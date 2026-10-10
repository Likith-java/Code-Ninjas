from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.services.notification_service import dispatch_order_ready_for_dispatch_notification
from app.models import (
    Dispatch,
    DispatchItem,
    FabricRoll,
    Inspection,
    Machine,
    Order,
    ProductionRun,
)
from app.schemas import (
    FabricRollCreate,
    FabricRollOut,
    InspectionCreate,
    InspectionOut,
    TraceabilityOut,
)

router = APIRouter(prefix="/rolls", tags=["Quality and Traceability"])


@router.post(
    "",
    response_model=FabricRollOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a fabric roll from a production run",
)
def create_roll(
    payload: FabricRollCreate,
    db: Session = Depends(get_db),
):
    order = db.get(Order, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    run = db.get(ProductionRun, payload.production_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Production run not found")

    if run.order_id != payload.order_id:
        raise HTTPException(
            status_code=409,
            detail=f"Production run {run.id} belongs to order {run.order_id}, not order {payload.order_id}",
        )

    if payload.status is not None and payload.status != "awaiting_inspection":
        raise HTTPException(
            status_code=409,
            detail="New fabric rolls must have initial status 'awaiting_inspection'",
        )

    existing = db.scalar(
        select(FabricRoll.id)
        .where(FabricRoll.roll_code == payload.roll_code)
        .limit(1)
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Fabric roll with code '{payload.roll_code}' already exists",
        )

    roll = FabricRoll(
        roll_code=payload.roll_code,
        order_id=payload.order_id,
        production_run_id=payload.production_run_id,
        metres=payload.metres,
        status="awaiting_inspection",
    )

    try:
        db.add(roll)
        db.commit()
        db.refresh(roll)
        return FabricRollOut(
            id=roll.id,
            roll_code=roll.roll_code,
            order_id=roll.order_id,
            production_run_id=roll.production_run_id,
            metres=roll.metres,
            status=roll.status,
            created_at=roll.created_at,
            is_dispatch_eligible=False,
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[FabricRollOut],
    summary="List fabric rolls with optional filters",
)
def list_rolls(
    order_id: int | None = Query(None, description="Filter rolls by order ID"),
    status_filter: Literal[
        "awaiting_inspection", "passed", "rework", "rejected", "dispatched"
    ] | None = Query(None, alias="status", description="Filter rolls by status"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
):
    query = select(FabricRoll)
    if order_id is not None:
        query = query.where(FabricRoll.order_id == order_id)
    if status_filter is not None:
        query = query.where(FabricRoll.status == status_filter)

    rolls = db.scalars(query.order_by(FabricRoll.id.desc()).offset(skip).limit(limit)).all()
    return [
        FabricRollOut(
            id=r.id,
            roll_code=r.roll_code,
            order_id=r.order_id,
            production_run_id=r.production_run_id,
            metres=r.metres,
            status=r.status,
            created_at=r.created_at,
            is_dispatch_eligible=(r.status == "passed"),
        )
        for r in rolls
    ]


@router.get(
    "/{roll_id}",
    response_model=FabricRollOut,
    summary="Get fabric roll by ID",
)
def get_roll(
    roll_id: int,
    db: Session = Depends(get_db),
):
    roll = db.get(FabricRoll, roll_id)
    if roll is None:
        raise HTTPException(status_code=404, detail="Fabric roll not found")
    return FabricRollOut(
        id=roll.id,
        roll_code=roll.roll_code,
        order_id=roll.order_id,
        production_run_id=roll.production_run_id,
        metres=roll.metres,
        status=roll.status,
        created_at=roll.created_at,
        is_dispatch_eligible=(roll.status == "passed"),
    )


@router.post(
    "/{roll_id}/inspections",
    response_model=InspectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record quality inspection result for a fabric roll",
)
def create_inspection(
    roll_id: int,
    payload: InspectionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    roll = db.scalar(
        select(FabricRoll)
        .where(FabricRoll.id == roll_id)
        .with_for_update()
    )
    if roll is None:
        raise HTTPException(status_code=404, detail="Fabric roll not found")

    # 1. Once dispatched or linked to a confirmed dispatch, the roll
    # cannot have its inspection state modified.
    already_dispatched = db.scalar(
        select(DispatchItem.id)
        .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
        .where(
            DispatchItem.roll_id == roll_id,
            Dispatch.confirmed.is_(True),
        ).limit(1)
    )
    if already_dispatched is not None or roll.status == "dispatched":
        raise HTTPException(
            status_code=409,
            detail="Cannot inspect a roll that has already been dispatched",
        )

    # 2. Enforce quality state lifecycle:
    # A rejected roll is a terminal defective state and cannot be reinspected.
    if roll.status == "rejected":
        raise HTTPException(
            status_code=409,
            detail="Cannot reinspect a roll that has already been rejected",
        )

    # Append-only: create new inspection entry
    inspection = Inspection(
        roll_id=roll.id,
        defect_type=payload.defect_type,
        severity=payload.severity,
        result=payload.result,
        disposition=payload.disposition,
    )

    try:
        db.add(inspection)

        # Update roll status based on current inspection result:
        # pass -> passed (eligible for dispatch)
        # rework -> rework (ineligible for dispatch; eligible for reinspection)
        # reject -> rejected (ineligible for dispatch; terminal defect)
        status_map = {
            "pass": "passed",
            "rework": "rework",
            "reject": "rejected",
        }
        roll.status = status_map[payload.result]

        db.commit()
        db.refresh(inspection)

        if payload.result == "pass" and roll.order_id:
            background_tasks.add_task(
                dispatch_order_ready_for_dispatch_notification,
                roll.order_id,
            )

        return inspection
    except Exception:
        db.rollback()
        raise


@router.get(
    "/{roll_id}/traceability",
    response_model=TraceabilityOut,
    summary="Retrieve complete roll traceability chain and inspection history",
)
def get_traceability(
    roll_id: int,
    db: Session = Depends(get_db),
):
    roll = db.scalar(
        select(FabricRoll)
        .options(
            selectinload(FabricRoll.inspections),
            selectinload(FabricRoll.order),
            selectinload(FabricRoll.production_run).selectinload(ProductionRun.machine),
        )
        .where(FabricRoll.id == roll_id)
    )
    if roll is None:
        raise HTTPException(status_code=404, detail="Fabric roll not found")

    run = roll.production_run or (
        db.get(ProductionRun, roll.production_run_id)
        if roll.production_run_id
        else None
    )
    order = roll.order or (db.get(Order, roll.order_id) if roll.order_id else None)
    machine = run.machine if run else None

    # Deterministic chronological history using (inspected_at, id) tie-breaker
    sorted_inspections = sorted(
        roll.inspections,
        key=lambda i: (
            i.inspected_at or datetime.min.replace(tzinfo=timezone.utc),
            i.id,
        ),
    )
    latest_insp = sorted_inspections[-1] if sorted_inspections else None

    return TraceabilityOut(
        roll_id=roll.id,
        roll_code=roll.roll_code,
        order_id=roll.order_id,
        production_run_id=roll.production_run_id,
        machine_id=run.machine_id if run else None,
        metres=roll.metres,
        status=roll.status,
        created_at=roll.created_at,
        is_dispatch_eligible=(roll.status == "passed"),
        fabric_type=order.fabric_type if order else None,
        colour=order.colour if order else None,
        machine_code=machine.machine_code if machine else None,
        machine_type=machine.machine_type if machine else None,
        run_kind=run.run_kind if run else None,
        run_status=run.status if run else None,
        inspections=[InspectionOut.model_validate(i) for i in sorted_inspections],
        latest_inspection=(
            InspectionOut.model_validate(latest_insp) if latest_insp else None
        ),
    )