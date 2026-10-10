"""add_dispatch_confirmation_constraint

Revision ID: cc44d72126a7
Revises: 93bcbe93cd2a
Create Date: 2026-10-10 14:51:17.971659

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cc44d72126a7'
down_revision: Union[str, Sequence[str], None] = '93bcbe93cd2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: ensure confirmed dispatch requires confirmed_at timestamp."""
    op.create_check_constraint(
        "ck_dispatch_confirmed_at",
        "dispatches",
        "(confirmed = FALSE) OR (confirmed = TRUE AND confirmed_at IS NOT NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_dispatch_confirmed_at", "dispatches", type_="check")
