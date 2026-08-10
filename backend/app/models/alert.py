"""Alerts: deadlines, mismatches and risks the business needs to act on."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from sqlalchemy import Date, DateTime, Index, String, Text, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import BusinessScopedMixin, JSONType, SoftDeleteMixin, TimestampMixin


class AlertType(str, Enum):
    FILING_DEADLINE = "filing_deadline"
    MISMATCH = "mismatch"
    ITC_AT_RISK = "itc_at_risk"
    SUPPLIER_RISK = "supplier_risk"
    PLAN_LIMIT = "plan_limit"
    PARSE_FAILED = "parse_failed"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    READ = "read"
    DISMISSED = "dismissed"  # The business closed it: "I know."
    FAILED = "failed"
    # The thing the alert asked for happened — the return was filed. Kept
    # distinct from DISMISSED because the difference is the only way to ask
    # later whether these alerts do anything: one means the business acted, the
    # other means they made it go away. Stored as the member name in a plain
    # VARCHAR (``native_enum=False``, no check constraint), so adding it needs
    # no migration.
    RESOLVED = "resolved"


# The statuses that mean the alert is still outstanding: everything except the
# two that close it. FAILED is one of them — a delivery that failed leaves the
# deadline every bit as unmet, so the alert is live and it is the sending that
# is broken.
#
# Kept here rather than in whichever module needed it first, because the sweep,
# the listing and the dashboard's badge all have to agree on it. They disagreed
# once: the badge counted PENDING and SENT alone, so reading an alert made the
# count go down while the return stayed unfiled.
OPEN_STATUSES = frozenset(
    {AlertStatus.PENDING, AlertStatus.SENT, AlertStatus.READ, AlertStatus.FAILED}
)


class Alert(Base, BusinessScopedMixin, TimestampMixin, SoftDeleteMixin):
    """One thing the business should know about, and whether we told them.

    Delivery state is on the row rather than in the worker's memory: a missed
    filing deadline is a penalty, so "did this actually reach them, and by
    which channel" has to survive a worker restart.
    """

    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_business_created", "business_id", "created_at"),
        Index("ix_alerts_business_status", "business_id", "status"),
        Index("ix_alerts_business_due", "business_id", "due_date"),
        # The email digest asks which tenants have anything undelivered, across
        # every tenant at once — so like the reaper's query on invoices it
        # constrains no ``business_id`` and cannot use the three indexes above.
        # ``business_id`` trails ``status`` here rather than leading it, which
        # is what lets the DISTINCT be answered from the index instead of from
        # the rows. See ``send_pending_alerts`` in services/alert_delivery.py.
        Index(
            "ix_alerts_status_business",
            "status",
            "business_id",
            sqlite_where=text("deleted_at IS NULL"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_type: Mapped[AlertType] = mapped_column(
        SAEnum(AlertType, native_enum=False, length=30), nullable=False
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        SAEnum(AlertSeverity, native_enum=False, length=10),
        default=AlertSeverity.INFO,
        nullable=False,
    )
    status: Mapped[AlertStatus] = mapped_column(
        SAEnum(AlertStatus, native_enum=False, length=10),
        default=AlertStatus.PENDING,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # "email", "sms", "whatsapp", "in_app". Null until a sender picks one.
    channel: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # What the alert is about: ``{"invoice_id": 12}``, ``{"supplier_gstin": ...}``.
    # Free-form so a new alert type does not need a migration.
    context: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Alert {self.alert_type} {self.severity} {self.status}>"
