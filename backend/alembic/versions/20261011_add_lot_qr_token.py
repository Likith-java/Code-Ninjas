"""add qr_token to material_lots

Revision ID: 20261011_add_lot_qr_token
Revises: 20261011_add_user_buyer_id
Create Date: 2026-10-11

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20261011_add_lot_qr_token'
down_revision: Union[str, Sequence[str], None] = '20261011_add_user_buyer_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("material_lots", sa.Column("qr_token", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_material_lots_qr_token"), "material_lots", ["qr_token"], unique=True)

    # Safely backfill existing lots with unique non-guessable tokens
    conn = op.get_bind()
    lots = conn.execute(sa.text("SELECT id FROM material_lots WHERE qr_token IS NULL")).fetchall()
    for row in lots:
        token = uuid.uuid4().hex
        conn.execute(
            sa.text("UPDATE material_lots SET qr_token = :token WHERE id = :lot_id"),
            {"token": token, "lot_id": row[0]},
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_material_lots_qr_token"), table_name="material_lots")
    op.drop_column("material_lots", "qr_token")
