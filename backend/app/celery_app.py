"""Celery application: the worker that parses invoices off the request path.

Kept in its own module rather than in ``main`` so the worker process never
imports FastAPI, and so ``celery -A app.celery_app worker`` is the whole
command.
"""
from __future__ import annotations

from celery import Celery

from app.core.config import settings

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
