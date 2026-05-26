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


def _parse_arm_product(text: str, result: dict) -> None:
    """Try to extract ARM fixed period and adjustment interval from text.

    Handles common CFPB Loan Estimate formats:
      "7-Year/6-Month ARM", "7 Year / 6 Month ARM"
      "7/6 ARM", "5/1 ARM"
      "7-Year ARM"  (annual adjustments implied)
    """
    # "7-Year/6-Month ARM" or "7 Year / 6 Month"
    m = re.search(r"(\d+)[- ]?[Yy]ear[s]?\s*/\s*(\d+)[- ]?[Mm]onth", text, re.I)
    if m:
        result["arm_fixed_years"] = int(m.group(1))
        result["arm_interval_months"] = int(m.group(2))
        return
    # "7/6" or "5/1" bare-number notation
    m2 = re.search(r"\b(\d+)\s*/\s*(\d+)\b", text)
    if m2:
        fy = int(m2.group(1))
        iv = int(m2.group(2))
        result["arm_fixed_years"] = fy
        result["arm_interval_months"] = iv if iv > 1 else 12
        return
    # "7-Year ARM" — annual adjustments implied
    m3 = re.search(r"(\d+)[- ]?[Yy]ear", text, re.I)
    if m3:
        result["arm_fixed_years"] = int(m3.group(1))
        result["arm_interval_months"] = 12


def _find_dollar_right_of(pattern: str, line: str) -> int | None:
    """Return the dollar amount that appears to the RIGHT of `pattern` in `line`.

    Only looks at the text after the label match — prevents values from an
    adjacent column or the preceding line from being captured.
    Returns None if the label isn't on this line or has no dollar to its right.
    """
    m = re.search(pattern, line, re.I)
    if not m:
        return None
    after = line[m.end() :]
    dm = re.search(r"\(?\$\s*([\d,]+)\)?", after)
    return _parse_dollar(dm.group(1)) if dm else None


