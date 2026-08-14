"""The tenant: one GST registration."""
from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import String, and_
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.elements import ColumnElement

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

    # Two columns say a business is over, and they say it for different
    # reasons: ``deleted_at`` is the tenant closing their account,
    # ``is_active`` is us suspending it. Neither is usable, and the product
    # has to agree with itself about that — three places asked the question
    # separately and gave three answers, which is how a login could be told
    # it had linked a business that would never appear in its own list, and
    # be offered one in the switcher that refused every request after the
    # switch. Asked once here, in both the shapes callers need.

    @property
    def is_reachable(self) -> bool:
        """Can a request act for this business at all?"""
        return self.deleted_at is None and self.is_active

    @classmethod
    def reachable(cls) -> ColumnElement[bool]:
        """The same question as a ``WHERE`` clause.

        ``is_active.is_(True)`` rather than a bare ``is_active``: the column is
        ``NOT NULL`` today, so the two are equivalent — but only the explicit
        form stays correct if it ever isn't, and a truthiness test on a
        three-valued column is the kind of thing that reads as fine forever.
        """
        return and_(cls.deleted_at.is_(None), cls.is_active.is_(True))

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Business {self.gstin} {self.legal_name!r}>"
