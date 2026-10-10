from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import InventoryMovement, Material, MaterialLot, Order, Supplier


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


def get_all_lot_balances(db: Session) -> dict[int, Decimal]:
    query = (
        select(
            InventoryMovement.lot_id,
            func.coalesce(
                func.sum(
                    case(
                        (InventoryMovement.movement_type == "receipt", InventoryMovement.quantity_kg),
                        (InventoryMovement.movement_type == "issue", -InventoryMovement.quantity_kg),
                        (InventoryMovement.movement_type == "adjustment", InventoryMovement.quantity_kg),
                        else_=0,
                    )
                ),
                0,
            ).label("balance"),
        )
        .group_by(InventoryMovement.lot_id)
    )
    results = db.execute(query).all()
    return {row[0]: Decimal(str(row[1])) for row in results}


def get_all_material_balances(db: Session) -> dict[int, Decimal]:
    query = (
        select(
            MaterialLot.material_id,
            func.coalesce(
                func.sum(
                    case(
                        (InventoryMovement.movement_type == "receipt", InventoryMovement.quantity_kg),
                        (InventoryMovement.movement_type == "issue", -InventoryMovement.quantity_kg),
                        (InventoryMovement.movement_type == "adjustment", InventoryMovement.quantity_kg),
                        else_=0,
                    )
                ),
                0,
            ).label("balance"),
        )
        .join(MaterialLot, InventoryMovement.lot_id == MaterialLot.id)
        .group_by(MaterialLot.material_id)
    )
    results = db.execute(query).all()
    return {row[0]: Decimal(str(row[1])) for row in results}


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
    if quantity_kg <= 0:
        raise HTTPException(
            status_code=422,
            detail="Receipt quantity must be greater than zero",
        )
    if lot_cost < 0:
        raise HTTPException(
            status_code=422,
            detail="Lot cost cannot be negative",
        )

    # Validate referenced entities
    if db.get(Material, material_id) is None:
        raise HTTPException(status_code=404, detail="Material not found")
    if db.get(Supplier, supplier_id) is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if intended_order_id is not None:
        if db.get(Order, intended_order_id) is None:
            raise HTTPException(status_code=404, detail="Intended order not found")

    clean_lot_code = lot_code.strip()
    if not clean_lot_code:
        raise HTTPException(status_code=422, detail="Lot code cannot be empty")

    existing_lot = db.scalar(
        select(MaterialLot.id).where(MaterialLot.lot_code == clean_lot_code)
    )
    if existing_lot is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Lot code '{clean_lot_code}' already exists",
        )

    try:
        lot = MaterialLot(
            lot_code=clean_lot_code,
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
    except IntegrityError as exc:
        db.rollback()
        error_msg = str(exc).lower()
        if "uq_material_lot_code" in error_msg or "lot_code" in error_msg:
            raise HTTPException(
                status_code=409,
                detail=f"Lot code '{clean_lot_code}' already exists",
            )
        raise HTTPException(
            status_code=409,
            detail="Database integrity constraint violation during receipt creation",
        )
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
    if quantity_kg <= 0:
        raise HTTPException(
            status_code=422,
            detail="Issue quantity must be greater than zero",
        )

    # 1. Validate that the order exists
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    # 2. Acquire row lock on the lot and load its material
    lot = db.scalar(
        select(MaterialLot)
        .options(selectinload(MaterialLot.material))
        .where(MaterialLot.id == lot_id)
        .with_for_update()
    )
    if lot is None:
        raise HTTPException(status_code=404, detail=f"Material lot {lot_id} not found")

    # 3. Check material compatibility with order fabric specification
    material = lot.material
    if (
        material.material_type.strip().lower() != order.fabric_type.strip().lower()
        or material.colour.strip().lower() != order.colour.strip().lower()
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Material lot is incompatible with order fabric specification",
                "lot_id": lot_id,
                "lot_material": f"{material.material_type} ({material.colour})",
                "order_id": order_id,
                "order_requirement": f"{order.fabric_type} ({order.colour})",
            },
        )

    # 4. If reserved/intended for a specific order, prevent issuing to another order
    if lot.intended_order_id is not None and lot.intended_order_id != order_id:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Material lot is reserved for another order",
                "lot_id": lot_id,
                "intended_order_id": lot.intended_order_id,
                "requested_order_id": order_id,
            },
        )

    # 5. Calculate available stock from ledger and reject over-issue
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

    # 6. Record the issue movement
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
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Database integrity constraint violation during yarn issue",
        )
    except Exception:
        db.rollback()
        raise


def adjust_yarn(
    db: Session,
    *,
    lot_id: int,
    quantity_kg: Decimal,
    reason: str,
):
    if quantity_kg == 0:
        raise HTTPException(
            status_code=422,
            detail="Adjustment quantity cannot be zero; use positive for surplus or negative for shrinkage",
        )

    clean_reason = reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=422,
            detail="Adjustment reason cannot be empty",
        )

    # 1. Acquire row lock on the lot
    lot = db.scalar(
        select(MaterialLot)
        .where(MaterialLot.id == lot_id)
        .with_for_update()
    )
    if lot is None:
        raise HTTPException(status_code=404, detail=f"Material lot {lot_id} not found")

    # 2. Check resulting balance (must not become negative)
    current_balance = lot_balance(db, lot_id)
    resulting_balance = current_balance + quantity_kg
    if resulting_balance < 0:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Adjustment would result in negative stock balance",
                "lot_id": lot_id,
                "current_balance_kg": str(current_balance),
                "adjustment_kg": str(quantity_kg),
                "resulting_balance_kg": str(resulting_balance),
            },
        )

    # 3. Create adjustment movement
    movement = InventoryMovement(
        lot_id=lot_id,
        order_id=None,
        movement_type="adjustment",
        quantity_kg=quantity_kg,
        note=f"Adjustment: {clean_reason}",
    )

    try:
        db.add(movement)
        db.commit()
        db.refresh(movement)
        return movement
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Database integrity constraint violation during inventory adjustment",
        )
    except Exception:
        db.rollback()
        raise