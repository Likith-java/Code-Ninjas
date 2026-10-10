"""harden_inventory_and_order_constraints

Revision ID: 93bcbe93cd2a
Revises: 05be858920c9
Create Date: 2026-10-10 14:03:52.332312

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93bcbe93cd2a'
down_revision: Union[str, Sequence[str], None] = '05be858920c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: harden inventory movement and order deadline constraints."""
    # 1. Update inventory_movements check constraints
    op.drop_constraint('ck_inventory_quantity_nonzero', 'inventory_movements', type_='check')
    op.create_check_constraint(
        'ck_inventory_movement_quantity_valid',
        'inventory_movements',
        "(movement_type IN ('receipt', 'issue') AND quantity_kg > 0) OR (movement_type = 'adjustment' AND quantity_kg <> 0)"
    )
    op.create_check_constraint(
        'ck_inventory_issue_requires_order',
        'inventory_movements',
        "movement_type <> 'issue' OR order_id IS NOT NULL"
    )

    # 2. Add orders deadline constraint
    op.create_check_constraint(
        'ck_order_deadline_after_order_date',
        'orders',
        "deadline > order_date"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_order_deadline_after_order_date', 'orders', type_='check')
    op.drop_constraint('ck_inventory_issue_requires_order', 'inventory_movements', type_='check')
    op.drop_constraint('ck_inventory_movement_quantity_valid', 'inventory_movements', type_='check')
    op.create_check_constraint(
        'ck_inventory_quantity_nonzero',
        'inventory_movements',
        'quantity_kg <> 0'
    )
