"""Request/response models for registration and login."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core import sanitize
from app.models.business import BusinessPlan
from app.models.user import UserRole
from app.services import gstin as gstin_service

# The handful of passwords that show up at the top of every breach corpus.
# Not a substitute for a real strength check — just a floor.
_COMMON_PASSWORDS = frozenset(
    {
        "password", "password1", "password123", "12345678", "123456789",
        "1234567890", "qwertyuiop", "letmein123", "welcome123", "admin123",
        "iloveyou", "abc12345", "gstbot123", "changeme", "passw0rd",
    }
)


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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "owner@umangtraders.in",
                "password": "a-long-passphrase",
                "gstin": "27AAPFU0939F1ZV",
                "legal_name": "Umang Traders Private Limited",
                "trade_name": "Umang Traders",
                "full_name": "Umang Shah",
                "phone": "+919820012345",
            }
        }
    )

    email: EmailStr = Field(description="Owner's email. Also the login identifier.")
    password: str = Field(
        min_length=8,
        max_length=128,
        description=(
            "At least 8 characters. Capped at 128 because bcrypt hashes only the "
            "first 72 bytes, and accepting more would suggest a strength that is "
            "not there."
        ),
    )
    gstin: str = Field(
        # Bounded generously rather than at exactly 15: the validator below
        # normalises away the spacing people paste out of a registration
        # certificate, and rejecting "27 AAPFU0939F 1ZV" on length before that
        # runs would be a worse error than the one it is trying to give.
        max_length=32,
        description=(
            "15-character GSTIN of the business. Spaces are stripped, case is "
            "normalised, and the check digit is verified."
        ),
    )
    legal_name: str = Field(
        min_length=1, max_length=255, description="Name as registered with GST."
    )
    trade_name: str | None = Field(
        default=None, max_length=255, description="Name the business trades under."
    )
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

    @field_validator("legal_name", "trade_name", "full_name", "phone")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        # Control characters and bidi overrides are stripped at the edge: these
        # values are rendered in the app, written into a GSTR-1 export and put
        # in a Content-Disposition filename, and none of those want them.
        return sanitize.clean_text(v, max_length=255)

    @field_validator("password")
    @classmethod
    def _not_obviously_weak(cls, v: str) -> str:
        # A deliberately shallow check. Real strength enforcement belongs with
        # a breach-corpus check, not a regex; what this catches is the sign-up
        # that would be brute-forced in an afternoon.
        if v.strip() == "":
            raise ValueError("Password cannot be only whitespace")
        if v.lower() in _COMMON_PASSWORDS:
            raise ValueError("That password is too common. Choose something less guessable.")
        return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    """Registration returns a usable session, not just a created row."""

    user: UserOut
    business: BusinessOut
    access_token: str
    token_type: str = "bearer"
