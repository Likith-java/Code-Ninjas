from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Dispatch,
    DispatchItem,
    FabricRoll,
    Inspection,
    ProductionRun,
)
from app.schemas import InspectionCreate, InspectionOut, TraceabilityOut

router = APIRouter(prefix="/rolls", tags=["Quality and Traceability"])


@router.post(
    "/{roll_id}/inspections",
    response_model=InspectionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_inspection(
    roll_id: int,
    payload: InspectionCreate,
    db: Session = Depends(get_db),
):
    roll = db.scalar(
        select(FabricRoll)
        .where(FabricRoll.id == roll_id)
        .with_for_update()
    )
    if roll is None:
        raise HTTPException(status_code=404, detail="Fabric roll not found")

    # Once a dispatch has been confirmed, the roll's inspection state
    # must not be changed through this endpoint.
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

    inspection = Inspection(
        roll_id=roll.id,
        defect_type=payload.defect_type,
        severity=payload.severity,
        result=payload.result,
        disposition=payload.disposition,
    )

    try:
        db.add(inspection)
        # The roll status reflects the latest inspection result.
        roll.status = {
            "pass": "passed",
            "rework": "rework",
            "reject": "rejected",
        }[payload.result]

        db.commit()
        db.refresh(inspection)
        return inspection
    except Exception:
        db.rollback()
        raise


@router.get("/{roll_id}/traceability", response_model=TraceabilityOut)
def get_traceability(
    roll_id: int,
    db: Session = Depends(get_db),
):
    roll = db.scalar(
        select(FabricRoll)
        .options(selectinload(FabricRoll.inspections))
        .where(FabricRoll.id == roll_id)
    )
    if roll is None:
        raise HTTPException(status_code=404, detail="Fabric roll not found")

    run = db.get(ProductionRun, roll.production_run_id)
    if run is None:
        raise HTTPException(
            status_code=409,
            detail="Production run associated with this roll was not found",
        )

    return TraceabilityOut(
        roll_id=roll.id,
        roll_code=roll.roll_code,
        order_id=roll.order_id,
        production_run_id=run.id,
        machine_id=run.machine_id,
        metres=roll.metres,
        status=roll.status,
        created_at=roll.created_at,
        inspections=roll.inspections,
    )