"""Invoices a worker picked up and never put down.

``process_invoice`` writes every failure it can catch onto the row, so the only
way to stay in ``processing`` is for the process to stop existing between the
commit that claims the row and the one that records an outcome: the 240s hard
time limit, the OOM killer choosing the child holding a decoded PDF, or a
redeploy mid-document. No ``except`` runs in any of those.

What made that worth a sweep rather than a shrug is where the row then sits.
``PROCESSING`` is in ``UNREADABLE_STATUSES``, so the GSTR-1, the period's output
tax, the credit pool, the reconciliation and the supplier's exposure all skip
it — right, because nothing has read it. But the dashboard's needs-review count
is ``PARSED`` plus ``FAILED``, and the register renders the status as a neutral
"Processing" chip. So the one document missing from the return is the one
document the product shows as work in hand, on no screen, forever.

These tests are about that invisibility as much as about the status: the point
of reaping to ``FAILED`` is that the row starts being counted and complained
about, while not one rupee of any return moves.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.business import Business
from app.models.invoice import UNREADABLE_STATUSES, Invoice, InvoiceStatus, InvoiceType
from app.services import invoice_service
from app.services.invoice_service import STALLED_PARSE_MESSAGE, reap_stalled_parses


def _invoice(db_session, business, *, status, age_seconds=0, **overrides) -> Invoice:
    """An invoice whose ``updated_at`` is *age_seconds* in the past.

    ``updated_at`` carries ``onupdate=func.now()``, so it cannot be aged by
    assignment through the ORM — the flush would overwrite it with the current
    time, which is exactly the write this is trying to simulate the absence of.
    It is stamped with an UPDATE afterwards instead.
    """
    fields = {
        "business_id": business.id,
        "invoice_type": InvoiceType.PURCHASE,
        "status": status,
        "source_filename": "bill.pdf",
        "storage_path": "/tmp/stored-bill.pdf",
        "content_type": "application/pdf",
    }
    fields.update(overrides)
    invoice = Invoice(**fields)
    db_session.add(invoice)
    db_session.commit()

    if age_seconds:
        db_session.query(Invoice).filter(Invoice.id == invoice.id).update(
            {"updated_at": datetime.now(UTC) - timedelta(seconds=age_seconds)},
            synchronize_session=False,
        )
        db_session.commit()
    db_session.refresh(invoice)
    return invoice


class TestWhatGetsReaped:
    def test_a_parse_stranded_past_the_deadline_is_failed(self, db_session, business):
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )

        assert reap_stalled_parses(db_session) == 1

        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.FAILED

    def test_the_row_says_what_happened_and_what_to_do(self, db_session, business):
        # The stored file was committed before the parse ever started, so
        # nothing has been lost and re-parsing is still the fix. A row that only
        # said "failed" would send the user back to their filing cabinet.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )

        reap_stalled_parses(db_session)

        db_session.refresh(invoice)
        assert invoice.parse_error == STALLED_PARSE_MESSAGE
        assert "Re-parse" in invoice.parse_error

    def test_the_stored_file_is_left_alone(self, db_session, business):
        # Reaping is a statement about the worker, not about the document.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )

        reap_stalled_parses(db_session)

        db_session.refresh(invoice)
        assert invoice.storage_path == "/tmp/stored-bill.pdf"
        assert invoice.source_filename == "bill.pdf"

    def test_every_stranded_row_is_reaped_in_one_pass(self, db_session, business):
        # One OOM kill strands one row; a redeploy mid-queue strands several.
        for index in range(3):
            _invoice(
                db_session,
                business,
                status=InvoiceStatus.PROCESSING,
                age_seconds=7200,
                invoice_number=f"INV-{index}",
            )

        assert reap_stalled_parses(db_session) == 3

    def test_it_reaps_across_tenants(self, db_session, business, other_tenant):
        # The sweep runs on a schedule with no request behind it, so there is no
        # tenant to scope to. A worker dying strands whichever row it held.
        rival = db_session.scalars(
            select(Business).where(Business.id != business.id)
        ).one()

        _invoice(db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200)
        _invoice(db_session, rival, status=InvoiceStatus.PROCESSING, age_seconds=7200)

        assert reap_stalled_parses(db_session) == 2


class TestWhatIsLeftAlone:
    def test_a_parse_still_inside_the_deadline_is_untouched(self, db_session, business):
        # The whole risk of a sweep like this is failing an invoice that is
        # merely slow. A parse that started a minute ago is a parse.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=60
        )

        assert reap_stalled_parses(db_session) == 0

        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.PROCESSING

    def test_a_retry_restamps_the_clock_and_buys_the_full_deadline_again(
        self, db_session, business
    ):
        # ``process_invoice`` re-commits ``PROCESSING`` on every attempt, and
        # ``updated_at`` is maintained by the database, so a task legitimately
        # retrying looks new. This is why the claim on the row is the clock
        # rather than the upload time: max_retries=3 at a 60s delay would
        # otherwise let a healthy retry be reaped out from under itself.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )

        invoice.status = InvoiceStatus.PROCESSING
        invoice.parse_error = "attempt 2"
        db_session.commit()

        assert reap_stalled_parses(db_session) == 0

        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.PROCESSING

    @pytest.mark.parametrize(
        "status",
        [
            InvoiceStatus.UPLOADED,
            InvoiceStatus.PARSED,
            InvoiceStatus.FAILED,
            InvoiceStatus.MATCHED,
            InvoiceStatus.MISMATCHED,
            InvoiceStatus.MISSING_IN_2B,
        ],
    )
    def test_no_other_status_is_touched(self, db_session, business, status):
        # ``UPLOADED`` is the one worth naming: it is also unreadable and also
        # waiting on a worker, but it has not been claimed by one. Failing it
        # would fail every invoice sitting in a queue that is merely backed up.
        invoice = _invoice(db_session, business, status=status, age_seconds=7200)

        assert reap_stalled_parses(db_session) == 0

        db_session.refresh(invoice)
        assert invoice.status is status

    def test_a_deleted_invoice_is_not_resurrected_into_the_review_queue(
        self, db_session, business
    ):
        # Deleting is soft, so the row is still there to be found. Reaping it
        # would put a document the user removed back in front of them.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )
        invoice.soft_delete()
        db_session.commit()

        assert reap_stalled_parses(db_session) == 0

        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.PROCESSING

    def test_a_sweep_that_finds_nothing_is_a_no_op(self, db_session, business):
        # Runs hourly, and the ordinary case is an empty result. It must not
        # commit, log an alarm, or otherwise cost anything on a healthy box.
        _invoice(db_session, business, status=InvoiceStatus.PARSED, age_seconds=7200)

        assert reap_stalled_parses(db_session) == 0


class TestTheDeadline:
    def test_the_configured_stall_window_decides(self, db_session, business):
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=1800
        )

        # Inside the default hour, so nothing happens...
        assert reap_stalled_parses(db_session) == 0
        # ...and the same row is stranded under a tighter one.
        assert reap_stalled_parses(db_session, stall_seconds=600) == 1

        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.FAILED

    def test_the_default_clears_a_full_parse_with_every_retry(self):
        # Four attempts at the 240s hard time limit plus three 60s retry delays
        # is about nineteen minutes, and that is the floor a legitimate parse
        # can reach. Anything at or under it would reap live work.
        worst_legitimate_parse = 4 * 240 + 3 * 60
        assert settings.invoice_parse_stall_seconds > worst_legitimate_parse

    def test_now_can_be_supplied(self, db_session, business):
        # So the sweep is assertable against a clock rather than against sleep.
        invoice = _invoice(db_session, business, status=InvoiceStatus.PROCESSING)

        reaped = reap_stalled_parses(
            db_session, now=datetime.now(UTC) + timedelta(days=1)
        )

        assert reaped == 1
        db_session.refresh(invoice)
        assert invoice.status is InvoiceStatus.FAILED


class TestTheRowBecomesVisible:
    """The point of the reaping, rather than a side effect of it."""

    def test_it_starts_being_counted_as_needing_review(
        self, db_session, business, auth_client
    ):
        # ``needs_review`` on the dashboard is PARSED plus FAILED. A stranded
        # row was in neither, so the document missing from the return was on no
        # screen at all — not even as a problem.
        _invoice(db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200)

        def needs_review() -> int:
            return auth_client.get("/api/v1/dashboard").json()["counts"]["needs_review"]

        before = needs_review()
        reap_stalled_parses(db_session)

        assert (before, needs_review()) == (0, 1)

    def test_it_shows_up_under_the_failed_filter(self, db_session, business, auth_client):
        # Which is where a user goes looking for documents to deal with.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )

        reap_stalled_parses(db_session)

        listed = auth_client.get("/api/v1/invoices", params={"status": "failed"}).json()
        assert [row["id"] for row in listed["items"]] == [invoice.id]
        assert listed["items"][0]["parse_error"] == STALLED_PARSE_MESSAGE

    def test_no_return_figure_moves(self, db_session, business):
        # Both statuses are unreadable, so this changes what the user is told
        # and nothing about what is filed. A sweep that could alter a return
        # would be a sweep nobody should run on a schedule.
        assert InvoiceStatus.PROCESSING in UNREADABLE_STATUSES
        assert InvoiceStatus.FAILED in UNREADABLE_STATUSES

        _invoice(
            db_session,
            business,
            status=InvoiceStatus.PROCESSING,
            age_seconds=7200,
            invoice_type=InvoiceType.SALES,
            period="2026-04",
            invoice_date=None,
            taxable_value="100000.00",
            igst="18000.00",
        )

        before = invoice_service.tax_summary(db_session, business.id, "2026-04")
        reap_stalled_parses(db_session)
        after = invoice_service.tax_summary(db_session, business.id, "2026-04")

        assert before == after

    def test_the_document_can_then_be_re_extracted(
        self, db_session, business, auth_client, monkeypatch
    ):
        # The stored file never went anywhere, so the reaped row is exactly as
        # recoverable as any other failure — which is what makes failing it the
        # honest answer rather than a destructive one.
        invoice = _invoice(
            db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200
        )
        reap_stalled_parses(db_session)

        def fake_process(db, row):
            row.status = InvoiceStatus.PARSED
            row.parse_error = None
            db.commit()
            return row

        monkeypatch.setattr(invoice_service, "process_invoice", fake_process)

        response = auth_client.post(f"/api/v1/invoices/{invoice.id}/reparse")

        assert response.status_code == 200
        assert response.json()["status"] == "parsed"


class TestTheScheduledTask:
    def test_the_sweep_is_on_the_beat_schedule(self):
        # Nothing else can notice a process that stopped existing, so if this
        # is not scheduled the fix does not exist in production.
        from app.celery_app import celery_app

        entry = celery_app.conf.beat_schedule["stalled-parse-sweep"]
        assert entry["task"] == "invoices.reap_stalled"

    def test_it_runs_more_often_than_a_row_can_go_stale(self):
        # Hourly, against a stall window of an hour: a stranded row is visible
        # within about two hours of the worker dying rather than never.
        from app.celery_app import celery_app

        entry = celery_app.conf.beat_schedule["stalled-parse-sweep"]
        assert entry["schedule"].hour == set(range(24))

    def test_the_task_reports_what_it_reaped(self, db_session, business, monkeypatch):
        from app.tasks import invoice_tasks

        _invoice(db_session, business, status=InvoiceStatus.PROCESSING, age_seconds=7200)

        class _Handle:
            def __getattr__(self, name):
                return getattr(db_session, name)

            def close(self):
                closed.append(True)

        closed: list[bool] = []
        monkeypatch.setattr(invoice_tasks, "SessionLocal", _Handle)

        assert invoice_tasks.reap_stalled_parses_task() == {"reaped": 1}
        # A leaked connection in a long-lived worker never comes back.
        assert closed == [True]
