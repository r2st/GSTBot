"""The invoice API: upload, tenancy, dedup, plan limits, review."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.business import BusinessPlan
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.supplier import Supplier
from app.services import invoice_service
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE


def upload(client, text: str, *, name: str = "invoice.txt", invoice_type: str = "purchase"):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": invoice_type},
    )


# --------------------------------------------------------------------------
# Upload
# --------------------------------------------------------------------------

def test_upload_extracts_and_stores_an_invoice(auth_client, sample_invoice_text):
    response = upload(auth_client, sample_invoice_text)
    assert response.status_code == 201, response.text
    body = response.json()

    # Celery is off in tests, so extraction has already run inline.
    assert body["queued"] is False
    invoice = body["invoice"]
    assert invoice["status"] == InvoiceStatus.PARSED.value
    assert invoice["invoice_type"] == InvoiceType.PURCHASE.value
    assert invoice["invoice_number"] == "INV-2026-0042"
    assert invoice["invoice_date"] == "2026-04-15"
    assert invoice["period"] == "2026-04"
    assert Decimal(invoice["igst"]) == Decimal("81000.00")
    assert Decimal(invoice["total_value"]) == Decimal("531000.00")


def test_upload_records_the_counterparty_not_the_tenant(auth_client, sample_invoice_text):
    """On a purchase the counterparty is the supplier, never ourselves.

    The invoice carries both GSTINs; picking the wrong one would file our own
    registration as the vendor on every purchase we make.
    """
    invoice = upload(auth_client, sample_invoice_text).json()["invoice"]
    assert invoice["counterparty_gstin"] == SUPPLIER_GSTIN_OTHER_STATE
    assert invoice["counterparty_gstin"] != BUSINESS_GSTIN


def test_upload_creates_a_supplier_for_a_purchase(auth_client, db_session, sample_invoice_text):
    upload(auth_client, sample_invoice_text)
    supplier = db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).one()
    assert supplier.state_code == "29"


def test_two_invoices_from_one_supplier_share_a_supplier_row(auth_client, db_session):
    for number in ("A-1", "A-2"):
        upload(
            auth_client,
            f"GSTIN: {SUPPLIER_GSTIN_OTHER_STATE}\nInvoice No: {number}\n"
            f"Invoice Date: 01/04/2026\nTotal Amount: 1000.00",
            name=f"{number}.txt",
        )
    assert db_session.query(Supplier).filter_by(gstin=SUPPLIER_GSTIN_OTHER_STATE).count() == 1


def test_a_sales_upload_does_not_create_a_supplier(auth_client, db_session, sample_invoice_text):
    upload(auth_client, sample_invoice_text, invoice_type="sales")
    assert db_session.query(Supplier).count() == 0


def test_upload_requires_authentication(client, sample_invoice_text):
    assert upload(client, sample_invoice_text).status_code == 401


def test_an_empty_file_is_rejected(auth_client):
    response = auth_client.post(
        "/api/v1/invoices/upload",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"invoice_type": "purchase"},
    )
    assert response.status_code == 400


def test_an_unsupported_file_type_is_rejected(auth_client):
    response = auth_client.post(
        "/api/v1/invoices/upload",
        files={"file": ("virus.exe", b"MZ\x90\x00", "application/x-msdownload")},
        data={"invoice_type": "purchase"},
    )
    assert response.status_code == 415


def test_an_oversized_file_is_rejected(auth_client):
    from app.core.config import settings

    oversized = b"x" * (settings.max_upload_mb * 1024 * 1024 + 1)
    response = auth_client.post(
        "/api/v1/invoices/upload",
        files={"file": ("big.txt", oversized, "text/plain")},
        data={"invoice_type": "purchase"},
    )
    assert response.status_code == 413


def test_an_unparseable_upload_is_kept_rather_than_refused(auth_client):
    """A file we cannot read is still the user's document.

    It comes back as a row with warnings, because a rejected upload means the
    business has to find the paper again.
    """
    response = upload(auth_client, "this text contains no invoice fields whatsoever")
    assert response.status_code == 201
    invoice = response.json()["invoice"]
    assert invoice["status"] == InvoiceStatus.PARSED.value
    assert invoice["warnings"]


# --------------------------------------------------------------------------
# Deduplication
# --------------------------------------------------------------------------

def test_the_same_file_twice_is_a_conflict(auth_client, sample_invoice_text):
    """Duplicate uploads are duplicate ITC claims, which draw a notice."""
    first = upload(auth_client, sample_invoice_text)
    assert first.status_code == 201

    second = upload(auth_client, sample_invoice_text)
    assert second.status_code == 409
    assert second.json()["detail"]["invoice_id"] == first.json()["invoice"]["id"]


def test_the_same_file_may_be_uploaded_by_a_different_tenant(
    client, auth_client, other_tenant, sample_invoice_text
):
    """Dedup is per tenant.

    Two businesses can legitimately hold the same invoice — one as a sale, the
    other as a purchase — and a global hash check would block the second.
    """
    assert upload(auth_client, sample_invoice_text).status_code == 201

    client.headers.update({"Authorization": f"Bearer {other_tenant}"})
    assert upload(client, sample_invoice_text).status_code == 201


# --------------------------------------------------------------------------
# Plan limits
# --------------------------------------------------------------------------

def test_the_free_plan_caps_monthly_uploads(auth_client, db_session, business, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=2,starter=500,pro=0")
    for i in range(2):
        assert upload(auth_client, f"Invoice No: A-{i}\nTotal Amount: 100.00",
                      name=f"a{i}.txt").status_code == 201

    blocked = upload(auth_client, "Invoice No: A-3\nTotal Amount: 100.00", name="a3.txt")
    assert blocked.status_code == 402
    assert "upgrade" in blocked.json()["detail"].lower()


def test_a_paid_plan_is_uncapped(auth_client, db_session, business, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=1,pro=0")
    business.plan = BusinessPlan.PRO
    db_session.commit()

    for i in range(3):
        assert upload(auth_client, f"Invoice No: B-{i}\nTotal Amount: 100.00",
                      name=f"b{i}.txt").status_code == 201


def test_soft_deleted_invoices_do_not_count_against_the_plan(
    auth_client, db_session, monkeypatch
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=1")
    first = upload(auth_client, "Invoice No: C-1\nTotal Amount: 100.00", name="c1.txt")
    assert first.status_code == 201

    auth_client.delete(f"/api/v1/invoices/{first.json()['invoice']['id']}")
    assert upload(auth_client, "Invoice No: C-2\nTotal Amount: 100.00",
                  name="c2.txt").status_code == 201


class TestThePlanMonthIsTheIndianMonth:
    """A business's allowance resets when *their* month rolls over.

    Counted against UTC midnight, the reset is 05:30 IST on the 1st: a business
    that used up October is told to upgrade for five and a half hours of a
    November they have already entered, and whatever they do upload in that
    window is charged to the month that closed.
    """

    def test_the_month_starts_at_midnight_in_india(self):
        start, end = invoice_service.month_bounds("2026-05")

        # 00:00 IST on 1 May is 18:30 UTC on 30 April.
        assert start == datetime(2026, 4, 30, 18, 30, tzinfo=UTC)
        assert end == datetime(2026, 5, 31, 18, 30, tzinfo=UTC)

    def test_december_rolls_into_january(self):
        start, end = invoice_service.month_bounds("2026-12")

        assert start == datetime(2026, 11, 30, 18, 30, tzinfo=UTC)
        assert end == datetime(2026, 12, 31, 18, 30, tzinfo=UTC)

    def test_the_bounds_are_utc_because_the_stored_timestamps_are(self):
        """Not merely cosmetic — an IST-aware bound is wrong on SQLite.

        SQLAlchemy's SQLite DateTime formats whatever wall clock the value
        carries and drops the offset, so handing the query 00:00+05:30 would
        compare "00:00" against UTC-stored rows: right on Postgres, five and a
        half hours out in the suite, and nothing would catch it.
        """
        start, end = invoice_service.month_bounds("2026-05")
        assert start.utcoffset() == timedelta(0)
        assert end.utcoffset() == timedelta(0)

    def test_an_upload_just_after_midnight_ist_counts_against_the_new_month(
        self, db_session, business
    ):
        db_session.add(
            Invoice(
                business_id=business.id,
                invoice_type=InvoiceType.PURCHASE,
                status=InvoiceStatus.PARSED,
                # 00:30 IST on 1 May 2026 — still 30 April in UTC.
                created_at=datetime(2026, 4, 30, 19, 0, tzinfo=UTC),
                updated_at=datetime(2026, 4, 30, 19, 0, tzinfo=UTC),
            )
        )
        db_session.commit()

        assert invoice_service.monthly_usage(db_session, business.id, "2026-05") == 1
        assert invoice_service.monthly_usage(db_session, business.id, "2026-04") == 0


# --------------------------------------------------------------------------
# Listing and tenancy
# --------------------------------------------------------------------------

def test_list_returns_only_the_callers_invoices(
    client, auth_client, other_tenant, sample_invoice_text
):
    upload(auth_client, sample_invoice_text)
    own_token = auth_client.headers["Authorization"]

    client.headers.update({"Authorization": f"Bearer {other_tenant}"})
    upload(client, "Invoice No: OTHER-1\nTotal Amount: 500.00", name="other.txt")
    rival = client.get("/api/v1/invoices").json()
    assert rival["total"] == 1
    assert rival["items"][0]["invoice_number"] == "OTHER-1"

    client.headers.update({"Authorization": own_token})
    mine = client.get("/api/v1/invoices").json()
    assert mine["total"] == 1
    assert mine["items"][0]["invoice_number"] == "INV-2026-0042"


def test_another_tenants_invoice_is_not_found(
    client, auth_client, other_tenant, sample_invoice_text
):
    """404 rather than 403.

    A 403 would confirm the id exists, which is enough to measure a
    competitor's invoice volume by probing.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    client.headers.update({"Authorization": f"Bearer {other_tenant}"})
    assert client.get(f"/api/v1/invoices/{invoice_id}").status_code == 404
    assert client.patch(f"/api/v1/invoices/{invoice_id}", json={"hsn_code": "1"}).status_code == 404
    assert client.delete(f"/api/v1/invoices/{invoice_id}").status_code == 404


