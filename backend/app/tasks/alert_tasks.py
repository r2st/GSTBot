"""Periodic alert work: the daily filing-deadline sweep.

The one scheduled task in this application, and the reason a beat process
exists at all. Everything else here runs because a request asked for it; a
deadline is the opposite — it is a thing that fails to happen, so only a clock
can notice.
"""
from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.services import alerting

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
