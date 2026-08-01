"""Schema-level guarantees: tenancy, soft delete, and the invoice natural key."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertType
from app.models.business import Business, BusinessPlan
from app.models.gstr_return import GSTRReturn, ReturnStatus, ReturnType
from app.models.invoice import Invoice, InvoiceType
from app.models.reconciliation_run import ReconciliationRun, ReconciliationStatus
from app.models.supplier import RiskLevel, Supplier
from app.models.user import User, UserRole
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE


@pytest.fixture()
def tenant(db_session) -> Business:
    business = Business(
        gstin=BUSINESS_GSTIN,
        legal_name="Umang Traders Private Limited",
        state_code="27",
        pan="AAPFU0939F",
        plan=BusinessPlan.FREE,
    )
    db_session.add(business)
    db_session.commit()
    db_session.refresh(business)
    return business


def make_invoice(db, business_id, **kwargs) -> Invoice:
    defaults = dict(
        business_id=business_id,
        invoice_type=InvoiceType.PURCHASE,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="N-1",
        invoice_date=date(2026, 4, 1),
        period="2026-04",
    )
    defaults.update(kwargs)
    invoice = Invoice(**defaults)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def test_gstin_is_globally_unique(db_session, tenant):
    db_session.add(Business(gstin=BUSINESS_GSTIN, legal_name="Impostor", state_code="27"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_email_is_globally_unique(db_session, tenant):
    for _ in range(2):
        db_session.add(
            User(
                business_id=tenant.id,
                email="dup@example.com",
                hashed_password="x",
                role=UserRole.OWNER,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_an_invoice_cannot_exist_without_a_tenant(db_session):
    """``business_id`` is not nullable — multi-tenancy is structural."""
    db_session.add(
        Invoice(invoice_type=InvoiceType.PURCHASE, invoice_number="ORPHAN-1")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_an_invoice_cannot_reference_a_missing_tenant(db_session):
    make = lambda: make_invoice(db_session, 9999)  # noqa: E731
    with pytest.raises(IntegrityError):
        make()


def test_the_same_invoice_number_from_one_supplier_is_rejected(db_session, tenant):
    """The natural key under GST: issuer GSTIN plus their invoice number.

    Booking one invoice twice is a duplicate ITC claim, which is what draws a
    departmental notice.
    """
    make_invoice(db_session, tenant.id, invoice_number="DUP-1")
    with pytest.raises(IntegrityError):
        make_invoice(db_session, tenant.id, invoice_number="DUP-1")


def test_the_same_number_from_a_different_supplier_is_fine(db_session, tenant):
    """Invoice numbers are only unique within an issuer's own series."""
    make_invoice(db_session, tenant.id, invoice_number="INV-001")
    invoice = make_invoice(
        db_session,
        tenant.id,
        invoice_number="INV-001",
        counterparty_gstin=SUPPLIER_GSTIN_SAME_STATE,
    )
    assert invoice.id is not None


def test_a_sale_and_a_purchase_may_share_a_number(db_session, tenant):
    make_invoice(db_session, tenant.id, invoice_number="X-1", invoice_type=InvoiceType.PURCHASE)
    invoice = make_invoice(
        db_session, tenant.id, invoice_number="X-1", invoice_type=InvoiceType.SALES
    )
    assert invoice.id is not None


def test_two_tenants_may_hold_the_same_invoice(db_session, tenant):
    other = Business(gstin=SUPPLIER_GSTIN_SAME_STATE, legal_name="Rival", state_code="27")
    db_session.add(other)
    db_session.commit()

    make_invoice(db_session, tenant.id, invoice_number="SHARED-1")
    invoice = make_invoice(db_session, other.id, invoice_number="SHARED-1")
    assert invoice.id is not None


def test_soft_delete_sets_a_timestamp_and_keeps_the_row(db_session, tenant):
    invoice = make_invoice(db_session, tenant.id)
    assert invoice.is_deleted is False

    invoice.soft_delete()
    db_session.commit()

    assert invoice.deleted_at is not None
    assert invoice.is_deleted is True
    assert db_session.get(Invoice, invoice.id) is not None


def test_money_is_stored_as_decimal_not_float(db_session, tenant):
    """A float cannot hold 18% of ₹1,234.56 exactly."""
    invoice = make_invoice(
        db_session,
        tenant.id,
        taxable_value=Decimal("1234.56"),
        igst=Decimal("222.22"),
        total_value=Decimal("1456.78"),
    )
    db_session.expire(invoice)

    assert isinstance(invoice.taxable_value, Decimal)
    assert invoice.taxable_value == Decimal("1234.56")
    assert invoice.total_tax == Decimal("222.22")


