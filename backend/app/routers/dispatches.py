from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Dispatch,
    DispatchItem,
    FabricRoll,
    Order,
)
from app.schemas import (
    DispatchCreate,
    DispatchOut,
)
from app.services.dispatch import (
    build_dispatch_out,
    ensure_utc,
    utc_now,
)

router = APIRouter(prefix="/dispatches", tags=["Finished Goods Dispatches"])


@router.post(
    "",
    response_model=DispatchOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a finished-goods dispatch",
)
def create_dispatch(
    payload: DispatchCreate,
    db: Session = Depends(get_db),
):
    if not payload.items:
        raise HTTPException(
            status_code=422,
            detail="Dispatch must contain at least one fabric roll item",
        )

    # Prevent duplicate roll allocation in the same dispatch request
    roll_ids = [item.roll_id for item in payload.items]
    if len(roll_ids) != len(set(roll_ids)):
        raise HTTPException(
            status_code=409,
            detail="Duplicate fabric roll ID specified in dispatch line items",
        )

    # 1. Validate order existence
    order = db.scalar(
        select(Order).where(Order.id == payload.order_id).with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # 2. Validate unique invoice number
    existing_invoice = db.scalar(
        select(Dispatch.id)
        .where(Dispatch.invoice_number == payload.invoice_number)
        .limit(1)
    )
    if existing_invoice is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Invoice number '{payload.invoice_number}' already exists",
        )

    # 3. Lock and validate each fabric roll
    rolls = db.scalars(
        select(FabricRoll)
        .where(FabricRoll.id.in_(roll_ids))
        .with_for_update()
    ).all()
    rolls_by_id = {r.id: r for r in rolls}

    total_dispatch_metres = Decimal("0")

    for item in payload.items:
        roll = rolls_by_id.get(item.roll_id)
        if roll is None:
            raise HTTPException(
                status_code=404,
                detail=f"Fabric roll {item.roll_id} not found",
            )

        # Validate roll belongs to the same order
        if roll.order_id != payload.order_id:
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' belongs to order {roll.order_id}, not order {payload.order_id}",
            )

        # Validate quality inspection status
        if roll.status == "awaiting_inspection":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' has not been inspected (status: awaiting_inspection)",
            )
        if roll.status == "rework":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' is currently in rework and cannot be dispatched",
            )
        if roll.status == "rejected":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' was rejected during inspection and cannot be dispatched",
            )
        if roll.status == "dispatched":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' has already been fully dispatched",
            )
        if roll.status != "passed":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' is not eligible for dispatch (status: {roll.status})",
            )

        # Check remaining undispatched quantity on this roll
        # Count all existing dispatch allocations (both active and confirmed)
        already_allocated = db.scalar(
            select(func.coalesce(func.sum(DispatchItem.metres), 0))
            .where(DispatchItem.roll_id == roll.id)
        ) or Decimal("0")

        remaining_roll_metres = Decimal(str(roll.metres)) - Decimal(str(already_allocated))
        requested_metres = Decimal(str(item.metres))

        if requested_metres > remaining_roll_metres:
            raise HTTPException(
                status_code=409,
                detail=f"Requested quantity {requested_metres}m exceeds remaining available metres on roll '{roll.roll_code}' (available: {remaining_roll_metres}m)",
            )

        total_dispatch_metres += requested_metres

    # 4. Check remaining undispatched quantity on the order
    order_already_allocated = db.scalar(
        select(func.coalesce(func.sum(DispatchItem.metres), 0))
        .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
        .where(Dispatch.order_id == order.id)
    ) or Decimal("0")

    remaining_order_metres = Decimal(str(order.quantity_metres)) - Decimal(str(order_already_allocated))
    if total_dispatch_metres > remaining_order_metres:
        raise HTTPException(
            status_code=409,
            detail=f"Dispatch quantity {total_dispatch_metres}m exceeds remaining order quantity (order: {order.quantity_metres}m, already allocated: {order_already_allocated}m, available: {remaining_order_metres}m)",
        )

    # 5. Compute server-side totals and reconcile
    rate = Decimal(str(order.agreed_rate))
    computed_invoice_total = Decimal("0")
    for item in payload.items:
        m = Decimal(str(item.metres))
        lt = (m * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        computed_invoice_total += lt

    if payload.expected_invoice_total is not None:
        expected = Decimal(str(payload.expected_invoice_total)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if expected != computed_invoice_total:
            raise HTTPException(
                status_code=422,
                detail=f"Invoice total reconciliation failed: client expected {expected}, but server calculated {computed_invoice_total}",
            )

    # 6. Create Dispatch and DispatchItem records
    dispatch = Dispatch(
        order_id=payload.order_id,
        dispatch_date=ensure_utc(payload.dispatch_date),
        vehicle=payload.vehicle,
        invoice_number=payload.invoice_number,
        confirmed=False,
    )

    try:
        db.add(dispatch)
        db.flush()

        for item in payload.items:
            db.add(
                DispatchItem(
                    dispatch_id=dispatch.id,
                    roll_id=item.roll_id,
                    metres=item.metres,
                )
            )

        db.commit()
        db.refresh(dispatch)
        return build_dispatch_out(db, dispatch)
    except Exception:
        db.rollback()
        raise


@router.post(
    "/{dispatch_id}/confirm",
    response_model=DispatchOut,
    summary="Confirm a finished-goods dispatch (idempotent)",
)
def confirm_dispatch(
    dispatch_id: int,
    db: Session = Depends(get_db),
):
    # Lock dispatch record to serialize concurrent confirmations
    dispatch = db.scalar(
        select(Dispatch)
        .options(selectinload(Dispatch.items).selectinload(DispatchItem.roll))
        .where(Dispatch.id == dispatch_id)
        .with_for_update()
    )
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Dispatch not found")

    # Reject duplicate confirmation
    if dispatch.confirmed:
        raise HTTPException(
            status_code=409,
            detail=f"Dispatch {dispatch_id} has already been confirmed",
        )

    # Lock order
    order = db.scalar(
        select(Order).where(Order.id == dispatch.order_id).with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # Lock all rolls referenced in dispatch
    roll_ids = [it.roll_id for it in dispatch.items]
    rolls = db.scalars(
        select(FabricRoll).where(FabricRoll.id.in_(roll_ids)).with_for_update()
    ).all()
    rolls_by_id = {r.id: r for r in rolls}

    # Revalidate roll quality status and remaining quantities
    for it in dispatch.items:
        roll = rolls_by_id.get(it.roll_id)
        if roll is None:
            raise HTTPException(
                status_code=404, detail=f"Fabric roll {it.roll_id} not found"
            )

        if roll.status != "passed":
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' cannot be confirmed for dispatch because its status is '{roll.status}' (must be 'passed')",
            )

        # Check total confirmed metres on this roll from other confirmed dispatches
        other_confirmed_roll_metres = db.scalar(
            select(func.coalesce(func.sum(DispatchItem.metres), 0))
            .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
            .where(
                DispatchItem.roll_id == roll.id,
                Dispatch.confirmed.is_(True),
                Dispatch.id != dispatch.id,
            )
        ) or Decimal("0")

        total_roll_confirmed = Decimal(str(other_confirmed_roll_metres)) + Decimal(str(it.metres))
        if total_roll_confirmed > Decimal(str(roll.metres)):
            raise HTTPException(
                status_code=409,
                detail=f"Roll '{roll.roll_code}' has insufficient remaining quantity to confirm dispatch",
            )

    # Revalidate order total confirmed quantity
    other_confirmed_order_metres = db.scalar(
        select(func.coalesce(func.sum(DispatchItem.metres), 0))
        .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
        .where(
            Dispatch.order_id == order.id,
            Dispatch.confirmed.is_(True),
            Dispatch.id != dispatch.id,
        )
    ) or Decimal("0")

    dispatch_total_metres = sum(Decimal(str(it.metres)) for it in dispatch.items)
    if Decimal(str(other_confirmed_order_metres)) + dispatch_total_metres > Decimal(str(order.quantity_metres)):
        raise HTTPException(
            status_code=409,
            detail="Confirming this dispatch would exceed the total order quantity",
        )

    try:
        # Update rolls status: if a roll is fully dispatched, mark 'dispatched'
        for it in dispatch.items:
            roll = rolls_by_id[it.roll_id]
            other_confirmed_roll_metres = db.scalar(
                select(func.coalesce(func.sum(DispatchItem.metres), 0))
                .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
                .where(
                    DispatchItem.roll_id == roll.id,
                    Dispatch.confirmed.is_(True),
                    Dispatch.id != dispatch.id,
                )
            ) or Decimal("0")
            total_confirmed = Decimal(str(other_confirmed_roll_metres)) + Decimal(str(it.metres))
            if total_confirmed >= Decimal(str(roll.metres)):
                roll.status = "dispatched"

        # Update dispatch confirmation
        dispatch.confirmed = True
        dispatch.confirmed_at = utc_now()

        db.commit()
        db.refresh(dispatch)
        return build_dispatch_out(db, dispatch)
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[DispatchOut],
    summary="List finished-goods dispatches",
)
def list_dispatches(
    order_id: int | None = Query(None, description="Filter by order ID"),
    confirmed: bool | None = Query(None, description="Filter by confirmation state"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
):
    query = (
        select(Dispatch)
        .options(
            selectinload(Dispatch.items).selectinload(DispatchItem.roll),
            selectinload(Dispatch.order),
        )
    )
    if order_id is not None:
        query = query.where(Dispatch.order_id == order_id)
    if confirmed is not None:
        query = query.where(Dispatch.confirmed == confirmed)

    dispatches = db.scalars(query.order_by(Dispatch.id.desc()).offset(skip).limit(limit)).all()
    return [build_dispatch_out(db, d) for d in dispatches]


@router.get(
    "/{dispatch_id}",
    response_model=DispatchOut,
    summary="Get dispatch details by ID",
)
def get_dispatch(
    dispatch_id: int,
    db: Session = Depends(get_db),
):
    dispatch = db.scalar(
        select(Dispatch)
        .options(
            selectinload(Dispatch.items).selectinload(DispatchItem.roll),
            selectinload(Dispatch.order),
        )
        .where(Dispatch.id == dispatch_id)
    )
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    return build_dispatch_out(db, dispatch)
