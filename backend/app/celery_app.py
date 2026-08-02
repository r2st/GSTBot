"""Celery application: the worker that parses invoices off the request path.

Kept in its own module rather than in ``main`` so the worker process never
imports FastAPI, and so ``celery -A app.celery_app worker`` is the whole
command.

The signal handlers at the bottom carry the request's correlation id across the
broker. Without them an upload's log lines stop at the enqueue and a separate,
unrelated id picks up in the worker — which is exactly where the interesting
failures happen, since the model call is on that side.
"""
from __future__ import annotations

import logging
from typing import Any

from celery import Celery
from celery.signals import (
    before_task_publish,
    setup_logging,
    task_postrun,
    task_prerun,
)

from app.core.config import settings
from app.core.logging import (
    bind_correlation_id,
    configure_logging,
    get_correlation_id,
    new_correlation_id,
    set_correlation_id,
)

celery_app = Celery(
    "gstbot",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.invoice_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",  # Every deadline this product tracks is IST.
    enable_utc=True,
    task_track_started=True,
    # An invoice parse is one model call plus IO. Well under a minute in
    # practice; the hard limit is there so a hung upstream frees the worker.
    task_soft_time_limit=180,
    task_time_limit=240,
    # Free-tier models rate-limit, so a retry a minute later usually succeeds.
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

CORRELATION_HEADER = "correlation_id"


@setup_logging.connect
def _configure_worker_logging(**_: Any) -> None:
    """Stop Celery installing its own handlers.

    Celery configures logging itself unless this signal has a receiver. Letting
    it do that would give the worker a different format from the API and drop
    the correlation id, so the receiver exists purely to take the decision back.
    """
    configure_logging(settings.log_level, settings.log_format)


@before_task_publish.connect
def _attach_correlation_id(headers: dict[str, Any] | None = None, **_: Any) -> None:
    """Stamp the publishing context's id onto the message.

    Protocol 2 puts unknown header keys on ``task.request`` in the worker, which
    is how the id survives the broker without changing any task signature. An id
    is generated when publishing from outside a request (a beat schedule, a
    shell) so the worker end is never anonymous.
    """
    if headers is None:
        return
    if not headers.get(CORRELATION_HEADER):
        headers[CORRELATION_HEADER] = get_correlation_id() or new_correlation_id()


@task_prerun.connect
def _bind_task_correlation_id(task: Any = None, **_: Any) -> None:
    request = getattr(task, "request", None)
    bind_correlation_id(getattr(request, CORRELATION_HEADER, None) if request else None)


@task_postrun.connect
def _clear_task_correlation_id(**_: Any) -> None:
    """Clear between tasks.

    A worker process is long-lived and reuses the context, so an id left bound
    would be inherited by the next task off the queue and attribute its lines to
    an unrelated upload.
    """
    set_correlation_id("")


logging.getLogger(__name__).debug("Celery configured with correlation propagation")
