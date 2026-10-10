from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Downtime, Machine
from app.schemas import DowntimeCreate, DowntimeOut, DowntimeUpdate
from app.services.production import (
    ensure_utc,
    sync_machine_state_after_downtime_change,
    utc_now,
    validate_downtime_overlap,
)

router = APIRouter(prefix="/downtimes", tags=["Machine Downtimes"])


@router.post(
    "",
    response_model=DowntimeOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record factory machine downtime",
)
def create_downtime(
    payload: DowntimeCreate,
    db: Session = Depends(get_db),
):
    # Lock machine to serialize concurrent downtime or run creation
    machine = db.scalar(
        select(Machine).where(Machine.id == payload.machine_id).with_for_update()
    )
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    start_time = ensure_utc(payload.start_time)
    end_time = ensure_utc(payload.end_time)

    if end_time is not None and end_time < start_time:
        raise HTTPException(
            status_code=422,
            detail="end_time cannot be earlier than start_time",
        )

    # Validate that no overlapping downtime records exist on this machine
    validate_downtime_overlap(
        db=db,
        machine_id=machine.id,
        start_time=start_time,
        end_time=end_time,
    )

    downtime = Downtime(
        machine_id=machine.id,
        reason=payload.reason,
        start_time=start_time,
        end_time=end_time,
    )

    try:
        db.add(downtime)
        db.flush()

        # Update machine state based on downtime
        sync_machine_state_after_downtime_change(db, machine)

        db.commit()
        db.refresh(downtime)
        return downtime
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[DowntimeOut],
    summary="List and filter machine downtime records",
)
def list_downtimes(
    machine_id: int | None = Query(None, description="Filter by machine ID"),
    start_date: datetime | None = Query(None, description="Filter downtimes from start date"),
    end_date: datetime | None = Query(None, description="Filter downtimes up to end date"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
):
    query = select(Downtime)

    if machine_id is not None:
        query = query.where(Downtime.machine_id == machine_id)
    if start_date is not None:
        query = query.where(Downtime.start_time >= ensure_utc(start_date))
    if end_date is not None:
        query = query.where(Downtime.start_time <= ensure_utc(end_date))

    downtimes = (
        db.scalars(
            query.order_by(Downtime.start_time.desc()).offset(skip).limit(limit)
        ).all()
    )
    return downtimes


@router.get(
    "/{downtime_id}",
    response_model=DowntimeOut,
    summary="Get machine downtime by ID",
)
def get_downtime(
    downtime_id: int,
    db: Session = Depends(get_db),
):
    downtime = db.get(Downtime, downtime_id)
    if downtime is None:
        raise HTTPException(status_code=404, detail="Downtime record not found")
    return downtime


@router.patch(
    "/{downtime_id}",
    response_model=DowntimeOut,
    summary="Update or close machine downtime record",
)
def update_downtime(
    downtime_id: int,
    payload: DowntimeUpdate,
    db: Session = Depends(get_db),
):
    downtime = db.scalar(
        select(Downtime).where(Downtime.id == downtime_id).with_for_update()
    )
    if downtime is None:
        raise HTTPException(status_code=404, detail="Downtime record not found")

    machine = db.scalar(
        select(Machine).where(Machine.id == downtime.machine_id).with_for_update()
    )

    if payload.reason is not None:
        downtime.reason = payload.reason

    if payload.end_time is not None:
        end_time = ensure_utc(payload.end_time)
        if end_time < downtime.start_time:
            raise HTTPException(
                status_code=422,
                detail="end_time cannot be earlier than start_time",
            )
        # Check that updating end_time doesn't create an overlap with other downtimes
        validate_downtime_overlap(
            db=db,
            machine_id=machine.id,
            start_time=downtime.start_time,
            end_time=end_time,
            exclude_downtime_id=downtime.id,
        )
        downtime.end_time = end_time

    try:
        # Synchronize machine state if downtime ended
        sync_machine_state_after_downtime_change(db, machine)

        db.commit()
        db.refresh(downtime)
        return downtime
    except Exception:
        db.rollback()
        raise
