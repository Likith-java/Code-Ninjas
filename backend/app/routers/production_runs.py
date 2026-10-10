from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Machine, Operation, Order, ProductionRun
from app.schemas import (
    OperationOut,
    ProductionRunCreate,
    ProductionRunOut,
    ProductionRunUpdate,
)
from app.services.production import (
    ensure_utc,
    sync_machine_state_after_run_change,
    utc_now,
    validate_actual_run_overlap,
    validate_machine_eligibility,
    validate_run_downtime_conflict,
)
from app.services.scheduler_adapter import import_scheduler_output

router = APIRouter(tags=["Production Operations"])


# ============================================================
# Operations & Machine Eligibility Endpoints
# ============================================================

@router.get(
    "/orders/{order_id}/operations",
    response_model=list[OperationOut],
    summary="List operations for an order",
)
def list_order_operations(
    order_id: int,
    db: Session = Depends(get_db),
):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    operations = (
        db.scalars(
            select(Operation)
            .options(selectinload(Operation.eligible_machines))
            .where(Operation.order_id == order_id)
            .order_by(Operation.sequence.asc())
        ).all()
    )

    return [
        OperationOut(
            id=op.id,
            order_id=op.order_id,
            stage=op.stage,
            sequence=op.sequence,
            planned_duration_minutes=op.planned_duration_minutes,
            eligible_machine_ids=[m.id for m in op.eligible_machines],
        )
        for op in operations
    ]


@router.post(
    "/operations/{operation_id}/eligible-machines/{machine_id}",
    response_model=OperationOut,
    summary="Configure machine as eligible for an operation",
)
def add_eligible_machine(
    operation_id: int,
    machine_id: int,
    db: Session = Depends(get_db),
):
    operation = db.scalar(
        select(Operation)
        .options(selectinload(Operation.eligible_machines))
        .where(Operation.id == operation_id)
        .with_for_update()
    )
    if operation is None:
        raise HTTPException(status_code=404, detail="Operation not found")

    machine = db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    if machine not in operation.eligible_machines:
        operation.eligible_machines.append(machine)
        db.commit()
        db.refresh(operation)

    return OperationOut(
        id=operation.id,
        order_id=operation.order_id,
        stage=operation.stage,
        sequence=operation.sequence,
        planned_duration_minutes=operation.planned_duration_minutes,
        eligible_machine_ids=[m.id for m in operation.eligible_machines],
    )


@router.delete(
    "/operations/{operation_id}/eligible-machines/{machine_id}",
    response_model=OperationOut,
    summary="Remove machine eligibility from an operation",
)
def remove_eligible_machine(
    operation_id: int,
    machine_id: int,
    db: Session = Depends(get_db),
):
    operation = db.scalar(
        select(Operation)
        .options(selectinload(Operation.eligible_machines))
        .where(Operation.id == operation_id)
        .with_for_update()
    )
    if operation is None:
        raise HTTPException(status_code=404, detail="Operation not found")

    machine = db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    if machine in operation.eligible_machines:
        operation.eligible_machines.remove(machine)
        db.commit()
        db.refresh(operation)

    return OperationOut(
        id=operation.id,
        order_id=operation.order_id,
        stage=operation.stage,
        sequence=operation.sequence,
        planned_duration_minutes=operation.planned_duration_minutes,
        eligible_machine_ids=[m.id for m in operation.eligible_machines],
    )


# ============================================================
# Production Runs Endpoints
# ============================================================

