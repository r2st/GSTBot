"""invoices: make the natural-key uniqueness respect soft delete

Deleting an invoice is soft — the row and the stored file both stay, so that a
deletion can be audited and the original document is still there to compare
against. A plain unique constraint on the natural key counts those tombstones,
which meant deleting an invoice did not free its number: the key stayed
occupied by a row the API answers 404 for.

That closed off the ordinary way to fix a badly-read invoice. Delete it,
re-scan the paper, upload again — and because a re-scan is different bytes, the
file-hash dedup does not fire and the document is read as far as its number
before the insert fails. The upload came back ``failed`` saying the invoice was
already on file, and there was no way back short of SQL, because the delete
that was meant to undo it had already happened.

Replaced with a partial unique index over the undeleted rows, which is what
"one invoice on file" actually means and what ``find_duplicate`` has always
queried. Same shape as ``uq_gstr_returns_business_period_type`` in 0002, and
for the same reason. Supported by both Postgres and SQLite.

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-03 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEX = 'uq_invoices_business_type_party_number'
_COLUMNS = ['business_id', 'invoice_type', 'counterparty_gstin', 'invoice_number']


def upgrade() -> None:
    # batch_alter_table so SQLite, which cannot drop a constraint in place,
    # rebuilds the table instead.
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_constraint(_INDEX, type_='unique')

    op.create_index(
        _INDEX,
        'invoices',
        _COLUMNS,
        unique=True,
        sqlite_where=sa.text('deleted_at IS NULL'),
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name='invoices')

    # Going back to a total constraint means the soft-deleted duplicates it
    # forbids have to go first, or the constraint cannot be created. Only the
    # tombstones are dropped: a live invoice is never deleted to make room for
    # a constraint, and the partial index guarantees there is at most one of
    # them per key.
    op.execute(
        sa.text(
            """
            DELETE FROM invoices
            WHERE deleted_at IS NOT NULL
              AND (business_id, invoice_type, counterparty_gstin, invoice_number) IN (
                  SELECT business_id, invoice_type, counterparty_gstin, invoice_number
                  FROM invoices
                  GROUP BY business_id, invoice_type, counterparty_gstin, invoice_number
                  HAVING COUNT(*) > 1
              )
            """
        )
    )
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.create_unique_constraint(_INDEX, _COLUMNS)
