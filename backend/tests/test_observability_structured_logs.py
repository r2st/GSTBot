"""Structured logging on error and summary paths carries correlation fields.

GB003 rounds 2–3: every log line that names a business, an invoice or a task
must carry that id as a structured ``extra`` field so a log aggregator can
filter on it without parsing the message string. Round 3 added success lines
for filing and GSTR-2B import, and the recipient field on alert delivery
failures.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from unittest.mock import MagicMock

import pytest

from app.core.config import settings
from app.core.security import hash_password
from app.models.alert import Alert, AlertStatus, AlertType
from app.models.business import Business
from app.models.user import User
from app.services import alert_delivery, alerting
from app.services.alert_delivery import send_pending_alerts
from app.services.email_sender import EmailSendError
from app.tasks import alert_tasks, invoice_tasks
from tests.conftest import BUSINESS_GSTIN

TODAY = date(2026, 5, 14)
NOW = datetime(2026, 5, 14, 7, 15)
SIGNED_UP = datetime(2026, 4, 2, 10, 0)


def _make_business(db, *, gstin=BUSINESS_GSTIN, created=SIGNED_UP, **kwargs):
    business = Business(
        gstin=gstin,
        legal_name="Umang Traders Private Limited",
        state_code=gstin[:2],
        created_at=created,
        updated_at=created,
        **kwargs,
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


def _make_user(db, business, *, email="owner@example.com"):
    user = User(
        business_id=business.id,
        email=email,
        hashed_password=hash_password("correct horse battery staple"),
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


def _make_alert(db, business, *, status=AlertStatus.PENDING):
    alert = Alert(
        business_id=business.id,
        alert_type=AlertType.FILING_DEADLINE,
        status=status,
        title="GSTR-1 for 2026-04 is overdue",
        message="GSTR-1 for 2026-04 was due on 2026-05-11.",
        due_date=date(2026, 5, 11),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ── alerting.sweep_filing_deadlines: summary line ──────────────────────

class TestSweepSummaryIsStructured:
    def test_the_summary_carries_all_counts_as_extra_fields(self, db_session, caplog):
        _make_business(db_session)

        with caplog.at_level(logging.INFO, logger="app.services.alerting"):
            alerting.sweep_filing_deadlines(db_session, today=TODAY)

        completed = [
            r for r in caplog.records
            if r.name == "app.services.alerting" and "completed" in r.message.lower()
        ]
        assert completed, "No sweep summary log line emitted"
        record = completed[0]
        assert record.date == TODAY.isoformat()
        assert isinstance(record.businesses, int)
        assert isinstance(record.raised, int)
        assert isinstance(record.reopened, int)
        assert isinstance(record.resolved, int)
        assert isinstance(record.failed, int)


# ── alerting.sweep_filing_deadlines: per-tenant failure ────────────────

class TestSweepPerTenantFailureIsStructured:
    def test_the_failure_line_carries_business_id(self, db_session, monkeypatch, caplog):
        business = _make_business(db_session)

        def explode(db, biz, *, today):
            raise RuntimeError("bad data")

        monkeypatch.setattr(alerting, "sweep_business", explode)

        with caplog.at_level(logging.ERROR, logger="app.services.alerting"):
            alerting.sweep_filing_deadlines(db_session, today=TODAY)

        errors = [
            r for r in caplog.records
            if r.name == "app.services.alerting" and r.levelno >= logging.ERROR
        ]
        assert errors, "No per-tenant failure log line emitted"
        assert errors[0].business_id == business.id


# ── alert_delivery: failure and summary lines ──────────────────────────

class TestAlertDeliveryLogsAreStructured:
    @pytest.fixture(autouse=True)
    def _email_enabled(self, monkeypatch):
        monkeypatch.setattr(settings, "alerts_email_enabled", True)
        monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")

    def test_the_summary_carries_result_fields(self, db_session, monkeypatch, caplog):
        business = _make_business(db_session)
        _make_user(db_session, business)
        _make_alert(db_session, business)
        monkeypatch.setattr(alert_delivery, "send_email", lambda **kw: None)

        with caplog.at_level(logging.INFO, logger="app.services.alert_delivery"):
            send_pending_alerts(db_session, now=NOW)

        completed = [
            r for r in caplog.records
            if r.name == "app.services.alert_delivery" and "completed" in r.message.lower()
        ]
        assert completed, "No delivery summary log line emitted"
        record = completed[0]
        assert isinstance(record.businesses, int)
        assert isinstance(record.emails_sent, int)
        assert isinstance(record.alerts_sent, int)

    def test_a_per_tenant_failure_carries_business_id(
        self, db_session, monkeypatch, caplog
    ):
        business = _make_business(db_session)
        _make_user(db_session, business)
        _make_alert(db_session, business)

        def boom(**kw):
            raise RuntimeError("relay exploded unexpectedly")

        monkeypatch.setattr(alert_delivery, "send_email", boom)

        with caplog.at_level(logging.ERROR, logger="app.services.alert_delivery"):
            send_pending_alerts(db_session, now=NOW)

        errors = [
            r for r in caplog.records
            if r.name == "app.services.alert_delivery" and r.levelno >= logging.ERROR
        ]
        assert errors, "No delivery failure log line emitted"
        assert errors[0].business_id == business.id
        assert errors[0].alert_count >= 1

    def test_a_per_recipient_failure_carries_business_id(
        self, db_session, monkeypatch, caplog
    ):
        business = _make_business(db_session)
        _make_user(db_session, business)
        _make_alert(db_session, business)

        def fail(**kw):
            raise EmailSendError("relay refused")

        monkeypatch.setattr(alert_delivery, "send_email", fail)

        with caplog.at_level(logging.WARNING, logger="app.services.alert_delivery"):
            send_pending_alerts(db_session, now=NOW)

        warnings = [
            r for r in caplog.records
            if r.name == "app.services.alert_delivery" and r.levelno >= logging.WARNING
        ]
        assert warnings, "No per-recipient failure log line emitted"
        assert warnings[0].business_id == business.id


# ── reconciliation failure line ────────────────────────────────────────

class TestReconciliationFailureIsStructured:
    def test_the_failure_line_carries_business_id_and_period(
        self, db_session, monkeypatch, caplog
    ):
        from app.services import reconciliation

        business = _make_business(db_session)

        fake_return = MagicMock()
        fake_return.id = 99
        fake_return.records_json = "[]"
        monkeypatch.setattr(
            reconciliation, "latest_gstr2b", lambda db, bid, period: fake_return
        )
        monkeypatch.setattr(
            reconciliation, "records_from_return", lambda r: []
        )
        monkeypatch.setattr(
            reconciliation,
            "match",
            MagicMock(side_effect=RuntimeError("unexpected failure")),
        )

        with caplog.at_level(logging.ERROR, logger="app.services.reconciliation"):
            reconciliation.run_reconciliation(db_session, business.id, "2026-04")

        errors = [
            r for r in caplog.records
            if r.name == "app.services.reconciliation" and r.levelno >= logging.ERROR
        ]
        assert errors, "No reconciliation failure log line emitted"
        assert errors[0].business_id == business.id
        assert errors[0].period == "2026-04"


# ── Celery task failure lines ──────────────────────────────────────────

class _Retry(Exception):
    pass


class TestTaskFailureLinesAreStructured:
    @pytest.fixture()
    def _task_plumbing(self, monkeypatch, db_session):
        class _Handle:
            def __getattr__(self, name):
                return getattr(db_session, name)
            def close(self):
                pass

        monkeypatch.setattr(alert_tasks, "SessionLocal", lambda: _Handle())
        monkeypatch.setattr(invoice_tasks, "SessionLocal", lambda: _Handle())

        for task in (
            alert_tasks.sweep_filing_deadlines_task,
            alert_tasks.send_pending_alert_emails_task,
            invoice_tasks.parse_invoice_task,
            invoice_tasks.reap_stalled_parses_task,
        ):
            monkeypatch.setattr(task, "retry", lambda exc=None, **kw: _Retry())

    def test_sweep_task_failure_log_has_celery_task_id_field(
        self, _task_plumbing, monkeypatch, caplog
    ):
        def explode(db):
            raise RuntimeError("db down")
        monkeypatch.setattr(alert_tasks.alerting, "sweep_filing_deadlines", explode)

        with caplog.at_level(logging.ERROR, logger="app.tasks.alert_tasks"), \
                pytest.raises(_Retry):
            alert_tasks.sweep_filing_deadlines_task()

        errors = [
            r for r in caplog.records
            if r.name == "app.tasks.alert_tasks" and r.levelno >= logging.ERROR
        ]
        assert errors
        assert hasattr(errors[0], "celery_task_id")
        assert hasattr(errors[0], "retry")

    def test_email_task_failure_log_has_celery_task_id_field(
        self, _task_plumbing, monkeypatch, caplog
    ):
        def explode(db):
            raise RuntimeError("db down")
        monkeypatch.setattr(alert_tasks.alert_delivery, "send_pending_alerts", explode)

        with caplog.at_level(logging.ERROR, logger="app.tasks.alert_tasks"), \
                pytest.raises(_Retry):
            alert_tasks.send_pending_alert_emails_task()

        errors = [
            r for r in caplog.records
            if r.name == "app.tasks.alert_tasks" and r.levelno >= logging.ERROR
        ]
        assert errors
        assert hasattr(errors[0], "celery_task_id")
        assert hasattr(errors[0], "retry")

    def test_parse_task_failure_log_has_invoice_id_and_celery_task_id(
        self, _task_plumbing, monkeypatch, caplog
    ):
        monkeypatch.setattr(
            invoice_tasks, "SessionLocal",
            lambda: type("S", (), {
                "get": lambda self, *a: (_ for _ in ()).throw(RuntimeError("db down")),
                "close": lambda self: None,
            })(),
        )

        with caplog.at_level(logging.ERROR, logger="app.tasks.invoice_tasks"), \
                pytest.raises(_Retry):
            invoice_tasks.parse_invoice_task(42)

        errors = [
            r for r in caplog.records
            if r.name == "app.tasks.invoice_tasks" and r.levelno >= logging.ERROR
        ]
        assert errors
        assert errors[0].invoice_id == 42
        assert hasattr(errors[0], "celery_task_id")

    def test_reap_task_failure_log_has_celery_task_id(
        self, _task_plumbing, monkeypatch, caplog
    ):
        def explode(db):
            raise RuntimeError("db down")
        monkeypatch.setattr(invoice_tasks.invoice_service, "reap_stalled_parses", explode)

        with caplog.at_level(logging.ERROR, logger="app.tasks.invoice_tasks"), \
                pytest.raises(_Retry):
            invoice_tasks.reap_stalled_parses_task()

        errors = [
            r for r in caplog.records
            if r.name == "app.tasks.invoice_tasks" and r.levelno >= logging.ERROR
        ]
        assert errors
        assert hasattr(errors[0], "celery_task_id")
