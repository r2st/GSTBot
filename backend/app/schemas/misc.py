"""Schemas for public endpoints that live outside the domain routers."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr


class ReminderSubscribeRequest(BaseModel):
    email: EmailStr
