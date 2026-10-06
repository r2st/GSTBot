"""OAuth SSO endpoints: Google, GitHub, Microsoft."""
from __future__ import annotations

import logging
import secrets

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.config import Config

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import RateLimit
from app.core.security import create_access_token
from app.models.business import Business, BusinessPlan
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()

if settings.google_client_id:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

if settings.github_client_id:
    oauth.register(
        name="github",
        client_id=settings.github_client_id,
        client_secret=settings.github_client_secret,
        authorize_url="https://github.com/login/oauth/authorize",
        access_token_url="https://github.com/login/oauth/access_token",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "user:email"},
    )

if settings.microsoft_client_id:
    oauth.register(
        name="microsoft",
        client_id=settings.microsoft_client_id,
        client_secret=settings.microsoft_client_secret,
        server_metadata_url="https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

FRONTEND_URL = settings.cors_origins[0] if settings.cors_origins else "http://localhost:5173"

_oauth_initiate_limit = RateLimit("oauth_initiate", "30/minute", by="ip")
_oauth_callback_limit = RateLimit("oauth_callback", "30/minute", by="ip")


def _callback_url(provider: str) -> str:
    return f"{settings.oauth_redirect_base}{settings.api_v1_prefix}/auth/{provider}/callback"


def _find_or_create_oauth_user(
    db: Session,
    *,
    provider: str,
    oauth_id: str,
    email: str,
    name: str | None,
    email_verified: bool = False,
) -> User | None:
    user = db.scalar(
        select(User).where(User.oauth_provider == provider, User.oauth_id == oauth_id)
    )
    if user:
        if not user.is_active:
            return None
        return user

    user = db.scalar(select(User).where(User.email == email))
    if user:
        if not user.is_active:
            return None
        if not email_verified:
            logger.warning(
                "OAuth link refused: provider did not verify email",
                extra={"provider": provider, "user_id": user.id},
            )
            return None
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_id = oauth_id
            db.commit()
            db.refresh(user)
            logger.info(
                "OAuth provider linked to existing account",
                extra={"provider": provider, "user_id": user.id},
            )
        return user

    business = Business(
        legal_name=name or email.split("@")[0],
        plan=BusinessPlan.FREE,
        is_active=True,
    )
    db.add(business)
    db.flush()

    user = User(
        email=email,
        full_name=name,
        business_id=business.id,
        role=UserRole.OWNER,
        oauth_provider=provider,
        oauth_id=oauth_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info(
        "OAuth account created",
        extra={
            "provider": provider,
            "user_id": user.id,
            "business_id": business.id,
        },
    )
    return user


def _complete_oauth_login(user: User | None, provider: str) -> RedirectResponse:
    if user is None:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=account_deactivated")
    logger.info(
        "OAuth login",
        extra={"user_id": user.id, "business_id": user.business_id, "provider": provider},
    )
    access_token = create_access_token(user.id)
    # Fragment (not query param) so the token never reaches server logs or Referer headers.
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback#token={access_token}")


# ── Google ────────────────────────────────────────────────

@router.get("/google", dependencies=[Depends(_oauth_initiate_limit)])
async def google_login(request: Request):
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    redirect_uri = _callback_url("google")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get(
    "/google/callback",
    dependencies=[Depends(_oauth_callback_limit)],
)
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google OAuth not configured")
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        logger.exception("Google OAuth callback failed")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=google_auth_failed")

    userinfo = token.get("userinfo", {})
    email = userinfo.get("email")
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")

    user = _find_or_create_oauth_user(
        db,
        provider="google",
        oauth_id=userinfo.get("sub", ""),
        email=email.lower(),
        name=userinfo.get("name"),
        email_verified=bool(userinfo.get("email_verified")),
    )
    return _complete_oauth_login(user, "google")


# ── GitHub ────────────────────────────────────────────────

@router.get("/github", dependencies=[Depends(_oauth_initiate_limit)])
async def github_login(request: Request):
    if not settings.github_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth not configured")
    redirect_uri = _callback_url("github")
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get(
    "/github/callback",
    dependencies=[Depends(_oauth_callback_limit)],
)
async def github_callback(request: Request, db: Session = Depends(get_db)):
    if not settings.github_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="GitHub OAuth not configured")
    try:
        token = await oauth.github.authorize_access_token(request)
    except Exception:
        logger.exception("GitHub OAuth callback failed")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=github_auth_failed")

    resp = await oauth.github.get("user", token=token)
    profile = resp.json()

    email = profile.get("email")
    if not email:
        emails_resp = await oauth.github.get("user/emails", token=token)
        for e in emails_resp.json():
            if e.get("primary") and e.get("verified"):
                email = e["email"]
                break

    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")

    user = _find_or_create_oauth_user(
        db,
        provider="github",
        oauth_id=str(profile.get("id", "")),
        email=email.lower(),
        name=profile.get("name") or profile.get("login"),
        email_verified=True,
    )
    return _complete_oauth_login(user, "github")


# ── Microsoft ─────────────────────────────────────────────

@router.get("/microsoft", dependencies=[Depends(_oauth_initiate_limit)])
async def microsoft_login(request: Request):
    if not settings.microsoft_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Microsoft OAuth not configured")
    redirect_uri = _callback_url("microsoft")
    return await oauth.microsoft.authorize_redirect(request, redirect_uri)


@router.get(
    "/microsoft/callback",
    dependencies=[Depends(_oauth_callback_limit)],
)
async def microsoft_callback(request: Request, db: Session = Depends(get_db)):
    if not settings.microsoft_client_id:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Microsoft OAuth not configured")
    try:
        token = await oauth.microsoft.authorize_access_token(request)
    except Exception:
        logger.exception("Microsoft OAuth callback failed")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=microsoft_auth_failed")

    userinfo = token.get("userinfo", {})
    email = userinfo.get("email") or userinfo.get("preferred_username")
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=no_email")

    user = _find_or_create_oauth_user(
        db,
        provider="microsoft",
        oauth_id=userinfo.get("sub", ""),
        email=email.lower(),
        name=userinfo.get("name"),
        email_verified=bool(userinfo.get("email_verified")),
    )
    return _complete_oauth_login(user, "microsoft")
