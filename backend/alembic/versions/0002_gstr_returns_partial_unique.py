"""gstr_returns: make the period/type uniqueness respect soft delete

The portal regenerates a GSTR-2B every time one of a buyer's suppliers files
late, so re-importing a period is a routine operation rather than an error. The
import supersedes the previous one by soft-deleting it, which a plain unique
constraint cannot express: it counts the tombstones and rejects the second
import with an integrity error.

Replaced with a partial unique index over the undeleted rows, which is what
"one live return per period and type" actually means. Supported by both
Postgres and SQLite.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-01 09:20:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEX = 'uq_gstr_returns_business_period_type'
_COLUMNS = ['business_id', 'period', 'return_type']


def upgrade() -> None:
    # batch_alter_table so SQLite, which cannot drop a constraint in place,
    # rebuilds the table instead.
    with op.batch_alter_table('gstr_returns', schema=None) as batch_op:
        batch_op.drop_constraint(_INDEX, type_='unique')

    op.create_index(
        _INDEX,
        'gstr_returns',
        _COLUMNS,
        unique=True,
        sqlite_where=sa.text('deleted_at IS NULL'),
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name='gstr_returns')

    # Going back to a total constraint means the soft-deleted duplicates it
    # forbids have to go first, or the constraint cannot be created.
    op.execute(
        sa.text(
            """
            DELETE FROM gstr_returns
            WHERE deleted_at IS NOT NULL
              AND (business_id, period, return_type) IN (
                  SELECT business_id, period, return_type
                  FROM gstr_returns
                  GROUP BY business_id, period, return_type
                  HAVING COUNT(*) > 1
              )
            """
        )
    )
    with op.batch_alter_table('gstr_returns', schema=None) as batch_op:
        batch_op.create_unique_constraint(_INDEX, _COLUMNS)
