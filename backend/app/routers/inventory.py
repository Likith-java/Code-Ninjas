from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user_optional
from app.database import get_db
from app.models import InventoryMovement, Material, MaterialLot, User
from app.schemas import (
    AdjustmentCreate,
    InventoryLotOut,
    InventoryMovementOut,
    InventorySummaryOut,
    IssueCreate,
    MaterialLotDetailOut,
    ReceiptCreate,
)
from app.services.inventory import (
    adjust_yarn,
    get_all_lot_balances,
    get_all_material_balances,
    issue_yarn,
    receive_yarn,
)
from app.services.inventory_qr import (
    build_lot_detail_dto,
    generate_lot_qr_code,
    resolve_lot_by_identifier,
)

class ScanRequest(BaseModel):
    query: str = Field(..., description="Scanned QR code payload, token, URL or lot code")

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post(
    "/receipts",
    response_model=InventoryMovementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record yarn receipt",
    description="Atomically creates a new material lot and records its initial receipt movement in the inventory ledger.",
)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
):
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


@router.post(
    "/issues",
    response_model=InventoryMovementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Issue yarn to order",
    description="Issues yarn from a specific lot to an order. Validates material compatibility, reservation, and ledger stock.",
)
def create_issue(
    payload: IssueCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user and current_user.role == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer users are not authorized to issue warehouse materials.",
        )
    return issue_yarn(
        db,
        lot_id=payload.lot_id,
        order_id=payload.order_id,
        quantity_kg=payload.quantity_kg,
        note=payload.note,
    )


@router.post(
    "/adjustments",
    response_model=InventoryMovementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record inventory adjustment",
    description=(
        "Records an explicit stock adjustment with reason. "
        "Sign convention: positive quantity (>0) represents surplus/gain; "
        "negative quantity (<0) represents shrinkage, damage, or deficit. "
        "Rejects adjustments that would cause negative stock balance."
    ),
)
def create_adjustment(
    payload: AdjustmentCreate,
    db: Session = Depends(get_db),
):
    return adjust_yarn(
        db,
        lot_id=payload.lot_id,
        quantity_kg=payload.quantity_kg,
        reason=payload.reason,
    )


