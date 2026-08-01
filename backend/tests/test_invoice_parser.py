"""Extraction: the heuristic path, the model path, and the validation between."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services import invoice_parser
from app.services.invoice_parser import (
    ParsedInvoice,
    parse_heuristic,
    parse_invoice,
    to_date,
    to_decimal,
    validate,
)
from app.services.openrouter_client import OpenRouterError, extract_json_object
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE

INTRASTATE_INVOICE = f"""\
MUMBAI HARDWARE SUPPLIES
GSTIN: {SUPPLIER_GSTIN_SAME_STATE}
TAX INVOICE
Invoice No: MH/2026/118
Invoice Date: 02/05/2026
Bill To: UMANG TRADERS  GSTIN: {BUSINESS_GSTIN}
HSN: 73181500
Taxable Value: 100000.00
CGST @ 9%: 9000.00
SGST @ 9%: 9000.00
Grand Total: 118000.00
"""


# --------------------------------------------------------------------------
# Coercion
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1,23,456.78", Decimal("123456.78")),  # Indian digit grouping.
        ("₹ 45,000", Decimal("45000")),
        ("Rs. 1000.50", Decimal("1000.50")),
        (1234.5, Decimal("1234.5")),
        (0, Decimal("0")),
        (None, Decimal("0.00")),
        ("", Decimal("0.00")),
        ("not a number", Decimal("0.00")),
        ("-500.00", Decimal("-500.00")),
    ],
)
def test_to_decimal(raw, expected):
    assert to_decimal(raw) == expected


def test_to_decimal_honours_a_none_default():
    assert to_decimal("garbage", default=None) is None


def test_to_decimal_does_not_treat_booleans_as_numbers():
    """``True`` is an ``int`` in Python, and ``Decimal(1)`` is not an amount."""
    assert to_decimal(True) == Decimal("0.00")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-04-15", date(2026, 4, 15)),
        ("15/04/2026", date(2026, 4, 15)),
        ("15-04-2026", date(2026, 4, 15)),
        ("15.04.2026", date(2026, 4, 15)),
        ("15-Apr-2026", date(2026, 4, 15)),
        ("15 April 2026", date(2026, 4, 15)),
        ("nonsense", None),
        ("", None),
        (None, None),
    ],
)
def test_to_date(raw, expected):
    assert to_date(raw) == expected


def test_ambiguous_dates_are_read_day_first():
    """``03/04/2026`` is 3 April in India, not 4 March."""
    assert to_date("03/04/2026") == date(2026, 4, 3)


# --------------------------------------------------------------------------
# Heuristic extraction
# --------------------------------------------------------------------------

def test_heuristic_reads_an_interstate_invoice(sample_invoice_text):
    parsed = parse_heuristic(sample_invoice_text)

    assert parsed.supplier_gstin == SUPPLIER_GSTIN_OTHER_STATE
    assert parsed.buyer_gstin == BUSINESS_GSTIN
    assert parsed.invoice_number == "INV-2026-0042"
    assert parsed.invoice_date == date(2026, 4, 15)
    assert parsed.period == "2026-04"
    assert parsed.hsn_code == "84713010"
    assert parsed.taxable_value == Decimal("450000.00")
    assert parsed.igst == Decimal("81000.00")
    assert parsed.total_value == Decimal("531000.00")
    assert parsed.parsed_with == "heuristic"


def test_heuristic_reads_an_intrastate_invoice():
    parsed = parse_heuristic(INTRASTATE_INVOICE)

    assert parsed.supplier_gstin == SUPPLIER_GSTIN_SAME_STATE
    assert parsed.cgst == Decimal("9000.00")
    assert parsed.sgst == Decimal("9000.00")
    assert parsed.igst == Decimal("0.00")
    assert parsed.total_value == Decimal("118000.00")


def test_heuristic_on_empty_text_is_empty_not_an_error():
    parsed = parse_heuristic("")
    assert parsed.supplier_gstin is None
    assert parsed.total_value == Decimal("0.00")
    assert parsed.confidence == 0.0


def test_heuristic_confidence_reflects_field_coverage():
    """Confidence is coverage, and is capped below certainty.

    Regexes match shape, not meaning, so even a fully-populated heuristic read
    must stay below a model's — it is what decides which invoices a human is
    asked to check.
    """
    full = parse_heuristic(INTRASTATE_INVOICE)
    sparse = parse_heuristic("Some text with no invoice fields at all")
    assert full.confidence > sparse.confidence
    assert full.confidence <= 0.6


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def test_validate_flags_an_unbalanced_total():
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        taxable_value=Decimal("1000.00"),
        igst=Decimal("180.00"),
        total_value=Decimal("1500.00"),  # Should be 1180.
        confidence=0.9,
    )
    validate(parsed)
    assert any("does not equal" in w for w in parsed.warnings)


def test_validate_tolerates_rupee_rounding():
    """Invoices round tax lines to the rupee; a few paise is not a defect."""
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        taxable_value=Decimal("1000.00"),
        igst=Decimal("180.00"),
        total_value=Decimal("1180.50"),
        confidence=0.9,
    )
    validate(parsed)
    assert not any("does not equal" in w for w in parsed.warnings)


def test_validate_rejects_igst_together_with_cgst():
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        cgst=Decimal("90.00"),
        igst=Decimal("180.00"),
    )
    validate(parsed)
    assert any("both IGST and CGST" in w for w in parsed.warnings)


def test_validate_flags_unequal_cgst_and_sgst():
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        cgst=Decimal("90.00"),
        sgst=Decimal("80.00"),
    )
    validate(parsed)
    assert any("should be equal" in w for w in parsed.warnings)


def test_validate_flags_an_interstate_supply_taxed_as_cgst_sgst():
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_OTHER_STATE,  # Karnataka
        buyer_gstin=BUSINESS_GSTIN,  # Maharashtra
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
    )
    validate(parsed)
    assert any("Inter-state supply taxed as CGST/SGST" in w for w in parsed.warnings)


def test_validate_flags_an_intrastate_supply_taxed_as_igst():
    parsed = ParsedInvoice(
        supplier_gstin=SUPPLIER_GSTIN_SAME_STATE,  # Maharashtra
        buyer_gstin=BUSINESS_GSTIN,  # Maharashtra
        invoice_number="X-1",
        invoice_date=date(2026, 4, 1),
        igst=Decimal("180.00"),
    )
    validate(parsed)
    assert any("Intra-state supply taxed as IGST" in w for w in parsed.warnings)


def test_validate_accepts_a_correct_interstate_invoice(sample_invoice_text):
    parsed = validate(parse_heuristic(sample_invoice_text))
    assert parsed.warnings == []


def test_validate_lowers_confidence_per_warning():
    parsed = ParsedInvoice(confidence=0.9)
    validate(parsed)
    assert parsed.warnings
    assert parsed.confidence < 0.9


# --------------------------------------------------------------------------
# Model extraction
# --------------------------------------------------------------------------

def test_model_extraction_is_used_when_configured(stub_openrouter, sample_invoice_text):
    stub_openrouter.update(
        {
            "supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE,
            "supplier_name": "Northwind Supplies Private Limited",
            "buyer_gstin": BUSINESS_GSTIN,
            "invoice_number": "INV-2026-0042",
            "invoice_date": "2026-04-15",
            "place_of_supply": "27",
            "hsn_code": "84713010",
            "taxable_value": 450000,
            "cgst": 0,
            "sgst": 0,
            "igst": 81000,
            "cess": 0,
            "total_value": 531000,
            "tax_rate": 18,
            "confidence": 0.95,
        }
    )
    parsed = parse_invoice(text=sample_invoice_text)

    assert parsed.parsed_with.startswith("openrouter:")
    assert parsed.supplier_name == "Northwind Supplies Private Limited"
    assert parsed.tax_rate == Decimal("18")
    assert parsed.place_of_supply == "27"
    assert parsed.confidence == pytest.approx(0.95)
    assert parsed.warnings == []


def test_a_hallucinated_gstin_is_discarded(stub_openrouter, sample_invoice_text):
    """A confident wrong GSTIN is worse than no GSTIN.

    It attributes the invoice to a different taxpayer, and everything
    downstream — the supplier record, the 2B match, the ITC claim — inherits
    the error silently. The check digit is the arbiter, not the model.
    """
    stub_openrouter.update(
        {
            "supplier_gstin": "27AAPFU0939F1ZW",  # Valid shape, bad check digit.
            "invoice_number": "INV-2026-0042",
            "invoice_date": "2026-04-15",
            "taxable_value": 450000,
            "igst": 81000,
            "total_value": 531000,
        }
    )
    parsed = parse_invoice(text=sample_invoice_text)

    assert parsed.supplier_gstin != "27AAPFU0939F1ZW"
    assert any("Discarded invalid" in w for w in parsed.warnings)
    # The heuristic pass then supplies the real one from the invoice text.
    assert parsed.supplier_gstin == SUPPLIER_GSTIN_OTHER_STATE


def test_heuristics_fill_gaps_the_model_left(stub_openrouter, sample_invoice_text):
    stub_openrouter.update(
        {
            "supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE,
            "invoice_number": None,  # Model missed it.
            "invoice_date": None,
            "taxable_value": 450000,
            "igst": 81000,
            "total_value": 531000,
            "confidence": 0.8,
        }
    )
    parsed = parse_invoice(text=sample_invoice_text)

    assert parsed.invoice_number == "INV-2026-0042"
    assert parsed.invoice_date == date(2026, 4, 15)


def test_heuristics_do_not_overwrite_what_the_model_answered(
    stub_openrouter, sample_invoice_text
):
    """Gap-filling only.

    The regex has no notion of layout and would happily replace an invoice
    total with a line item's amount, so a field the model answered is final.
    """
    stub_openrouter.update(
        {
            "supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE,
            "invoice_number": "MODEL-NUMBER",
            "invoice_date": "2026-04-15",
            "taxable_value": 450000,
            "igst": 81000,
            "total_value": 531000,
        }
    )
    assert parse_invoice(text=sample_invoice_text).invoice_number == "MODEL-NUMBER"


def test_an_out_of_range_tax_rate_is_dropped(stub_openrouter):
    """17% is not a GST rate, so it is a misread rather than a rate.

    The invoice text here prints no percentage, so nothing can refill the
    field and the drop is observable on its own.
    """
    text = f"ACME LTD GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}\nInvoice No: A-9\nTotal Amount: 1180.00"
    stub_openrouter.update(
        {"supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE, "tax_rate": 17, "total_value": 1180}
    )
    assert parse_invoice(text=text).tax_rate is None


def test_a_dropped_rate_is_refilled_from_the_document(stub_openrouter, sample_invoice_text):
    """Dropping the model's answer is not the same as giving up on the field.

    The invoice itself says 18%, so the heuristic pass supplies it once the
    model's impossible 17 has been discarded.
    """
    stub_openrouter.update(
        {"supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE, "tax_rate": 17, "total_value": 531000}
    )
    assert parse_invoice(text=sample_invoice_text).tax_rate == Decimal("18")


def test_heuristic_sums_the_two_halves_of_an_intrastate_rate():
    """An 18% invoice prints as 9% CGST + 9% SGST.

    Reporting 9 would understate the rate on every intra-state invoice.
    """
    assert parse_heuristic(INTRASTATE_INVOICE).tax_rate == Decimal("18")


def test_heuristic_does_not_read_gstin_as_a_tax_line():
    """"GSTIN" contains "GST".

    A label pattern that is not anchored on word boundaries reads the digits
    of the GSTIN itself as an SGST amount.
    """
    parsed = parse_heuristic(f"GSTIN: {SUPPLIER_GSTIN_SAME_STATE}\nTotal Amount: 1000.00")
    assert parsed.sgst == Decimal("0.00")
    assert parsed.cgst == Decimal("0.00")


def test_a_fractional_rate_is_read_as_a_percentage(stub_openrouter, sample_invoice_text):
    """A model asked for "18" sometimes answers "0.18"."""
    stub_openrouter.update(
        {"supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE, "tax_rate": 0.18, "total_value": 531000}
    )
    assert parse_invoice(text=sample_invoice_text).tax_rate == Decimal("18")


def test_a_model_failure_falls_back_to_heuristics(monkeypatch, sample_invoice_text):
    """A free-tier rate limit must not lose an invoice."""
    monkeypatch.setattr(invoice_parser, "is_configured", lambda: True)

    def _boom(*args, **kwargs):
        raise OpenRouterError("429 rate limited")

    monkeypatch.setattr(invoice_parser, "chat_json", _boom)

    parsed = parse_invoice(text=sample_invoice_text)
    assert parsed.parsed_with == "heuristic"
    assert parsed.supplier_gstin == SUPPLIER_GSTIN_OTHER_STATE
    assert parsed.total_value == Decimal("531000.00")


def test_parse_invoice_without_a_key_uses_heuristics(sample_invoice_text):
    parsed = parse_invoice(text=sample_invoice_text)
    assert parsed.parsed_with == "heuristic"
    assert parsed.invoice_number == "INV-2026-0042"


def test_parse_invoice_never_raises_on_junk():
    parsed = parse_invoice(content=b"\x00\x01\x02", content_type="image/png", filename="x.png")
    assert isinstance(parsed, ParsedInvoice)
    assert parsed.warnings  # It says what went wrong rather than throwing.


def test_parse_invoice_reads_a_plain_text_upload(sample_invoice_text):
    parsed = parse_invoice(
        content=sample_invoice_text.encode(), content_type="text/plain", filename="inv.txt"
    )
    assert parsed.invoice_number == "INV-2026-0042"


def test_as_dict_is_json_safe(sample_invoice_text):
    import json

    data = parse_invoice(text=sample_invoice_text).as_dict()
    json.dumps(data)  # Must not raise: this is stored in a JSON column.
    assert data["invoice_date"] == "2026-04-15"
    assert data["taxable_value"] == "450000.00"


# --------------------------------------------------------------------------
# JSON extraction from model output
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw",
    [
        '{"invoice_number": "A-1"}',
        '```json\n{"invoice_number": "A-1"}\n```',
        'Here is the result:\n{"invoice_number": "A-1"}\nHope that helps.',
        'We need to read the invoice. The user wants JSON. {"invoice_number": "A-1"}',
    ],
)
def test_extract_json_object_survives_free_tier_output(raw):
    assert extract_json_object(raw) == {"invoice_number": "A-1"}


@pytest.mark.parametrize("raw", ["", "no json here", "[1, 2, 3]", "{not valid json}"])
def test_extract_json_object_returns_none_when_there_is_none(raw):
    assert extract_json_object(raw) is None