def test_list_filters(auth_client, sample_invoice_text):
    upload(auth_client, sample_invoice_text)
    upload(auth_client, "Invoice No: S-1\nInvoice Date: 10/05/2026\nTotal Amount: 200.00",
           name="s1.txt", invoice_type="sales")

    assert auth_client.get("/api/v1/invoices?invoice_type=sales").json()["total"] == 1
    assert auth_client.get("/api/v1/invoices?invoice_type=purchase").json()["total"] == 1
    assert auth_client.get("/api/v1/invoices?period=2026-04").json()["total"] == 1
    assert auth_client.get("/api/v1/invoices?period=2026-05").json()["total"] == 1
    assert auth_client.get("/api/v1/invoices?period=2026-06").json()["total"] == 0
    assert auth_client.get("/api/v1/invoices?search=INV-2026").json()["total"] == 1
    assert (
        auth_client.get(
            f"/api/v1/invoices?counterparty_gstin={SUPPLIER_GSTIN_OTHER_STATE}"
        ).json()["total"]
        == 1
    )


def test_list_rejects_a_malformed_period(auth_client):
    assert auth_client.get("/api/v1/invoices?period=April").status_code == 422


def test_list_paginates(auth_client):
    for i in range(5):
        upload(auth_client, f"Invoice No: P-{i}\nTotal Amount: 100.00", name=f"p{i}.txt")

    page = auth_client.get("/api/v1/invoices?limit=2&offset=0").json()
    assert page["total"] == 5
    assert len(page["items"]) == 2

    tail = auth_client.get("/api/v1/invoices?limit=2&offset=4").json()
    assert len(tail["items"]) == 1


