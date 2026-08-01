"""Authentication: register (with GSTIN onboarding), login, me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_business, get_current_user
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

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    """Create a business and its owner login in one step.

    The GSTIN has already been validated and normalised by the schema, so what
    remains here is uniqueness: one registration is one tenant, and a second
    sign-up against a GSTIN already on file is an invitation problem rather
    than a registration one.
    """
    if db.scalar(select(User).where(User.email == payload.email)):
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
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=UserRole.OWNER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(business)

    return RegisterResponse(
        user=UserOut.model_validate(user),
        business=BusinessOut.from_business(business),
        access_token=create_access_token(user.id),
    )


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Token:
    # OAuth2PasswordRequestForm calls it ``username``; we treat it as the email.
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.hashed_password):
        # One message for both cases, so the endpoint cannot be used to
        # enumerate which GSTINs have accounts.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=MeOut)
def me(
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
) -> MeOut:
    return MeOut(
        **UserOut.model_validate(current_user).model_dump(),
        business=BusinessOut.from_business(business),
    )
