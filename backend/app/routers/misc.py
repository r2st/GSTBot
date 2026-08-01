"""Health and metadata routes — no auth, no database writes."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services import gstin as gstin_service
from app.services.openrouter_client import is_configured

router = APIRouter(tags=["misc"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Liveness plus the two dependencies that can fail independently.

    Reports rather than 503s on a degraded dependency: the product still
    ingests invoices without a model (heuristics take over), so a monitor
    should be able to tell "AI is down" from "the API is down".
    """
    try:
        db.execute(text("SELECT 1"))
        database_ok = True
    except Exception:  # noqa: BLE001 - the endpoint's job is to report this
        database_ok = False

    return {
        "status": "ok" if database_ok else "degraded",
        "app": settings.app_name,
        "environment": settings.environment,
        "database": "ok" if database_ok else "unavailable",
        "ai": "configured" if is_configured() else "unconfigured",
    }


@router.get("/meta/states")
def states() -> dict[str, str]:
    """GST state codes, for the onboarding and filing forms."""
    return gstin_service.STATE_CODES


@router.get("/meta/gstin/{gstin}")
def validate_gstin(gstin: str) -> dict:
    """Validate a GSTIN and decode what it encodes.

    Public because the sign-up form calls it before an account exists.
    """
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