# --------------------------------------------------------------------------
# Review and correction
# --------------------------------------------------------------------------

def test_patch_applies_corrections(auth_client, sample_invoice_text):
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"invoice_number": "CORRECTED-1", "taxable_value": "450000.00"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["invoice_number"] == "CORRECTED-1"
    assert body["parsed_with"] == "manual"
    assert body["extraction_confidence"] == 1.0


def test_patch_leaves_unmentioned_fields_alone(auth_client, sample_invoice_text):
    """A user fixing one field must not blank the rest by omission."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"hsn_code": "84713090"}
    ).json()
    assert body["hsn_code"] == "84713090"
    assert Decimal(body["igst"]) == Decimal("81000.00")
    assert body["invoice_number"] == "INV-2026-0042"


def test_patch_recomputes_the_period_from_a_corrected_date(auth_client, sample_invoice_text):
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"invoice_date": "2026-05-20"}
    ).json()
    assert body["period"] == "2026-05"


def test_patch_rejects_an_invalid_gstin(auth_client, sample_invoice_text):
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"counterparty_gstin": "27AAPFU0939F1ZW"}
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "field",
    ["taxable_value", "cgst", "sgst", "igst", "cess", "total_value",
     "itc_eligible", "reverse_charge"],
)
def test_patch_refuses_to_clear_a_field_the_invoice_must_have(
    auth_client, sample_invoice_text, field
):
    """Clearing a tax box is a validation error, not a duplicate.

    These columns are NOT NULL. The null went through to the database and came
    back as an integrity error, which the API reports as 409 "that record
    conflicts with one that already exists" — a reviewer is then hunting for a
    duplicate invoice that was never there. It also leaves the request's
    session needing a rollback.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    response = auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={field: None})

    assert response.status_code == 422, response.text
    assert field in response.text
    # And the invoice is untouched, not half-written.
    after = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()
    assert Decimal(after["igst"]) == Decimal("81000.00")


