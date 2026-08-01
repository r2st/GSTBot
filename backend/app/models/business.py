"""The tenant: one GST registration."""
from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.invoice import Invoice
    from app.models.user import User


class BusinessPlan(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    CA_BUNDLE = "ca_bundle"


class Business(Base, TimestampMixin, SoftDeleteMixin):
    """A GST-registered business — the tenant boundary for all other tables.

    The tenant is the *registration*, not the company: a company registered in
    three states holds three GSTINs, files three sets of returns, and
    reconciles each separately. Modelling it any other way would mean mixing
    three ledgers that the GST portal keeps apart.
    """

    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(primary_key=True)
    gstin: Mapped[str] = mapped_column(String(15), unique=True, nullable=False, index=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Derived from the GSTIN's first two characters at registration, and stored
    # because it decides the IGST-vs-CGST/SGST split on every invoice.
    state_code: Mapped[str] = mapped_column(String(2), nullable=False)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    plan: Mapped[BusinessPlan] = mapped_column(
        SAEnum(BusinessPlan, native_enum=False, length=20),
        default=BusinessPlan.FREE,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    users: Mapped[list[User]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    invoices: Mapped[list[Invoice]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Business {self.gstin} {self.legal_name!r}>"
