"""Request/response models for the alert list and the two things you can do to one."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class AlertScope(str, Enum):
    """Which alerts a listing is asking for.

    Three named states rather than a raw ``status`` filter, because the useful
    question is almost never "which alerts are in status *sent*" — it is "what
    is still on my plate". ``status`` remains on every row for a client that
    wants to group by it.
    """

    OPEN = "open"
    CLOSED = "closed"
    ALL = "all"


class AlertOut(BaseModel):
    """One thing the business should know about.

    ``channel`` and ``sent_at`` are null on every alert this application
    currently raises, and that is a statement rather than an omission: nothing
    here sends anything yet, so the alert is in the product and nowhere else.
    A client should not read null as "not delivered yet" and offer to retry.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    alert_type: str
    severity: str
    status: str
    title: str
    message: str
    period: str | None = None
    due_date: date | None = None
    channel: str | None = None
    sent_at: datetime | None = None
    context: dict | None = None
    created_at: datetime
    updated_at: datetime


class AlertListOut(BaseModel):
    """A page of alerts, plus the counts a badge needs.

    ``total`` counts what matched the filters and ``open_total`` does not — it
    is every outstanding alert for the tenant, whatever this page asked for. A
    screen showing "3 dismissed alerts" should still be able to say there are
    eleven waiting, without a second call.
    """

    items: list[AlertOut]
    total: int
    open_total: int
    limit: int
    offset: int
