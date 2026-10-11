from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Worker, WorkerAssignment, Operation, ProductionRun, User
from pydantic import BaseModel, Field


router = APIRouter(tags=["Workforce"])


class WorkerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    name: str
    skill_level: str
    shift: str
    status: str
    hourly_rate: float
    skills: list[str]
    created_at: datetime


class WorkerAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    worker_id: int
    operation_id: int
    production_run_id: int
    role_in_run: str
    assigned_at: datetime
    released_at: datetime | None


@router.get(
    "/workers",
    response_model=list[WorkerOut],
    summary="List workers with optional filters",
)
def list_workers(
    shift: str | None = Query(None, description="Filter by shift"),
    status: str | None = Query(None, description="Filter by status"),
    skill_level: str | None = Query(None, description="Filter by skill level"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Worker).order_by(Worker.id)

    if shift:
        query = query.where(Worker.shift == shift)
    if status:
        query = query.where(Worker.status == status)
    if skill_level:
        query = query.where(Worker.skill_level == skill_level)

    workers = db.scalars(query.offset(offset).limit(limit)).all()
    return workers


@router.get(
    "/workers/{worker_id}",
    response_model=WorkerOut,
    summary="Get worker by ID",
)
def get_worker(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


@router.get(
    "/workers/{worker_id}/assignments",
    response_model=list[WorkerAssignmentOut],
    summary="Get worker assignments",
)
def get_worker_assignments(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    assignments = db.scalars(
        select(WorkerAssignment)
        .options(
            selectinload(WorkerAssignment.operation).selectinload(Operation.order),
            selectinload(WorkerAssignment.production_run),
        )
        .where(WorkerAssignment.worker_id == worker_id)
        .order_by(WorkerAssignment.assigned_at.desc())
    ).all()
    return assignments


# Import at bottom to avoid circular imports
from datetime import datetime
from pydantic import BaseModel, ConfigDict