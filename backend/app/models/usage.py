"""Per-business API usage tracking, rolled up monthly."""
from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class UsageRecord(Base, TimestampMixin):
    """How many API calls a business has made in a calendar month.

    ``period`` is ``YYYY-MM``, matching the filing-period format used
    elsewhere in this product.  One row per (business, period, endpoint).
    """

    __tablename__ = "usage_records"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "period", "endpoint",
            name="uq_usage_business_period_endpoint",
        ),
        Index("ix_usage_business_period", "business_id", "period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(64), nullable=False)
    call_count: Mapped[int] = mapped_column(default=0, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"<UsageRecord business_id={self.business_id} "
            f"period={self.period} endpoint={self.endpoint} count={self.call_count}>"
        )
