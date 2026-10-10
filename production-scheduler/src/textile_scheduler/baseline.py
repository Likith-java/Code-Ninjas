"""Earliest-Deadline-First (EDF) baseline scheduler.

Dispatches operations greedily by order deadline, respecting all constraints.
Used as warm-start for CP-SAT and as standalone baseline.
"""

from __future__ import annotations

from collections import defaultdict

from .models import (
    Machine,
    Order,
    Scenario,
    ScheduledOperation,
    Stage,
)
from .durations import compute_duration


class EDFScheduler:
    """Earliest Deadline First baseline scheduler.

    Algorithm:
    1. Sort orders by deadline (earliest first), then by priority (higher first)
    2. For each order in sorted order, schedule each stage on the earliest
       available eligible machine that satisfies all constraints
    3. Respects: machine eligibility, route order, machine capacity,
       downtime, yarn_ready, frozen operations, horizon
    """

    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.route_order = {stage: idx for idx, stage in enumerate(scenario.route)}
        self.frozen_ops = {(f.order, f.stage, f.machine): f for f in scenario.frozen}

        # Machine timeline: machine_id -> list of (start, end, order)
        self.machine_timeline: dict[str, list[tuple[int, int, str]]] = defaultdict(list)

        # Order progress: order_id -> {stage -> (start, end, machine)}
        self.order_progress: dict[str, dict[Stage, tuple[int, int, str]]] = defaultdict(dict)

        # Initialize with frozen operations
        self._initialize_frozen()

    def _initialize_frozen(self) -> None:
        """Add frozen operations to timeline."""
        for frozen in self.scenario.frozen:
            self.machine_timeline[frozen.machine].append((frozen.start, frozen.end, frozen.order))
            self.order_progress[frozen.order][frozen.stage] = (
                frozen.start,
                frozen.end,
                frozen.machine,
            )

    def _get_eligible_machines(self, order: Order, stage: Stage) -> list[Machine]:
        """Get eligible machines for an order at a stage, sorted by rate (fastest first)."""
        eligible_ids = order.eligible.get_machines(stage)
        machines = [self.machine_by_id[mid] for mid in eligible_ids if mid in self.machine_by_id]
        # Sort by rate descending (faster machines first)
        return sorted(machines, key=lambda m: m.rate_m_per_hour, reverse=True)

    def _machine_limit(self, machine: Machine) -> int:
        """Latest minute an operation may end on this machine."""
        if machine.available_until is not None:
            return min(self.scenario.horizon, machine.available_until)
        return self.scenario.horizon

    def _find_earliest_slot(
        self,
        machine: Machine,
        duration: int,
        earliest_start: int,
        order_id: str,
    ) -> int | None:
        """Find earliest available slot on machine after earliest_start.

        Returns start time or None if no slot within horizon.
        """
        timeline = sorted(self.machine_timeline[machine.id])
        limit = self._machine_limit(machine)
        if not timeline:
            start = max(earliest_start, 0)
            if start + duration > limit:
                return None
            return start

        # Check before first operation
        first_start = timeline[0][0]
        if earliest_start + duration <= first_start:
            return earliest_start

        # Check between operations
        for i in range(len(timeline) - 1):
            gap_start = max(earliest_start, timeline[i][1])
            gap_end = timeline[i + 1][0]
            if gap_start + duration <= gap_end:
                return gap_start

        # Check after last operation
        last_end = timeline[-1][1]
        start = max(earliest_start, last_end)
        if start + duration <= self._machine_limit(machine):
            return start

        return None

    def _check_downtime(self, machine: Machine, start: int, end: int) -> bool:
        """Check if [start, end) overlaps any downtime window."""
        for dt in machine.downtime:
            if start < dt.end and end > dt.start:
                return False
        return True

    def _find_slot_with_downtime(
        self,
        machine: Machine,
        duration: int,
        earliest_start: int,
        order_id: str,
    ) -> int | None:
        """Find slot that also avoids downtime.

        Simple approach: if slot overlaps downtime, push to after downtime and retry.
        """
        max_iterations = 100  # Prevent infinite loop
        start = earliest_start

        for _ in range(max_iterations):
            slot = self._find_earliest_slot(machine, duration, start, order_id)
            if slot is None:
                return None

            end = slot + duration
            if self._check_downtime(machine, slot, end):
                return slot

            # Push past the conflicting downtime
            for dt in machine.downtime:
                if slot < dt.end and end > dt.start:
                    start = dt.end
                    break
            else:
                return slot  # No conflict found

        return None

    def schedule_order(self, order: Order) -> list[ScheduledOperation] | None:
        """Schedule all stages for a single order.

        Returns list of operations or None if infeasible.
        """
        operations: list[ScheduledOperation] = []
        prev_end = 0

        for stage in self.scenario.route:
            # Check if already frozen
            frozen = None
            for fk, fv in self.frozen_ops.items():
                if fk[0] == order.id and fk[1] == stage:
                    frozen = fv
                    break

            if frozen:
                # Use frozen operation
                op = ScheduledOperation(
                    order=order.id,
                    stage=stage,
                    machine=frozen.machine,
                    start=frozen.start,
                    end=frozen.end,
                    quantity_metres=order.metres,
                )
                operations.append(op)
                prev_end = frozen.end
                continue

            # Find eligible machines
            machines = self._get_eligible_machines(order, stage)
            if not machines:
                return None  # No eligible machine

            earliest_start = max(prev_end, order.yarn_ready, self.scenario.now)

            # Try each machine in order of preference
            scheduled = False
            for machine in machines:
                duration = compute_duration(order.metres, machine.rate_m_per_hour)
                start = self._find_slot_with_downtime(machine, duration, earliest_start, order.id)
                if start is not None:
                    end = start + duration
                    # Add to timeline
                    self.machine_timeline[machine.id].append((start, end, order.id))
                    self.machine_timeline[machine.id].sort()
                    self.order_progress[order.id][stage] = (start, end, machine.id)

                    op = ScheduledOperation(
                        order=order.id,
                        stage=stage,
                        machine=machine.id,
                        start=start,
                        end=end,
                        quantity_metres=order.metres,
                    )
                    operations.append(op)
                    prev_end = end
                    scheduled = True
                    break

            if not scheduled:
                return None  # Could not schedule this stage

        return operations

    def solve(self) -> list[ScheduledOperation]:
        """Run EDF scheduling on all orders.

        Returns complete list of scheduled operations.
        Raises exception if any order cannot be scheduled.
        """
        # Sort orders by deadline, then by priority (descending)
        sorted_orders = sorted(
            self.scenario.orders,
            key=lambda o: (o.due, -o.priority_weight),
        )

        all_operations: list[ScheduledOperation] = []

        for order in sorted_orders:
            ops = self.schedule_order(order)
            if ops is None:
                raise RuntimeError(f"Failed to schedule order {order.id} with EDF")
            all_operations.extend(ops)

        return all_operations


def run_edf_baseline(scenario: Scenario) -> list[ScheduledOperation]:
    """Convenience function to run EDF baseline."""
    scheduler = EDFScheduler(scenario)
    return scheduler.solve()
