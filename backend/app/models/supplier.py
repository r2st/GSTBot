"""Counterparties, with the compliance history that decides whether to trust them."""
from __future__ import annotations

from datetime import date
from enum import Enum

from sqlalchemy import Date, Index, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import BusinessScopedMixin, JSONType, SoftDeleteMixin, TimestampMixin


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class Supplier(Base, BusinessScopedMixin, TimestampMixin, SoftDeleteMixin):
    """A supplier as seen from one business's books.

    Deliberately per-tenant rather than global. The same GSTIN can be a
    reliable supplier to one buyer and a chronic late filer to another —
    because the score here is built from *this* business's matched invoices,
    not from a shared reputation the product has no authority to publish. It
    also keeps one tenant's purchase history from being inferable from
    another's supplier list.
    """

    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("business_id", "gstin", name="uq_suppliers_business_gstin"),
        Index("ix_suppliers_business_created", "business_id", "created_at"),
        Index("ix_suppliers_business_risk", "business_id", "risk_level"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    gstin: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state_code: Mapped[str | None] = mapped_column(String(2), nullable=True)

    # 0-100, higher is safer. None until the first reconciliation run produces
    # evidence — an unrated supplier and a badly rated one warrant very
    # different handling, so they must not share a value.
    compliance_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[RiskLevel] = mapped_column(
        SAEnum(RiskLevel, native_enum=False, length=10),
        default=RiskLevel.UNKNOWN,
        nullable=False,
    )

    total_invoices: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matched_invoices: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mismatched_invoices: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Invoices in our books that never appeared in the supplier's GSTR-1 — the
    # "ghost credit" case, and the reason ITC gets reversed months later.
    missing_invoices: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    late_filings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_filed_period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    last_seen_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Per-period filing observations, kept for the score's audit trail:
    # ``[{"period": "2026-04", "filed_on_time": true, "matched": 12}, ...]``
    filing_history: Mapped[list | None] = mapped_column(JSONType, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Supplier {self.gstin} score={self.compliance_score}>"
