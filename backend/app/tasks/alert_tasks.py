"""Periodic alert work: the daily filing-deadline sweep, and emailing what it raised.

The two scheduled tasks in this application, and the reason a beat process
exists at all. Everything else here runs because a request asked for it; a
deadline is the opposite — it is a thing that fails to happen, so only a clock
can notice. The sweep runs first; the send runs a quarter-hour after it, so
there is something to send by the time it runs — see ``DEADLINE_SWEEP_HOUR``
and ``ALERT_EMAIL_MINUTE`` in ``app/celery_app.py``.
"""
from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.services import alert_delivery, alerting

logger = logging.getLogger(__name__)


@celery_app.task(
    name="alerts.sweep_filing_deadlines",
    bind=True,
    max_retries=2,
    default_retry_delay=600,
)
def sweep_filing_deadlines_task(self) -> dict:
    """Bring every tenant's filing-deadline alerts into line with what they filed.

    Retried twice, ten minutes apart, and then left alone. The sweep is
    idempotent and runs again tomorrow, so the thing worth covering is a
    database that happened to be unreachable at 07:00 — not a defect, which
    would only be repeated. Retrying harder would turn one bad morning into a
    day of identical failures in the journal.

    The service commits per business and swallows a single tenant's failure, so
    reaching this handler at all means something below that broke: the tenant
    query itself, or the connection.
    """
    db = SessionLocal()
    try:
        return alerting.sweep_filing_deadlines(db).as_dict()
    except Exception as exc:  # noqa: BLE001 - retried, then surfaced
        logger.exception("Filing deadline sweep failed")
        raise self.retry(exc=exc) from exc
    finally:
        db.close()


@celery_app.task(
    name="alerts.send_pending_emails",
    bind=True,
    max_retries=2,
    default_retry_delay=600,
)
def send_pending_alert_emails_task(self) -> dict:
    """Email each business a digest of its undelivered alerts.

    A no-op wherever ``ALERTS_EMAIL_ENABLED`` or ``SMTP_HOST`` is unset, so
    scheduling this costs nothing on a deployment that has not configured
    email — see :func:`app.services.alert_delivery.send_pending_alerts`.

    Retried on the same schedule as the sweep and for the same reason: a
    single tenant's bad address or a relay outage is handled inside the
    service and never reaches this handler, so reaching here means the
    database itself was briefly unavailable.
    """
    db = SessionLocal()
    try:
        return alert_delivery.send_pending_alerts(db).as_dict()
    except Exception as exc:  # noqa: BLE001 - retried, then surfaced
        logger.exception("Alert email digest failed")
        raise self.retry(exc=exc) from exc
    finally:
        db.close()
