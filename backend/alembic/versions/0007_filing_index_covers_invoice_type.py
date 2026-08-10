"""widen the period index to the direction every reader of it constrains

``ix_invoices_business_period`` was created for one thing — "what is in this
month" — and nothing asks that. Five callers ask "what is in this month, in
this direction", because sales and purchases are different returns: GSTR-1 is
built from one, the ITC position and the 2B match from the other. Both live in
this table, so a period holds roughly twice the rows any one of them wants.

    services/filing.py         _invoices, _unreadable_invoices
    services/reconciliation.py _period_invoices
    services/itc.py            output tax, and the Rule 42 exempt ratio

With ``invoice_type`` outside the index it could only ever be a filter, and a
filter is applied *after* the row is fetched. So every one of those queries
read both directions off the heap and discarded half. Measured on Postgres 16,
one tenant, 24 months, 120 invoices per direction per month:

    before   Bitmap Index Scan -> 240 rows, 130 Rows Removed by Filter
    after    Bitmap Index Scan -> 120 rows,  10 Rows Removed by Filter

The 10 that remain are the unreadable statuses, which belong in the filter:
they are a small and shrinking fraction, and putting ``status`` in the key
would cost an index entry rewrite on every parse — the one column on this table
that changes constantly. ``invoice_type`` is written once and never updated.

Replacing the index rather than adding a fourth: ``(business_id, period)`` is a
prefix of ``(business_id, period, invoice_type)``, so the grouped scan behind
the dashboard — ``invoice_service._grouped``, which constrains the period and
no direction — searches the new index exactly as it searched the old one. A
second index would be dead weight on every write to the table.

Not partial on ``deleted_at IS NULL``. The index it replaces was not, the
callers do filter it, and the tombstones here are a rounding error next to the
live rows — unlike 0002 and 0004, where the predicate is what makes a *unique*
constraint mean "one live invoice" instead of "one row ever".

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-10 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index('ix_invoices_business_period', table_name='invoices')
    op.create_index(
        'ix_invoices_business_period',
        'invoices',
        ['business_id', 'period', 'invoice_type'],
    )


def downgrade() -> None:
    op.drop_index('ix_invoices_business_period', table_name='invoices')
    op.create_index(
        'ix_invoices_business_period',
        'invoices',
        ['business_id', 'period'],
    )
