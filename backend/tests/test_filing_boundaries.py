"""The edges the filing service's dates, defaults and value objects turn on.

tests/test_filing.py asserts what a return contains and tests/test_filing_record.py
asserts what happens when one is recorded. Between them they read every line of
`filing`, which is why the mutation target lists both — but reading a line is
not deciding it, and the assertions below are the ones a mutation run showed
were missing: the day a return is late *on*, the day it becomes overdue, the
default a report starts at, which builder a return type reaches, and whether
the objects those answers travel in can be edited after the fact.

Each test here was written against a surviving mutant. Where one is left alive
on purpose, :class:`TestTheEdgesThatCannotMove` names it and says why.
"""
from __future__ import annotations

import dataclasses
from datetime import date
from decimal import Decimal

import pytest

from app.models.gstr_return import ReturnType
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.services import filing as filing_service
from app.services import gst_calendar
from app.services.filing import (
    FilingPreview,
    RateLine,
    ReturnStanding,
    ValidationReport,
)
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE

TODAY = date(2026, 6, 15)
PERIOD = "2026-04"


@pytest.fixture()
def frozen_today(monkeypatch):
    monkeypatch.setattr(gst_calendar, "today_ist", lambda: TODAY)
    return TODAY


def sale(db, business_id, *, period=PERIOD, taxable="100000.00", igst="18000.00",
         cess="0.00", tax_rate="18", place_of_supply="29", gstin=SUPPLIER_GSTIN_OTHER_STATE):
    invoice = Invoice(
        business_id=business_id,
        invoice_type=InvoiceType.SALES,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=gstin,
        counterparty_name="Northwind Supplies",
        invoice_number=f"S-{period}-{db.query(Invoice).count() + 1}",
        invoice_date=date(int(period[:4]), int(period[5:]), 15),
        period=period,
        place_of_supply=place_of_supply,
        hsn_code="84713010",
        tax_rate=Decimal(tax_rate) if tax_rate is not None else None,
        taxable_value=Decimal(taxable),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal(igst),
        cess=Decimal(cess),
        total_value=Decimal(taxable) + Decimal(igst) + Decimal(cess),
        reverse_charge=False,
    )
    db.add(invoice)
    db.commit()
    return invoice


# ---------------------------------------------------------------------------
# Where a return stands, to the day
# ---------------------------------------------------------------------------

def _standing(**overrides) -> ReturnStanding:
    base = dict(
        period=PERIOD,
        return_type=ReturnType.GSTR3B,
        due_date=date(2026, 5, 20),
        as_of=date(2026, 5, 20),
    )
    return ReturnStanding(**{**base, **overrides})


class TestTheDayAReturnIsLateOn:
    """The due date is the last day it is on time, not the first day it is late.

    ``ReturnStanding`` is shared by the status screen and the deadline
    alerting so the two cannot disagree — which means an off-by-one here tells
    a business that filed on the deadline that it filed late, on the screen and
    in the email at once, and late filing is what a late fee is charged on.
    """

    def test_filing_on_the_due_date_is_not_late(self):
        assert _standing(filed_on=date(2026, 5, 20)).filed_late is False

    def test_filing_the_day_after_the_due_date_is_late(self):
        assert _standing(filed_on=date(2026, 5, 21)).filed_late is True

    def test_filing_the_day_before_is_not_late(self):
        assert _standing(filed_on=date(2026, 5, 19)).filed_late is False

    def test_an_unfiled_return_is_not_reported_as_late(self):
        # `filed_late` is about how a filing happened, `overdue` is about one
        # that has not. An unfiled return must not answer the first.
        standing = _standing()
        assert standing.filed is False
        assert standing.filed_late is False


class TestTheDayAReturnBecomesOverdue:
    """Overdue starts the day *after* the deadline, and only while unfiled.

    Due today is not overdue today — the business has until the end of the day
    to file, and an alert that says otherwise is wrong on the one day someone
    is most likely to act on it.
    """

    def test_a_return_due_today_is_not_yet_overdue(self):
        standing = _standing(as_of=date(2026, 5, 20))
        assert standing.days_until_due == 0
        assert standing.overdue is False

    def test_a_return_due_yesterday_is_overdue(self):
        standing = _standing(as_of=date(2026, 5, 21))
        assert standing.days_until_due == -1
        assert standing.overdue is True

    def test_a_return_still_ahead_of_its_deadline_is_not_overdue(self):
        standing = _standing(as_of=date(2026, 5, 18))
        assert standing.days_until_due == 2
        assert standing.overdue is False

    def test_filing_late_stops_the_clock(self):
        standing = _standing(as_of=date(2026, 6, 15), filed_on=date(2026, 5, 25))
        assert standing.days_until_due < 0
        assert standing.filed_late is True
        assert standing.overdue is False


