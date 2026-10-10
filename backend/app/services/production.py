from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Downtime, Machine, Operation, ProductionRun
from app.schemas import (
    DowntimeCreate,
    DowntimeUpdate,
    ProductionRunCreate,
    ProductionRunUpdate,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def validate_machine_eligibility(operation: Operation, machine: Machine) -> None:
    if not machine.is_active:
        raise HTTPException(
            status_code=409,
            detail=f"Machine {machine.id} ({machine.machine_code}) is inactive",
        )

    # If explicit eligible machines mappings exist for this operation
    if operation.eligible_machines:
        eligible_ids = {m.id for m in operation.eligible_machines}
        if machine.id not in eligible_ids:
            raise HTTPException(
                status_code=409,
                detail=f"Machine {machine.id} ({machine.machine_code}) is not configured as eligible for operation {operation.id} ({operation.stage})",
            )
    else:
        # Fallback check stage vs machine_type for physical processing stages
        if operation.stage in ("spinning", "weaving", "dyeing"):
            if machine.machine_type != operation.stage:
                raise HTTPException(
                    status_code=409,
                    detail=f"Machine type '{machine.machine_type}' is incompatible with operation stage '{operation.stage}'",
                )


def validate_downtime_overlap(
    db: Session,
    machine_id: int,
    start_time: datetime,
    end_time: datetime | None,
    exclude_downtime_id: int | None = None,
) -> None:
    """
    Checks for overlapping downtime intervals on the same machine.
    Two intervals [S1, E1] and [S2, E2] overlap iff S1 < E2 and S2 < E1
    (with None treated as infinity).
    """
    conditions = [
        Downtime.machine_id == machine_id,
        or_(Downtime.end_time.is_(None), Downtime.end_time > start_time),
    ]
    if exclude_downtime_id is not None:
        conditions.append(Downtime.id != exclude_downtime_id)
    if end_time is not None:
        conditions.append(Downtime.start_time < end_time)

    conflicting = db.scalar(select(Downtime).where(*conditions).limit(1))
    if conflicting is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Overlapping downtime record exists for machine {machine_id} (conflicts with downtime #{conflicting.id})",
        )


def validate_run_downtime_conflict(
    db: Session,
    machine_id: int,
    start_time: datetime,
    end_time: datetime | None,
) -> None:
    """
    Ensures that an actual production run does not overlap with any machine downtime.
    """
    conditions = [
        Downtime.machine_id == machine_id,
        or_(Downtime.end_time.is_(None), Downtime.end_time > start_time),
    ]
    if end_time is not None:
        conditions.append(Downtime.start_time < end_time)

    conflicting = db.scalar(select(Downtime).where(*conditions).limit(1))
    if conflicting is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Machine {machine_id} has scheduled or active downtime during the requested run period (conflicts with downtime #{conflicting.id}: '{conflicting.reason}')",
        )


def validate_actual_run_overlap(
    db: Session,
    machine_id: int,
    start_time: datetime,
    end_time: datetime | None,
    exclude_run_id: int | None = None,
) -> None:
    """
    Prevents overlapping actual runs on the same machine.
    Scheduled runs are not restricted by this check.
    Cancelled runs do not occupy machine time.
    """
    conditions = [
        ProductionRun.machine_id == machine_id,
        ProductionRun.run_kind == "actual",
        ProductionRun.status != "cancelled",
        ProductionRun.start_time.is_not(None),
        or_(ProductionRun.end_time.is_(None), ProductionRun.end_time > start_time),
    ]
    if exclude_run_id is not None:
        conditions.append(ProductionRun.id != exclude_run_id)
    if end_time is not None:
        conditions.append(ProductionRun.start_time < end_time)

    conflicting = db.scalar(select(ProductionRun).where(*conditions).limit(1))
    if conflicting is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Overlapping actual production run detected on machine {machine_id} (conflicts with run #{conflicting.id})",
        )


def sync_machine_state_after_run_change(
    db: Session,
    machine: Machine,
    exclude_run_id: int | None = None,
) -> None:
    """
    Synchronizes machine state following run start, completion or cancellation.
    """
    now = utc_now()
    # Check if machine has an active downtime right now
    active_downtime = db.scalar(
        select(Downtime.id)
        .where(
            Downtime.machine_id == machine.id,
            Downtime.start_time <= now,
            or_(Downtime.end_time.is_(None), Downtime.end_time > now),
        )
        .limit(1)
    )
    if active_downtime is not None:
        if machine.state not in ("maintenance", "breakdown"):
            machine.state = "maintenance"
        return

    # Check if there is any running actual run on this machine
    conditions = [
        ProductionRun.machine_id == machine.id,
        ProductionRun.run_kind == "actual",
        ProductionRun.status == "running",
    ]
    if exclude_run_id is not None:
        conditions.append(ProductionRun.id != exclude_run_id)

    active_running = db.scalar(select(ProductionRun.id).where(*conditions).limit(1))
    if active_running is not None:
        machine.state = "running"
    else:
        if machine.state == "running":
            machine.state = "idle"


def sync_machine_state_after_downtime_change(db: Session, machine: Machine) -> None:
    """
    Synchronizes machine state after downtime creation, update or closure.
    """
    now = utc_now()
    active_downtime = db.scalar(
        select(Downtime)
        .where(
            Downtime.machine_id == machine.id,
            Downtime.start_time <= now,
            or_(Downtime.end_time.is_(None), Downtime.end_time > now),
        )
        .order_by(Downtime.start_time.desc())
        .limit(1)
    )
    if active_downtime is not None:
        if "breakdown" in active_downtime.reason.lower():
            machine.state = "breakdown"
        else:
            machine.state = "maintenance"
        return

    # If no active downtime, check running actual runs
    active_running = db.scalar(
        select(ProductionRun.id)
        .where(
            ProductionRun.machine_id == machine.id,
            ProductionRun.run_kind == "actual",
            ProductionRun.status == "running",
        )
        .limit(1)
    )
    if active_running is not None:
        machine.state = "running"
    else:
        machine.state = "idle"
