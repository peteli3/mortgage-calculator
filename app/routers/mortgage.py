import io
import re

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/mortgage")


def _parse_dollar(text: str) -> int:
    cleaned = re.sub(r"[,$\s]", "", text)
    try:
        return int(cleaned)
    except ValueError:
        try:
            return int(float(cleaned))
        except ValueError:
            return 0


def _find_dollar_after(line: str, peek: str) -> int | None:
    """Return first dollar amount found in `line`, falling back to `peek`."""
    m = re.search(r"\$\s*([\d,]+)", line)
    if m:
        return _parse_dollar(m.group(1))
    m = re.search(r"\$\s*([\d,]+)", peek)
    return _parse_dollar(m.group(1)) if m else None


def _find_dollar_right_of(pattern: str, line: str) -> int | None:
    """Return the dollar amount that appears to the RIGHT of `pattern` in `line`.

    Only looks at the text after the label match — prevents values from an
    adjacent column or the preceding line from being captured.
    Returns None if the label isn't on this line or has no dollar to its right.
    """
    m = re.search(pattern, line, re.I)
    if not m:
        return None
    after = line[m.end():]
    dm = re.search(r"\(?\$\s*([\d,]+)\)?", after)
    return _parse_dollar(dm.group(1)) if dm else None


def parse_loan_estimate_text(text: str) -> dict:
    """
    Extract key Loan Estimate fields from raw PDF text.

    CFPB Loan Estimate forms (2015+ standard) have consistent section labels.
    We match against those labels and grab adjacent dollar/percent values.
    Values are best-effort; the UI lets users correct anything we miss.
    """
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    result: dict = {
        "name": "",
        "loan_amount": 0,
        "interest_rate": 0.0,
        "term_years": 30,
        "points": 0.0,
        "net_credits": 0,
        "net_fees": 0,
        "prop_tax": 0,
        "hoa": 0,
        "insurance": 0,
    }

    # Accumulate credits from multiple labeled lines before writing net_credits.
    _lender_credits: int = 0
    _seller_credits: int = 0

    for i, line in enumerate(lines):
        peek = lines[i + 1] if i + 1 < len(lines) else ""

        # ── Loan Amount ────────────────────────────────────────────────────
        if re.search(r"\bLoan\s+Amount\b", line, re.I) and not result["loan_amount"]:
            v = _find_dollar_after(line, peek)
            if v:
                result["loan_amount"] = v

        # ── Interest Rate ──────────────────────────────────────────────────
        if re.search(r"\bInterest\s+Rate\b", line, re.I) and not result["interest_rate"]:
            # Avoid matching "Annual Percentage Rate (APR)"
            if not re.search(r"\bAnnual\b|\bAPR\b", line, re.I):
                m = re.search(r"([\d.]+)\s*%", line + " " + peek)
                if m:
                    result["interest_rate"] = float(m.group(1))

        # ── Loan Term ──────────────────────────────────────────────────────
        if re.search(r"\bLoan\s+Term\b", line, re.I):
            m = re.search(r"(\d+)\s*[Yy]ear", line + " " + peek)
            if m:
                result["term_years"] = int(m.group(1))

        # ── Origination Points (% of loan, Section A) ─────────────────────
        # CFPB Section A lines look like either:
        #   "0.500 % of Loan Amount (Points)   $1,750"
        #   "Points (0.500% of Loan Amount)    $1,750"
        # Always extract the percentage figure, never the dollar amount.
        if not result["points"]:
            m = re.search(r"([\d.]+)\s*%\s+of\s+Loan\s+Amount", line, re.I)
            if m:
                result["points"] = float(m.group(1))
            elif re.search(r"\bPoints\b", line, re.I):
                # "Points (X.XXX%)" style — find the % on the same line
                m2 = re.search(r"([\d.]+)\s*%", line)
                if m2:
                    result["points"] = float(m2.group(1))

        # ── Lender Credits ─────────────────────────────────────────────────
        # Only capture a value that appears to the RIGHT of the label on the
        # same line. The closing-cost table always has the dollar inline; any
        # dollar on a previous or subsequent line belongs to a different row.
        if re.search(r"\bLender\s+Credits?\b", line, re.I):
            v = _find_dollar_right_of(r"\bLender\s+Credits?\b", line)
            if v is not None:
                _lender_credits = v

        # ── Seller Credits ─────────────────────────────────────────────────
        if re.search(r"\bSeller\s+Credits?\b", line, re.I):
            v = _find_dollar_right_of(r"\bSeller\s+Credits?\b", line)
            if v is not None:
                _seller_credits = v

        # ── Total Loan Costs — Section D (A + B + C) ──────────────────────
        # CFPB label: "D. Total Loan Costs (A + B + C)".  Value is always on
        # the same line; fall back to peek for PDFs that wrap it.
        if re.search(r"\bTotal\s+Loan\s+Costs?\b", line, re.I) and not result["net_fees"]:
            v = _find_dollar_right_of(r"\bTotal\s+Loan\s+Costs?\b", line)
            if v is None:
                m2 = re.search(r"\$\s*([\d,]+)", peek)
                v = _parse_dollar(m2.group(1)) if m2 else None
            if v:
                result["net_fees"] = v

        # ── Property Taxes (monthly, from Projected Payments / escrow) ─────
        if re.search(r"\bProperty\s+Tax(es)?\b", line, re.I) and not result["prop_tax"]:
            v = _find_dollar_after(line, peek)
            if v:
                result["prop_tax"] = v

        # ── Homeowner's Insurance (monthly → we store annual) ──────────────
        if re.search(r"\bHomeowner.?s?\s+Insurance\b|\bHazard\s+Insurance\b", line, re.I) and not result["insurance"]:
            v = _find_dollar_after(line, peek)
            if v:
                result["insurance"] = v * 12  # convert monthly → annual

        # ── HOA Dues ───────────────────────────────────────────────────────
        if re.search(r"\bHOA\b|\bHomeowner.?s?\s+Assoc", line, re.I) and not result["hoa"]:
            v = _find_dollar_after(line, peek)
            if v:
                result["hoa"] = v

    # Net credits = sum of all credit sources found; 0 if none were labeled.
    result["net_credits"] = _lender_credits + _seller_credits

    return result


@router.post("/parse-loan-estimate")
async def parse_loan_estimate(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20 MB guard
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]

        full_text = "\n".join(pages_text)
        data = parse_loan_estimate_text(full_text)
        return JSONResponse(content=data)

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PDF parsing library not installed. Run: pip install pdfplumber",
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {exc}")
