"""Disruption handling for re-planning.

Implements freeze, split, and shift operations for machine breakdowns
and yarn delays.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import (
    Disruption,
    DisruptionType,
    DowntimeWindow,
    FrozenOperation,
    Machine,
    Order,
    Scenario,
    ScheduledOperation,
    Stage,
)


@dataclass
class ReplanDiff:
    """Difference between original and re-planned schedule."""

    moved_orders: list[dict]  # {order, old_completion, new_completion, delta_minutes}
    now_late: list[str]  # order IDs that became late
    now_at_risk: list[str]  # order IDs that are now at risk (>90% window)
    frozen_count: int
    split_count: int


def apply_disruption(
    scenario: Scenario,
    schedule_operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply a disruption to a scenario and schedule, returning modified versions.

    Returns new scenario, new frozen operations (from running ops), and diff.
    """
    if disruption.type == DisruptionType.MACHINE_DOWN:
        return _apply_machine_breakdown(scenario, schedule_operations, disruption)
    elif disruption.type == DisruptionType.YARN_DELAY:
        return _apply_yarn_delay(scenario, schedule_operations, disruption)
    else:
        raise ValueError(f"Unknown disruption type: {disruption.type}")


def _apply_machine_breakdown(
    scenario: Scenario,
    operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply machine breakdown disruption.

    - Freeze operations on other machines that are running at 'now'
    - Split operation on broken machine if it overlaps downtime
    - Add downtime window to machine
    """
    now = disruption.now
    machine_id = disruption.machine
    dt_from = disruption.from_minute
    dt_to = disruption.to_minute

    # Find the operation on the broken machine that overlaps downtime
    broken_op = None
    for op in operations:
        if op.machine == machine_id and op.start < dt_to and op.end > dt_from:
            broken_op = op
            break

    # Find operations running at 'now' on healthy machines (to freeze)
    frozen_ops: list[FrozenOperation] = []
    for op in operations:
        if op.machine != machine_id and op.start <= now < op.end:
            frozen_ops.append(
                FrozenOperation(
                    order=op.order,
                    stage=op.stage,
                    machine=op.machine,
                    start=op.start,
                    end=op.end,
                )
            )

    # Build new scenario
    if dt_from is None or dt_to is None or machine_id is None:
        raise ValueError("machine_down disruption requires machine, from, and to")
    new_machines = []
    for m in scenario.machines:
        if m.id == machine_id:
            # Add the breakdown downtime, preserving existing windows
            new_downtime = [
                *m.downtime,
                DowntimeWindow(from_minute=dt_from, to_minute=dt_to, reason="Breakdown"),
            ]
            new_machines.append(
                Machine(
                    id=m.id,
                    stage=m.stage,
                    rate_m_per_hour=m.rate_m_per_hour,
                    downtime=new_downtime,
                    status=m.status,
                    current_order=m.current_order,
                    progress_pct=m.progress_pct,
                )
            )
        else:
            new_machines.append(m)

    # Build new operations list (remove the broken operation, keep frozen)
    new_operations = []
    split_count = 0

    for op in operations:
        if (
            op.machine == machine_id
            and broken_op
            and op.order == broken_op.order
            and op.stage == broken_op.stage
        ):
            # This is the operation to split
            if op.start < dt_from and op.end > dt_from:
                # Split: part before downtime stays, part after becomes new operation
                # The completed part becomes frozen
                frozen_ops.append(
                    FrozenOperation(
                        order=op.order,
                        stage=op.stage,
                        machine=op.machine,
                        start=op.start,
                        end=dt_from,
                    )
                )
                # Remaining metres become a new operation at 'now'
                # Calculate remaining metres proportionally
                total_duration = op.end - op.start
                completed_duration = dt_from - op.start
                completed_ratio = completed_duration / total_duration
                # For simplicity, we keep the order and let the re-solver handle remaining metres
                # The frozen part is recorded, the rest is unscheduled
                split_count += 1
            # Don't add the broken operation to new_operations - it will be re-scheduled
        elif op.machine == machine_id and op.start >= dt_to:
            # Operation entirely after downtime - will be re-scheduled
            pass
        else:
            # Keep other operations (including frozen ones)
            new_operations.append(op)

    # Add frozen operations to the list
    for fo in frozen_ops:
        new_operations.append(
            ScheduledOperation(
                order=fo.order,
                stage=fo.stage,
                machine=fo.machine,
                start=fo.start,
                end=fo.end,
            )
        )

    # Create modified orders list (the split order has reduced metres for remaining)
    # For simplicity, we keep original orders and let solver handle it
    new_scenario = Scenario(
        name=f"{scenario.name}_replan",
        synthetic=True,
        now=now,
        horizon=scenario.horizon,
        route=scenario.route,
        machines=new_machines,
        orders=scenario.orders,
        frozen=frozen_ops,
    )

    # Compute diff
    diff = _compute_diff(
        scenario, operations, new_scenario, new_operations, frozen_ops, split_count
    )

    return new_scenario, new_operations, diff


def _apply_yarn_delay(
    scenario: Scenario,
    operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply yarn delay disruption.

    - Push the affected order's yarn_ready time later
    - Freeze operations already running at 'now' on healthy machines
    """
    now = disruption.now
    order_id = disruption.order
    delay_minutes = (disruption.hours or 0) * 60

    # Find operations running at 'now' (to freeze)
    frozen_ops: list[FrozenOperation] = []
    for op in operations:
        if op.start <= now < op.end:
            frozen_ops.append(
                FrozenOperation(
                    order=op.order,
                    stage=op.stage,
                    machine=op.machine,
                    start=op.start,
                    end=op.end,
                )
            )

    # Build new scenario with delayed yarn_ready
    new_orders = []
    for order in scenario.orders:
        if order.id == order_id:
            new_yarn_ready = order.yarn_ready + delay_minutes
            # Create new order with updated yarn_ready
            new_orders.append(
                Order(
                    id=order.id,
                    buyer=order.buyer,
                    fabric=order.fabric,
                    colour=order.colour,
                    metres=order.metres,
                    due=order.due,
                    priority_weight=order.priority_weight,
                    yarn_ready=new_yarn_ready,
                    eligible=order.eligible,
                )
            )
        else:
            new_orders.append(order)

    new_scenario = Scenario(
        name=f"{scenario.name}_replan",
        synthetic=True,
        now=now,
        horizon=scenario.horizon,
        route=scenario.route,
        machines=scenario.machines,
        orders=new_orders,
        frozen=frozen_ops,
    )

    # Keep non-frozen operations from before 'now'
    new_operations = []
    for op in operations:
        if op.end <= now:
            new_operations.append(op)
        elif any(
            fo.order == op.order and fo.stage == op.stage and fo.machine == op.machine
            for fo in frozen_ops
        ):
            new_operations.append(op)
        # Operations after 'now' on non-frozen machines will be re-scheduled

    diff = _compute_diff(scenario, operations, new_scenario, new_operations, frozen_ops, 0)

    return new_scenario, new_operations, diff


def _compute_diff(
    original_scenario: Scenario,
    original_ops: list[ScheduledOperation],
    new_scenario: Scenario,
    new_ops: list[ScheduledOperation],
    frozen_ops: list[FrozenOperation],
    split_count: int,
) -> ReplanDiff:
    """Compute difference between original and new schedule."""
    orig_completion = _get_completions(original_ops)
    new_completion = _get_completions(new_ops)

    moved = []
    now_late = []
    now_at_risk = []

    for order in original_scenario.orders:
        orig_c = orig_completion.get(order.id)
        new_c = new_completion.get(order.id)

        if orig_c is not None and new_c is not None and new_c != orig_c:
            delta = new_c - orig_c
            moved.append(
                {
                    "order": order.id,
                    "old_completion": orig_c,
                    "new_completion": new_c,
                    "delta_minutes": delta,
                }
            )

            # Check if now late
            if new_c > order.due and (orig_c is None or orig_c <= order.due):
                now_late.append(order.id)

            # Check if at risk (completion in last 10% of window)
            if new_c is not None:
                window = order.due - new_scenario.now
                if window > 0:
                    threshold = order.due - window * 0.1
                    if new_c >= threshold and new_c <= order.due:
                        now_at_risk.append(order.id)

    return ReplanDiff(
        moved_orders=moved,
        now_late=now_late,
        now_at_risk=now_at_risk,
        frozen_count=len(frozen_ops),
        split_count=split_count,
    )


def _get_completions(operations: list[ScheduledOperation]) -> dict[str, int]:
    """Get completion time per order (last operation end)."""
    completions: dict[str, int] = {}
    for op in operations:
        if op.order not in completions or op.end > completions[op.order]:
            completions[op.order] = op.end
    return completions
