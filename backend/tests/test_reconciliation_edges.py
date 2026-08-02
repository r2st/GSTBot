"""Reconciliation's defensive edges: bad data, and the run that fails.

test_reconciliation.py covers the matching itself — what counts as the same
invoice, what the credit arithmetic does with it. This file covers what
happens when the inputs are not the clean case, which for a reconciliation
engine is most of the time: an invoice whose extraction produced neither a
GSTIN nor a number, a stored 2B whose JSON has been hand-edited, a finding
about a supplier nobody can identify, and the run that raises partway through.

The through-line is that none of these may lose a period. A reconciliation is
evidence for an ITC claim that may be questioned years later, so a run that
goes wrong has to leave a row saying so — a run that vanishes looks exactly
like a period nobody reconciled.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.models.gstr_return import GSTRReturn, ReturnType
from app.models.reconciliation_run import MatchCategory, ReconciliationStatus
from app.models.supplier import Supplier
from app.services import reconciliation
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE
from tests.test_reconciliation import PERIOD, book, categories, import_2b, portal, save

# ---------------------------------------------------------------------------
# Invoices with nothing to identify them
# ---------------------------------------------------------------------------

class TestUnidentifiableInvoices:
    """Extraction failed on both identity fields. It still has to reconcile."""

    def test_two_invoices_with_no_gstin_and_no_number_are_not_duplicates(self):
        # Duplicate detection keys on (GSTIN, number). With both blank every
        # such invoice would collapse onto one key and the second would be
        # written off as a double claim — deleting a real credit because OCR
        # could not read a header.
        result = reconciliation.match(
            [
                book(id=1, counterparty_gstin=None, invoice_number=None),
                book(id=2, counterparty_gstin=None, invoice_number=None),
            ],
            [],
            period=PERIOD,
        )
        assert MatchCategory.DUPLICATE not in categories(result)
        assert categories(result) == [
            MatchCategory.MISSING_IN_2B,
            MatchCategory.MISSING_IN_2B,
        ]

    def test_an_empty_string_counts_as_blank_not_as_a_key(self):
        # OCR yields "" as often as it yields None.
        result = reconciliation.match(
            [
                book(id=1, counterparty_gstin="", invoice_number=""),
                book(id=2, counterparty_gstin="", invoice_number=""),
            ],
            [],
            period=PERIOD,
        )
        assert MatchCategory.DUPLICATE not in categories(result)

    def test_a_number_alone_is_still_enough_to_be_a_duplicate(self):
        # Only *both* fields blank disables the check. A missing GSTIN with a
        # real number is still the double-claim the check exists for.
        result = reconciliation.match(
            [
                book(id=1, counterparty_gstin=None, invoice_number="INV-2026-0042"),
                book(id=2, counterparty_gstin=None, invoice_number="INV-2026-0042"),
            ],
            [],
            period=PERIOD,
        )
        assert MatchCategory.DUPLICATE in categories(result)

    def test_a_gstin_alone_is_still_enough_to_be_a_duplicate(self):
        result = reconciliation.match(
            [
                book(id=1, invoice_number=None),
                book(id=2, invoice_number=None),
            ],
            [],
            period=PERIOD,
        )
        assert MatchCategory.DUPLICATE in categories(result)

    def test_an_unidentifiable_invoice_still_puts_its_credit_at_risk(self):
        # It cannot be matched, so the credit resting on it is unsupported.
        result = reconciliation.match(
            [book(id=1, counterparty_gstin=None, invoice_number=None)],
            [],
            period=PERIOD,
        )
        assert result.itc_at_risk == Decimal("81000.00")


class TestScoringWithoutASupplier:
    def test_a_finding_with_no_gstin_on_either_side_is_skipped(
        self, db_session, business
    ):
        # _score_suppliers keys on the GSTIN. A finding that has none belongs
        # to no supplier, and inventing a row for it would put an unnamed
        # entry in the user's supplier list.
        save(db_session, business.id, counterparty_gstin=None, invoice_number="NO-GSTIN-1")
        import_2b(db_session, business.id, [])

        run = reconciliation.run_reconciliation(db_session, business.id, PERIOD)

        assert run.status is ReconciliationStatus.COMPLETED
        assert run.report["suppliers"] == {}

    def test_the_run_still_counts_the_unattributable_invoice(
        self, db_session, business
    ):
        save(db_session, business.id, counterparty_gstin=None, invoice_number="NO-GSTIN-1")
        import_2b(db_session, business.id, [])

        run = reconciliation.run_reconciliation(db_session, business.id, PERIOD)
        assert run.total_invoices == 1
        assert run.missing_in_2b_count == 1

    def test_suppliers_that_can_be_identified_are_still_scored(
        self, db_session, business
    ):
        # The skip must not abort the loop and lose everyone after it. Scoring
        # only records against a supplier the tenant already has a row for, so
        # this one is created first.
        db_session.add(
            Supplier(
                business_id=business.id,
                gstin=SUPPLIER_GSTIN_OTHER_STATE,
                legal_name="Northwind Supplies",
            )
        )
        db_session.commit()

        save(db_session, business.id, counterparty_gstin=None, invoice_number="NO-GSTIN-1")
        save(db_session, business.id, invoice_number="INV-2026-0099")
        import_2b(db_session, business.id, [])

        run = reconciliation.run_reconciliation(db_session, business.id, PERIOD)
        assert SUPPLIER_GSTIN_OTHER_STATE in run.report["suppliers"]
        assert run.report["suppliers"][SUPPLIER_GSTIN_OTHER_STATE]["missing"] == 1


# ---------------------------------------------------------------------------
# Blocked credit that the supplier did declare
# ---------------------------------------------------------------------------

class TestBlockedCreditOnAMatchedInvoice:
    def test_a_matched_but_ineligible_invoice_claims_nothing(self):
        # s.17(5) credit is blocked whatever the portal says. Matching tells
        # the user the supplier filed it; it does not make the credit claimable.
        result = reconciliation.match(
            [book(itc_eligible=False)], [portal()], period=PERIOD
        )
        assert categories(result) == [MatchCategory.MATCHED]
        assert result.itc_claimed == Decimal("0.00")
        assert result.itc_at_risk == Decimal("0.00")

    def test_a_matched_reverse_charge_invoice_claims_nothing(self):
        # Reverse charge means the buyer pays the tax directly; there is no
        # supplier credit to reconcile even when the row is there.
        result = reconciliation.match(
            [book(reverse_charge=True)], [portal()], period=PERIOD
        )
        assert categories(result) == [MatchCategory.MATCHED]
        assert result.itc_claimed == Decimal("0.00")
        assert result.itc_at_risk == Decimal("0.00")

    def test_a_mismatched_but_ineligible_invoice_claims_nothing(self):
        # The figures differ *and* the credit is blocked: the user still wants
        # to see the mismatch, but no arithmetic follows from it.
        result = reconciliation.match(
            [book(itc_eligible=False)],
            [portal(igst=Decimal("70000.00"), total_value=Decimal("520000.00"))],
            period=PERIOD,
        )
        assert categories(result) == [MatchCategory.MISMATCHED]
        assert result.itc_claimed == Decimal("0.00")
        assert result.itc_at_risk == Decimal("0.00")

    def test_an_eligible_invoice_beside_it_is_unaffected(self):
        result = reconciliation.match(
            [book(id=1, itc_eligible=False), book(id=2, invoice_number="INV-2026-0099")],
            [portal(), portal(invoice_number="INV-2026-0099")],
            period=PERIOD,
        )
        assert result.itc_claimed == Decimal("81000.00")


# ---------------------------------------------------------------------------
# Reading a stored 2B back
# ---------------------------------------------------------------------------

def _stored_return(db_session, business_id, data) -> GSTRReturn:
    gstr_return = GSTRReturn(
        business_id=business_id,
        return_type=ReturnType.GSTR2B,
        period=PERIOD,
        data=data,
    )
    db_session.add(gstr_return)
    db_session.commit()
    db_session.refresh(gstr_return)
    return gstr_return


class TestRecordsFromReturn:
    def test_a_well_formed_row_round_trips(self, db_session, business):
        stored = _stored_return(
            db_session,
            business.id,
            {
                "invoices": [
                    {
                        "supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE,
                        "invoice_number": "INV-2026-0042",
                        "invoice_date": "2026-04-15",
                        "taxable_value": "450000.00",
                        "igst": "81000.00",
                        "total_value": "531000.00",
                    }
                ]
            },
        )
        records = reconciliation.records_from_return(stored)
        assert len(records) == 1
        assert records[0].invoice_number == "INV-2026-0042"
        assert records[0].igst == Decimal("81000.00")
        assert records[0].invoice_date == date(2026, 4, 15)

    @pytest.mark.parametrize(
        "junk",
        [
            ["not a dict"],
            [None],
            [42],
            [["nested", "list"]],
        ],
    )
    def test_non_dict_rows_are_skipped(self, db_session, business, junk):
        # The block is JSON in a column: a migration or a hand-edit can put
        # anything in it, and one bad row must not lose the whole statement.
        stored = _stored_return(db_session, business.id, {"invoices": junk})
        assert reconciliation.records_from_return(stored) == []

    def test_a_good_row_survives_beside_a_bad_one(self, db_session, business):
        stored = _stored_return(
            db_session,
            business.id,
            {
                "invoices": [
                    "garbage",
                    {"supplier_gstin": SUPPLIER_GSTIN_OTHER_STATE, "invoice_number": "INV-1"},
                    None,
                ]
            },
        )
        records = reconciliation.records_from_return(stored)
        assert [record.invoice_number for record in records] == ["INV-1"]

    @pytest.mark.parametrize(
        "data",
        [None, {}, {"invoices": None}, {"invoices": []}, {"other": "block"}, "a string"],
    )
    def test_a_missing_or_unusable_block_yields_no_records(
        self, db_session, business, data
    ):
        stored = _stored_return(db_session, business.id, data)
        assert reconciliation.records_from_return(stored) == []

    def test_missing_amounts_default_to_zero_rather_than_raising(
        self, db_session, business
    ):
        stored = _stored_return(
            db_session, business.id, {"invoices": [{"invoice_number": "INV-1"}]}
        )
        record = reconciliation.records_from_return(stored)[0]
        assert record.taxable_value == Decimal("0")
        assert record.total_value == Decimal("0")
        assert record.igst == Decimal("0")

    def test_an_unparseable_date_becomes_none_rather_than_raising(
        self, db_session, business
    ):
        stored = _stored_return(
            db_session,
            business.id,
            {"invoices": [{"invoice_number": "INV-1", "invoice_date": "not a date"}]},
        )
        assert reconciliation.records_from_return(stored)[0].invoice_date is None

    def test_the_itc_flag_defaults_to_available(self, db_session, business):
        # Absent means the portal did not restrict it; defaulting the other
        # way would silently move every credit into "at risk".
        stored = _stored_return(
            db_session, business.id, {"invoices": [{"invoice_number": "INV-1"}]}
        )
        assert reconciliation.records_from_return(stored)[0].itc_available is True


# ---------------------------------------------------------------------------
# A run that goes wrong
# ---------------------------------------------------------------------------

class TestAFailedRun:
    def test_the_run_row_records_the_failure(
        self, monkeypatch, db_session, business
    ):
        # The run row is the error channel: nobody is watching the return
        # value, and a period with no row looks like one nobody reconciled.
        save(db_session, business.id)
        import_2b(db_session, business.id, [portal()])
        monkeypatch.setattr(
            reconciliation,
            "match",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("matcher exploded")),
        )

        run = reconciliation.run_reconciliation(db_session, business.id, PERIOD)

        assert run.status is ReconciliationStatus.FAILED
        assert "matcher exploded" in run.error
        assert run.completed_at is not None

    def test_the_failure_does_not_propagate_to_the_caller(
        self, monkeypatch, db_session, business
    ):
        save(db_session, business.id)
        import_2b(db_session, business.id, [portal()])
        monkeypatch.setattr(
            reconciliation,
            "match",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        # No pytest.raises: the point is that this returns.
        assert reconciliation.run_reconciliation(db_session, business.id, PERIOD) is not None

    def test_the_failed_run_is_persisted_and_readable(
        self, monkeypatch, db_session, business
    ):
        save(db_session, business.id)
        import_2b(db_session, business.id, [portal()])
        monkeypatch.setattr(
            reconciliation,
            "match",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        run_id = reconciliation.run_reconciliation(db_session, business.id, PERIOD).id

        db_session.expire_all()
        from app.models.reconciliation_run import ReconciliationRun

        reloaded = db_session.get(ReconciliationRun, run_id)
        assert reloaded.status is ReconciliationStatus.FAILED

    def test_a_very_long_error_is_truncated_to_fit_the_column(
        self, monkeypatch, db_session, business
    ):
        save(db_session, business.id)
        import_2b(db_session, business.id, [portal()])
        monkeypatch.setattr(
            reconciliation,
            "match",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("x" * 5000)),
        )
        run = reconciliation.run_reconciliation(db_session, business.id, PERIOD)
        assert len(run.error) == 2000

    def test_a_missing_2b_still_raises_rather_than_recording_a_failure(
        self, db_session, business
    ):
        # This one is the caller's fault and is fixable by importing a 2B, so
        # it is an exception rather than a failed run the user has to read.
        with pytest.raises(reconciliation.NoGSTR2BImported):
            reconciliation.run_reconciliation(db_session, business.id, "2026-05")

    def test_a_failed_run_does_not_hide_the_previous_good_one(
        self, monkeypatch, db_session, business
    ):
        # Runs append rather than update, so the last successful reconciliation
        # of a period survives a later failure.
        save(db_session, business.id)
        import_2b(db_session, business.id, [portal()])
        good = reconciliation.run_reconciliation(db_session, business.id, PERIOD)
        assert good.status is ReconciliationStatus.COMPLETED

        monkeypatch.setattr(
            reconciliation,
            "match",
            lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        bad = reconciliation.run_reconciliation(db_session, business.id, PERIOD)

        assert bad.id != good.id
        db_session.expire_all()
        from app.models.reconciliation_run import ReconciliationRun

        assert (
            db_session.get(ReconciliationRun, good.id).status
            is ReconciliationStatus.COMPLETED
        )


# ---------------------------------------------------------------------------
# normalize_gstin
# ---------------------------------------------------------------------------

class TestNormalizeGstin:
    def test_a_valid_gstin_comes_back_normalised(self):
        assert (
            reconciliation.normalize_gstin(SUPPLIER_GSTIN_OTHER_STATE.lower())
            == SUPPLIER_GSTIN_OTHER_STATE
        )

    def test_surrounding_whitespace_is_tolerated(self):
        assert (
            reconciliation.normalize_gstin(f"  {SUPPLIER_GSTIN_OTHER_STATE}  ")
            == SUPPLIER_GSTIN_OTHER_STATE
        )

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_nothing_in_gives_none_out(self, value):
        assert reconciliation.normalize_gstin(value) is None

    @pytest.mark.parametrize(
        "value",
        [
            "not a gstin",
            "29AAGCB7383J1Z",  # one short
            "29AAGCB7383J1ZZ",  # wrong check digit
            "00AAGCB7383J1Z4",  # no such state
            "1234567890abcde",
        ],
    )
    def test_an_invalid_gstin_gives_none_rather_than_raising(self, value):
        # The router calls this on user-supplied filter values, so a raise
        # here would be a 500 on a typo.
        assert reconciliation.normalize_gstin(value) is None
