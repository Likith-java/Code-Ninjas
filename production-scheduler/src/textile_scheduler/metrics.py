"""Schedule metrics computation.

Shared by every scheduler and the benchmark runner so all comparisons use
identical functions. Definitions:

- Weighted tardiness: ``sum(priority_weight * max(0, completion - due))``
  in priority-weighted minutes (same units as the CP-SAT objective).
- Makespan: minutes from the planning reference (``scenario.now``) to the
  final completion; ``0`` when nothing is scheduled.
- Utilisation: productive machine minutes divided by available machine
  minutes. Availability per machine is ``min(horizon, available_until)``
  minus downtime; a zero denominator yields ``0.0`` (never divides by zero).
- Delivery counts: completed within horizon, late (past due), at-risk
  (within the last 10% of the order-date-to-deadline window, same definition
  used for replan diffs).
"""

from __future__ import annotations

from collections import defaultdict

from .models import Machine, Order, Scenario, ScheduledOperation, ScheduleMetrics


def compute_metrics(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> ScheduleMetrics:
    """Compute all metrics for a schedule."""
    weighted_tardiness = _compute_weighted_tardiness(scenario, operations)
    on_time_rate = _compute_on_time_rate(scenario, operations)
    utilisation = _compute_utilisation(scenario, operations)
    makespan = _compute_makespan(scenario, operations)

    return ScheduleMetrics(
        weighted_tardiness=weighted_tardiness,
        on_time_rate=on_time_rate,
        utilisation=utilisation,
        makespan=makespan,
    )


def _completions(operations: list[ScheduledOperation]) -> dict[str, int]:
    """Latest end time per order."""
    completion_by_order: dict[str, int] = {}
    for op in operations:
        if op.order not in completion_by_order or op.end > completion_by_order[op.order]:
            completion_by_order[op.order] = op.end
    return completion_by_order


def order_completions(
    scenario: Scenario, operations: list[ScheduledOperation]
) -> dict[str, int | None]:
    """Completion minute per order, or None when the order has no operations."""
    done = _completions(operations)
    return {order.id: done.get(order.id) for order in scenario.orders}


def is_order_at_risk(completion: int, order: Order) -> bool:
    """An order is at risk when completion falls in the last 10% of its window.

    The window runs from the order date (``ordered_at``) to the deadline
    (``due``), per the PRD: at risk means
    ``due - 0.1 * (due - ordered_at) <= completion <= due``. Zero or negative
    windows are never at risk (already due or late). Lot-shortage risk is not
    modeled: the schema has no lot-level inventory tracking.
    """
    window = order.due - order.ordered_at
    if window <= 0:
        return False
    return order.due - 0.1 * window <= completion <= order.due


def count_completed_within_horizon(scenario: Scenario, operations: list[ScheduledOperation]) -> int:
    """Number of orders completed at or before the planning horizon."""
    return sum(
        1
        for completion in order_completions(scenario, operations).values()
        if completion is not None and completion <= scenario.horizon
    )


def count_late_orders(scenario: Scenario, operations: list[ScheduledOperation]) -> int:
    """Number of scheduled orders completing after their deadline."""
    completions = order_completions(scenario, operations)
    return sum(
        1 for order in scenario.orders if (c := completions[order.id]) is not None and c > order.due
    )


def count_at_risk_orders(scenario: Scenario, operations: list[ScheduledOperation]) -> int:
    """Number of scheduled, on-time orders completing in the risk window."""
    completions = order_completions(scenario, operations)
    total = 0
    for order in scenario.orders:
        completion = completions[order.id]
        if completion is None or completion > order.due:
            continue
        if is_order_at_risk(completion, order):
            total += 1
    return total


def _compute_weighted_tardiness(
    scenario: Scenario,
    operations: list[ScheduledOperation],
) -> float:
    """Sum over orders of priority-weighted late minutes."""
    completion_by_order = _completions(operations)

    total = 0.0
    for order in scenario.orders:
        completion = completion_by_order.get(order.id)
        if completion is None:
            # Order not scheduled - contributes nothing here; completeness
            # is a validator concern, never silently scored as on time.
            continue
        if completion > order.due:
            total += (completion - order.due) * order.priority_weight

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


def _compute_makespan(scenario: Scenario, operations: list[ScheduledOperation]) -> int:
    """Minutes from the planning reference (scenario.now) to final completion."""
    if not operations:
        return 0
    return max(0, max(op.end for op in operations) - scenario.now)


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
