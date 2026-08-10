"""business_memberships: multi-GSTIN access for one login

A user's own tenant (``users.business_id``) stays authoritative and untouched.
This table is purely additive: a login may also be linked to other businesses
it owns, proven at link time by that account's own credentials — see
``POST /businesses/mine/link``. ``app.core.deps.get_current_business`` reads
it only when a caller sends ``X-Business-Id`` for a business other than their
own, so a request that never sends the header behaves exactly as it always
has.

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-10 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEX = 'uq_business_memberships_user_business'
_COLUMNS = ['user_id', 'business_id']


def upgrade() -> None:
    op.create_table(
        'business_memberships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column(
            'role',
            sa.Enum('OWNER', 'ACCOUNTANT', 'VIEWER', name='membershiprole', native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('business_memberships', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_business_memberships_user_id'), ['user_id'], unique=False
        )
        batch_op.create_index(
            'ix_business_memberships_business', ['business_id'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_business_memberships_deleted_at'), ['deleted_at'], unique=False
        )

    op.create_index(
        _INDEX,
        'business_memberships',
        _COLUMNS,
        unique=True,
        sqlite_where=sa.text('deleted_at IS NULL'),
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name='business_memberships')
    op.drop_table('business_memberships')
