from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import InventoryMovement, MaterialLot


def lot_balance(db: Session, lot_id: int) -> Decimal:
    balance_query = select(
        func.coalesce(
            func.sum(
                case(
                    (InventoryMovement.movement_type == "receipt",
                     InventoryMovement.quantity_kg),
                    (InventoryMovement.movement_type == "issue",
                     -InventoryMovement.quantity_kg),
                    (InventoryMovement.movement_type == "adjustment",
                     InventoryMovement.quantity_kg),
                    else_=0,
                )
            ),
            0,
        )
    ).where(InventoryMovement.lot_id == lot_id)

    return Decimal(str(db.scalar(balance_query) or 0))


def receive_yarn(
    db: Session,
    *,
    lot_code: str,
    material_id: int,
    supplier_id: int,
    quantity_kg: Decimal,
    lot_cost: Decimal,
    intended_order_id: int | None = None,
    note: str | None = None,
):
    # The initial receipt and ledger entry are committed together.
    try:
        lot = MaterialLot(
            lot_code=lot_code,
            material_id=material_id,
            supplier_id=supplier_id,
            intended_order_id=intended_order_id,
            initial_received_kg=quantity_kg,
            lot_cost=lot_cost,
        )
        db.add(lot)
        db.flush()

        movement = InventoryMovement(
            lot_id=lot.id,
            movement_type="receipt",
            quantity_kg=quantity_kg,
            note=note,
        )
        db.add(movement)
        db.commit()
        db.refresh(movement)
        return movement
    except Exception:
        db.rollback()
        raise


def issue_yarn(
    db: Session,
    *,
    lot_id: int,
    order_id: int,
    quantity_kg: Decimal,
    note: str | None = None,
):
    # PostgreSQL row lock serializes issues against the same lot.
    lot = db.scalar(
        select(MaterialLot)
        .where(MaterialLot.id == lot_id)
        .with_for_update()
    )

    if lot is None:
        raise HTTPException(status_code=404, detail="Material lot not found")

    available = lot_balance(db, lot_id)

    if quantity_kg > available:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Insufficient yarn in this lot",
                "lot_id": lot_id,
                "available_kg": str(available),
                "requested_kg": str(quantity_kg),
            },
        )

    movement = InventoryMovement(
        lot_id=lot_id,
        order_id=order_id,
        movement_type="issue",
        quantity_kg=quantity_kg,
        note=note,
    )

    try:
        db.add(movement)
        db.commit()
        db.refresh(movement)
        return movement
    except Exception:
        db.rollback()
        raise