def parse_loan_estimate_text(text: str) -> dict:
    """
    Extract key Loan Estimate fields from raw PDF text.

    CFPB Loan Estimate forms (2015+ standard) have consistent section labels.
    We match against those labels and grab adjacent dollar/percent values.
    Values are best-effort; the UI lets users correct anything we miss.
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    result: dict = {
        "name": "",
        "loan_type": "fixed",
        "loan_amount": 0,
        "interest_rate": 0.0,
        "term_years": 30,
        "points": 0.0,
        "net_credits": 0,
        "net_fees": 0,
        "prop_tax": 0,
        "hoa": 0,
        "insurance": 0,
        # ARM-specific fields (None = not found; frontend shows empty placeholder)
        "arm_fixed_years": None,
        "arm_interval_months": None,
        "arm_margin": None,
        "arm_cap_initial": None,
        "arm_cap_periodic": None,
        "arm_cap_lifetime": None,
    }

    # Accumulate credits from multiple labeled lines before writing net_credits.
    _lender_credits: int = 0
    _seller_credits: int = 0

    for i, line in enumerate(lines):
        peek = lines[i + 1] if i + 1 < len(lines) else ""

        # ── Product / Loan Type (ARM detection) ───────────────────────────
        # CFPB page-1 "Product" field. Common values:
        #   "7-Year/6-Month ARM", "5-Year ARM", "Fixed Rate", etc.
        # We also catch bare "Adjustable Rate" / "ARM" mentions elsewhere.
        if re.search(r"\bProduct\b", line, re.I):
            combined = line + " " + peek
            if re.search(r"Adjustable\s+Rate|\bARM\b", combined, re.I):
                result["loan_type"] = "arm"
                if result["arm_fixed_years"] is None:
                    _parse_arm_product(combined, result)
        elif (
            result["loan_type"] == "fixed"
            and re.search(r"Adjustable\s+Rate|\bARM\b", line, re.I)
            and not re.search(r"Annual\s+Percentage|APR\b", line, re.I)
        ):
            result["loan_type"] = "arm"
            if result["arm_fixed_years"] is None:
                _parse_arm_product(line + " " + peek, result)

        # ── ARM Margin ─────────────────────────────────────────────────────
        # CFPB AIR table: "Index + Margin = Initial Interest Rate"
        # Typical line: "SOFR   +   2.750%  =  6.250%"  (next line after Margin header)
        # Or: "Margin  2.750%"
        if re.search(r"\bMargin\b", line, re.I) and result["arm_margin"] is None:
            if not re.search(
                r"Gross\s+Margin|Profit\s+Margin|error\s+margin", line, re.I
            ):
                m_mar = re.search(r"([\d.]+)\s*%", line + " " + peek)
                if m_mar:
                    result["arm_margin"] = float(m_mar.group(1))

        # ── ARM Interest Rate Caps ─────────────────────────────────────────
        # Inline N/N/N format on a line with cap/limit keywords.
        if result["arm_cap_initial"] is None and re.search(
            r"\bCaps?\b|\bLimits?\b", line, re.I
        ):
            m_cap = re.search(r"(\d+)\s*/\s*(\d+)\s*/\s*(\d+)", line + " " + peek)
            if m_cap:
                result["arm_cap_initial"] = float(m_cap.group(1))
                result["arm_cap_periodic"] = float(m_cap.group(2))
                result["arm_cap_lifetime"] = float(m_cap.group(3))

        # Individual CFPB AIR-table cap labels
        if result["arm_cap_initial"] is None and re.search(
            r"\bFirst\s+Change\b|\bInitial\s+(?:Cap|Limit|Change)\b", line, re.I
        ):
            m_fc = re.search(r"([\d.]+)\s*%", line + " " + peek)
            if m_fc:
                result["arm_cap_initial"] = float(m_fc.group(1))

        if result["arm_cap_periodic"] is None and re.search(
            r"\bSubsequent\b|\bPeriodic\s+(?:Cap|Limit|Change)\b", line, re.I
        ):
            m_sc = re.search(r"([\d.]+)\s*%", line + " " + peek)
            if m_sc:
                result["arm_cap_periodic"] = float(m_sc.group(1))

        if result["arm_cap_lifetime"] is None and re.search(
            r"\bLifetime\b|\bLife\s+of\s+Loan\b", line, re.I
        ):
            m_lc = re.search(r"([\d.]+)\s*%", line + " " + peek)
            if m_lc:
                result["arm_cap_lifetime"] = float(m_lc.group(1))

        # ── Loan Amount ────────────────────────────────────────────────────
        if re.search(r"\bLoan\s+Amount\b", line, re.I) and not result["loan_amount"]:
            v = _find_dollar_after(line, peek)
            if v:
                result["loan_amount"] = v

        # ── Interest Rate ──────────────────────────────────────────────────
        if (
            re.search(r"\bInterest\s+Rate\b", line, re.I)
            and not result["interest_rate"]
        ):
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
        if (
            re.search(r"\bTotal\s+Loan\s+Costs?\b", line, re.I)
            and not result["net_fees"]
        ):
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
        if (
            re.search(
                r"\bHomeowner.?s?\s+Insurance\b|\bHazard\s+Insurance\b", line, re.I
            )
            and not result["insurance"]
        ):
            v = _find_dollar_after(line, peek)
            if v:
                result["insurance"] = v * 12  # convert monthly → annual

        # ── HOA Dues ───────────────────────────────────────────────────────
        if (
            re.search(r"\bHOA\b|\bHomeowner.?s?\s+Assoc", line, re.I)
            and not result["hoa"]
        ):
            v = _find_dollar_after(line, peek)
            if v:
                result["hoa"] = v

    # Net credits = sum of all credit sources found; 0 if none were labeled.
    result["net_credits"] = _lender_credits + _seller_credits

    # ── Post-loop: ARM cap fallback ────────────────────────────────────────
    # Some lenders (e.g. Chase) describe caps in a paragraph rather than a
    # tabular layout.  Scan the full text if we still haven't found caps.
    #
    # Handles patterns like:
    #   "max 5 first increase ... subsequent 1 / lifetime 5"  → 5/1/5
    #   "First Change Cap: 2%  Subsequent: 2%  Lifetime: 5%"
    if result["loan_type"] == "arm" and result["arm_cap_initial"] is None:
        # Try N/N/N anywhere near a cap/limit/change keyword
        m_cap3 = re.search(
            r"(?:cap|caps|limit|change|adjust)[^\n]{0,120}?(\d+)\s*/\s*(\d+)\s*/\s*(\d+)",
            text,
            re.I,
        )
        if m_cap3:
            result["arm_cap_initial"] = float(m_cap3.group(1))
            result["arm_cap_periodic"] = float(m_cap3.group(2))
            result["arm_cap_lifetime"] = float(m_cap3.group(3))
        else:
            # Keyword-anchored individual values across the full text
            m_init = re.search(
                r"\bfirst\s+(?:change|increase|adjustment)[^0-9\n]{0,40}([\d.]+)",
                text,
                re.I,
            )
            m_per = re.search(
                r"\b(?:subsequent|periodic)[^0-9\n]{0,40}([\d.]+)", text, re.I
            )
            m_life = re.search(
                r"\b(?:lifetime|life\s*of\s*(?:the\s*)?loan)[^0-9\n]{0,40}([\d.]+)",
                text,
                re.I,
            )
            if m_init:
                result["arm_cap_initial"] = float(m_init.group(1))
            if m_per:
                result["arm_cap_periodic"] = float(m_per.group(1))
            if m_life:
                result["arm_cap_lifetime"] = float(m_life.group(1))

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
