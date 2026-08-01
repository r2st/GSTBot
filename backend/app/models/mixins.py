"""Column types and mixins shared by every model.

Two things live here because getting them wrong is expensive everywhere:

* **Money.** GST is computed to the paisa and reported to the rupee, and a
  float cannot hold ``18%`` of ``₹1,234.56`` exactly. Every monetary column is
  ``Numeric(16, 2)``, which SQLAlchemy hands back as ``Decimal``.
* **Tenancy and soft delete.** The feature doc requires ``business_id`` on
  every business-owned table and soft delete only. Both are mixins so a new
  table gets them by inheriting rather than by remembering.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import ClassVar

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column
from sqlalchemy.types import JSON

# JSONB on Postgres (indexable, typed) and plain JSON on SQLite (tests).
JSONType = JSON().with_variant(JSONB, "postgresql")

# Money: 16 digits with 2 decimals. Comfortably holds a crore-scale invoice
# line without ever rounding through a float.
Money = Numeric(16, 2)

ZERO = Decimal("0.00")


def utcnow() -> datetime:
    """Timezone-aware now, for defaults set in Python rather than by the DB."""
    return datetime.now(UTC)


class TimestampMixin:
    """``created_at`` / ``updated_at``, maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """``deleted_at``, set instead of issuing a DELETE.

    Business data is never hard-deleted: a GST filing can be reopened years
    later during an assessment, and a row that is gone cannot be explained to
    an officer. Queries filter on ``deleted_at.is_(None)``.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        self.deleted_at = utcnow()


class BusinessScopedMixin:
    """A non-null ``business_id`` FK plus an index on it.

    Declared here rather than per-model so that "multi-tenant from day 1" is
    structural: a table that inherits this cannot be written without a tenant,
    and every tenant-filtered query has an index to use.
    """

    # Supplied by the concrete model; declared so the index name below can be
    # built from it without the type checker losing track of the attribute.
    __tablename__: ClassVar[str]

    @declared_attr
    def business_id(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(
            ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
        )

    @declared_attr.directive
    def __table_args__(cls) -> tuple:  # noqa: N805
        return (Index(f"ix_{cls.__tablename__}_business_created", "business_id", "created_at"),)