def test_patch_still_zeroes_a_head_that_is_sent_as_zero(auth_client, sample_invoice_text):
    """Refusing null must not refuse the correction it stands in for."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"igst": "0.00", "cgst": "40500.00", "sgst": "40500.00"},
    ).json()

    assert Decimal(body["igst"]) == Decimal("0.00")
    assert Decimal(body["cgst"]) == Decimal("40500.00")


def test_patch_still_clears_a_field_that_can_be_empty(auth_client, sample_invoice_text):
    """A misread GSTIN is taken off the invoice by sending null."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"counterparty_gstin": None}
    ).json()

    assert body["counterparty_gstin"] is None


def test_a_correction_links_a_supplier(auth_client, db_session):
    invoice_id = upload(auth_client, "no fields here", name="blank.txt").json()["invoice"]["id"]
    auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"counterparty_gstin": SUPPLIER_GSTIN_SAME_STATE, "counterparty_name": "Mumbai HW"},
    )
    invoice = db_session.get(Invoice, invoice_id)
    assert invoice.supplier_id is not None
    assert db_session.get(Supplier, invoice.supplier_id).gstin == SUPPLIER_GSTIN_SAME_STATE


def test_reparse_reruns_extraction(auth_client, sample_invoice_text):
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    response = auth_client.post(f"/api/v1/invoices/{invoice_id}/reparse")
    assert response.status_code == 200
    assert response.json()["invoice_number"] == "INV-2026-0042"


def test_delete_is_soft(auth_client, db_session, sample_invoice_text):
    """The row survives: a filing can be reopened during an assessment."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    assert auth_client.delete(f"/api/v1/invoices/{invoice_id}").status_code == 204
    assert auth_client.get(f"/api/v1/invoices/{invoice_id}").status_code == 404

    row = db_session.get(Invoice, invoice_id)
    assert row is not None
    assert row.deleted_at is not None


def test_get_returns_the_extraction_and_warnings(auth_client):
    invoice_id = upload(auth_client, "nothing useful", name="junk.txt").json()["invoice"]["id"]
    body = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()
    assert body["warnings"]
    assert body["extraction"] is not None


def test_a_missing_invoice_is_404(auth_client):
    assert auth_client.get("/api/v1/invoices/999999").status_code == 404


# --------------------------------------------------------------------------
# Storage
# --------------------------------------------------------------------------

def test_the_uploaded_file_is_stored_under_the_tenant(auth_client, db_session, business):
    from pathlib import Path

    invoice_id = upload(auth_client, "Invoice No: F-1\nTotal Amount: 10.00",
                        name="f1.txt").json()["invoice"]["id"]
    invoice = db_session.get(Invoice, invoice_id)

    path = Path(invoice.storage_path)
    assert path.exists()
    # Namespaced by tenant, and the stored name is not attacker-controlled.
    assert path.parent.name == str(business.id)
    assert path.name != "f1.txt"


def test_period_and_date_survive_the_round_trip(auth_client, db_session, sample_invoice_text):
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    invoice = db_session.get(Invoice, invoice_id)
    assert invoice.invoice_date == date(2026, 4, 15)
    assert invoice.period == "2026-04"
    assert invoice.total_tax == Decimal("81000.00")
