"""Rate limiting: a fixed-window counter, in Redis when there is one.

Why a fixed window rather than a token bucket: the limits here exist to stop
one tenant burning a shared free-tier model quota or brute-forcing a password,
not to shape traffic to the millisecond. A fixed window is two Redis commands
and is exact about the thing that matters — "no more than N in any minute" —
whereas a leaky bucket costs a Lua script for a precision nobody here needs.

Every limit is keyed by *tenant*, not by connection. Behind a NAT, a whole
office shares one IP, and an IP-keyed upload limit would mean the first user in
the building spends everyone's quota. Authenticated callers are therefore keyed
on their user id and only anonymous ones fall back to the address.

With Redis down the limiter falls back to a per-process in-memory window. That
is deliberately weaker — four API processes means four times the limit — but a
weak limit that stays up beats a strong one that takes the API down with the
cache.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.ratespec import Rate, parse_rate
from app.core.security import decode_access_token

logger = logging.getLogger(__name__)

# Keeps the in-memory fallback from growing without bound under a flood of
# distinct keys. Oldest-touched entries are evicted first.
_MAX_MEMORY_KEYS = 10_000


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class _MemoryWindows:
    """Process-local fixed windows. The fallback when Redis is unreachable."""

    def __init__(self) -> None:
        self._counts: OrderedDict[str, int] = OrderedDict()
        self._lock = threading.Lock()

    def hit(self, bucket_key: str) -> int:
        with self._lock:
            # The window start is part of the key, so a bucket is dead the
            # moment its window rolls over — but nothing deletes it. Evicting
            # the least-recently-touched quarter when the map gets large is
            # what bounds this; those are the rolled-over windows.
            if len(self._counts) > _MAX_MEMORY_KEYS:
                for key in list(self._counts)[: _MAX_MEMORY_KEYS // 4]:
                    self._counts.pop(key, None)
            count = self._counts.get(bucket_key, 0) + 1
            self._counts[bucket_key] = count
            self._counts.move_to_end(bucket_key)
            return count

    def clear(self) -> None:
        with self._lock:
            self._counts.clear()


_memory = _MemoryWindows()


def _hit(key: str, rate: Rate) -> Decision:
    """Count one request against *key* and decide whether it may proceed."""
    now = time.time()
    window_start = int(now // rate.window) * rate.window
    reset_in = int(window_start + rate.window - now) or 1
    bucket = f"ratelimit:{key}:{window_start}"

    count: int | None = None
    from app.core.redis_client import get_redis

    client = get_redis()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.incr(bucket, 1)
            pipe.expire(bucket, rate.window + 1)
            count = int(pipe.execute()[0])
        except Exception as exc:  # noqa: BLE001 - fall back, never fail the request
            logger.warning("Rate limiter degraded to in-process counters: %s", exc)
            count = None

    if count is None:
        count = _memory.hit(bucket)

    remaining = max(0, rate.limit - count)
    return Decision(
        allowed=count <= rate.limit,
        limit=rate.limit,
        remaining=remaining,
        retry_after=reset_in,
    )


def client_ip(request: Request) -> str:
    """The caller's address, trusting proxy headers only when told to.

    ``X-Forwarded-For`` is a request header like any other: a client can send
    a fabricated one and mint itself a fresh rate-limit bucket per request. It
    is honoured only when ``TRUST_PROXY_HEADERS`` says a proxy we control is in
    front and is rewriting it.
    """
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            # Left-most entry is the original client; the rest are hops.
            return forwarded.split(",")[0].strip()[:64]
        real_ip = request.headers.get("x-real-ip", "")
        if real_ip:
            return real_ip.strip()[:64]
    return request.client.host if request.client else "unknown"


def identity(request: Request) -> str:
    """Who to charge this request to: ``user:<id>`` or ``ip:<addr>``.

    The token is decoded rather than looked up — the point is to attribute the
    request, and a signature check is enough for that without a database round
    trip on every call.
    """
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        subject = decode_access_token(header[7:].strip())
        if subject:
            return f"user:{subject}"
    return f"ip:{client_ip(request)}"


def apply_headers(response_headers: dict[str, str], decision: Decision) -> None:
    response_headers["X-RateLimit-Limit"] = str(decision.limit)
    response_headers["X-RateLimit-Remaining"] = str(decision.remaining)
    response_headers["X-RateLimit-Reset"] = str(decision.retry_after)


class RateLimit:
    """A FastAPI dependency enforcing one named limit.

    Used as ``dependencies=[Depends(RateLimit("uploads", "30/minute"))]``. The
    name is part of the key, so a caller's upload budget and their login budget
    are separate buckets rather than one shared pool.
    """

    def __init__(self, name: str, spec: str, *, by: str = "identity") -> None:
        self.name = name
        self.spec = spec
        self.by = by
        self._rate: Rate | None = None

    @property
    def rate(self) -> Rate:
        # Parsed on first use rather than at import, so an override in settings
        # (and a monkeypatch in a test) is picked up.
        if self._rate is None:
            self._rate = parse_rate(settings.rate_limits.get(self.name, self.spec))
        return self._rate

    def __call__(self, request: Request) -> None:
        if not settings.rate_limit_enabled:
            return

        who = f"ip:{client_ip(request)}" if self.by == "ip" else identity(request)
        decision = _hit(f"{self.name}:{who}", self.rate)

        # Stashed on the request so the middleware can put the headers on the
        # response — a dependency has no response object to write to.
        request.state.rate_limit = decision

        if not decision.allowed:
            logger.warning(
                "Rate limit exceeded",
                extra={"limit_name": self.name, "limit": self.rate.label, "principal": who},
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Rate limit exceeded: {self.rate.label}. "
                    f"Try again in {decision.retry_after}s."
                ),
                headers={
                    "Retry-After": str(decision.retry_after),
                    "X-RateLimit-Limit": str(decision.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(decision.retry_after),
                },
            )


def check_global(request: Request) -> Decision | None:
    """The blanket per-caller limit every request passes through.

    Applied in middleware rather than as a dependency so that it also covers
    routes that do not exist — an unauthenticated scan for ``/admin.php`` is
    exactly the traffic a global limit is for.
    """
    if not settings.rate_limit_enabled:
        return None
    rate = parse_rate(settings.rate_limits.get("global", settings.rate_limit_default))
    return _hit(f"global:{identity(request)}", rate)


def reset() -> None:
    """Forget every counter. For tests."""
    _memory.clear()
    from app.core.redis_client import get_redis

    client = get_redis()
    if client is None:
        return
    try:
        keys = list(client.scan_iter("ratelimit:*", count=500))
        if keys:
            client.delete(*keys)
    except Exception:  # noqa: BLE001 - best effort
        pass
