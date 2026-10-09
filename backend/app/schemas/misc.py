"""Schemas for public endpoints that live outside the domain routers."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class ReminderSubscribeRequest(BaseModel):
    email: EmailStr


class SubscriberRequest(BaseModel):
    email: EmailStr
    source: str = Field(
        default="landing",
        pattern=r"^(calculator|lookup|filing-dates|landing)$",
    )


class FeedbackRequest(BaseModel):
    page: str = Field(..., max_length=500)
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=2000)
    timestamp: str = Field(..., max_length=40)
