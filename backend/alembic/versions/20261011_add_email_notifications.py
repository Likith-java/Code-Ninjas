"""add email_notifications table

Revision ID: 20261011_add_email_notifications
Revises: 20261011_add_lot_qr_token
Create Date: 2026-10-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20261011_add_email_notifications'
down_revision: Union[str, Sequence[str], None] = '20261011_add_lot_qr_token'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_notifications",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_type", sa.String(length=64), nullable=False),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("recipient_name", sa.String(length=255), nullable=True),
        sa.Column("recipient_role", sa.String(length=32), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("idempotency_key", name="uq_email_notifications_idempotency_key"),
        sa.UniqueConstraint("order_id", "notification_type", "recipient_email", name="uq_email_notifications_order_event_recipient"),
    )
    op.create_index(op.f("ix_email_notifications_order_id"), "email_notifications", ["order_id"], unique=False)
    op.create_index(op.f("ix_email_notifications_notification_type"), "email_notifications", ["notification_type"], unique=False)
    op.create_index(op.f("ix_email_notifications_recipient_email"), "email_notifications", ["recipient_email"], unique=False)
    op.create_index(op.f("ix_email_notifications_idempotency_key"), "email_notifications", ["idempotency_key"], unique=True)
    op.create_index(op.f("ix_email_notifications_status"), "email_notifications", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_notifications_status"), table_name="email_notifications")
    op.drop_index(op.f("ix_email_notifications_idempotency_key"), table_name="email_notifications")
    op.drop_index(op.f("ix_email_notifications_recipient_email"), table_name="email_notifications")
    op.drop_index(op.f("ix_email_notifications_notification_type"), table_name="email_notifications")
    op.drop_index(op.f("ix_email_notifications_order_id"), table_name="email_notifications")
    op.drop_table("email_notifications")
