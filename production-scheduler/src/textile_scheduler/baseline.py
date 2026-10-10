"""Event-driven earliest-deadline-first (EDF) baseline scheduler.

Transparent heuristic baseline against which the CP-SAT optimiser is
evaluated on exactly the same scenario. Dispatches one ready operation at a
time: every operation whose predecessor is complete and whose yarn is
available is eligible, and the operation with the earliest due date wins.

Selection priority (fully deterministic):
  1. earliest due date,
  2. higher priority weight,
  3. stable order ID,
  4. route stage order.
Machine choice: earliest feasible completion time across all eligible
machines (per-machine duration from the shared utility, downtime avoided by
advancing past conflicting windows); ties broken by machine ID.

Hard constraints are never violated to improve due-date metrics: machine
reservations are conflict-free, downtime is avoided, yarn-ready times gate
the first operation of each order, route precedence gates later operations,
and nothing is placed past the horizon or machine availability. Orders that
cannot be scheduled raise an explicit error naming the order and stage --
they are never silently omitted.

Limitations (EDF is a comparison baseline, not an optimizer):
  - Greedy: an early choice can block a globally better arrangement; no
    backtracking or lookahead is performed.
  - Myopic machine choice: earliest completion now may starve a later,
    more urgent operation that only that machine can serve.
  - No preemption or splitting: operations occupy one machine contiguously.
  - Warm-start quality for CP-SAT varies; CP-SAT may substantially improve
    weighted tardiness on contended scenarios.
"""

from __future__ import annotations

import time

from .durations import compute_duration
from .metrics import compute_metrics
from .models import (
    Machine,
    Order,
    Scenario,
    Schedule,
    ScheduledOperation,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationResult,
)
from .validator import validate_schedule


