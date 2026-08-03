"""The invoice API: upload, tenancy, dedup, plan limits, review."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.business import BusinessPlan
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.supplier import Supplier
from app.services import gst_calendar, invoice_service
from app.services import itc as itc_service
from tests.conftest import BUSINESS_GSTIN, SUPPLIER_GSTIN_OTHER_STATE, SUPPLIER_GSTIN_SAME_STATE


def upload(client, text: str, *, name: str = "invoice.txt", invoice_type: str = "purchase"):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": invoice_type},
    )


def _business_of(db, invoice_id: int) -> int:
    return db.get(Invoice, invoice_id).business_id


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


class TestTwoWorkersMeetingAtANewSupplier:
    """Concurrent uploads from a supplier neither worker has seen before.

    ``get_or_create_supplier`` looks, finds nothing, and inserts. When a
    business drags in a folder of invoices from a new supplier, several workers
    do that at once and only the first insert survives ``uq_suppliers_business_gstin``.
    The loser's invoice was being marked ``failed`` and told the user its
    document was already on file — a statement about a duplicate that does not
    exist, over a supplier row the winner had already created correctly.
    """

    @staticmethod
    def _blind_the_lookup(monkeypatch, db_session):
        """Make the *next* supplier lookup miss, as a concurrent one would."""
        real_scalar = db_session.scalar
        missed = {"once": False}

        def blind(statement, *args, **kwargs):
            found = real_scalar(statement, *args, **kwargs)
            if isinstance(found, Supplier) and not missed["once"]:
                missed["once"] = True
                return None
            return found

        monkeypatch.setattr(db_session, "scalar", blind)

    def test_the_loser_of_the_race_still_gets_its_invoice(
        self, auth_client, db_session, business, sample_invoice_text, monkeypatch
    ):
        db_session.add(
            Supplier(
                business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE, state_code="29"
            )
        )
        db_session.flush()
        self._blind_the_lookup(monkeypatch, db_session)

        invoice = upload(auth_client, sample_invoice_text).json()["invoice"]

        assert invoice["status"] != InvoiceStatus.FAILED.value
        assert invoice["parse_error"] is None
        assert invoice["counterparty_gstin"] == SUPPLIER_GSTIN_OTHER_STATE

    def test_it_is_linked_to_the_row_the_winner_created(
        self, auth_client, db_session, business, sample_invoice_text, monkeypatch
    ):
        db_session.add(
            Supplier(
                business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE, state_code="29"
            )
        )
        db_session.flush()
        self._blind_the_lookup(monkeypatch, db_session)

        invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

        suppliers = db_session.query(Supplier).filter_by(
            gstin=SUPPLIER_GSTIN_OTHER_STATE
        ).all()
        assert len(suppliers) == 1
        assert db_session.get(Invoice, invoice_id).supplier_id == suppliers[0].id

    def test_the_lost_race_is_not_reported_as_a_duplicate_invoice(
        self, auth_client, db_session, business, sample_invoice_text, monkeypatch
    ):
        db_session.add(
            Supplier(
                business_id=business.id, gstin=SUPPLIER_GSTIN_OTHER_STATE, state_code="29"
            )
        )
        db_session.flush()
        self._blind_the_lookup(monkeypatch, db_session)

        invoice = upload(auth_client, sample_invoice_text).json()["invoice"]

        assert "already on file" not in (invoice["parse_error"] or "")

    def test_a_genuine_duplicate_is_still_refused(self, auth_client, sample_invoice_text):
        """The race fix must not swallow the constraint it shares a handler with."""
        upload(auth_client, sample_invoice_text)
        # Same invoice number and supplier, different bytes, so the file-hash
        # check at upload cannot catch it and the natural key has to.
        second = upload(
            auth_client, sample_invoice_text + "\nDuplicate re-scan\n", name="rescan.txt"
        ).json()["invoice"]

        assert second["status"] == InvoiceStatus.FAILED.value
        assert "already on file" in second["parse_error"]


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


class TestDeletingAnInvoiceFreesItsNumber:
    """Deleting is soft, and the natural key has to agree.

    Delete a badly-read invoice, re-scan the paper, upload it again: that is
    the ordinary way to fix one, and it is the only way, because a re-scan is
    different bytes and so the file-hash check never fires. A tombstone that
    kept holding the key turned the second upload into ``failed`` — "already
    on file", naming an invoice the API answers 404 for — and there was no way
    back, because the delete that was meant to undo it had already happened.
    """

    def _rescan(self, client, text: str, *, name: str):
        """The same invoice, photographed again: same fields, different bytes."""
        return upload(client, text + "\n \n", name=name).json()["invoice"]

    def test_the_same_invoice_can_be_uploaded_again_after_a_delete(
        self, auth_client, sample_invoice_text
    ):
        first = upload(auth_client, sample_invoice_text).json()["invoice"]
        assert auth_client.delete(f"/api/v1/invoices/{first['id']}").status_code == 204

        second = self._rescan(auth_client, sample_invoice_text, name="rescan.txt")
        assert second["status"] == "parsed", second
        assert second["id"] != first["id"]

    def test_the_replacement_carries_the_figures_rather_than_an_error(
        self, auth_client, sample_invoice_text
    ):
        first = upload(auth_client, sample_invoice_text).json()["invoice"]
        auth_client.delete(f"/api/v1/invoices/{first['id']}")

        second = self._rescan(auth_client, sample_invoice_text, name="rescan.txt")
        assert second["parse_error"] is None
        assert second["invoice_number"] == first["invoice_number"]
        assert Decimal(second["taxable_value"]) == Decimal(first["taxable_value"])

    def test_the_replacement_is_the_one_the_period_files(
        self, auth_client, sample_invoice_text
    ):
        """A ``failed`` row is out of the filing pool; the point is to be in it."""
        first = upload(auth_client, sample_invoice_text).json()["invoice"]
        auth_client.delete(f"/api/v1/invoices/{first['id']}")
        second = self._rescan(auth_client, sample_invoice_text, name="rescan.txt")

        listed = auth_client.get("/api/v1/invoices").json()["items"]
        assert [row["id"] for row in listed] == [second["id"]]

    def test_a_duplicate_is_still_refused_while_the_original_lives(
        self, auth_client, sample_invoice_text
    ):
        """The constraint still does its job — that is the whole reason it exists.

        Two live copies of one invoice are two claims of the same credit, which
        is what draws a departmental notice.
        """
        upload(auth_client, sample_invoice_text)
        second = self._rescan(auth_client, sample_invoice_text, name="rescan.txt")
        assert second["status"] == "failed"
        assert "already on file" in second["parse_error"]

    def test_deleting_twice_over_leaves_the_number_free_each_time(
        self, auth_client, sample_invoice_text
    ):
        """Two tombstones on one key, which a partial index has to tolerate."""
        for round_number in range(3):
            invoice = self._rescan(
                auth_client, sample_invoice_text + " " * round_number, name=f"r{round_number}.txt"
            )
            assert invoice["status"] == "parsed", invoice
            auth_client.delete(f"/api/v1/invoices/{invoice['id']}")

    def test_the_tombstones_are_kept_rather_than_overwritten(
        self, auth_client, db_session, sample_invoice_text
    ):
        """Soft delete is an audit record; freeing the key must not drop it."""
        first = upload(auth_client, sample_invoice_text).json()["invoice"]
        auth_client.delete(f"/api/v1/invoices/{first['id']}")
        self._rescan(auth_client, sample_invoice_text, name="rescan.txt")

        assert db_session.get(Invoice, first["id"]).deleted_at is not None


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
    # A body that passes validation, so the 404 is the tenancy check answering
    # and not a malformed field being refused before the row is ever looked up.
    assert (
        client.patch(f"/api/v1/invoices/{invoice_id}", json={"hsn_code": "8471"}).status_code
        == 404
    )
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


class TestTheCodedFieldsAReviewerCanType:
    """``place_of_supply`` and ``hsn_code`` are codes, not free text.

    The extractor has always checked both. A correction did not, so the one
    path a person types into was the one that let anything through — and what
    it lets through is copied verbatim into the GSTR-1 the portal rejects.
    """

    @pytest.fixture()
    def invoice_id(self, auth_client, sample_invoice_text) -> int:
        return upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    def test_a_place_of_supply_that_is_not_a_state_is_refused(self, auth_client, invoice_id):
        response = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": "ZZ"}
        )
        assert response.status_code == 422, response.text
        assert "state code" in response.text

    def test_a_state_number_that_does_not_exist_is_refused(self, auth_client, invoice_id):
        # 88 is inside the two-digit shape and is not a code GST assigns.
        response = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": "88"}
        )
        assert response.status_code == 422, response.text

    def test_the_refused_code_never_reaches_the_return(self, auth_client, invoice_id):
        before = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()["place_of_supply"]
        auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": "ZZ"})
        after = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()["place_of_supply"]
        assert after == before

    def test_a_single_digit_state_is_padded_rather_than_refused(self, auth_client, invoice_id):
        """``7`` is what a person types for Delhi; ``07`` is what the portal wants."""
        body = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": "7"}
        ).json()
        assert body["place_of_supply"] == "07"

    def test_a_real_state_code_still_goes_through(self, auth_client, invoice_id):
        body = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": "29"}
        ).json()
        assert body["place_of_supply"] == "29"

    def test_the_place_of_supply_can_still_be_cleared(self, auth_client, invoice_id):
        body = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"place_of_supply": None}
        ).json()
        assert body["place_of_supply"] is None

    @pytest.mark.parametrize("bad", ["notdigit", "12345", "123", "8471301X"])
    def test_an_hsn_the_portal_will_not_take_is_refused(self, auth_client, invoice_id, bad):
        response = auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"hsn_code": bad})
        assert response.status_code == 422, response.text
        assert "HSN" in response.text

    @pytest.mark.parametrize("good", ["8471", "847130", "84713010"])
    def test_the_three_lengths_the_portal_takes_go_through(
        self, auth_client, invoice_id, good
    ):
        body = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"hsn_code": good}
        ).json()
        assert body["hsn_code"] == good

    def test_the_hsn_can_still_be_cleared(self, auth_client, invoice_id):
        body = auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"hsn_code": None}
        ).json()
        assert body["hsn_code"] is None


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


# --------------------------------------------------------------------------
# The two facts the ITC reversal rules turn on
#
# Rule 37 reverses the credit on a purchase left unpaid 180 days past its
# invoice date; Rule 43 spreads a capital good's credit over sixty months
# rather than claiming it in the month of purchase. Both are read off the
# invoice row by app.services.itc, and neither was settable through the API —
# so a business could not prevent a reversal that was not due, and every
# capital good claimed its whole credit in one month.
# --------------------------------------------------------------------------

def test_recording_a_payment_takes_the_invoice_off_the_rule_37_clock(
    auth_client, db_session, sample_invoice_text
):
    """Nothing could set ``paid_at``, so the reversal was unavoidable.

    Every purchase reversed its credit 180 days after its invoice date and
    stayed reversed for good, which over-reverses table 4(B) of GSTR-3B: the
    business pays cash it does not owe on a supplier it has actually paid.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    as_of = date(2026, 4, 15) + timedelta(days=200)

    before = itc_service.rule_37(
        itc_service.purchase_invoices(db_session, _business_of(db_session, invoice_id)),
        as_of=as_of,
    )
    assert before.reversal.igst == Decimal("81000.00")

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"}
    ).json()
    assert body["paid_at"] == "2026-05-01"

    db_session.expire_all()
    after = itc_service.rule_37(
        itc_service.purchase_invoices(db_session, _business_of(db_session, invoice_id)),
        as_of=as_of,
    )
    assert after.reversal.igst == Decimal("0.00")
    assert after.overdue == []


