"""Schedule metrics computation.

Computes weighted tardiness, on-time rate, utilisation, makespan.
"""

from __future__ import annotations

from collections import defaultdict

from .models import Machine, Order, Scenario, ScheduledOperation, ScheduleMetrics
from .durations import compute_duration


def compute_metrics(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> ScheduleMetrics:
    """Compute all metrics for a schedule."""
    weighted_tardiness = _compute_weighted_tardiness(scenario, operations)
    on_time_rate = _compute_on_time_rate(scenario, operations)
    utilisation = _compute_utilisation(scenario, operations)
    makespan = _compute_makespan(operations)

    return ScheduleMetrics(
        weighted_tardiness=weighted_tardiness,
        on_time_rate=on_time_rate,
        utilisation=utilisation,
        makespan=makespan,
    )


def _compute_weighted_tardiness(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> float:
    """Sum over orders of (days_late * priority_weight)."""
    completion_by_order: dict[str, int] = {}

    for op in operations:
        if op.order not in completion_by_order or op.end > completion_by_order[op.order]:
            completion_by_order[op.order] = op.end

    total = 0.0
    for order in scenario.orders:
        completion = completion_by_order.get(order.id)
        if completion is None:
            # Order not scheduled - treat as infinitely late
            continue
        if completion > order.due:
            days_late = (completion - order.due) / 1440.0  # minutes to days
            total += days_late * order.priority_weight

    return total


def _compute_on_time_rate(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> float:
    """Fraction of orders completed by their deadline."""
    if not scenario.orders:
        return 1.0

    completion_by_order: dict[str, int] = {}
    for op in operations:
        if op.order not in completion_by_order or op.end > completion_by_order[op.order]:
            completion_by_order[op.order] = op.end

    on_time = 0
    for order in scenario.orders:
        completion = completion_by_order.get(order.id)
        if completion is not None and completion <= order.due:
            on_time += 1

    return on_time / len(scenario.orders)


def _compute_utilisation(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> float:
    """Productive machine hours / available machine hours in horizon.

    Available hours excludes downtime and respects each machine's
    ``available_until`` horizon when set.
    """
    # Total productive minutes
    productive_minutes = 0
    for op in operations:
        productive_minutes += op.end - op.start

    # Available machine minutes (horizon * num_machines - downtime)
    total_available = 0
    for machine in scenario.machines:
        machine_available = _machine_available_minutes(scenario, machine)
        total_available += machine_available

    if total_available == 0:
        return 0.0

    return productive_minutes / total_available


def _compute_makespan(operations: list[ScheduledOperation]) -> int:
    """Latest end time across all operations."""
    if not operations:
        return 0
    return max(op.end for op in operations)


def _machine_available_minutes(scenario: Scenario, machine: Machine) -> int:
    """Available minutes for one machine: capped horizon minus downtime."""
    limit = scenario.horizon
    if machine.available_until is not None:
        limit = min(limit, machine.available_until)
    available = limit
    for dt in machine.downtime:
        available -= dt.end - dt.start
    return max(0, available)


def compute_order_details(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> list[dict]:
    """Compute per-order detail metrics for reporting."""
    completion_by_order: dict[str, int] = {}
    stages_by_order: dict[str, list[ScheduledOperation]] = defaultdict(list)

    for op in operations:
        stages_by_order[op.order].append(op)
        if op.order not in completion_by_order or op.end > completion_by_order[op.order]:
            completion_by_order[op.order] = op.end

    details = []
    for order in scenario.orders:
        completion = completion_by_order.get(order.id)
        tardiness_days = 0.0
        if completion is not None and completion > order.due:
            tardiness_days = (completion - order.due) / 1440.0

        details.append(
            {
                "order_id": order.id,
                "due": order.due,
                "completion": completion,
                "tardiness_days": tardiness_days,
                "priority_weight": order.priority_weight,
                "weighted_tardiness": tardiness_days * order.priority_weight,
                "on_time": completion is not None and completion <= order.due,
                "stages": [
                    {
                        "stage": op.stage.value,
                        "machine": op.machine,
                        "start": op.start,
                        "end": op.end,
                        "duration": op.end - op.start,
                    }
                    for op in sorted(stages_by_order.get(order.id, []), key=lambda x: x.start)
                ],
            }
        )

    return details


def compute_machine_utilisation(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> list[dict]:
    """Compute per-machine utilisation details."""
    machine_busy: dict[str, int] = defaultdict(int)
    machine_ops: dict[str, list[ScheduledOperation]] = defaultdict(list)

    for op in operations:
        machine_busy[op.machine] += op.end - op.start
        machine_ops[op.machine].append(op)

    details = []
    for machine in scenario.machines:
        busy = machine_busy.get(machine.id, 0)
        available = _machine_available_minutes(scenario, machine)

        details.append(
            {
                "machine_id": machine.id,
                "stage": machine.stage.value,
                "rate_m_per_hour": machine.rate_m_per_hour,
                "busy_minutes": busy,
                "available_minutes": available,
                "utilisation": busy / available if available > 0 else 0.0,
                "operations": [
                    {
                        "order": op.order,
                        "stage": op.stage.value,
                        "start": op.start,
                        "end": op.end,
                        "duration": op.end - op.start,
                    }
                    for op in sorted(machine_ops.get(machine.id, []), key=lambda x: x.start)
                ],
            }
        )

    return details
