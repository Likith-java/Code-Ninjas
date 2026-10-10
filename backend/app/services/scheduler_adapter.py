from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, Operation, Order, ProductionRun
from app.services.production import ensure_utc, utc_now, validate_machine_eligibility


def resolve_order(db: Session, order_identifier: Any) -> Order:
    """
    Resolves an order from an integer ID or string identifier (e.g. 1 or 'ORD-001').
    """
    if isinstance(order_identifier, int):
        order = db.get(Order, order_identifier)
        if order is not None:
            return order
    elif isinstance(order_identifier, str):
        if order_identifier.isdigit():
            order = db.get(Order, int(order_identifier))
            if order is not None:
                return order
        # Strip prefixes like ORD-001 -> id 1
        clean = order_identifier.strip()
        if clean.upper().startswith("ORD-"):
            num_part = clean[4:].lstrip("0")
            if num_part.isdigit():
                order = db.get(Order, int(num_part))
                if order is not None:
                    return order

    raise HTTPException(
        status_code=404,
        detail=f"Order '{order_identifier}' not found in database for schedule import",
    )


def resolve_machine(db: Session, machine_identifier: Any) -> Machine:
    """
    Resolves a machine by integer ID or string machine_code (e.g. 'SPIN-01').
    """
    if isinstance(machine_identifier, int):
        machine = db.get(Machine, machine_identifier)
        if machine is not None:
            return machine
    elif isinstance(machine_identifier, str):
        clean = machine_identifier.strip()
        machine = db.scalar(select(Machine).where(Machine.machine_code == clean).limit(1))
        if machine is not None:
            return machine
        if clean.isdigit():
            machine = db.get(Machine, int(clean))
            if machine is not None:
                return machine

    raise HTTPException(
        status_code=404,
        detail=f"Machine '{machine_identifier}' not found in database for schedule import",
    )


def _process_schedule_import(
    db: Session,
    schedule_data: dict[str, Any],
    scenario_start: datetime | None = None,
) -> tuple[list[ProductionRun], int, int]:
    """
    Converts Member 1's validated schedule output into backend 'scheduled' ProductionRun records.
    
    Business Rules:
    1. Validates solver status (must be OPTIMAL or FEASIBLE).
    2. Validates validation status (must be 'valid').
    3. Maps operations by order and stage.
    4. Validates machine eligibility.
    5. Converts integer minute offsets into absolute UTC datetimes.
    6. Upserts scheduled runs (idempotent: avoids duplicate scheduled runs for same order/op/machine).
    7. Sets run_kind='scheduled' and status='planned' without changing actual output quantities.
    """
    # 1. Validate solver and schedule feasibility
    solver_status = str(schedule_data.get("status", "")).upper()
    if solver_status not in ("OPTIMAL", "FEASIBLE"):
        raise ValueError(f"Cannot import schedule with non-feasible solver status '{solver_status}'")

    val_status = schedule_data.get("validation_status")
    if val_status and str(val_status).lower() == "invalid":
        raise ValueError("Cannot import schedule failing validation rules")

    validation = schedule_data.get("validation", {})
    if isinstance(validation, dict) and validation.get("status") == "invalid":
        violations = validation.get("violations", [])
        raise ValueError(f"Cannot import schedule failing validation rules: {violations}")

    operations_data = schedule_data.get("operations") or schedule_data.get("schedule")
    if not operations_data or not isinstance(operations_data, list):
        raise ValueError("Schedule contains no scheduled operations list")

    base_time = ensure_utc(scenario_start) or utc_now()
    imported_runs: list[ProductionRun] = []
    created_count = 0
    updated_count = 0

    for op_entry in operations_data:
        order_ref = op_entry.get("order") if op_entry.get("order") is not None else op_entry.get("order_id")
        stage = str(op_entry.get("stage", "")).strip().lower()
        machine_ref = op_entry.get("machine") if op_entry.get("machine") is not None else op_entry.get("machine_code")
        start_min = op_entry.get("start") if op_entry.get("start") is not None else op_entry.get("start_minute")
        end_min = op_entry.get("end") if op_entry.get("end") is not None else op_entry.get("end_minute")
        op_id_ref = op_entry.get("operation_id")

        if order_ref is None or machine_ref is None or start_min is None or end_min is None:
            raise ValueError(f"Malformed operation in schedule data: {op_entry}")

        if int(end_min) < int(start_min):
            raise ValueError(f"Contradictory schedule times: end ({end_min}) cannot precede start ({start_min})")

        order = resolve_order(db, order_ref)
        machine = resolve_machine(db, machine_ref)

        # Locate matching operation for order and stage/operation_id
        if op_id_ref:
            operation = db.get(Operation, int(op_id_ref))
        elif stage:
            operation = db.scalar(
                select(Operation)
                .where(Operation.order_id == order.id, Operation.stage == stage)
                .limit(1)
            )
        else:
            operation = None

        if operation is None:
            raise ValueError(f"Operation not found for order #{order.id} (stage: {stage}, id: {op_id_ref})")

        # Validate machine eligibility
        if machine not in operation.eligible_machines:
            raise ValueError(f"Machine {machine.machine_code} is not eligible for operation #{operation.id} ({operation.stage})")

        start_time = base_time + timedelta(minutes=int(start_min))
        end_time = base_time + timedelta(minutes=int(end_min))

        # Check for existing scheduled run for this operation and machine (idempotent upsert)
        existing_run = db.scalar(
            select(ProductionRun)
            .where(
                ProductionRun.order_id == order.id,
                ProductionRun.operation_id == operation.id,
                ProductionRun.machine_id == machine.id,
                ProductionRun.run_kind == "scheduled",
            )
            .with_for_update()
            .limit(1)
        )

        if existing_run is not None:
            existing_run.start_time = start_time
            existing_run.end_time = end_time
            existing_run.status = "planned"
            run_record = existing_run
            updated_count += 1
        else:
            run_record = ProductionRun(
                order_id=order.id,
                operation_id=operation.id,
                machine_id=machine.id,
                run_kind="scheduled",
                status="planned",
                start_time=start_time,
                end_time=end_time,
                output_metres=None,
            )
            db.add(run_record)
            created_count += 1

        imported_runs.append(run_record)

    db.commit()
    for r in imported_runs:
        db.refresh(r)

    return imported_runs, created_count, updated_count


def import_schedule(
    db: Session,
    schedule_data: dict[str, Any],
    scenario_start: datetime | None = None,
) -> list[ProductionRun]:
    runs, _, _ = _process_schedule_import(db, schedule_data, scenario_start=scenario_start)
    return runs


def import_scheduler_output(
    db: Session,
    schedule_data: dict[str, Any],
    base_time: datetime | None = None,
) -> dict[str, Any]:
    """
    Adapter wrapper returning statistics and imported runs.
    """
    runs, created_count, updated_count = _process_schedule_import(db, schedule_data, scenario_start=base_time)
    return {
        "runs_created": created_count,
        "runs_updated": updated_count,
        "total_scheduled": len(runs),
        "runs": runs,
    }


