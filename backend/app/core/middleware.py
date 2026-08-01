"""Request-scoped middleware: identity, logging, limits and response headers.

Ordering matters and is set in ``create_app``. Starlette runs middleware in the
reverse of the order they are added, so the correlation-id middleware is added
*last* and therefore runs *first* — everything after it, including the rate
limiter's rejection and the exception handlers' 500, is logged and answered
with an id already bound.
"""
from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.logging import (
    bind_correlation_id,
    get_correlation_id,
    reset_correlation_id,
    sanitize_correlation_id,
    set_correlation_id,
)

logger = logging.getLogger("app.access")

# Header a client (or an upstream proxy) may use to supply its own id, in the
# order they are honoured.
_INBOUND_HEADERS = ("x-request-id", "x-correlation-id")

# Paths whose access lines are noise: a load balancer hits health every few
# seconds and would otherwise be the bulk of the log volume.
_QUIET_PATHS = frozenset({"/health", "/api/v1/health", "/api/v1/health/live", "/metrics"})


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Bind an id to the request context and echo it on the response.

    An id supplied by the caller is reused when it survives sanitising, so a
    trace that starts in the frontend or an upstream gateway stays one trace.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        supplied = ""
        for header in _INBOUND_HEADERS:
            supplied = sanitize_correlation_id(request.headers.get(header))
            if supplied:
                break

        correlation_id = bind_correlation_id(supplied)
        token = set_correlation_id(correlation_id)
        request.state.correlation_id = correlation_id
        try:
            response = await call_next(request)
        finally:
            reset_correlation_id(token)

        response.headers["X-Request-ID"] = correlation_id
        response.headers["X-Correlation-ID"] = correlation_id
        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    """One structured line per request, with its duration and outcome.

    Query strings are deliberately not logged: periods and GSTINs travel there,
    and a log aggregator is a lower-trust store than the database.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # The exception handlers turn this into a 500 response; the access
            # line still has to exist, and has to say the request failed.
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.exception(
                "%s %s failed", request.method, request.url.path,
                extra={
                    "http_method": request.method,
                    "http_path": request.url.path,
                    "duration_ms": duration_ms,
                    "status_code": 500,
                },
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Response-Time-Ms"] = str(duration_ms)

        # Rate-limit headers, if a limiter dependency ran on this route.
        decision = getattr(request.state, "rate_limit", None)
        if decision is not None:
            response.headers["X-RateLimit-Limit"] = str(decision.limit)
            response.headers["X-RateLimit-Remaining"] = str(decision.remaining)

        if request.url.path in _QUIET_PATHS and response.status_code < 400:
            return response

        level = logging.INFO
        if response.status_code >= 500:
            level = logging.ERROR
        elif response.status_code >= 400:
            level = logging.WARNING

        logger.log(
            level,
            "%s %s %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "http_method": request.method,
                "http_path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client_ip": _client_ip(request),
                "user_agent": request.headers.get("user-agent", "")[:200],
            },
        )
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Response headers that cost nothing and close off whole bug classes.

    The CSP is strict because this is an API: nothing it serves should ever be
    rendered, and ``default-src 'none'`` means a stored value reflected into an
    error page cannot execute. The docs pages are exempt — Swagger UI loads its
    own bundle — and they are only mounted when enabled.
    """

    _BASE = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    }

    def __init__(self, app, docs_paths: tuple[str, ...] = ()) -> None:
        super().__init__(app)
        self._docs_paths = docs_paths

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for header, value in self._BASE.items():
            response.headers.setdefault(header, value)

        if request.url.path not in self._docs_paths:
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            )

        # HSTS only where TLS is actually terminated in front of us; sending it
        # from a plain-HTTP dev server would pin a developer's browser.
        if settings.hsts_enabled:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """The blanket per-caller ceiling, applied before routing.

    Per-endpoint limits are dependencies (see ``app.core.rate_limit``); this is
    the one that also covers requests to paths that do not exist, which is what
    a scanner generates.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        from app.core.errors import error_body
        from app.core.rate_limit import check_global

        if request.method == "OPTIONS" or request.url.path in _QUIET_PATHS:
            # A CORS preflight is not a request the caller chose to make, and
            # rejecting one turns a rate limit into an opaque browser error.
            return await call_next(request)

        decision = check_global(request)
        if decision is not None and not decision.allowed:
            logger.warning(
                "Global rate limit exceeded",
                extra={
                    "http_path": request.url.path,
                    "client_ip": _client_ip(request),
                    "status_code": 429,
                },
            )
            response = JSONResponse(
                status_code=429,
                content=error_body(
                    429,
                    f"Too many requests. Try again in {decision.retry_after}s.",
                    code="rate_limited",
                ),
                headers={
                    "Retry-After": str(decision.retry_after),
                    "X-RateLimit-Limit": str(decision.limit),
                    "X-RateLimit-Remaining": "0",
                },
            )
            # The correlation middleware runs outside this one and will add the
            # id header on the way out, but the body is built here.
            response.headers["X-Request-ID"] = get_correlation_id() or "-"
            return response

        return await call_next(request)


def _client_ip(request: Request) -> str:
    from app.core.rate_limit import client_ip

    return client_ip(request)
