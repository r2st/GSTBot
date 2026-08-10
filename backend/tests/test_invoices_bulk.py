"""Bulk invoice upload: the same validation as a single upload, per file.

A batch is a person dragging a folder of paperwork in, and one bad or
duplicate page in it must not cost the other forty-nine — see
``POST /invoices/bulk`` in app/routers/invoices.py. The tests below are mostly
about that isolation: every file gets its own verdict, and the request itself
only fails for something that is wrong about the *batch* (too many files),
never about one file in it.
"""
from __future__ import annotations

from app.models.invoice import Invoice
from app.routers.invoices import MAX_BULK_FILES


def bulk_upload(client, files: list[tuple[str, str]], *, invoice_type: str = "purchase"):
    """*files* is a list of ``(name, text)`` pairs."""
    return client.post(
        "/api/v1/invoices/bulk",
        files=[("files", (name, text.encode(), "text/plain")) for name, text in files],
        data={"invoice_type": invoice_type},
    )


def _invoice_text(number: str) -> str:
    return f"Invoice No: {number}\nTotal Amount: 100.00"


class TestAllFilesValid:
    def test_every_file_is_accepted(self, auth_client):
        response = bulk_upload(
            auth_client,
            [(f"inv-{i}.txt", _invoice_text(f"BULK-{i}")) for i in range(3)],
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total"] == 3
        assert body["accepted"] == 3
        assert body["rejected"] == 0
        assert all(item["accepted"] for item in body["items"])
        assert all(item["invoice"] is not None for item in body["items"])

    def test_invoices_are_actually_stored(self, auth_client, db_session, business):
        bulk_upload(
            auth_client, [(f"inv-{i}.txt", _invoice_text(f"BULK-S-{i}")) for i in range(3)]
        )
        count = (
            db_session.query(Invoice)
            .filter_by(business_id=business.id)
            .count()
        )
        assert count == 3

    def test_the_invoice_type_applies_to_the_whole_batch(self, auth_client, db_session):
        bulk_upload(
            auth_client,
            [(f"sale-{i}.txt", _invoice_text(f"BULK-SALE-{i}")) for i in range(2)],
            invoice_type="sales",
        )
        types = {inv.invoice_type.value for inv in db_session.query(Invoice).all()}
        assert types == {"sales"}


class TestOneBadFileDoesNotSinkTheBatch:
    def test_an_empty_file_is_rejected_alone(self, auth_client):
        response = bulk_upload(
            auth_client,
            [
                ("good.txt", _invoice_text("BULK-GOOD")),
                ("empty.txt", ""),
            ],
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["accepted"] == 1
        assert body["rejected"] == 1
        bad = next(item for item in body["items"] if item["filename"] == "empty.txt")
        assert bad["accepted"] is False
        assert "empty" in bad["error"].lower()
        good = next(item for item in body["items"] if item["filename"] == "good.txt")
        assert good["accepted"] is True

    def test_an_unsupported_file_type_is_rejected_alone(self, auth_client):
        response = auth_client.post(
            "/api/v1/invoices/bulk",
            files=[
                ("files", ("good.txt", _invoice_text("BULK-OK").encode(), "text/plain")),
                ("files", ("virus.exe", b"MZ\x90\x00", "application/x-msdownload")),
            ],
            data={"invoice_type": "purchase"},
        )
        body = response.json()
        assert body["accepted"] == 1
        assert body["rejected"] == 1
        bad = next(item for item in body["items"] if item["filename"] == "virus.exe")
        assert bad["error"] is not None

    def test_a_duplicate_within_the_batch_is_rejected_and_points_at_the_original(
        self, auth_client
    ):
        text = _invoice_text("BULK-DUP")
        response = bulk_upload(
            auth_client,
            [("first.txt", text), ("second.txt", text)],
        )
        body = response.json()
        assert body["accepted"] == 1
        assert body["rejected"] == 1

        first = next(item for item in body["items"] if item["filename"] == "first.txt")
        second = next(item for item in body["items"] if item["filename"] == "second.txt")
        assert first["accepted"] is True
        assert second["accepted"] is False
        assert second["duplicate_of_invoice_id"] == first["invoice"]["id"]


class TestTheBatchSizeLimit:
    def test_a_batch_over_the_limit_is_refused_outright(self, auth_client):
        files = [(f"f{i}.txt", _invoice_text(f"OVER-{i}")) for i in range(MAX_BULK_FILES + 1)]
        response = bulk_upload(auth_client, files)
        assert response.status_code == 413
        assert str(MAX_BULK_FILES) in response.json()["detail"]

    def test_a_batch_at_exactly_the_limit_is_accepted(self, auth_client):
        files = [(f"f{i}.txt", _invoice_text(f"AT-{i}")) for i in range(MAX_BULK_FILES)]
        response = bulk_upload(auth_client, files)
        assert response.status_code == 200
        assert response.json()["total"] == MAX_BULK_FILES


class TestThePlanLimit:
    def test_files_past_the_monthly_allowance_are_rejected_not_the_batch(
        self, auth_client, monkeypatch
    ):
        from app.core.config import settings

        monkeypatch.setattr(settings, "plan_monthly_invoice_limits", "free=2")
        response = bulk_upload(
            auth_client,
            [(f"p{i}.txt", _invoice_text(f"PLAN-{i}")) for i in range(4)],
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["accepted"] == 2
        assert body["rejected"] == 2
        # The two that fit are the first two attempted, not a scattered subset.
        assert [item["accepted"] for item in body["items"]] == [True, True, False, False]
        assert "plan" in body["items"][2]["error"].lower()


class TestAuthAndTenancy:
    def test_bulk_upload_requires_authentication(self, client):
        response = bulk_upload(client, [("a.txt", _invoice_text("AUTH-1"))])
        assert response.status_code == 401

    def test_files_land_under_the_uploading_tenant(self, auth_client, business, db_session):
        bulk_upload(auth_client, [("t.txt", _invoice_text("TENANT-1"))])
        invoice = db_session.query(Invoice).filter_by(invoice_number="TENANT-1").one()
        assert invoice.business_id == business.id