# ---------------------------------------------------------------------------
# Filed returns, unfiltered
# ---------------------------------------------------------------------------

class TestAskingForEveryFiledReturn:
    """``periods=None`` means "all of them", and it is not the same as "none".

    The two callers ask different questions: the alerting names the periods it
    is chasing, and the status read wants the lot. Collapsing "no filter" into
    "no periods" answers the second with an empty mapping — so every return the
    business has ever filed reads as unfiled, and the alerting nags someone who
    is completely up to date.
    """

    def test_no_period_filter_returns_every_filed_return(
        self, db_session, business, frozen_today
    ):
        filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR3B, filed_on=date(2026, 5, 20)
        )
        filing_service.record_filing(
            db_session, business, "2026-05", ReturnType.GSTR1, filed_on=date(2026, 6, 11)
        )

        everything = filing_service.filed_returns(db_session, business.id)

        assert set(everything) == {
            (PERIOD, ReturnType.GSTR3B),
            ("2026-05", ReturnType.GSTR1),
        }

    def test_an_empty_period_list_still_returns_nothing(
        self, db_session, business, frozen_today
    ):
        # The other side of the same edge: an empty `IN ()` is a query that can
        # only return nothing, and some backends reject it outright.
        filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR3B, filed_on=date(2026, 5, 20)
        )
        assert filing_service.filed_returns(db_session, business.id, []) == {}

    def test_a_named_period_filters_to_it(self, db_session, business, frozen_today):
        filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR3B, filed_on=date(2026, 5, 20)
        )
        filing_service.record_filing(
            db_session, business, "2026-05", ReturnType.GSTR1, filed_on=date(2026, 6, 11)
        )
        filtered = filing_service.filed_returns(db_session, business.id, [PERIOD])
        assert set(filtered) == {(PERIOD, ReturnType.GSTR3B)}


# ---------------------------------------------------------------------------
# Which return a recorded filing stores
# ---------------------------------------------------------------------------

class TestTheRecordedReturnIsTheOneThatWasFiled:
    """``data`` is the best available record of what went to the portal.

    The two returns are not interchangeable documents: a GSTR-1 is the
    invoice-level statement of outward supplies and a GSTR-3B is a summary with
    a credit ledger in it. Stored under the wrong type the record is not merely
    mislabelled — it is the wrong document, and the ARN beside it is a real
    acknowledgement vouching for it.
    """

    def test_recording_a_gstr1_stores_a_gstr1(
        self, db_session, business, frozen_today
    ):
        sale(db_session, business.id)
        record = filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR1, filed_on=date(2026, 5, 11)
        )
        assert record.return_type is ReturnType.GSTR1
        assert "fp" in record.data
        assert "sup_details" not in record.data

    def test_recording_a_gstr3b_stores_a_gstr3b(
        self, db_session, business, frozen_today
    ):
        sale(db_session, business.id)
        record = filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR3B, filed_on=date(2026, 5, 20)
        )
        assert record.return_type is ReturnType.GSTR3B
        assert "sup_details" in record.data
        assert "fp" not in record.data

    def test_the_two_records_for_one_period_hold_different_documents(
        self, db_session, business, frozen_today
    ):
        sale(db_session, business.id)
        one = filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR1, filed_on=date(2026, 5, 11)
        )
        three_b = filing_service.record_filing(
            db_session, business, PERIOD, ReturnType.GSTR3B, filed_on=date(2026, 5, 20)
        )
        assert one.data != three_b.data


# ---------------------------------------------------------------------------
# The rate derived from the figures
# ---------------------------------------------------------------------------

class TestTheRateDerivedFromAnInvoicesOwnFigures:
    """Cess is not charged at the GST rate, so it is left out of the division.

    An invoice that carries amounts but no explicit rate has one derived, and
    the portal wants a rate on every line. Cess sits on top of GST at its own
    rate — often higher than any slab — so counting it in the numerator inflates
    the derived rate and snaps the line to the wrong slab, which is a rate-wise
    block that does not match the tax beside it.
    """

    def test_cess_is_excluded_from_the_derivation(self, db_session, business):
        invoice = sale(
            db_session,
            business.id,
            taxable="100000.00",
            igst="18000.00",
            cess="12000.00",
            tax_rate=None,
        )
        assert filing_service._rate_of(invoice) == Decimal("18")

    def test_an_invoice_with_no_cess_derives_the_same_rate(self, db_session, business):
        invoice = sale(
            db_session, business.id, taxable="100000.00", igst="18000.00", tax_rate=None
        )
        assert filing_service._rate_of(invoice) == Decimal("18")

    def test_an_explicit_rate_is_preferred_to_any_derivation(self, db_session, business):
        invoice = sale(
            db_session,
            business.id,
            taxable="100000.00",
            igst="5000.00",
            cess="12000.00",
            tax_rate="12",
        )
        assert filing_service._rate_of(invoice) == Decimal("12")

    def test_an_invoice_with_no_taxable_value_derives_nothing(
        self, db_session, business
    ):
        invoice = sale(
            db_session, business.id, taxable="0.00", igst="0.00", tax_rate=None
        )
        assert filing_service._rate_of(invoice) == Decimal("0")