@router.post(
    "/production-runs",
    response_model=ProductionRunOut,
    status_code=status.HTTP_201_CREATED,
    summary="Record or schedule a production run",
)
def create_production_run(
    payload: ProductionRunCreate,
    db: Session = Depends(get_db),
):
    # 1. Existence validations
    order = db.get(Order, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    operation = db.scalar(
        select(Operation)
        .options(selectinload(Operation.eligible_machines))
        .where(Operation.id == payload.operation_id)
    )
    if operation is None:
        raise HTTPException(status_code=404, detail="Operation not found")

    # Serialize against concurrent updates on this machine
    machine = db.scalar(
        select(Machine).where(Machine.id == payload.machine_id).with_for_update()
    )
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    # 2. Validate operation belongs to the order
    if operation.order_id != payload.order_id:
        raise HTTPException(
            status_code=409,
            detail=f"Operation {operation.id} does not belong to order {payload.order_id}",
        )

    # 3. Validate machine eligibility
    validate_machine_eligibility(operation, machine)

    # 4. Validate timestamps & quantities
    start_time = ensure_utc(payload.start_time)
    end_time = ensure_utc(payload.end_time)

    if start_time is not None and end_time is not None and end_time < start_time:
        raise HTTPException(
            status_code=422,
            detail="end_time cannot be earlier than start_time",
        )

    if payload.output_metres is not None and payload.output_metres < 0:
        raise HTTPException(
            status_code=422,
            detail="output_metres must be non-negative",
        )

    # 5. Handle actual run specifics (overlap detection, downtime conflict, state)
    if payload.run_kind == "actual":
        if payload.status == "running":
            if machine.state in ("breakdown", "maintenance"):
                raise HTTPException(
                    status_code=409,
                    detail=f"Machine {machine.id} is currently in '{machine.state}' state and cannot start an actual run",
                )
            if start_time is None:
                start_time = utc_now()

        if payload.status == "completed":
            if end_time is None:
                end_time = utc_now()
            if start_time is None:
                start_time = end_time
            if end_time < start_time:
                raise HTTPException(
                    status_code=422,
                    detail="end_time cannot be earlier than start_time",
                )

        if start_time is not None and payload.status != "cancelled":
            # Check overlap against other actual runs on this machine
            validate_actual_run_overlap(
                db=db,
                machine_id=machine.id,
                start_time=start_time,
                end_time=end_time,
            )
            # Check overlap against machine downtimes
            validate_run_downtime_conflict(
                db=db,
                machine_id=machine.id,
                start_time=start_time,
                end_time=end_time,
            )

    run = ProductionRun(
        order_id=payload.order_id,
        operation_id=payload.operation_id,
        machine_id=payload.machine_id,
        run_kind=payload.run_kind,
        status=payload.status,
        start_time=start_time,
        end_time=end_time,
        output_metres=payload.output_metres,
    )

    try:
        db.add(run)
        db.flush()

        if payload.run_kind == "actual":
            if payload.status == "running":
                machine.state = "running"
            else:
                sync_machine_state_after_run_change(db, machine)

        db.commit()
        db.refresh(run)
        return run
    except Exception:
        db.rollback()
        raise


@router.get(
    "/production-runs",
    response_model=list[ProductionRunOut],
    summary="List and filter production runs",
)
def list_production_runs(
    order_id: int | None = Query(None, description="Filter by order ID"),
    operation_id: int | None = Query(None, description="Filter by operation ID"),
    machine_id: int | None = Query(None, description="Filter by machine ID"),
    run_kind: Literal["scheduled", "actual"] | None = Query(
        None, description="Filter by run kind ('scheduled' or 'actual')"
    ),
    status_filter: Literal[
        "planned", "running", "completed", "cancelled"
    ] | None = Query(None, alias="status", description="Filter by run status"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
):
    query = select(ProductionRun)

    if order_id is not None:
        query = query.where(ProductionRun.order_id == order_id)
    if operation_id is not None:
        query = query.where(ProductionRun.operation_id == operation_id)
    if machine_id is not None:
        query = query.where(ProductionRun.machine_id == machine_id)
    if run_kind is not None:
        query = query.where(ProductionRun.run_kind == run_kind)
    if status_filter is not None:
        query = query.where(ProductionRun.status == status_filter)

    runs = (
        db.scalars(
            query.order_by(ProductionRun.id.desc()).offset(skip).limit(limit)
        ).all()
    )
    return runs


@router.get(
    "/production-runs/{run_id}",
    response_model=ProductionRunOut,
    summary="Get production run by ID",
)
def get_production_run(
    run_id: int,
    db: Session = Depends(get_db),
):
    run = db.get(ProductionRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Production run not found")
    return run


@router.patch(
    "/production-runs/{run_id}",
    response_model=ProductionRunOut,
    summary="Update production run status, timestamps, or output",
)
def update_production_run(
    run_id: int,
    payload: ProductionRunUpdate,
    db: Session = Depends(get_db),
):
    run = db.scalar(
        select(ProductionRun).where(ProductionRun.id == run_id).with_for_update()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Production run not found")

    target_machine_id = payload.machine_id or run.machine_id
    machine = db.scalar(
        select(Machine).where(Machine.id == target_machine_id).with_for_update()
    )
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    # If machine is being changed, validate eligibility
    if payload.machine_id is not None and payload.machine_id != run.machine_id:
        operation = db.scalar(
            select(Operation)
            .options(selectinload(Operation.eligible_machines))
            .where(Operation.id == run.operation_id)
        )
        validate_machine_eligibility(operation, machine)

    curr_status = run.status
    new_status = payload.status if payload.status is not None else curr_status

    # Validate status transitions
    if curr_status != new_status:
        if curr_status in ("completed", "cancelled"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot transition production run from terminal state '{curr_status}' to '{new_status}'",
            )
        if curr_status == "running" and new_status == "planned":
            raise HTTPException(
                status_code=409,
                detail="Cannot transition production run backwards from 'running' to 'planned'",
            )

    # Compute effective timestamps and output metres
    effective_start = (
        ensure_utc(payload.start_time)
        if payload.start_time is not None
        else ensure_utc(run.start_time)
    )
    effective_end = (
        ensure_utc(payload.end_time)
        if payload.end_time is not None
        else ensure_utc(run.end_time)
    )

    if new_status == "running" and effective_start is None:
        effective_start = utc_now()

    if new_status == "completed":
        if effective_end is None:
            effective_end = utc_now()
        if effective_start is None:
            effective_start = effective_end

    if (
        effective_start is not None
        and effective_end is not None
        and effective_end < effective_start
    ):
        raise HTTPException(
            status_code=422,
            detail="end_time cannot be earlier than start_time",
        )

    effective_output = (
        payload.output_metres
        if payload.output_metres is not None
        else run.output_metres
    )
    if effective_output is not None and effective_output < 0:
        raise HTTPException(
            status_code=422,
            detail="output_metres must be non-negative",
        )

    # Check overlaps and downtimes for actual runs
    if run.run_kind == "actual" and new_status != "cancelled":
        if new_status == "running" and machine.state in ("breakdown", "maintenance"):
            raise HTTPException(
                status_code=409,
                detail=f"Machine {machine.id} is currently in '{machine.state}' state and cannot run",
            )
        if effective_start is not None:
            validate_actual_run_overlap(
                db=db,
                machine_id=target_machine_id,
                start_time=effective_start,
                end_time=effective_end,
                exclude_run_id=run.id,
            )
            validate_run_downtime_conflict(
                db=db,
                machine_id=target_machine_id,
                start_time=effective_start,
                end_time=effective_end,
            )

    # Apply updates
    run.status = new_status
    run.start_time = effective_start
    run.end_time = effective_end
    run.output_metres = effective_output
    if payload.machine_id is not None:
        run.machine_id = payload.machine_id

    try:
        db.flush()

        if run.run_kind == "actual":
            if new_status == "running":
                machine.state = "running"
            else:
                sync_machine_state_after_run_change(
                    db, machine, exclude_run_id=run.id
                )

        db.commit()
        db.refresh(run)
        return run
    except Exception:
        db.rollback()
        raise


@router.post(
    "/production-runs/import-schedule",
    response_model=dict[str, Any],
    summary="Import CP-SAT solver output schedule into planned production runs",
)
def import_schedule_runs(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    try:
        result = import_scheduler_output(db, payload)
        return {
            "status": "success",
            "runs_created": result["runs_created"],
            "runs_updated": result["runs_updated"],
            "total_scheduled": result["total_scheduled"],
            "runs": [
                {
                    "id": r.id,
                    "order_id": r.order_id,
                    "operation_id": r.operation_id,
                    "machine_id": r.machine_id,
                    "run_kind": r.run_kind,
                    "status": r.status,
                    "start_time": r.start_time.isoformat() if r.start_time else None,
                    "end_time": r.end_time.isoformat() if r.end_time else None,
                    "output_metres": float(r.output_metres) if r.output_metres is not None else None,
                }
                for r in result["runs"]
            ],
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

