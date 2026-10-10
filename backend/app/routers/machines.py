from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Machine
from app.schemas import MachineCreate, MachineOut, MachineUpdate

router = APIRouter(prefix="/machines", tags=["Machines"])


@router.post(
    "",
    response_model=MachineOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new factory machine",
)
def create_machine(
    payload: MachineCreate,
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(Machine.id).where(Machine.machine_code == payload.machine_code).limit(1)
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Machine with code '{payload.machine_code}' already exists",
        )

    machine = Machine(
        machine_code=payload.machine_code,
        machine_type=payload.machine_type,
        capacity_rate=payload.capacity_rate,
        state=payload.state,
        is_active=payload.is_active,
    )

    try:
        db.add(machine)
        db.commit()
        db.refresh(machine)
        return machine
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Machine with code '{payload.machine_code}' already exists",
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[MachineOut],
    summary="List and filter factory machines",
)
def list_machines(
    machine_type: Literal["spinning", "weaving", "dyeing"] | None = Query(
        None, description="Filter by machine type"
    ),
    state: Literal[
        "idle", "scheduled", "running", "maintenance", "breakdown"
    ] | None = Query(None, description="Filter by current machine state"),
    is_active: bool | None = Query(None, description="Filter active/inactive machines"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
):
    query = select(Machine)

    if machine_type is not None:
        query = query.where(Machine.machine_type == machine_type)
    if state is not None:
        query = query.where(Machine.state == state)
    if is_active is not None:
        query = query.where(Machine.is_active == is_active)

    machines = (
        db.scalars(
            query.order_by(Machine.id.asc()).offset(skip).limit(limit)
        ).all()
    )
    return machines


@router.get(
    "/{machine_id}",
    response_model=MachineOut,
    summary="Get machine by ID",
)
def get_machine(
    machine_id: int,
    db: Session = Depends(get_db),
):
    machine = db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


@router.patch(
    "/{machine_id}",
    response_model=MachineOut,
    summary="Update machine status or capacity rate",
)
def update_machine(
    machine_id: int,
    payload: MachineUpdate,
    db: Session = Depends(get_db),
):
    machine = db.scalar(
        select(Machine).where(Machine.id == machine_id).with_for_update()
    )
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    if payload.state is not None:
        machine.state = payload.state
    if payload.is_active is not None:
        machine.is_active = payload.is_active
    if payload.capacity_rate is not None:
        machine.capacity_rate = payload.capacity_rate

    try:
        db.commit()
        db.refresh(machine)
        return machine
    except Exception:
        db.rollback()
        raise
