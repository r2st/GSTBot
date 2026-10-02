"""A DUPLICATE invoice is excluded from every register that counts money.

Reconciliation marks a second copy of the same invoice as DUPLICATE.  Before
this status existed the copy kept PARSED and was silently counted in the ITC
pool, Rule 37, capital goods, filing and the tax summary — double-declaring
credit, reversals and supplies.

Each test here holds a single DUPLICATE invoice and asserts that the function
under test does not see it.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.invoice import UNCOUNTABLE_STATUSES, Invoice, InvoiceStatus, InvoiceType
from app.services import filing, invoice_service
from app.services import itc as itc_service
from tests.conftest import SUPPLIER_GSTIN_OTHER_STATE

PERIOD = "2026-04"


def _purchase(**kwargs) -> Invoice:
    defaults = dict(
        id=kwargs.pop("id", 1),
        business_id=1,
        invoice_type=InvoiceType.PURCHASE,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        counterparty_name="Northwind Supplies",
        invoice_number="INV-1",
        invoice_date=date(2026, 4, 15),
        period=PERIOD,
        taxable_value=Decimal("100000.00"),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("18000.00"),
        cess=Decimal("0.00"),
        total_value=Decimal("118000.00"),
        itc_eligible=True,
        reverse_charge=False,
        is_capital_good=False,
        paid_at=None,
    )
    defaults.update(kwargs)
    return Invoice(**defaults)


def _save(db, business_id, **kwargs) -> Invoice:
    invoice = _purchase(id=None, business_id=business_id, **kwargs)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


# ---------------------------------------------------------------------------
# The enum member itself
# ---------------------------------------------------------------------------

class TestDuplicateIsUncountable:
    def test_duplicate_is_in_uncountable_statuses(self):
        assert InvoiceStatus.DUPLICATE in UNCOUNTABLE_STATUSES

    def test_duplicate_is_a_valid_status_string(self):
        assert InvoiceStatus.DUPLICATE.value == "duplicate"


# ---------------------------------------------------------------------------
# ITC purchase register — _purchases()
# ---------------------------------------------------------------------------

class TestAPurchaseRegisterExcludesDuplicates:
    def test_a_parsed_invoice_is_in_the_register(self, db_session, business):
        _save(db_session, business.id, status=InvoiceStatus.PARSED)
        result = itc_service.purchase_invoices(db_session, business.id, PERIOD)
        assert len(result) == 1

    def test_a_duplicate_invoice_is_not_in_the_register(self, db_session, business):
        _save(db_session, business.id, status=InvoiceStatus.DUPLICATE)
        result = itc_service.purchase_invoices(db_session, business.id, PERIOD)
        assert len(result) == 0


# ---------------------------------------------------------------------------
# ITC pool via summarise — Rule 37 and capital goods see duplicates only
# through _purchases(), which is the guard
# ---------------------------------------------------------------------------

class TestITCSummariseExcludesDuplicateCredit:
    def test_a_duplicate_does_not_inflate_the_available_pool(
        self, db_session, business
    ):
        """Two invoices with the same credit: only the original counts."""
        _save(db_session, business.id, invoice_number="ORIG-1",
              status=InvoiceStatus.PARSED)
        _save(db_session, business.id, invoice_number="DUP-1",
              counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
              status=InvoiceStatus.DUPLICATE)
        summary = itc_service.summarise(db_session, business.id, PERIOD)
        assert summary.available.igst == Decimal("18000.00")
        assert summary.invoice_count == 1


# ---------------------------------------------------------------------------
# Filing — _invoices()
# ---------------------------------------------------------------------------

class TestFilingExcludesDuplicates:
    def test_a_parsed_invoice_is_filable(self, db_session, business):
        _save(db_session, business.id, invoice_number="S-1",
              invoice_type=InvoiceType.SALES, status=InvoiceStatus.PARSED)
        invoices = filing._invoices(db_session, business.id, PERIOD, InvoiceType.SALES)
        assert len(invoices) == 1

    def test_a_duplicate_invoice_is_not_filable(self, db_session, business):
        _save(db_session, business.id, invoice_number="S-1",
              invoice_type=InvoiceType.SALES, status=InvoiceStatus.DUPLICATE)
        invoices = filing._invoices(db_session, business.id, PERIOD, InvoiceType.SALES)
        assert len(invoices) == 0


# ---------------------------------------------------------------------------
# Filing validation names duplicates specifically
# ---------------------------------------------------------------------------

class TestValidationReportsDuplicates:
    def test_a_duplicate_invoice_appears_as_a_validation_issue(
        self, db_session, business
    ):
        _save(db_session, business.id, invoice_number="S-1",
              invoice_type=InvoiceType.SALES, status=InvoiceStatus.DUPLICATE)
        report = filing.validate_period(db_session, business, PERIOD,
                                        invoice_type=InvoiceType.SALES)
        assert len(report.issues) == 1
        assert "duplicate" in report.issues[0].message.lower()


# ---------------------------------------------------------------------------
# Tax summary excludes duplicates
# ---------------------------------------------------------------------------

class TestTaxSummaryExcludesDuplicates:
    def test_a_parsed_purchase_is_counted_in_the_summary(self, db_session, business):
        _save(db_session, business.id)
        result = invoice_service.tax_summary(db_session, business.id, PERIOD)
        assert result["purchase"]["count"] > 0

    def test_a_duplicate_purchase_is_not_counted_in_the_summary(
        self, db_session, business
    ):
        _save(db_session, business.id, status=InvoiceStatus.DUPLICATE)
        result = invoice_service.tax_summary(db_session, business.id, PERIOD)
        assert result["purchase"]["count"] == 0
