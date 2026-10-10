"""add buyer_id to users table

Revision ID: 20261011_add_user_buyer_id
Revises: 20261010_add_auth_users
Create Date: 2026-10-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20261011_add_user_buyer_id'
down_revision: Union[str, Sequence[str], None] = '20261010_add_auth_users'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("buyer_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_users_buyer_id"), "users", ["buyer_id"], unique=False)
    op.create_foreign_key(
        "fk_users_buyer_id",
        "users",
        "buyers",
        ["buyer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Associate default customer demo user to Buyer #1
    op.execute("UPDATE users SET buyer_id = 1 WHERE role = 'customer' AND buyer_id IS NULL")


def downgrade() -> None:
    op.drop_constraint("fk_users_buyer_id", "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_buyer_id"), table_name="users")
    op.drop_column("users", "buyer_id")
