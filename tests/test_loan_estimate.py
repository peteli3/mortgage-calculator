from pathlib import Path

from app.routers.mortgage import (
    _parse_arm_product,
    _parse_dollar,
    parse_loan_estimate_text,
)

FIXTURE = Path(__file__).parent / "fixtures" / "loan_estimate_minimal.txt"


def test_parse_dollar():
    assert _parse_dollar("$1,234") == 1234
    assert _parse_dollar("") == 0
    assert _parse_dollar("n/a") == 0


def test_parse_arm_product_formats():
    r: dict = {}
    _parse_arm_product("7-Year/6-Month ARM", r)
    assert r["arm_fixed_years"] == 7
    assert r["arm_interval_months"] == 6

    r = {}
    _parse_arm_product("5/1 ARM", r)
    assert r["arm_fixed_years"] == 5
    assert r["arm_interval_months"] == 12

    r = {}
    _parse_arm_product("7-Year ARM", r)
    assert r["arm_fixed_years"] == 7
    assert r["arm_interval_months"] == 12


def test_parse_loan_estimate_minimal_fixture():
    text = FIXTURE.read_text()
    result = parse_loan_estimate_text(text)

    assert result["loan_type"] == "arm"
    assert result["loan_amount"] == 400_000
    assert result["interest_rate"] == 6.5
    assert result["term_years"] == 30
    assert result["arm_fixed_years"] == 7
    assert result["arm_interval_months"] == 6
    assert result["arm_margin"] == 2.75
    assert result["arm_cap_initial"] == 2.0
    assert result["arm_cap_periodic"] == 1.0
    assert result["arm_cap_lifetime"] == 5.0
    assert result["net_credits"] == 2500
    assert result["net_fees"] == 8000
    assert result["prop_tax"] == 500
    assert result["insurance"] == 1800  # monthly $150 → annual
    assert result["hoa"] == 0
