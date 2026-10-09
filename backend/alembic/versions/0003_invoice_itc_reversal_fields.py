"""invoices: payment date and capital-goods flag, for the ITC reversal rules

Two reversal rules need a fact about a purchase that matching cannot supply.

Rule 37 reverses the credit on an invoice left unpaid 180 days after its date,
so whether the supplier has been paid is a per-invoice fact, not something that
can be inferred from a payments ledger the product does not hold. ``paid_at``
is nullable and NULL means "unpaid as far as GSTIndia knows" — which is the
honest default for a business that has not told us otherwise, and the one that
errs toward flagging exposure rather than hiding it.

Rule 43 spreads the credit on capital goods over 60 months instead of granting
it in the month of purchase, so capital goods cannot share a pool with inputs.
``is_capital_good`` defaults to False: the overwhelming majority of purchase
invoices are inputs, and a wrong True would defer credit a business is entitled
to claim now.

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-01 11:15:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('paid_at', sa.Date(), nullable=True))
        # Added with a server default so the NOT NULL can be applied to rows
        # that already exist, then dropped: the application supplies the
        # default from the model, and leaving it in the schema would let an
        # insert that forgets the column silently succeed.
        batch_op.add_column(
            sa.Column(
                'is_capital_good',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )

    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.alter_column('is_capital_good', server_default=None)

    # Rule 37 asks one question of the whole purchase register — "what is
    # unpaid and older than 180 days" — and asks it on every ITC screen.
    op.create_index(
        'ix_invoices_business_paid', 'invoices', ['business_id', 'paid_at'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_invoices_business_paid', table_name='invoices')

    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_column('is_capital_good')
        batch_op.drop_column('paid_at')
