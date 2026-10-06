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
