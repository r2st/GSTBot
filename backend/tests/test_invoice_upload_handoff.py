"""What the upload endpoint does with the parse once the row is committed.

The rest of the suite runs with ``CELERY_ENABLED`` off, so every upload test
elsewhere exercises the inline branch and the handoff to the worker is never
taken. That branch is the one production actually runs, and the interesting
part of it is not the happy path: the row is committed *before* the enqueue,
so a broker that is down decides between "parse it here and now" and "lose the
document". These tests pin that decision.

No broker is involved. ``delay`` is replaced, because what is under test is
the endpoint's choice, not Celery's transport — a live Redis would test the
latter and still not let us make the enqueue fail on demand.
"""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.models.invoice import Invoice, InvoiceStatus


def upload(client, text: str, *, name: str = "invoice.txt"):
    return client.post(
        "/api/v1/invoices/upload",
        files={"file": (name, text.encode(), "text/plain")},
        data={"invoice_type": "purchase"},
    )


@pytest.fixture()
def celery_on(monkeypatch):
    """Turn the worker handoff on and record what gets enqueued.

    The endpoint imports ``parse_invoice_task`` inside the function body, so
    the patch has to land on the task module rather than on a name the router
    grabbed at import time.
    """
    monkeypatch.setattr(settings, "celery_enabled", True)

    calls: list[int] = []

    def fake_delay(invoice_id):
        calls.append(invoice_id)
        return object()

    from app.tasks import invoice_tasks

    monkeypatch.setattr(invoice_tasks.parse_invoice_task, "delay", fake_delay)
    return calls


@pytest.fixture()
def celery_broker_down(monkeypatch):
    """A broker that raises on enqueue, the way kombu does when Redis is gone."""
    monkeypatch.setattr(settings, "celery_enabled", True)

    def fake_delay(invoice_id):
        raise OSError("Error 61 connecting to redis:6379. Connection refused.")

    from app.tasks import invoice_tasks

    monkeypatch.setattr(invoice_tasks.parse_invoice_task, "delay", fake_delay)


class TestTheWorkerTakesIt:
    def test_the_invoice_id_is_handed_to_the_worker(
        self, auth_client, sample_invoice_text, celery_on
    ):
        response = upload(auth_client, sample_invoice_text)
        assert response.status_code == 201, response.text

        # The row the caller was told about is the row the worker was given.
        assert celery_on == [response.json()["invoice"]["id"]]

    def test_the_response_says_it_was_queued(self, auth_client, sample_invoice_text, celery_on):
        body = upload(auth_client, sample_invoice_text).json()

        assert body["queued"] is True
        assert body["message"] == "Invoice queued for extraction"

    def test_extraction_has_not_run_yet(self, auth_client, sample_invoice_text, celery_on):
        """The 201 is the receipt for the file, not for the extraction.

        Nothing consumed the queue here, so a parsed invoice would mean the
        endpoint had done the work inline as well — paying the model call
        twice and making ``queued`` a lie.
        """
        body = upload(auth_client, sample_invoice_text).json()

        assert body["invoice"]["status"] == InvoiceStatus.UPLOADED.value
        assert body["invoice"]["counterparty_gstin"] is None

    def test_the_file_is_stored_before_the_handoff(
        self, auth_client, db_session, sample_invoice_text, celery_on
    ):
        """The worker only receives an id, so the row and the bytes must
        already be durable when it picks the job up — otherwise the task
        races the request that created it."""
        invoice_id = upload(auth_client, sample_invoice_text).json()["invoice"]["id"]

        stored = db_session.get(Invoice, invoice_id)
        assert stored is not None
        assert stored.storage_path
        from pathlib import Path

        assert Path(stored.storage_path).exists()


class TestADeadBrokerDoesNotLoseTheDocument:
    def test_the_upload_still_succeeds(self, auth_client, sample_invoice_text, celery_broker_down):
        response = upload(auth_client, sample_invoice_text)

        assert response.status_code == 201, response.text

    def test_it_falls_back_to_parsing_inline(
        self, auth_client, sample_invoice_text, celery_broker_down
    ):
        body = upload(auth_client, sample_invoice_text).json()

        assert body["queued"] is False
        assert body["message"] == "Invoice processed"
        # Parsed for real, not merely stored: a fallback that left the row
        # UPLOADED would strand it, since nothing is coming to pick it up.
        assert body["invoice"]["status"] == InvoiceStatus.PARSED.value
        assert body["invoice"]["counterparty_gstin"]

    def test_the_failure_is_logged_with_the_invoice_id(
        self, auth_client, sample_invoice_text, celery_broker_down, caplog
    ):
        """Silently degrading to inline parsing hides a broker outage until
        someone notices the latency, so the warning names the row."""
        with caplog.at_level("WARNING", logger="app.routers.invoices"):
            body = upload(auth_client, sample_invoice_text).json()

        assert any(
            str(body["invoice"]["id"]) in record.getMessage()
            and "Connection refused" in record.getMessage()
            for record in caplog.records
        ), caplog.text

    def test_the_broker_failure_does_not_reach_the_caller(
        self, auth_client, sample_invoice_text, celery_broker_down
    ):
        """No trace of the transport in the response body — the upload
        worked, and how it was parsed is our problem."""
        body = upload(auth_client, sample_invoice_text).json()

        assert "redis" not in str(body).lower()


def test_with_celery_off_nothing_is_enqueued(auth_client, sample_invoice_text, monkeypatch):
    """The default the whole rest of the suite runs under, asserted once here
    rather than assumed everywhere."""
    monkeypatch.setattr(settings, "celery_enabled", False)

    def explode(invoice_id):  # pragma: no cover - the assertion is that it is not called
        raise AssertionError("delay() was called with CELERY_ENABLED off")

    from app.tasks import invoice_tasks

    monkeypatch.setattr(invoice_tasks.parse_invoice_task, "delay", explode)

    body = upload(auth_client, sample_invoice_text).json()

    assert body["queued"] is False
    assert body["invoice"]["status"] == InvoiceStatus.PARSED.value