def test_a_payment_can_be_taken_back_off_an_invoice(auth_client, sample_invoice_text):
    """``null`` means "not paid after all", which puts it back on the clock."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"})

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"paid_at": None}
    ).json()

    assert body["paid_at"] is None


def test_a_payment_date_in_the_future_is_refused(auth_client, sample_invoice_text):
    """A mistyped year would silently cancel a reversal that is genuinely due."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    tomorrow = gst_calendar.today_ist() + timedelta(days=1)

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"paid_at": tomorrow.isoformat()}
    )

    assert response.status_code == 422, response.text
    assert "future" in response.text


def test_a_payment_before_the_invoice_was_issued_is_refused(
    auth_client, sample_invoice_text
):
    """Rule 37 counts from the invoice date, so this is not a payment at all."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2025-04-01"}
    )

    assert response.status_code == 422, response.text
    assert "cannot be paid before it was issued" in response.text


def test_a_payment_and_a_corrected_date_are_judged_against_each_other(
    auth_client, sample_invoice_text
):
    """Both dates can arrive together, and the new one is what governs."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"invoice_date": "2026-01-10", "paid_at": "2026-02-01"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["paid_at"] == "2026-02-01"


def test_moving_the_invoice_past_a_recorded_payment_is_refused(
    auth_client, sample_invoice_text
):
    """The same rule, from the other side, where it was not being enforced.

    Only the *incoming* payment date was compared, so an edit that moved the
    invoice forward past a payment already on file produced exactly the state
    the check exists to refuse — and produced it silently. Correcting a misread
    year is the commonest reason anyone touches this field, so it is not an
    exotic route into it.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"})

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"invoice_date": "2026-06-01"}
    )

    assert response.status_code == 422, response.text
    assert "cannot be paid before it was issued" in response.text


def test_the_invoice_the_refusal_protects_is_left_untouched(
    auth_client, sample_invoice_text
):
    """What the silent version cost: a purchase that never reverses again.

    An invoice reading as paid is off the Rule 37 clock for good. Written with
    a payment predating it, the row asserts a payment that could not have
    happened and quietly suppresses a reversal that is genuinely due, however
    long the supplier goes unpaid.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"})

    auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"invoice_date": "2026-06-01"}
    )

    body = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()
    assert body["invoice_date"] == "2026-04-15"
    assert body["paid_at"] == "2026-05-01"
    assert body["period"] == "2026-04"


