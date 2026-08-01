"""A lazily-created, shared Redis client.

Redis is a *soft* dependency here. It backs rate limiting and the Celery
broker, and the product is still able to accept and parse an invoice without
it — so nothing in this module raises on a dead server. Callers get ``None``
and fall back, and the health endpoint is what tells an operator it is down.
"""
from __future__ import annotations

import contextlib
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Any | None = None
_unavailable = False


def get_redis() -> Any | None:
    """The shared client, or ``None`` when Redis cannot be reached.

    The failure is remembered so a dead server costs one connection attempt per
    process rather than one per request — a rate limiter that blocks on a
    connect timeout is worse than no rate limiter at all.
    """
    global _client, _unavailable

    if _client is not None:
        return _client
    if _unavailable:
        return None

    try:
        import redis

        client = redis.Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=settings.redis_timeout_seconds,
            socket_timeout=settings.redis_timeout_seconds,
            health_check_interval=30,
            decode_responses=True,
        )
        client.ping()
    except Exception as exc:  # noqa: BLE001 - any failure means "no Redis"
        logger.warning("Redis unavailable at startup, degrading gracefully: %s", exc)
        _unavailable = True
        return None

    _client = client
    return _client


def ping() -> bool:
    """Whether Redis answers right now. Used by the health endpoint."""
    client = get_redis()
    if client is None:
        return False
    try:
        return bool(client.ping())
    except Exception:  # noqa: BLE001 - the caller's job is to report this
        return False


def reset() -> None:
    """Drop the cached client and the "unavailable" memo. For tests."""
    global _client, _unavailable
    if _client is not None:
        # Closing an already-dead client raises; that is not a failure here.
        with contextlib.suppress(Exception):
            _client.close()
    _client = None
    _unavailable = False
