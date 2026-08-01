"""Request/response models for registration and login."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.business import BusinessPlan
from app.models.user import UserRole
from app.services import gstin as gstin_service


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gstin: str
    legal_name: str
    trade_name: str | None = None
    state_code: str
    state_name: str = ""
    plan: BusinessPlan
    is_active: bool
    created_at: datetime

    @classmethod
    def from_business(cls, business) -> BusinessOut:
        data = cls.model_validate(business)
        return data.model_copy(
            update={"state_name": gstin_service.STATE_CODES.get(business.state_code, "")}
        )


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None = None
    phone: str | None = None
    role: UserRole
    is_active: bool
    business_id: int
    created_at: datetime


class MeOut(UserOut):
    """``/auth/me`` — the user plus the tenant they act for.

    Returned together because the frontend needs both on every page load, and
    a second round trip for the business would be one the app always makes.
    """

    business: BusinessOut


class RegisterRequest(BaseModel):
    """Sign-up: one GSTIN, one owner login.

    Registration creates the business too — a GST compliance product has
    nothing to show a user who has not told it which registration they file
    under, so there is no useful account state before that point.
    """

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    gstin: str = Field(description="15-character GSTIN of the business")
    legal_name: str = Field(min_length=1, max_length=255)
    trade_name: str | None = Field(default=None, max_length=255)
    full_name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("gstin")
    @classmethod
    def _valid_gstin(cls, v: str) -> str:
        # Validated here rather than in the route so a malformed GSTIN comes
        # back as a 422 naming the field, like every other bad input.
        try:
            return gstin_service.parse(v).gstin
        except gstin_service.InvalidGSTIN as exc:
            raise ValueError(str(exc)) from exc


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    """Registration returns a usable session, not just a created row."""

    user: UserOut
    business: BusinessOut
    access_token: str
    token_type: str = "bearer"
