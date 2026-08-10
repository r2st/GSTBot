"""The scheduled task that emails what the sweep raised: registration,
retry behaviour and session hygiene.

What the digest actually contains is covered in ``test_alert_delivery.py``;
this file is only about the Celery wiring, mirroring the sweep task's own
tests in ``test_alerting.py`` for the reasons given there — a task run without
a broker has no real ``self`` to hand in, so ``.retry`` is patched on the
registered task object rather than passed as an argument.
"""
from __future__ import annotations

import pytest

from app.services import alert_delivery
from app.tasks import alert_tasks
from app.tasks.alert_tasks import send_pending_alert_emails_task


class _Retry(Exception):
    """Stands in for celery.exceptions.Retry, which is what .retry() raises."""


@pytest.fixture()
def retries(monkeypatch) -> list[BaseException | None]:
    recorded: list[BaseException | None] = []

    def fake_retry(exc=None, **kwargs):
        recorded.append(exc)
        return _Retry(str(exc))

    monkeypatch.setattr(send_pending_alert_emails_task, "retry", fake_retry)
    return recorded


@pytest.fixture()
def sessions(monkeypatch, db_session) -> dict[str, int]:
    record = {"opened": 0, "closed": 0}

    class _Handle:
        def __getattr__(self, name):
            return getattr(db_session, name)

        def close(self):
            record["closed"] += 1

    def factory():
        record["opened"] += 1
        return _Handle()

    monkeypatch.setattr(alert_tasks, "SessionLocal", factory)
    return record


class TestTheSchedule:
    def test_the_email_task_is_registered(self):
        from app.celery_app import celery_app

        assert "alerts.send_pending_emails" in celery_app.tasks

    def test_it_is_scheduled_after_the_sweep_in_the_same_timezone(self):
        from app.celery_app import ALERT_EMAIL_MINUTE, DEADLINE_SWEEP_HOUR, celery_app

        assert celery_app.conf.timezone == "Asia/Kolkata"

        schedule = celery_app.conf.beat_schedule["filing-deadline-alert-emails"]["schedule"]
        assert schedule.hour == {DEADLINE_SWEEP_HOUR}
        assert schedule.minute == {ALERT_EMAIL_MINUTE}
        assert ALERT_EMAIL_MINUTE > 0, "must run after the sweep's own :00 entry"

    def test_it_runs_once_a_day(self):
        from app.celery_app import celery_app

        schedule = celery_app.conf.beat_schedule["filing-deadline-alert-emails"]["schedule"]
        assert len(schedule.hour) == 1
        assert len(schedule.day_of_week) == 7
        assert len(schedule.day_of_month) == 31
        assert len(schedule.month_of_year) == 12


class TestTheTask:
    def test_the_task_reports_what_the_send_did(self, sessions, monkeypatch):
        monkeypatch.setattr(
            alert_tasks.alert_delivery,
            "send_pending_alerts",
            lambda db: alert_delivery.AlertEmailResult(businesses=1, emails_sent=1, alerts_sent=2),
        )

        result = send_pending_alert_emails_task()

        assert result == {
            "businesses": 1,
            "emails_sent": 1,
            "alerts_sent": 2,
            "alerts_failed": 0,
            "skipped_no_recipient": 0,
        }
        assert sessions["closed"] == 1

    def test_a_send_that_cannot_reach_the_database_is_retried(
        self, sessions, retries, monkeypatch
    ):
        boom = RuntimeError("could not connect to the database")

        def explode(db):
            raise boom

        monkeypatch.setattr(alert_tasks.alert_delivery, "send_pending_alerts", explode)

        with pytest.raises(_Retry):
            send_pending_alert_emails_task()

        assert retries == [boom]

    def test_the_session_is_closed_even_when_the_send_fails(
        self, sessions, retries, monkeypatch
    ):
        def explode(db):
            raise RuntimeError("the database is down")

        monkeypatch.setattr(alert_tasks.alert_delivery, "send_pending_alerts", explode)

        with pytest.raises(_Retry):
            send_pending_alert_emails_task()

        assert sessions["closed"] == 1
