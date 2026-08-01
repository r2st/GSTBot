"""GSTIN validation — the check every other correctness claim rests on."""
from __future__ import annotations

import pytest

from app.services import gstin as gstin_service
from tests.conftest import (
    BUSINESS_GSTIN,
    SUPPLIER_GSTIN_OTHER_STATE,
    SUPPLIER_GSTIN_SAME_STATE,
)

VALID = [BUSINESS_GSTIN, SUPPLIER_GSTIN_SAME_STATE, SUPPLIER_GSTIN_OTHER_STATE]


@pytest.mark.parametrize("gstin", VALID)
def test_valid_gstins_parse(gstin):
    parts = gstin_service.parse(gstin)
    assert parts.gstin == gstin
    assert parts.state_code == gstin[:2]
    assert parts.pan == gstin[2:12]
    assert parts.check_digit == gstin[14]


def test_state_name_is_resolved():
    assert gstin_service.parse(BUSINESS_GSTIN).state_name == "Maharashtra"
    assert gstin_service.parse(SUPPLIER_GSTIN_OTHER_STATE).state_name == "Karnataka"


def test_normalize_strips_separators_and_upcases():
    assert gstin_service.normalize(" 27aapfu0939f 1zv ") == BUSINESS_GSTIN
    assert gstin_service.normalize("27-AAPFU0939F-1ZV") == BUSINESS_GSTIN


def test_normalized_input_still_validates():
    assert gstin_service.is_valid("27 aapfu0939f 1zv")


@pytest.mark.parametrize(
    ("bad", "reason"),
    [
        ("", "empty"),
        ("27AAPFU0939F1Z", "too short"),
        ("27AAPFU0939F1ZVX", "too long"),
        ("27AAPFU0939F1ZW", "wrong check digit"),
        ("00AAPFU0939F1ZV", "state code 00 does not exist"),
        ("40AAPFU0939F1ZV", "state code 40 is unassigned"),
        ("27AAPFU0939F1AV", "14th character must be Z"),
        ("2AAPFU0939F1ZVV", "state code must be two digits"),
        ("27AAPFU0939F0ZV", "entity number cannot be 0"),
    ],
)
def test_invalid_gstins_are_rejected(bad, reason):
    assert not gstin_service.is_valid(bad), reason
    with pytest.raises(gstin_service.InvalidGSTIN):
        gstin_service.parse(bad)


def test_no_adjacent_transposition_survives_validation():
    """The failure mode validation exists for.

    Swapping two adjacent characters is the commonest typing and OCR error,
    and it is what silently misattributes an invoice to another taxpayer. Every
    such swap is asserted rather than one sample: a single example passing
    would say nothing about the rest, and "usually caught" is not a property
    worth having here.
    """
    swaps = [
        BUSINESS_GSTIN[:i] + BUSINESS_GSTIN[i + 1] + BUSINESS_GSTIN[i] + BUSINESS_GSTIN[i + 2 :]
        for i in range(len(BUSINESS_GSTIN) - 1)
    ]
    # A swap of two identical characters is not a corruption; it is the same
    # string, and there is nothing for validation to catch.
    distinct = [s for s in swaps if s != BUSINESS_GSTIN]
    assert len(distinct) == 13, "fixture should exercise all but one position"

    survivors = [s for s in distinct if gstin_service.is_valid(s)]
    assert survivors == []


def test_compute_check_digit_matches_known_gstins():
    for gstin in VALID:
        assert gstin_service.compute_check_digit(gstin[:14]) == gstin[14]


def test_compute_check_digit_rejects_wrong_length():
    with pytest.raises(gstin_service.InvalidGSTIN):
        gstin_service.compute_check_digit("27AAPFU0939F1")


def test_find_gstins_extracts_from_invoice_text(sample_invoice_text):
    found = gstin_service.find_gstins(sample_invoice_text)
    # Supplier's letterhead GSTIN first, buyer's from the "Bill To" block second.
    assert found == [SUPPLIER_GSTIN_OTHER_STATE, BUSINESS_GSTIN]


def test_find_gstins_drops_shape_matches_that_fail_the_checksum():
    text = f"Supplier GSTIN: 27AAPFU0939F1ZW and {BUSINESS_GSTIN}"
    assert gstin_service.find_gstins(text) == [BUSINESS_GSTIN]


def test_find_gstins_deduplicates():
    text = f"{BUSINESS_GSTIN} ... {BUSINESS_GSTIN}"
    assert gstin_service.find_gstins(text) == [BUSINESS_GSTIN]


def test_interstate_detection():
    assert gstin_service.is_interstate(SUPPLIER_GSTIN_OTHER_STATE, BUSINESS_GSTIN) is True
    assert gstin_service.is_interstate(SUPPLIER_GSTIN_SAME_STATE, BUSINESS_GSTIN) is False


def test_interstate_is_none_when_either_side_is_unknown():
    """Unknown must not collapse into "same state".

    A ``False`` here would tell the validator to expect CGST/SGST on an
    invoice whose supplier we cannot identify, producing a warning on a
    perfectly correct IGST invoice.
    """
    assert gstin_service.is_interstate(None, BUSINESS_GSTIN) is None
    assert gstin_service.is_interstate("garbage", BUSINESS_GSTIN) is None
    assert gstin_service.is_interstate(BUSINESS_GSTIN, None) is None


def test_state_code_of():
    assert gstin_service.state_code_of(BUSINESS_GSTIN) == "27"
    assert gstin_service.state_code_of("not-a-gstin") is None