# ---------------------------------------------------------------------------
# The value objects the answers travel in
# ---------------------------------------------------------------------------

class TestTheAnswersCannotBeEditedAfterTheyAreGiven:
    """Three of these carry a figure into a return or an alert.

    They are frozen because each is handed to more than one reader — the status
    screen and the alerting share a ``ReturnStanding``, and the rate-wise lines
    of an invoice are read into the B2B block, the B2CS summary and the HSN
    summary in turn. A reader that adjusted one in place would change what the
    next one filed, and nothing downstream re-derives it.
    """

    def test_a_return_standing_cannot_be_edited(self):
        standing = _standing()
        with pytest.raises(dataclasses.FrozenInstanceError):
            standing.due_date = date(2026, 12, 31)

    def test_a_rate_line_cannot_be_edited(self):
        line = RateLine(
            rate=Decimal("18"),
            taxable_value=Decimal("100000.00"),
            igst=Decimal("18000.00"),
            cgst=Decimal("0.00"),
            sgst=Decimal("0.00"),
            cess=Decimal("0.00"),
        )
        with pytest.raises(dataclasses.FrozenInstanceError):
            line.taxable_value = Decimal("1.00")

    def test_a_filing_preview_cannot_be_edited(self):
        preview = FilingPreview(
            period=PERIOD,
            return_type=ReturnType.GSTR1.value,
            document={},
            validation=ValidationReport(period=PERIOD),
        )
        with pytest.raises(dataclasses.FrozenInstanceError):
            preview.document = {"b2b": []}


class TestAValidationReportStartsEmpty:
    """A report is built by counting up from nothing.

    ``validate_period`` sets the count from the rows it read, so the default is
    only ever seen by a period with no invoices in it — which is exactly when a
    non-zero default would be wrong, and would tell someone their empty period
    holds an invoice that validation somehow found no issues with.
    """

    def test_a_fresh_report_counts_no_invoices(self):
        assert ValidationReport(period=PERIOD).invoice_count == 0

    def test_a_fresh_report_has_nothing_wrong_with_it(self):
        report = ValidationReport(period=PERIOD)
        assert report.issues == []
        assert report.errors == []
        assert report.warnings == []
        assert report.ok is True

    def test_an_empty_period_reports_a_zero_count(self, db_session, business):
        report = filing_service.validate_period(db_session, business, PERIOD)
        assert report.invoice_count == 0
        assert report.as_dict()["invoice_count"] == 0


# ---------------------------------------------------------------------------
# Survivors left alive on purpose
# ---------------------------------------------------------------------------

class TestTheEdgesThatCannotMove:
    """Mutants that survive because the line has no other side to be on.

    Asserted here as the facts that make them equivalent, so that the day one
    of those facts changes this goes red rather than a mutation score quietly
    improving.
    """

    def test_a_counterparty_state_is_only_ever_read_off_a_registered_gstin(self):
        # Table 3.2 derives a place of supply from the counterparty's GSTIN,
        # but `state_code_of` answers None for anything that does not checksum
        # — and anything that *does* checksum makes the supply B2B, which 3.2
        # excludes. So the derived state is unreachable inside the branch that
        # reads it, and widening the guard around it changes nothing.
        from app.services import gstin as gstin_service

        good = SUPPLIER_GSTIN_OTHER_STATE
        bad = good[:-1] + ("5" if good[-1] != "5" else "6")
        assert gstin_service.is_valid(good) and gstin_service.state_code_of(good) == "29"
        assert not gstin_service.is_valid(bad)
        assert gstin_service.state_code_of(bad) is None
        assert gstin_service.state_code_of("") is None

    def test_the_rate_wise_weights_are_built_from_one_list(self, db_session, business):
        # `zip(..., strict=True)` guards two sequences that are both derived
        # from `ordered` a few lines above, so they cannot differ in length.
        # What the strictness protects is a future edit that sources one of
        # them elsewhere; today it is the same list counted twice.
        invoice = sale(db_session, business.id, tax_rate=None)
        lines = filing_service.rate_lines(invoice)
        assert len(lines) == len({line.rate for line in lines})
        assert sum(line.taxable_value for line in lines) == invoice.taxable_value
