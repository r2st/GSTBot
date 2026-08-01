"""Async invoice work.

Tasks open their own session — a Celery task runs outside any request, so
there is no ``get_db`` dependency to inherit — and always close it, because a
worker process is long-lived and a leaked connection there is permanent.
"""
from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.invoice import Invoice
from app.services import invoice_service

logger = logging.getLogger(__name__)


@celery_app.task(name="invoices.parse", bind=True, max_retries=3, default_retry_delay=60)
def parse_invoice_task(self, invoice_id: int) -> dict:
    """Extract one stored invoice.

    ``process_invoice`` records its own failures on the row rather than
    raising, so a retry here would only ever repeat a permanent failure. The
    retry exists for the layer below that: a database that was unreachable
    when the task started.
    """
    db = SessionLocal()
    try:
        invoice = db.get(Invoice, invoice_id)
        if invoice is None or invoice.deleted_at is not None:
            logger.warning("Invoice %s is gone; nothing to parse", invoice_id)
            return {"invoice_id": invoice_id, "status": "missing"}

        invoice = invoice_service.process_invoice(db, invoice)
        return {
            "invoice_id": invoice.id,
            "status": invoice.status.value,
            "parsed_with": invoice.parsed_with,
            "confidence": invoice.extraction_confidence,
        }
    except Exception as exc:  # noqa: BLE001 - retried, then surfaced
        logger.exception("parse_invoice_task failed for invoice %s", invoice_id)
        raise self.retry(exc=exc) from exc
    finally:
        db.close()
