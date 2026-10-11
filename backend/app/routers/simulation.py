from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db, SessionLocal
from app.models import (
    SimulationState,
    ProductionRun,
    WorkerAssignment,
    User,
)
from app.services.simulation import (
    get_simulation_service,
    start_simulation,
    stop_simulation,
    pause_simulation,
    resume_simulation,
    set_simulation_speed,
)
from app.services.production import utc_now

router = APIRouter(tags=["Production Simulation"])


class SimulationStatusOut(BaseModel):
    status: str
    speed: float
    simulated_time: int
    last_tick_at: Optional[str]
    active_runs: int
    blocked_operations: int


class SimulationControlRequest(BaseModel):
    speed: Optional[float] = None


@router.get(
    "/simulation/status",
    response_model=SimulationStatusOut,
    summary="Get current simulation status",
)
def get_simulation_status(
    current_user: User = Depends(get_current_user),
):
    """Get current simulation status including speed, simulated time, and active runs."""
    service = get_simulation_service()
    return service.get_status()


@router.post(
    "/simulation/start",
    summary="Start the simulation clock",
)
async def start_simulation_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Start the simulation clock (1 simulated minute = 1 real second)."""
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Production Manager can start simulation",
        )
    await start_simulation()
    return {"message": "Simulation started"}


@router.post(
    "/simulation/stop",
    summary="Stop the simulation clock",
)
async def stop_simulation_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Stop the simulation clock."""
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Production Manager can stop simulation",
        )
    await stop_simulation()
    return {"message": "Simulation stopped"}


@router.post(
    "/simulation/pause",
    summary="Pause the simulation clock",
)
async def pause_simulation_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Pause the simulation clock."""
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Production Manager can pause simulation",
        )
    await pause_simulation()
    return {"message": "Simulation paused"}


@router.post(
    "/simulation/resume",
    summary="Resume the simulation clock",
)
async def resume_simulation_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Resume the simulation clock."""
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Production Manager can resume simulation",
        )
    await resume_simulation()
    return {"message": "Simulation resumed"}


@router.post(
    "/simulation/speed",
    summary="Set simulation speed",
)
async def set_simulation_speed_endpoint(
    payload: SimulationControlRequest,
    current_user: User = Depends(get_current_user),
):
    """Set simulation speed (simulated minutes per real second). Default is 1.0."""
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Production Manager can change simulation speed",
        )
    if payload.speed is None:
        raise HTTPException(status_code=422, detail="Speed is required")
    if payload.speed <= 0 or payload.speed > 100:
        raise HTTPException(status_code=422, detail="Speed must be between 0 and 100")
    await set_simulation_speed(payload.speed)
    return {"message": f"Simulation speed set to {payload.speed}x"}


@router.post(
    "/simulation/reset",
    summary="Reset simulation state (demo data only)",
)
async def reset_simulation_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Reset simulation state - only for demo environments."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin can reset simulation",
        )

    with SessionLocal() as db:
        state = db.get(SimulationState, 1)
        if state:
            state.status = "stopped"
            state.speed = Decimal("1.0")
            state.simulated_time = 0
            state.last_tick_at = None
            state.updated_at = utc_now()
            db.commit()

        # Reset running production runs to planned
        running_runs = db.scalars(
            select(ProductionRun).where(
                ProductionRun.run_kind == "actual",
                ProductionRun.status == "running",
            )
        ).all()

        for run in running_runs:
            run.status = "planned"
            run.start_time = None
            run.end_time = None
            run.output_metres = None

            # Release machine
            if run.machine:
                run.machine.state = "idle"

            # Release worker assignments
            assignments = db.scalars(
                select(WorkerAssignment).where(
                    WorkerAssignment.production_run_id == run.id,
                    WorkerAssignment.released_at.is_(None),
                )
            ).all()
            for assignment in assignments:
                assignment.released_at = utc_now()

        db.commit()

    return {"message": "Simulation state reset"}