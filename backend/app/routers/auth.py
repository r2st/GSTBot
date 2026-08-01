"""Authentication: register (with GSTIN onboarding), login, me.

The rate limits here are the strictest in the product and are keyed by
*address* rather than by identity, because the attack these endpoints face
comes from someone who has no identity yet: credential stuffing against login,
bulk sign-ups against register. Everywhere else, limiting by IP would punish an
office behind one NAT; here it is the only key that means anything.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_business, get_current_user
from app.core.rate_limit import RateLimit, client_ip
from app.core.security import create_access_token, hash_password, verify_password
from app.models.business import Business, BusinessPlan
from app.models.user import User, UserRole
from app.schemas.auth import (
    BusinessOut,
    MeOut,
    RegisterRequest,
    RegisterResponse,
    Token,
    UserOut,
)
from app.services import gstin as gstin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Ten sign-ups an hour from one address. A CA onboarding a handful of clients
# stays well under it; a script farming free-tier accounts does not.
_register_limit = RateLimit("register", "10/hour", by="ip")
# Twenty attempts a minute is far more than someone who has forgotten their
# password needs, and far less than a stuffing run wants.
_login_limit = RateLimit("login", "20/minute", by="ip")
_me_limit = RateLimit("me", "120/minute")


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a business and its owner login",
    description=(
        "One call creates the tenant (a GST registration) and the owner account "
        "that files under it, and returns a usable token — there is no second "
        "login round trip.\n\n"
        "The GSTIN's check digit is verified before anything is written, and the "
        "state code and PAN it encodes are decoded and stored, because they "
        "decide the IGST-vs-CGST/SGST split on every invoice that follows."
    ),
    responses={
        201: {"description": "Business and owner created; the token is live."},
        409: {
            "description": (
                "The email is taken, or this GSTIN is already registered — which "
                "is an invitation problem, not a registration one."
            )
        },
        422: {"description": "The GSTIN failed its check digit, or a field is invalid."},
    },
    dependencies=[Depends(_register_limit)],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    """Create a business and its owner login in one step.

    The GSTIN has already been validated and normalised by the schema, so what
    remains here is uniqueness: one registration is one tenant, and a second
    sign-up against a GSTIN already on file is an invitation problem rather
    than a registration one.
    """
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )
    if db.scalar(select(Business).where(Business.gstin == payload.gstin)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This GSTIN is already registered. Ask its owner to invite you.",
        )

    parts = gstin_service.parse(payload.gstin)
    business = Business(
        gstin=parts.gstin,
        legal_name=payload.legal_name,
        trade_name=payload.trade_name,
        state_code=parts.state_code,
        pan=parts.pan,
        plan=BusinessPlan.FREE,
    )
    db.add(business)
    db.flush()  # Assigns business.id without ending the transaction.

    user = User(
        business_id=business.id,
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(business)

    # The GSTIN identifies the tenant and belongs in the audit trail; the email
    # does not, and a log aggregator is a lower-trust store than the database.
    logger.info(
        "Business registered",
        extra={"business_id": business.id, "gstin": business.gstin, "user_id": user.id},
    )

    return RegisterResponse(
        user=UserOut.model_validate(user),
        business=BusinessOut.from_business(business),
        access_token=create_access_token(user.id),
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Exchange email and password for a bearer token",
    description=(
        "OAuth2 password flow, so the body is form-encoded and the email goes in "
        "the field named `username`.\n\n"
        "The token is a JWT whose `sub` claim is the user id; send it as "
        "`Authorization: Bearer <token>`. It expires after "
        "`ACCESS_TOKEN_EXPIRE_MINUTES` (24 hours by default) and there is no "
        "refresh flow — a filing session is not a long-lived one."
    ),
    responses={
        401: {
            "description": (
                "Wrong email or password. One message for both, so the endpoint "
                "cannot be used to enumerate which GSTINs have accounts."
            )
        },
        403: {"description": "The account exists but has been deactivated."},
        429: {"description": "Too many attempts from this address."},
    },
    dependencies=[Depends(_login_limit)],
)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    # OAuth2PasswordRequestForm calls it ``username``; we treat it as the email.
    # Registration stores the address folded to lower case, so that is the
    # indexed lookup. The second attempt covers rows written before the folding
    # existed — an exact match on what the user typed — rather than a
    # ``lower(email)`` comparison, which no index could serve.
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None and form.username != form.username.lower():
        user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        # Logged without the attempted email: a failed-login log is exactly
        # where a mistyped password ends up sitting next to the address that
        # typed it.
        logger.warning("Failed login attempt", extra={"client_ip": client_ip(request)})
        # One message for both cases, so the endpoint cannot be used to
        # enumerate which GSTINs have accounts.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    logger.info("Login", extra={"user_id": user.id, "business_id": user.business_id})
    return Token(access_token=create_access_token(user.id))


@router.get(
    "/me",
    response_model=MeOut,
    summary="The signed-in user and the business they act for",
    description=(
        "Returns both in one response because the frontend needs both on every "
        "page load, and a second round trip for the business would be one the "
        "app always makes.\n\n"
        "Also the session check: a 401 here means the stored token is expired or "
        "belongs to a deleted user."
    ),
    dependencies=[Depends(_me_limit)],
)
def me(
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
) -> MeOut:
    return MeOut(
        **UserOut.model_validate(current_user).model_dump(),
        business=BusinessOut.from_business(business),
    )