def test_clearing_the_payment_frees_the_invoice_date_to_move(
    auth_client, sample_invoice_text
):
    """The refusal names a real conflict, and says how to resolve it.

    Both dates travel in one PATCH, so a reviewer who has decided the invoice
    was never paid can say so and correct the date in the same request.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"})

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"invoice_date": "2026-06-01", "paid_at": None},
    )

    assert response.status_code == 200, response.text
    assert response.json()["invoice_date"] == "2026-06-01"
    assert response.json()["paid_at"] is None


def test_an_edit_touching_neither_date_is_still_allowed(
    auth_client, sample_invoice_text
):
    """Comparing the stored dates must not block edits that do not move them.

    The check now reads what the row *will* hold rather than what the request
    sends, and every PATCH goes through it — so a row already holding a
    consistent pair has to keep passing.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    auth_client.patch(f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"})

    response = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"hsn_code": "84713010"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["hsn_code"] == "84713010"
    assert response.json()["paid_at"] == "2026-05-01"


def test_marking_a_purchase_capital_goods_moves_its_credit_to_rule_43(
    auth_client, db_session, sample_invoice_text
):
    """Its credit belongs to sixty months, not to the month of purchase."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    business_id = _business_of(db_session, invoice_id)

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"is_capital_good": True}
    ).json()
    assert body["is_capital_good"] is True

    db_session.expire_all()
    summary = itc_service.summarise(db_session, business_id, "2026-04")
    assert summary.available.igst == Decimal("0.00")
    assert summary.proportionate.capital_credit.igst == Decimal("81000.00")
    assert summary.proportionate.capital_credit_this_month.igst == Decimal("1350.00")


def test_is_capital_good_cannot_be_cleared_to_null(auth_client, sample_invoice_text):
    """The column is NOT NULL; ``false`` is how it is turned off."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    assert (
        auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"is_capital_good": None}
        ).status_code
        == 422
    )
    assert (
        auth_client.patch(
            f"/api/v1/invoices/{invoice_id}", json={"is_capital_good": False}
        ).json()["is_capital_good"]
        is False
    )


