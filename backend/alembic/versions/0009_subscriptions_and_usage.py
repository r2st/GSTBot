"""subscriptions and usage tracking

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-03 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('tier', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('razorpay_subscription_id', sa.String(length=64), nullable=True, unique=True),
        sa.Column('razorpay_customer_id', sa.String(length=64), nullable=True),
        sa.Column('razorpay_plan_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_subscriptions_business_id', 'subscriptions', ['business_id'], unique=True)

    op.create_table(
        'usage_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('period', sa.String(length=7), nullable=False),
        sa.Column('endpoint', sa.String(length=64), nullable=False),
        sa.Column('call_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('business_id', 'period', 'endpoint', name='uq_usage_business_period_endpoint'),
    )
    op.create_index('ix_usage_records_business_id', 'usage_records', ['business_id'])
    op.create_index('ix_usage_business_period', 'usage_records', ['business_id', 'period'])


def downgrade() -> None:
    op.drop_table('usage_records')
    op.drop_table('subscriptions')