@router.get(
    "/movements",
    response_model=list[InventoryMovementOut],
    summary="List inventory movement history",
    description="Query historical ledger movements with optional filters by material, lot, order, type, and date range.",
)
def list_movements(
    material_id: int | None = Query(default=None, gt=0, description="Filter by material ID"),
    lot_id: int | None = Query(default=None, gt=0, description="Filter by lot ID"),
    order_id: int | None = Query(default=None, gt=0, description="Filter by order ID"),
    movement_type: Literal["receipt", "issue", "adjustment"] | None = Query(default=None, description="Filter by movement type"),
    start_date: datetime | None = Query(default=None, description="Start date (inclusive)"),
    end_date: datetime | None = Query(default=None, description="End date (inclusive)"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    query = select(InventoryMovement).join(MaterialLot, InventoryMovement.lot_id == MaterialLot.id)

    if material_id is not None:
        query = query.where(MaterialLot.material_id == material_id)
    if lot_id is not None:
        query = query.where(InventoryMovement.lot_id == lot_id)
    if order_id is not None:
        query = query.where(InventoryMovement.order_id == order_id)
    if movement_type is not None:
        query = query.where(InventoryMovement.movement_type == movement_type)
    if start_date is not None:
        query = query.where(InventoryMovement.movement_date >= start_date)
    if end_date is not None:
        query = query.where(InventoryMovement.movement_date <= end_date)

    return db.scalars(
        query.order_by(InventoryMovement.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()


@router.get(
    "",
    response_model=InventorySummaryOut,
    summary="Get inventory summary",
    description="Calculates current stock from movement ledger grouped by material and lot. Identifies materials below reorder threshold.",
)
def get_inventory(
    low_stock_only: bool = Query(default=False, description="Filter to show only lots of low-stock materials"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=100, ge=1, le=500, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    # 1. Aggregate balances from ledger without N+1 loops
    lot_balances = get_all_lot_balances(db)
    material_balances = get_all_material_balances(db)

    # 2. Check all materials (properly accounts for materials with 0 lots)
    all_materials = db.scalars(select(Material)).all()
    low_stock_material_ids = {
        m.id
        for m in all_materials
        if material_balances.get(m.id, Decimal("0")) <= Decimal(str(m.reorder_threshold_kg))
    }

    # 3. Query paginated lots
    lots_query = (
        select(MaterialLot)
        .options(selectinload(MaterialLot.material))
        .order_by(MaterialLot.id)
    )
    if low_stock_only:
        lots_query = lots_query.where(MaterialLot.material_id.in_(low_stock_material_ids))

    lots = db.scalars(lots_query.offset(offset).limit(limit)).all()
    total_lots_count = db.scalar(select(func.count(MaterialLot.id))) or 0

    result = [
        InventoryLotOut(
            lot_id=lot.id,
            lot_code=lot.lot_code,
            qr_token=lot.qr_token,
            material_id=lot.material.id,
            material_type=lot.material.material_type,
            colour=lot.material.colour,
            specification=lot.material.specification,
            supplier_id=lot.supplier_id,
            available_kg=lot_balances.get(lot.id, Decimal("0")),
            reorder_threshold_kg=lot.material.reorder_threshold_kg,
            low_stock=lot.material.id in low_stock_material_ids,
        )
        for lot in lots
    ]

    return InventorySummaryOut(
        total_lots=total_lots_count,
        low_stock_materials=len(low_stock_material_ids),
        lots=result,
    )


@router.get(
    "/lots/{lot_id}/qr",
    summary="Generate QR code for yarn lot",
    description="Returns a valid PNG image referencing the specific yarn lot for printing and mobile scanning.",
)
def get_lot_qr(
    lot_id: int,
    download: bool = Query(default=False, description="Prompt browser download"),
    db: Session = Depends(get_db),
):
    lot = db.scalar(
        select(MaterialLot)
        .options(selectinload(MaterialLot.material))
        .where(MaterialLot.id == lot_id)
    )
    if not lot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Material lot with ID {lot_id} not found",
        )

    png_bytes = generate_lot_qr_code(lot)
    headers = {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "image/png",
    }
    if download:
        headers["Content-Disposition"] = f'attachment; filename="lot-{lot.lot_code}-qr.png"'
    return Response(content=png_bytes, media_type="image/png", headers=headers)


@router.get(
    "/lots/{lot_id}",
    response_model=MaterialLotDetailOut,
    summary="Get detailed yarn lot tracking info",
    description="Fetches live lot state, available balance from movement ledger, supplier details, and recent movements.",
)
def get_lot_detail(
    lot_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user and current_user.role == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer users are not authorized to inspect raw warehouse inventory.",
        )

    lot = resolve_lot_by_identifier(db, lot_id)
    return build_lot_detail_dto(db, lot)


@router.get(
    "/lots/scan/{scan_query:path}",
    response_model=MaterialLotDetailOut,
    summary="Resolve scanned QR payload",
    description="Resolves a scanned QR string (full URL, relative path, qr_token, or lot code) to live lot state.",
)
def scan_lot_get(
    scan_query: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user and current_user.role == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer users are not authorized to inspect raw warehouse inventory.",
        )

    lot = resolve_lot_by_identifier(db, scan_query)
    return build_lot_detail_dto(db, lot)


@router.post(
    "/lots/scan",
    response_model=MaterialLotDetailOut,
    summary="Resolve scanned QR code via POST payload",
)
def scan_lot_post(
    payload: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user and current_user.role == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer users are not authorized to inspect raw warehouse inventory.",
        )

    lot = resolve_lot_by_identifier(db, payload.query)
    return build_lot_detail_dto(db, lot)