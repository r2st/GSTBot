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
    worker_shutdown,
)

from app.core.config import settings
from app.core.database import engine
from app.core.logging import (
    bind_correlation_id,
    configure_logging,
    get_correlation_id,
    new_correlation_id,
    set_correlation_id,
)
from app.core.redis_client import close as redis_close

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
    # Explicit rather than inherited. Left unset, Celery falls back to
    # broker_connection_retry to decide whether to retry the *first* broker
    # connection, and 6.0 drops that fallback. The behaviour it decides is the
    # one that matters here: the unit is ordered After=redis-server.service but
    # does not require it, so a worker starting while Redis is still coming up
    # is ordinary, and the alternative to retrying is a unit that exits and
    # takes its five restarts before Redis has finished booting.
    broker_connection_retry_on_startup=True,
    # Recycle the child after this many tasks. Parsing runs pdf text extraction,
    # PIL, and tesseract in-process — C libraries whose arenas fragment rather
    # than return, so a worker that never recycles grows for as long as it runs
    # and is eventually OOM-killed mid-invoice.
    worker_max_tasks_per_child=settings.celery_max_tasks_per_child,
    # Deliberately *not* set: task_reject_on_worker_lost. It covers a narrower
    # case than acks_late does. Killing the whole worker drops the broker
    # connection, so the unacked message goes back on the queue either way; this
    # setting is only about a prefork *child* dying while the parent lives,
    # which is the OOM killer's usual choice because the child is the one
    # holding the decoded PDF. Requeueing there would put an invoice that
    # reliably exhausts memory back on the queue forever, since redelivery after
    # worker loss does not count against max_retries. Failing that one task
    # leaves the invoice visibly unparsed and re-extractable from the UI, which
    # is the better of the two failures.
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


@worker_shutdown.connect
def _release_pools(**_: Any) -> None:
    """Drop the database and Redis pools on the way out.

    The same reasoning as the API's lifespan teardown, and it matters more here:
    the worker unit allows TimeoutStopSec=300 so a long parse can finish, which
    is five minutes during which a redeployed worker's connections and the
    outgoing one's are both live. Tasks open their own sessions from the same
    module-level engine, so it is this process's pool that is holding them.

    Nothing here may raise. An exception out of a shutdown signal is a non-zero
    exit, which systemd records as a failed unit — turning an ordinary stop into
    something that looks like a crash.
    """
    logger = logging.getLogger(__name__)

    try:
        redis_close()
    except Exception as exc:  # noqa: BLE001 - shutdown is not a place to fail
        logger.warning("Redis client did not close cleanly: %s", exc)

    try:
        engine.dispose()
    except Exception as exc:  # noqa: BLE001 - shutdown is not a place to fail
        logger.warning("Database pool did not dispose cleanly: %s", exc)

    logger.info("Worker pools released")


logging.getLogger(__name__).debug("Celery configured with correlation propagation")
