"""allow registration without a GSTIN

A user can now sign up to explore the product before adding their GST
registration. ``gstin`` and ``state_code`` become nullable — both are
derived from the GSTIN at registration and have no independent source.

The unique constraint on ``gstin`` is preserved: SQL treats each NULL as
distinct, so multiple businesses without a GSTIN do not conflict.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-01 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('businesses') as batch_op:
        batch_op.alter_column('gstin', existing_type=sa.String(15), nullable=True)
        batch_op.alter_column('state_code', existing_type=sa.String(2), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('businesses') as batch_op:
        batch_op.alter_column('state_code', existing_type=sa.String(2), nullable=False)
        batch_op.alter_column('gstin', existing_type=sa.String(15), nullable=False)