def test_total_tax_sums_every_head(db_session, tenant):
    invoice = make_invoice(
        db_session,
        tenant.id,
        cgst=Decimal("90.00"),
        sgst=Decimal("90.00"),
        cess=Decimal("10.00"),
    )
    assert invoice.total_tax == Decimal("190.00")


def test_timestamps_are_populated(db_session, tenant):
    invoice = make_invoice(db_session, tenant.id)
    assert invoice.created_at is not None
    assert invoice.updated_at is not None


def test_a_supplier_gstin_is_unique_per_tenant_not_globally(db_session, tenant):
    other = Business(gstin=SUPPLIER_GSTIN_SAME_STATE, legal_name="Rival", state_code="27")
    db_session.add(other)
    db_session.commit()

    db_session.add(Supplier(business_id=tenant.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    db_session.add(Supplier(business_id=other.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    db_session.commit()  # Same supplier, two buyers' books — both legitimate.

    db_session.add(Supplier(business_id=tenant.id, gstin=SUPPLIER_GSTIN_OTHER_STATE))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_a_new_supplier_is_unrated_rather_than_zero_rated(db_session, tenant):
    """Unknown and bad must not share a value.

    A score of 0 would mark every newly-seen supplier as high risk on their
    first invoice.
    """
    supplier = Supplier(business_id=tenant.id, gstin=SUPPLIER_GSTIN_OTHER_STATE)
    db_session.add(supplier)
    db_session.commit()

    assert supplier.compliance_score is None
    assert supplier.risk_level == RiskLevel.UNKNOWN


def test_one_return_per_period_and_type(db_session, tenant):
    db_session.add(
        GSTRReturn(business_id=tenant.id, period="2026-04", return_type=ReturnType.GSTR1)
    )
    db_session.commit()

    # A different type for the same period is a different document.
    db_session.add(
        GSTRReturn(business_id=tenant.id, period="2026-04", return_type=ReturnType.GSTR2B)
    )
    db_session.commit()

    db_session.add(
        GSTRReturn(business_id=tenant.id, period="2026-04", return_type=ReturnType.GSTR1)
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_a_return_defaults_to_draft(db_session, tenant):
    row = GSTRReturn(business_id=tenant.id, period="2026-04", return_type=ReturnType.GSTR3B)
    db_session.add(row)
    db_session.commit()
    assert row.status == ReturnStatus.DRAFT


def test_json_columns_round_trip(db_session, tenant):
    row = GSTRReturn(
        business_id=tenant.id,
        period="2026-04",
        return_type=ReturnType.GSTR1,
        data={"b2b": [{"ctin": SUPPLIER_GSTIN_OTHER_STATE, "inv": [{"val": 531000}]}]},
        validation_errors=["missing HSN on 2 invoices"],
    )
    db_session.add(row)
    db_session.commit()
    db_session.expire(row)

    assert row.data["b2b"][0]["ctin"] == SUPPLIER_GSTIN_OTHER_STATE
    assert row.validation_errors == ["missing HSN on 2 invoices"]


def test_reconciliation_runs_accumulate_rather_than_replace(db_session, tenant):
    """A period is reconciled repeatedly as suppliers file late.

    "What did we know, and when" is the question an ITC reversal turns on
    months later, so runs are a log rather than a single mutable result.
    """
    for matched in (5, 8):
        db_session.add(
            ReconciliationRun(
                business_id=tenant.id,
                period="2026-04",
                status=ReconciliationStatus.COMPLETED,
                matched_count=matched,
            )
        )
    db_session.commit()

    runs = db_session.query(ReconciliationRun).filter_by(period="2026-04").all()
    assert sorted(r.matched_count for r in runs) == [5, 8]


def test_alert_defaults(db_session, tenant):
    alert = Alert(
        business_id=tenant.id,
        alert_type=AlertType.FILING_DEADLINE,
        title="GSTR-3B due",
        message="Your GSTR-3B for 2026-04 is due on 20 May 2026.",
        due_date=date(2026, 5, 20),
    )
    db_session.add(alert)
    db_session.commit()

    assert alert.status == AlertStatus.PENDING
    assert alert.severity == AlertSeverity.INFO
    assert alert.sent_at is None


def test_deleting_a_business_cascades_to_its_invoices(db_session, tenant):
    make_invoice(db_session, tenant.id)
    db_session.delete(tenant)
    db_session.commit()
    assert db_session.query(Invoice).count() == 0
