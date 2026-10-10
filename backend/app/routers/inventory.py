from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Material, MaterialLot, Order, Supplier
from app.schemas import (
    InventoryLotOut,
    InventoryMovementOut,
    InventorySummaryOut,
    IssueCreate,
    ReceiptCreate,
)
from app.services.inventory import issue_yarn, lot_balance, receive_yarn

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post("/receipts", response_model=InventoryMovementOut,
             status_code=status.HTTP_201_CREATED)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
):
    if db.get(Material, payload.material_id) is None:
        raise HTTPException(status_code=404, detail="Material not found")
    if db.get(Supplier, payload.supplier_id) is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if payload.intended_order_id is not None:
        if db.get(Order, payload.intended_order_id) is None:
            raise HTTPException(status_code=404, detail="Intended order not found")

    if db.scalar(
        select(MaterialLot.id).where(MaterialLot.lot_code == payload.lot_code)
    ) is not None:
        raise HTTPException(status_code=409, detail="Lot code already exists")

    return receive_yarn(
        db,
        lot_code=payload.lot_code,
        material_id=payload.material_id,
        supplier_id=payload.supplier_id,
        quantity_kg=payload.quantity_kg,
        lot_cost=payload.lot_cost,
        intended_order_id=payload.intended_order_id,
        note=payload.note,
    )


@router.post("/issues", response_model=InventoryMovementOut,
             status_code=status.HTTP_201_CREATED)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
):
    if db.get(Order, payload.order_id) is None:
        raise HTTPException(status_code=404, detail="Order not found")

    return issue_yarn(
        db,
        lot_id=payload.lot_id,
        order_id=payload.order_id,
        quantity_kg=payload.quantity_kg,
        note=payload.note,
    )


@router.get("", response_model=InventorySummaryOut)
def get_inventory(
    low_stock_only: bool = False,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    lots = db.scalars(
        select(MaterialLot)
        .order_by(MaterialLot.id)
        .offset(offset)
        .limit(limit)
    ).all()

    # Low-stock status is based on the combined stock for a material,
    # not on one lot in isolation.
    all_lots = db.scalars(select(MaterialLot)).all()
    balances_by_material: dict[int, Decimal] = {}
    for lot in all_lots:
        balances_by_material[lot.material_id] = (
            balances_by_material.get(lot.material_id, Decimal("0"))
            + lot_balance(db, lot.id)
        )

    result = []
    for lot in lots:
        material = lot.material
        total_available = balances_by_material.get(
            material.id, Decimal("0")
        )
        low_stock = total_available <= Decimal(
            str(material.reorder_threshold_kg)
        )

        if low_stock_only and not low_stock:
            continue

        result.append(
            InventoryLotOut(
                lot_id=lot.id,
                lot_code=lot.lot_code,
                material_id=material.id,
                material_type=material.material_type,
                colour=material.colour,
                specification=material.specification,
                supplier_id=lot.supplier_id,
                available_kg=lot_balance(db, lot.id),
                reorder_threshold_kg=material.reorder_threshold_kg,
                low_stock=low_stock,
            )
        )

    low_material_ids = {
        material_id
        for material_id, available in balances_by_material.items()
        if available <= Decimal(
            str(db.get(Material, material_id).reorder_threshold_kg)
        )
    }

    return InventorySummaryOut(
        total_lots=len(all_lots),
        low_stock_materials=len(low_material_ids),
        lots=result,
    )