def test_recording_a_payment_does_not_claim_the_extraction_was_reviewed(
    auth_client, sample_invoice_text
):
    """A payment is a ledger fact, not a reading off the document.

    Every PATCH set ``parsed_with`` to manual and confidence to 1.0, which is an
    assertion that a human checked what the extractor made of the invoice.
    Recording a payment asserts nothing of the kind — and it took the row off
    the needs-review list, so a document nobody had looked at stopped being
    flagged for it.
    """
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]
    before = auth_client.get(f"/api/v1/invoices/{invoice_id}").json()

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}",
        json={"paid_at": "2026-05-01", "is_capital_good": True},
    ).json()

    assert body["paid_at"] == "2026-05-01"
    assert body["parsed_with"] == before["parsed_with"]
    assert body["extraction_confidence"] == before["extraction_confidence"]


def test_a_payment_does_not_promote_a_failed_invoice_into_the_filing_pool(
    auth_client, db_session
):
    """A ``failed`` row has fields that were never extracted.

    Promoting it to ``parsed`` on a payment puts those blanks into a return,
    and takes the row out of the error queue where someone was going to fix it.
    """
    invoice_id = upload(auth_client, "nothing readable here", name="blank.txt").json()[
        "invoice"
    ]["id"]
    invoice = db_session.get(Invoice, invoice_id)
    invoice.status = InvoiceStatus.FAILED
    invoice.invoice_date = date(2026, 4, 15)
    db_session.commit()

    body = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"paid_at": "2026-05-01"}
    ).json()

    assert body["status"] == InvoiceStatus.FAILED.value
    # A real correction still promotes it, which is what that rule is for.
    promoted = auth_client.patch(
        f"/api/v1/invoices/{invoice_id}", json={"invoice_number": "FIXED-1"}
    ).json()
    assert promoted["status"] == InvoiceStatus.PARSED.value


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
