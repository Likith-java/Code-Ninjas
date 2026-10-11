"""Simulation Service for Everest Textile Mills.

Implements the simulation clock (1 simulated minute = 1 real second)
and automatic production stage progression.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
import asyncio
import logging

from sqlalchemy import select, func
from sqlalchemy.orm import Session, selectinload

from app.database import SessionLocal
from app.models import (
    SimulationState,
    ProductionRun,
    Operation,
    Order,
    Machine,
    Worker,
    WorkerAssignment,
    FabricRoll,
    MaterialLot,
    InventoryMovement,
    Material,
)
from app.services.production import utc_now, sync_machine_state_after_run_change
from app.services.inventory import lot_balance, issue_yarn
from app.services.dispatch import derive_order_status

logger = logging.getLogger(__name__)


class SimulationService:
    """Background simulation service that advances production runs
    according to the simulation clock (1 sim minute = 1 real second)."""

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._tick_interval = 1.0  # real seconds per tick

    async def start(self) -> None:
        """Start the simulation loop."""
        if self._running:
            logger.warning("Simulation already running")
            return

        # Initialize simulation state in database
        self._ensure_simulation_state()

        self._running = True
        self._task = asyncio.create_task(self._simulation_loop())
        logger.info("Simulation service started")

    async def stop(self) -> None:
        """Stop the simulation loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Simulation service stopped")

    async def pause(self) -> None:
        """Pause the simulation."""
        with SessionLocal() as db:
            state = db.get(SimulationState, 1)
            if state:
                state.status = "paused"
                db.commit()
        logger.info("Simulation paused")

    async def resume(self) -> None:
        """Resume the simulation."""
        with SessionLocal() as db:
            state = db.get(SimulationState, 1)
            if state:
                state.status = "running"
                db.commit()
        logger.info("Simulation resumed")

    async def set_speed(self, speed: float) -> None:
        """Set simulation speed (simulated minutes per real second)."""
        with SessionLocal() as db:
            state = db.get(SimulationState, 1)
            if state:
                state.speed = speed
                db.commit()
        logger.info(f"Simulation speed set to {speed}x")

    def get_status(self) -> dict:
        """Get current simulation status."""
        with SessionLocal() as db:
            state = db.get(SimulationState, 1)
            if not state:
                return {"status": "stopped", "speed": 1.0, "simulated_time": 0}

            active_runs = db.scalar(
                select(func.count(ProductionRun.id)).where(
                    ProductionRun.run_kind == "actual",
                    ProductionRun.status == "running",
                )
            ) or 0

            blocked_ops = db.scalar(
                select(func.count(Operation.id)).where(
                    Operation.id.in_(
                        select(ProductionRun.operation_id).where(
                            ProductionRun.run_kind == "actual",
                            ProductionRun.status.in_(["planned", "waiting"]),
                        )
                    )
                )
            ) or 0

            return {
                "status": state.status,
                "speed": float(state.speed),
                "simulated_time": state.simulated_time,
                "last_tick_at": state.last_tick_at.isoformat() if state.last_tick_at else None,
                "active_runs": active_runs,
                "blocked_operations": blocked_ops,
            }

    def _ensure_simulation_state(self) -> None:
        """Ensure simulation state record exists."""
        with SessionLocal() as db:
            state = db.get(SimulationState, 1)
            if not state:
                state = SimulationState(id=1, status="stopped", speed=Decimal("1.0"), simulated_time=0)
                db.add(state)
                db.commit()

    async def _simulation_loop(self) -> None:
        """Main simulation loop - runs every real second."""
        while self._running:
            try:
                with SessionLocal() as db:
                    state = db.get(SimulationState, 1)
                    if not state or state.status != "running":
                        await asyncio.sleep(self._tick_interval)
                        continue

                    # Advance simulated time
                    sim_minutes_to_add = float(state.speed)
                    state.simulated_time += int(sim_minutes_to_add)
                    state.last_tick_at = utc_now()
                    db.commit()

                    # Process running production runs
                    await self._process_running_runs(db, sim_minutes_to_add)

            except Exception as e:
                logger.error(f"Error in simulation loop: {e}")

            await asyncio.sleep(self._tick_interval)

    async def _process_running_runs(self, db: Session, sim_minutes_elapsed: float) -> None:
        """Process all running production runs and advance their progress."""
        running_runs = db.scalars(
            select(ProductionRun)
            .options(
                selectinload(ProductionRun.operation).selectinload(Operation.order),
                selectinload(ProductionRun.machine),
            )
            .where(
                ProductionRun.run_kind == "actual",
                ProductionRun.status == "running",
            )
        ).all()

        for run in running_runs:
            try:
                await self._advance_run(db, run, sim_minutes_elapsed)
            except Exception as e:
                logger.error(f"Error advancing run {run.id}: {e}")
                db.rollback()

    async def _advance_run(self, db: Session, run: ProductionRun, sim_minutes_elapsed: float) -> None:
        """Advance a single production run by the elapsed simulated time."""
        if not run.operation or not run.operation.planned_duration_minutes:
            return

        planned_duration = run.operation.planned_duration_minutes
        if planned_duration <= 0:
            return

        # Calculate elapsed time for this run
        if run.start_time:
            real_elapsed = utc_now() - run.start_time
            # Convert real elapsed to simulated minutes based on simulation speed
            sim_elapsed = real_elapsed.total_seconds() / 60.0
        else:
            sim_elapsed = sim_minutes_elapsed

        progress = min(100, (sim_elapsed / planned_duration) * 100)

        # Check if run is complete
        if progress >= 100 or sim_elapsed >= planned_duration:
            await self._complete_run(db, run)
        else:
            # Update progress could be stored in a new field if needed
            pass

    async def _complete_run(self, db: Session, run: ProductionRun) -> None:
        """Complete a production run and trigger next stage."""
        now = utc_now()

        # Mark run as completed
        run.status = "completed"
        run.end_time = now
        run.output_metres = Decimal(str(run.operation.order.quantity_metres))

        # Release machine
        if run.machine:
            sync_machine_state_after_run_change(db, run.machine, exclude_run_id=run.id)

        # Release worker assignments
        assignments = db.scalars(
            select(WorkerAssignment).where(
                WorkerAssignment.production_run_id == run.id,
                WorkerAssignment.released_at.is_(None),
            )
        ).all()
        for assignment in assignments:
            assignment.released_at = now

        # Consume material for this operation
        await self._consume_material_for_run(db, run)

        # Check if this was the last operation (dyeing)
        order = run.operation.order
        if run.operation.stage == "dyeing":
            await self._create_fabric_lot(db, order, run)
        else:
            # Advance to next operation
            await self._start_next_operation(db, order, run.operation.sequence + 1)

        db.commit()

        # Update order derived status
        # This will be reflected when the dashboard queries

    async def _consume_material_for_run(self, db: Session, run: ProductionRun) -> None:
        """Consume yarn/material for the completed production run."""
        order = run.operation.order
        if not order:
            return

        # Find matching material for this order's fabric
        materials = db.scalars(
            select(Material).where(
                func.lower(Material.material_type) == order.fabric_type.lower(),
                func.lower(Material.colour) == order.colour.lower(),
            )
        ).all()

        if not materials:
            logger.warning(f"No matching material found for order {order.id} ({order.fabric_type} {order.colour})")
            return

        # Calculate required quantity
        for material in materials:
            required_kg = Decimal(str(order.quantity_metres)) * Decimal(str(material.yarn_kg_per_metre))

            # Find available lots for this material
            lots = db.scalars(
                select(MaterialLot)
                .options(selectinload(MaterialLot.material))
                .where(MaterialLot.material_id == material.id)
            ).all()

            remaining = required_kg
            for lot in lots:
                if remaining <= 0:
                    break
                available = lot_balance(db, lot.id)
                if available <= 0:
                    continue

                to_issue = min(remaining, available)
                if to_issue > 0:
                    try:
                        issue_yarn(
                            db,
                            lot_id=lot.id,
                            order_id=order.id,
                            quantity_kg=to_issue,
                            note=f"Consumed for {run.operation.stage} operation on order {order.id}",
                        )
                        remaining -= to_issue
                    except Exception as e:
                        logger.error(f"Failed to issue yarn from lot {lot.id}: {e}")
                        db.rollback()

    async def _start_next_operation(self, db: Session, order: Order, next_sequence: int) -> None:
        """Start the next operation in the sequence."""
        next_op = db.scalar(
            select(Operation)
            .options(selectinload(Operation.eligible_machines))
            .where(Operation.order_id == order.id, Operation.sequence == next_sequence)
        )

        if not next_op:
            logger.info(f"No next operation found for order {order.id} at sequence {next_sequence}")
            return

        # Check if there's already an actual run for this operation
        existing_run = db.scalar(
            select(ProductionRun).where(
                ProductionRun.order_id == order.id,
                ProductionRun.operation_id == next_op.id,
                ProductionRun.run_kind == "actual",
            )
        )
        if existing_run:
            logger.info(f"Actual run already exists for order {order.id} operation {next_op.id}")
            return

        # Find eligible machine
        eligible_machines = list(next_op.eligible_machines)
        if not eligible_machines:
            # Fallback to machines of correct type
            eligible_machines = db.scalars(
                select(Machine).where(
                    Machine.machine_type == next_op.stage,
                    Machine.is_active.is_(True),
                    Machine.state.notin_(["breakdown", "maintenance"]),
                )
            ).all()

        if not eligible_machines:
            logger.warning(f"No eligible machines for operation {next_op.id} ({next_op.stage})")
            return

        # Find available machine (not running, no downtime)
        now = utc_now()
        selected_machine = None
        for machine in eligible_machines:
            if not machine.is_active or machine.state in ("breakdown", "maintenance"):
                continue

            # Check for running actual run
            running = db.scalar(
                select(ProductionRun.id).where(
                    ProductionRun.machine_id == machine.id,
                    ProductionRun.run_kind == "actual",
                    ProductionRun.status == "running",
                ).limit(1)
            )
            if running:
                continue

            # Check downtime
            downtime = db.scalar(
                select(Downtime).where(
                    Downtime.machine_id == machine.id,
                    Downtime.start_time <= now,
                    Downtime.end_time.is_(None) | (Downtime.end_time > now),
                ).limit(1)
            )
            if downtime:
                continue

            selected_machine = machine
            break

        if not selected_machine:
            logger.warning(f"No available machine for operation {next_op.id} ({next_op.stage})")
            return

        # Create actual production run
        actual_run = ProductionRun(
            order_id=order.id,
            operation_id=next_op.id,
            machine_id=selected_machine.id,
            run_kind="actual",
            status="running",
            start_time=now,
            output_metres=Decimal("0.00"),
        )
        db.add(actual_run)

        # Update machine state
        selected_machine.state = "running"

        # Assign workers
        await self._assign_workers(db, actual_run, next_op, selected_machine)

        db.flush()

    async def _assign_workers(self, db: Session, run: ProductionRun, operation: Operation, machine: Machine) -> None:
        """Assign qualified workers to a production run."""
        # Find workers with matching skills for this stage
        skill_map = {
            "spinning": ["spinning_operator", "spinning_senior"],
            "weaving": ["weaving_operator", "weaving_senior"],
            "dyeing": ["dyeing_operator", "dyeing_senior"],
            "inspection": ["quality_inspector"],
        }
        required_skills = skill_map.get(operation.stage, ["operator"])

        # Find available workers with required skills
        for skill in required_skills:
            workers = db.scalars(
                select(Worker).where(
                    Worker.status == "active",
                    Worker.skills.op("@>")([skill]),  # JSONB contains
                )
            ).all()

            for worker in workers:
                # Check if worker is already assigned to a running run
                busy = db.scalar(
                    select(WorkerAssignment.id).where(
                        WorkerAssignment.worker_id == worker.id,
                        WorkerAssignment.released_at.is_(None),
                    ).limit(1)
                )
                if busy:
                    continue

                # Assign worker
                assignment = WorkerAssignment(
                    worker_id=worker.id,
                    operation_id=operation.id,
                    production_run_id=run.id,
                    role_in_run="operator" if skill != "quality_inspector" else "quality_check",
                )
                db.add(assignment)
                break  # Assign one worker per skill type

    async def _create_fabric_lot(self, db: Session, order: Order, completed_run: ProductionRun) -> None:
        """Create fabric lot after dyeing completion."""
        # Check if lot already exists for this order
        existing_lot = db.scalar(
            select(FabricRoll).where(FabricRoll.order_id == order.id).limit(1)
        )
        if existing_lot:
            logger.info(f"Fabric lot already exists for order {order.id}")
            return

        # Create fabric roll representing the finished fabric
        roll = FabricRoll(
            roll_code=f"LOT-{order.id:04d}-{completed_run.id:04d}",
            order_id=order.id,
            production_run_id=completed_run.id,
            metres=Decimal(str(order.quantity_metres)),
            status="awaiting_inspection",
        )
        db.add(roll)
        db.flush()

        logger.info(f"Created fabric lot {roll.roll_code} for order {order.id} ({order.quantity_metres}m)")


# Global simulation service instance
_simulation_service: Optional[SimulationService] = None


def get_simulation_service() -> SimulationService:
    """Get or create the global simulation service instance."""
    global _simulation_service
    if _simulation_service is None:
        _simulation_service = SimulationService()
    return _simulation_service


async def start_simulation() -> None:
    """Start the global simulation service."""
    service = get_simulation_service()
    await service.start()


async def stop_simulation() -> None:
    """Stop the global simulation service."""
    service = get_simulation_service()
    await service.stop()


async def pause_simulation() -> None:
    """Pause the global simulation service."""
    service = get_simulation_service()
    await service.pause()


async def resume_simulation() -> None:
    """Resume the global simulation service."""
    service = get_simulation_service()
    await service.resume()


async def set_simulation_speed(speed: float) -> None:
    """Set the global simulation speed."""
    service = get_simulation_service()
    await service.set_speed(speed)