class EDFScheduler:
    """Event-driven EDF dispatcher over a shared machine timeline."""

    def __init__(self, scenario: Scenario) -> None:
        self.scenario = scenario
        self.machine_by_id = {m.id: m for m in scenario.machines}
        self.order_by_id = {o.id: o for o in scenario.orders}
        self.stage_index = {stage: idx for idx, stage in enumerate(scenario.route)}

        # Machine timeline: machine_id -> list of (start, end, order)
        self.machine_timeline: dict[str, list[tuple[int, int, str]]] = {
            m.id: [] for m in scenario.machines
        }
        # Placed operations keyed by (order_id, stage).
        self.placed: dict[tuple[str, Stage], ScheduledOperation] = {}
        self._place_frozen()

    def _place_frozen(self) -> None:
        """Reserve frozen operations exactly as specified."""
        for frozen in self.scenario.frozen:
            self.machine_timeline[frozen.machine].append((frozen.start, frozen.end, frozen.order))
            self.placed[(frozen.order, frozen.stage)] = ScheduledOperation(
                order=frozen.order,
                stage=frozen.stage,
                machine=frozen.machine,
                start=frozen.start,
                end=frozen.end,
                quantity_metres=self.order_by_id[frozen.order].metres,
            )
        for timeline in self.machine_timeline.values():
            timeline.sort()

    def _machine_limit(self, machine: Machine) -> int:
        """Latest minute an operation may end on this machine."""
        if machine.available_until is not None:
            return min(self.scenario.horizon, machine.available_until)
        return self.scenario.horizon

    def _find_slot(self, machine: Machine, duration: int, earliest: int) -> int | None:
        """Earliest start >= earliest fitting timeline gaps and the limit."""
        limit = self._machine_limit(machine)
        timeline = sorted(self.machine_timeline[machine.id])
        if not timeline:
            return earliest if earliest + duration <= limit else None
        if earliest + duration <= timeline[0][0]:
            return earliest
        for i in range(len(timeline) - 1):
            gap_start = max(earliest, timeline[i][1])
            if gap_start + duration <= timeline[i + 1][0]:
                return gap_start
        start = max(earliest, timeline[-1][1])
        return start if start + duration <= limit else None

    def _find_slot_avoiding_downtime(
        self, machine: Machine, duration: int, earliest: int
    ) -> int | None:
        """Earliest slot that also avoids downtime, advancing past conflicts."""
        start = earliest
        for _ in range(100):  # bound the advance-and-retry loop
            slot = self._find_slot(machine, duration, start)
            if slot is None:
                return None
            end = slot + duration
            conflict = next(
                (dt for dt in machine.downtime if slot < dt.end and end > dt.start),
                None,
            )
            if conflict is None:
                return slot
            start = conflict.end
        return None

    def _ready(self, remaining: set[tuple[str, Stage]]) -> list[tuple[str, Stage]]:
        """Operations whose predecessor is placed (first stages always ready)."""
        ready = []
        for order_id, stage in remaining:
            idx = self.stage_index[stage]
            if idx == 0 or (order_id, self.scenario.route[idx - 1]) in self.placed:
                ready.append((order_id, stage))
        return ready

    def _priority(self, order_id: str, stage: Stage) -> tuple:
        order = self.order_by_id[order_id]
        return (order.due, -order.priority_weight, order_id, self.stage_index[stage])

    def _earliest_start(self, order: Order, stage: Stage) -> int:
        if self.stage_index[stage] == 0:
            return max(order.yarn_ready, self.scenario.now)
        prev = self.placed[(order.id, self.scenario.route[self.stage_index[stage] - 1])]
        return max(prev.end, self.scenario.now)

    def _place(self, order: Order, stage: Stage) -> ScheduledOperation:
        """Place one operation on its earliest-completing eligible machine."""
        eligible = [
            self.machine_by_id[mid]
            for mid in order.eligible.get_machines(stage)
            if mid in self.machine_by_id
        ]
        if not eligible:
            raise RuntimeError(
                f"Failed to schedule order {order.id} stage {stage.value} "
                f"with EDF: no eligible machine available"
            )
        earliest = self._earliest_start(order, stage)
        options: list[tuple[int, str, Machine, int]] = []
        for machine in eligible:
            duration = compute_duration(order.metres, machine.rate_m_per_hour)
            slot = self._find_slot_avoiding_downtime(machine, duration, earliest)
            if slot is not None:
                options.append((slot + duration, machine.id, machine, slot))
        if not options:
            raise RuntimeError(
                f"Failed to schedule order {order.id} stage {stage.value} "
                f"with EDF: no feasible slot within horizon"
            )
        end, _, machine, start = min(options)
        self.machine_timeline[machine.id].append((start, end, order.id))
        self.machine_timeline[machine.id].sort()
        op = ScheduledOperation(
            order=order.id,
            stage=stage,
            machine=machine.id,
            start=start,
            end=end,
            quantity_metres=order.metres,
        )
        self.placed[(order.id, stage)] = op
        return op

    def solve(self) -> list[ScheduledOperation]:
        """Dispatch all operations; raise explicitly when one cannot be placed."""
        remaining = {
            (o.id, stage) for o in self.scenario.orders for stage in self.scenario.route
        } - set(self.placed)
        while remaining:
            ready = self._ready(remaining)
            if not ready:
                blocked = sorted(f"{oid}/{stage.value}" for oid, stage in remaining)
                raise RuntimeError(
                    f"EDF deadlock: no ready operation but {len(remaining)} "
                    f"remain unscheduled: {blocked}"
                )
            order_id, stage = min(ready, key=lambda key: self._priority(*key))
            self._place(self.order_by_id[order_id], stage)
            remaining.remove((order_id, stage))
        return sorted(
            self.placed.values(),
            key=lambda op: (op.start, op.order, self.stage_index[op.stage]),
        )


def run_edf_baseline(scenario: Scenario) -> list[ScheduledOperation]:
    """Run EDF dispatch, returning placed operations (may raise RuntimeError)."""
    return EDFScheduler(scenario).solve()


def run_edf(scenario: Scenario) -> Schedule:
    """Run EDF dispatch and return a structured, validated schedule result.

    Tracks wall-clock dispatch time, computes metrics, and runs the
    independent validator on the complete schedule. A schedule with
    violations is marked MODEL_INVALID -- never published as successful.
    Unschedulable orders raise RuntimeError naming the order and stage.
    """
    started = time.perf_counter()
    operations = EDFScheduler(scenario).solve()
    compute_seconds = time.perf_counter() - started

    metrics = compute_metrics(scenario, operations)
    draft = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=SolverStatus.FEASIBLE,
        compute_seconds=compute_seconds,
        validation=ValidationResult(violations=[]),
        metrics=metrics,
        operations=operations,
    )
    validation = validate_schedule(scenario, draft)
    return Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=(SolverStatus.FEASIBLE if validation.is_valid else SolverStatus.MODEL_INVALID),
        compute_seconds=compute_seconds,
        validation=validation,
        metrics=metrics,
        operations=operations,
    )
