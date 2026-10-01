"""Additional GSTIN registrations one login can act for.

A user's own tenant — :attr:`app.models.user.User.business_id` — is unchanged
and stays authoritative: every existing tenant-scoped query still resolves
that way by default, with nothing here in the path. This table is the join
table :class:`~app.models.user.User`'s own docstring already anticipated: a
second, third, ... business the *same person* also owns, linked after the
fact rather than assumed at sign-up — because GST registration, and therefore
a DoAide GST account, happens one GSTIN at a time, and a practice or a business
with several registrations accumulates logins for each before it ever wants
to see them together.

Membership is proven once, at link time, by the target account's own
credentials (see ``POST /businesses/mine/link``) rather than granted through
an invitation flow this product does not have — verifying a password *is*
proving ownership of the account that password unlocks. Nothing here widens
what a membership *means*: :class:`~app.models.mixins.BusinessScopedMixin`
still keys every invoice, supplier and return to exactly one ``business_id``,
and a membership only changes which one business a given request acts as —
one at a time, chosen by the ``X-Business-Id`` header — see
:func:`app.core.deps.get_current_business`.
"""
from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class MembershipRole(str, Enum):
    OWNER = "owner"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"


class BusinessMembership(Base, TimestampMixin, SoftDeleteMixin):
    """One login's access to a business that is not its own tenant."""

    __tablename__ = "business_memberships"
    __table_args__ = (
        # One live membership per (user, business) — but only among the
        # undeleted, the same shape as ``uq_gstr_returns_business_period_type``
        # and for the same reason: unlinking and relinking later must not
        # collide with a tombstone still occupying the key.
        Index(
            "uq_business_memberships_user_business",
            "user_id",
            "business_id",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_business_memberships_business", "business_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MembershipRole] = mapped_column(
        SAEnum(MembershipRole, native_enum=False, length=20),
        default=MembershipRole.VIEWER,
        nullable=False,
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    business: Mapped[Business] = relationship(foreign_keys=[business_id])

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<BusinessMembership user={self.user_id} business={self.business_id}>"
