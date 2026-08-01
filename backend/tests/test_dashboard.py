"""The dashboard: counts, the tax summary, and the liability arithmetic."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.reconciliation_run import ReconciliationRun, ReconciliationStatus
from app.routers.dashboard import _previous_periods
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE


def make_invoice(db, business_id, **kwargs) -> Invoice:
    """Insert an invoice directly, so a test controls the exact figures."""
    defaults = dict(
        business_id=business_id,
        invoice_type=InvoiceType.PURCHASE,
        status=InvoiceStatus.PARSED,
        counterparty_gstin=SUPPLIER_GSTIN_OTHER_STATE,
        invoice_number="T-1",
        invoice_date=date(2026, 4, 10),
        period="2026-04",
        taxable_value=Decimal("0.00"),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("0.00"),
        cess=Decimal("0.00"),
        total_value=Decimal("0.00"),
        extraction_confidence=0.9,
    )
    defaults.update(kwargs)
    invoice = Invoice(**defaults)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def test_dashboard_requires_authentication(client):
    assert client.get("/api/v1/dashboard").status_code == 401


def test_empty_dashboard_is_all_zeroes(auth_client):
    body = auth_client.get("/api/v1/dashboard").json()
    assert body["business_gstin"] == BUSINESS_GSTIN
    assert body["business_name"] == "Umang Traders"
    assert body["counts"]["total"] == 0
    assert Decimal(body["output_tax"]) == Decimal("0.00")
    assert Decimal(body["net_liability"]["total"]) == Decimal("0.00")


def test_counts_split_by_type_and_status(auth_client, db_session, business):
    make_invoice(db_session, business.id, invoice_type=InvoiceType.SALES, invoice_number="S-1")
    make_invoice(db_session, business.id, invoice_type=InvoiceType.SALES, invoice_number="S-2")
    make_invoice(db_session, business.id, invoice_type=InvoiceType.PURCHASE, invoice_number="P-1")
    make_invoice(
        db_session,
        business.id,
        invoice_number="P-2",
        status=InvoiceStatus.FAILED,
        extraction_confidence=0.1,
    )

    counts = auth_client.get("/api/v1/dashboard").json()["counts"]
    assert counts["total"] == 4
    assert counts["sales"] == 2
    assert counts["purchase"] == 2
    assert counts["by_status"][InvoiceStatus.PARSED.value] == 3
    assert counts["by_status"][InvoiceStatus.FAILED.value] == 1


def test_low_confidence_invoices_are_queued_for_review(auth_client, db_session, business):
    make_invoice(db_session, business.id, invoice_number="OK-1", extraction_confidence=0.95)
    make_invoice(db_session, business.id, invoice_number="LOW-1", extraction_confidence=0.2)
    make_invoice(db_session, business.id, invoice_number="NONE-1", extraction_confidence=None)

    assert auth_client.get("/api/v1/dashboard").json()["counts"]["needs_review"] == 2


def test_tax_summary_totals_the_period(auth_client, db_session, business):
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.SALES, invoice_number="S-1",
        taxable_value=Decimal("100000.00"), igst=Decimal("18000.00"),
        total_value=Decimal("118000.00"),
    )
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.PURCHASE, invoice_number="P-1",
        taxable_value=Decimal("50000.00"), igst=Decimal("9000.00"),
        total_value=Decimal("59000.00"),
    )

    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert Decimal(body["sales"]["igst"]) == Decimal("18000.00")
    assert Decimal(body["sales"]["total_tax"]) == Decimal("18000.00")
    assert Decimal(body["purchase"]["total_tax"]) == Decimal("9000.00")
    assert Decimal(body["output_tax"]) == Decimal("18000.00")
    assert Decimal(body["input_tax_credit"]) == Decimal("9000.00")
    assert Decimal(body["net_liability"]["igst"]) == Decimal("9000.00")
    assert Decimal(body["net_liability"]["total"]) == Decimal("9000.00")


def test_liability_is_kept_separate_per_head(auth_client, db_session, business):
    """CGST credit cannot discharge an SGST liability.

    Netting the heads together would show this business owing nothing, when
    in fact it owes the whole SGST and is sitting on unusable CGST credit.
    """
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.SALES, invoice_number="S-1",
        taxable_value=Decimal("100000.00"), sgst=Decimal("9000.00"),
        total_value=Decimal("109000.00"),
    )
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.PURCHASE, invoice_number="P-1",
        taxable_value=Decimal("100000.00"), cgst=Decimal("9000.00"),
        total_value=Decimal("109000.00"),
    )

    liability = auth_client.get("/api/v1/dashboard?period=2026-04").json()["net_liability"]
    assert Decimal(liability["sgst"]) == Decimal("9000.00")
    assert Decimal(liability["cgst"]) == Decimal("0.00")
    assert Decimal(liability["total"]) == Decimal("9000.00")


def test_excess_credit_floors_at_zero_rather_than_going_negative(
    auth_client, db_session, business
):
    """Surplus credit carries forward; it is not money coming back."""
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.SALES, invoice_number="S-1",
        taxable_value=Decimal("10000.00"), igst=Decimal("1800.00"),
        total_value=Decimal("11800.00"),
    )
    make_invoice(
        db_session, business.id,
        invoice_type=InvoiceType.PURCHASE, invoice_number="P-1",
        taxable_value=Decimal("100000.00"), igst=Decimal("18000.00"),
        total_value=Decimal("118000.00"),
    )

    liability = auth_client.get("/api/v1/dashboard?period=2026-04").json()["net_liability"]
    assert Decimal(liability["igst"]) == Decimal("0.00")
    assert Decimal(liability["total"]) == Decimal("0.00")


def test_the_period_filter_scopes_the_money_but_not_the_counts(
    auth_client, db_session, business
):
    make_invoice(
        db_session, business.id, invoice_number="APR-1", period="2026-04",
        invoice_date=date(2026, 4, 5), igst=Decimal("1000.00"),
    )
    make_invoice(
        db_session, business.id, invoice_number="MAY-1", period="2026-05",
        invoice_date=date(2026, 5, 5), igst=Decimal("2000.00"),
    )

    april = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert Decimal(april["purchase"]["igst"]) == Decimal("1000.00")
    assert april["counts"]["total"] == 2  # Counts are lifetime.

    may = auth_client.get("/api/v1/dashboard?period=2026-05").json()
    assert Decimal(may["purchase"]["igst"]) == Decimal("2000.00")


def test_soft_deleted_invoices_are_excluded(auth_client, db_session, business):
    invoice = make_invoice(db_session, business.id, invoice_number="D-1",
                           igst=Decimal("5000.00"))
    invoice.soft_delete()
    db_session.commit()

    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert body["counts"]["total"] == 0
    assert Decimal(body["purchase"]["igst"]) == Decimal("0.00")


def test_another_tenants_invoices_never_appear(client, auth_client, other_tenant, db_session):
    from app.models.business import Business

    rival = db_session.query(Business).filter_by(legal_name="Rival Trading Co").one()
    make_invoice(db_session, rival.id, invoice_number="R-1", igst=Decimal("99999.00"))

    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert body["counts"]["total"] == 0
    assert Decimal(body["purchase"]["igst"]) == Decimal("0.00")


def test_plan_usage_is_reported(auth_client, db_session, business, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=50")
    make_invoice(db_session, business.id, invoice_number="U-1")

    usage = auth_client.get("/api/v1/dashboard").json()["plan_usage"]
    assert usage["plan"] == "free"
    assert usage["monthly_limit"] == 50
    assert usage["invoices_this_month"] == 1
    assert usage["remaining"] == 49


def test_an_unlimited_plan_reports_no_remaining(auth_client, db_session, business, monkeypatch):
    from app.core.config import settings
    from app.models.business import BusinessPlan

    monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=50,pro=0")
    business.plan = BusinessPlan.PRO
    db_session.commit()

    usage = auth_client.get("/api/v1/dashboard").json()["plan_usage"]
    assert usage["monthly_limit"] == 0
    assert usage["remaining"] is None


def test_the_gstr3b_due_date_is_the_twentieth_of_the_next_month(auth_client):
    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert body["next_due_date"] == "2026-05-20"


def test_the_due_date_rolls_over_the_year(auth_client):
    body = auth_client.get("/api/v1/dashboard?period=2026-12").json()
    assert body["next_due_date"] == "2027-01-20"


def test_recent_periods_run_oldest_first_and_cross_the_year(auth_client):
    periods = [p["period"] for p in auth_client.get(
        "/api/v1/dashboard?period=2026-02").json()["recent_periods"]]
    assert periods == ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]


def test_previous_periods_helper():
    assert _previous_periods("2026-03", 3) == ["2026-01", "2026-02", "2026-03"]
    assert _previous_periods("2026-01", 2) == ["2025-12", "2026-01"]


def test_itc_at_risk_comes_from_the_latest_reconciliation(auth_client, db_session, business):
    db_session.add(
        ReconciliationRun(
            business_id=business.id,
            period="2026-04",
            status=ReconciliationStatus.COMPLETED,
            matched_count=8,
            mismatched_count=1,
            missing_in_2b_count=2,
            itc_eligible=Decimal("70000.00"),
            itc_at_risk=Decimal("12000.00"),
        )
    )
    db_session.commit()

    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert Decimal(body["itc_at_risk"]) == Decimal("12000.00")
    assert body["last_reconciliation"]["matched"] == 8
    assert body["last_reconciliation"]["missing_in_2b"] == 2


def test_a_malformed_period_is_rejected(auth_client):
    assert auth_client.get("/api/v1/dashboard?period=2026-4").status_code == 422
    assert auth_client.get("/api/v1/dashboard?period=April").status_code == 422


def test_dashboard_reflects_a_real_upload(auth_client, sample_invoice_text):
    """End to end: the number on the invoice reaches the dashboard."""
    auth_client.post(
        "/api/v1/invoices/upload",
        files={"file": ("inv.txt", sample_invoice_text.encode(), "text/plain")},
        data={"invoice_type": "purchase"},
    )
    body = auth_client.get("/api/v1/dashboard?period=2026-04").json()
    assert body["counts"]["purchase"] == 1
    assert Decimal(body["purchase"]["igst"]) == Decimal("81000.00")
    assert Decimal(body["input_tax_credit"]) == Decimal("81000.00")
