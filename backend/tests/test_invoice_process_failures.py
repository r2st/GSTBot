"""`process_invoice` promises never to raise. This is that promise tested.

It runs on a Celery worker with nobody waiting on the result, so an exception
there is a log line nobody reads and a row left in PROCESSING forever. Every
failure has to land on the invoice instead, as FAILED with a reason — that row
is the only channel the user has.

The case exercised here is the stored file going missing, which is not
hypothetical: the API writes the upload and the worker reads it back, so the
two containers must share the volume. Get that wrong in a deployment and every
invoice takes this path.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.models.invoice import Invoice, InvoiceStatus
from app.services import invoice_service


def upload(client, text: str, *, name: str = "invoice.txt"):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": "purchase"},
    )


@pytest.fixture()
def orphaned(auth_client, db_session, sample_invoice_text):
    """A parsed invoice whose stored file has been deleted underneath it."""
    invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

    invoice = db_session.get(Invoice, invoice_id)
    Path(invoice.storage_path).unlink()
    # raw_text is the other way process_invoice can get at the document; this
    # is about the file being gone, so both have to be.
    invoice.raw_text = None
    db_session.commit()
    return invoice_id


class TestAStoredFileThatIsGone:
    def test_reparsing_it_does_not_500(self, auth_client, orphaned):
        """The caller gets an answer. An unhandled exception here would be a
        500 on a button the UI offers for every failed invoice."""
        response = auth_client.post(f"/api/v1/invoices/{orphaned}/reparse")

        assert response.status_code == 200, response.text

    def test_the_row_is_marked_failed(self, auth_client, orphaned):
        body = auth_client.post(f"/api/v1/invoices/{orphaned}/reparse").json()

        assert body["status"] == InvoiceStatus.FAILED.value

    def test_it_does_not_linger_in_processing(self, auth_client, orphaned):
        body = auth_client.post(f"/api/v1/invoices/{orphaned}/reparse").json()

        assert body["status"] != InvoiceStatus.PROCESSING.value

    def test_the_reason_names_the_missing_file(self, auth_client, orphaned, db_session):
        """An operator debugging a bad volume mount needs the path, not
        "extraction failed"."""
        body = auth_client.post(f"/api/v1/invoices/{orphaned}/reparse").json()

        assert "missing" in body["parse_error"].lower()
        assert db_session.get(Invoice, orphaned).storage_path in body["parse_error"]

    def test_the_service_returns_the_invoice_rather_than_raising(self, db_session, orphaned):
        """Called directly, the way the worker calls it."""
        invoice = db_session.get(Invoice, orphaned)

        result = invoice_service.process_invoice(db_session, invoice)

        assert result.id == orphaned
        assert result.status == InvoiceStatus.FAILED

    def test_the_session_still_works_afterwards(self, auth_client, orphaned, sample_invoice_text):
        """A worker reuses its session for the next task in the queue."""
        auth_client.post(f"/api/v1/invoices/{orphaned}/reparse")

        response = upload(
            auth_client,
            sample_invoice_text.replace("INV-2026-0042", "INV-2026-0500"),
            name="next.txt",
        )

        assert response.status_code == 201, response.text
        assert response.json()["invoice"]["status"] == InvoiceStatus.PARSED.value


class TestAParserThatBlowsUp:
    """Anything unexpected out of the extraction stack lands on the row too."""

    @pytest.fixture()
    def exploding_parser(self, monkeypatch):
        def boom(**kwargs):
            raise RuntimeError("tesseract segfaulted")

        monkeypatch.setattr(invoice_service, "parse_invoice", boom)

    def test_the_upload_still_succeeds(self, auth_client, sample_invoice_text, exploding_parser):
        response = upload(auth_client, sample_invoice_text)

        assert response.status_code == 201, response.text

    def test_the_failure_is_recorded_on_the_row(
        self, auth_client, sample_invoice_text, exploding_parser
    ):
        body = upload(auth_client, sample_invoice_text).json()["invoice"]

        assert body["status"] == InvoiceStatus.FAILED.value
        assert "tesseract segfaulted" in body["parse_error"]

    def test_the_reason_is_truncated_rather_than_unbounded(
        self, auth_client, db_session, sample_invoice_text, monkeypatch
    ):
        """`parse_error` is a column, and a repr of a huge payload would
        otherwise be what fails the insert."""
        def boom(**kwargs):
            raise RuntimeError("x" * 5000)

        monkeypatch.setattr(invoice_service, "parse_invoice", boom)

        invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

        assert len(db_session.get(Invoice, invoice_id).parse_error) == 2000
