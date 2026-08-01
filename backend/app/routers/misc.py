"""Health and metadata routes — no auth, no database writes.

Three health endpoints rather than one, because an orchestrator asks three
different questions and answering them all with the same check is how a
transient database blip turns into every pod being killed at once:

* ``/health/live`` — is the process alive? Never touches a dependency.
* ``/health/ready`` — should traffic be routed here? Fails on a dead database,
  because an instance that cannot read invoices should leave the rotation.
* ``/health`` — the operator's view: every dependency, with its latency, and a
  ``health`` field that distinguishes "degraded" from "down".

``/health`` returns 200 while degraded, on purpose. The product still ingests
invoices without a model provider (heuristics take over) and without Redis
(parsing runs inline), so a monitor has to be able to tell "AI is down" from
"the API is down" — and a 503 for the former would page someone at 3am over a
free-tier rate limit.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import check_database, get_db, pool_status
from app.core.rate_limit import RateLimit
from app.core.redis_client import ping as redis_ping
from app.services import gstin as gstin_service
from app.services.openrouter_client import is_configured

router = APIRouter(tags=["health"])

# These are public, so they are limited by address rather than by identity —
# there is no identity to key on before a caller has signed in.
_gstin_limit = RateLimit("gstin_lookup", "120/minute", by="ip")
_meta_limit = RateLimit("meta", "60/minute", by="ip")


def _timed(check) -> tuple[bool, float, str | None]:
    """Run *check*, returning ``(ok, milliseconds, error_type)``.

    Swallows everything: a health endpoint that can itself 500 tells a monitor
    nothing it can act on.
    """
    started = time.perf_counter()
    try:
        ok, error = check()
    except Exception as exc:  # noqa: BLE001 - a health check never raises
        return False, round((time.perf_counter() - started) * 1000, 2), type(exc).__name__
    return ok, round((time.perf_counter() - started) * 1000, 2), error


@router.get(
    "/health",
    summary="Full health report",
    description=(
        "Every dependency with its latency. Returns 200 even when degraded — "
        "read the `health` field, which is `ok`, `degraded` (a soft dependency "
        "is down and the product still works) or `unhealthy` (the database is "
        "unreachable, and the response is a 503)."
    ),
    responses={
        200: {"description": "The API is up. `health` says how healthy."},
        503: {"description": "The database is unreachable; this instance cannot serve."},
    },
)
def health(response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Liveness plus every dependency that can fail independently."""
    database_ok, database_ms, database_error = _timed(lambda: check_database(db))
    redis_ok, redis_ms, _ = _timed(lambda: (redis_ping(), None))
    ai_configured = is_configured()

    checks: dict[str, Any] = {
        "database": {
            "status": "ok" if database_ok else "unavailable",
            "latency_ms": database_ms,
            **({"error": database_error} if database_error else {}),
            "pool": pool_status(),
        },
        "redis": {
            "status": "ok" if redis_ok else "unavailable",
            "latency_ms": redis_ms,
            # Names what is actually lost when it is down, so the person
            # reading this at 3am does not have to guess.
            "required_for": ["distributed rate limiting", "celery broker"],
        },
        "ai": {
            "status": "configured" if ai_configured else "unconfigured",
            "provider": "openrouter",
            "model": settings.openrouter_model,
        },
    }

    if not database_ok:
        overall = "unhealthy"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif not redis_ok or not ai_configured:
        overall = "degraded"
    else:
        overall = "ok"

    return {
        # The flat keys are kept for the monitors already watching them;
        # `checks` is where the detail lives.
        "status": "ok" if database_ok else "degraded",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "database": "ok" if database_ok else "unavailable",
        "redis": "ok" if redis_ok else "unavailable",
        "ai": "configured" if ai_configured else "unconfigured",
        "health": overall,
        "checks": checks,
    }


@router.get(
    "/health/live",
    summary="Liveness probe",
    description=(
        "Answers only 'is this process running'. Touches no dependency on "
        "purpose — a database outage must not make an orchestrator restart "
        "every instance, which turns a recoverable blip into a cold start."
    ),
)
def liveness() -> dict[str, str]:
    return {"status": "alive", "app": settings.app_name, "version": settings.app_version}


@router.get(
    "/health/ready",
    summary="Readiness probe",
    description=(
        "Whether this instance should receive traffic. 503 when the database "
        "is unreachable; Redis being down is reported but does not fail the "
        "probe, because uploads still parse inline without it."
    ),
    responses={503: {"description": "Not ready — the database is unreachable."}},
)
def readiness(response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    database_ok, database_ms, database_error = _timed(lambda: check_database(db))
    redis_ok, _, _ = _timed(lambda: (redis_ping(), None))

    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if database_ok else "not_ready",
        "database": "ok" if database_ok else "unavailable",
        "database_latency_ms": database_ms,
        "redis": "ok" if redis_ok else "unavailable",
        **({"error": database_error} if database_error else {}),
    }


@router.get(
    "/meta/states",
    summary="GST state codes",
    description=(
        "The two-digit state code to name mapping, for the onboarding and "
        "filing forms. The first two digits of every GSTIN are one of these."
    ),
    response_model=dict[str, str],
    dependencies=[Depends(_meta_limit)],
)
def states() -> dict[str, str]:
    return gstin_service.STATE_CODES


@router.get(
    "/meta/gstin/{gstin}",
    summary="Validate a GSTIN",
    description=(
        "Checks the format and the check digit, and decodes the state and PAN "
        "a valid GSTIN encodes.\n\n"
        "Always 200: an invalid GSTIN comes back as "
        '`{"valid": false, "error": ...}` rather than a 4xx, because the '
        "sign-up form calls this on every keystroke and a 4xx per character is "
        "indistinguishable from the endpoint being broken.\n\n"
        "Public — it is called before an account exists."
    ),
    dependencies=[Depends(_gstin_limit)],
)
def validate_gstin(gstin: str) -> dict[str, Any]:
    try:
        parts = gstin_service.parse(gstin)
    except gstin_service.InvalidGSTIN as exc:
        return {"gstin": gstin_service.normalize(gstin), "valid": False, "error": str(exc)}
    return {
        "gstin": parts.gstin,
        "valid": True,
        "state_code": parts.state_code,
        "state_name": parts.state_name,
        "pan": parts.pan,
    }
