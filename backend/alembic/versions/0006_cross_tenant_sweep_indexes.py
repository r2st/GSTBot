"""index the two queries that read every tenant at once

Both periodic sweeps ask a question no screen asks: not "what does this business
have" but "what does anyone have". ``reap_stalled_parses`` looks for invoices
stranded in ``processing`` past the stall window; ``send_pending_alerts`` looks
for the tenants with anything undelivered. Neither constrains ``business_id``.

Every index on both tables leads with ``business_id``, because every other
caller is a tenant-scoped screen. A leading column the query does not constrain
cannot be searched, so neither sweep had an index it could use and both read
their whole live table — ``invoices`` hourly, and it is the table that grows.

Nothing reported it. The reaper commits only when it found something, so on a
healthy deployment the scan is an hourly cost with no output at all, and the
beat entry describing it as "one indexed query" was describing an index that
was never created.

Both are partial on ``deleted_at IS NULL``, matching the sweeps' own predicate
and the shape used in 0002 and 0004: a tombstone has no parse left to strand
and no digest left to send. Purely additive — no column or constraint changes,
so no ``batch_alter_table`` and nothing for SQLite to rebuild.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-10 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LIVE = 'deleted_at IS NULL'


def upgrade() -> None:
    # (status, updated_at): equality on the status, range on the clock, which is
    # exactly the order the reaper's predicate can use.
    op.create_index(
        'ix_invoices_status_updated',
        'invoices',
        ['status', 'updated_at'],
        sqlite_where=sa.text(_LIVE),
        postgresql_where=sa.text(_LIVE),
    )
    # (status, business_id) in that order: ``business_id`` trails so the
    # digest's DISTINCT over it can be answered from the index rather than by
    # visiting the rows.
    op.create_index(
        'ix_alerts_status_business',
        'alerts',
        ['status', 'business_id'],
        sqlite_where=sa.text(_LIVE),
        postgresql_where=sa.text(_LIVE),
    )


def downgrade() -> None:
    op.drop_index('ix_alerts_status_business', table_name='alerts')
    op.drop_index('ix_invoices_status_updated', table_name='invoices')
