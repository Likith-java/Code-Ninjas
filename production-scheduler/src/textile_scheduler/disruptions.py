"""Disruption simulation and schedule replanning.

Given a previously validated schedule and a disruption request, this module
builds a modified scenario, re-solves the movable work, validates the final
plan, and returns a structured before-and-after diff.

Replanning policy (documented simplifications included):
- Completed operations (ended at or before ``now``) are immutable history:
  frozen at their exact intervals.
- Operations running at ``now`` on healthy machines are frozen with their
  start, machine, and committed execution.
- A breakdown interrupting a running operation splits it proportionally
  into a completed sub-lot (frozen, exact history) and a remainder sub-lot
  (a new ``<order>-R...`` order carrying the remaining metres through the
  full route). Completed plus remaining metres always equal the original
  quantity, so production is never double-counted. Restart policy is
  resume-remaining: no setup loss is modeled. A negligible (< 1m) completed
  quantity restarts from scratch instead.
- The frozen interrupted part ends where its exact computed duration ends
  (at or just before the breakdown start); any gap is wound-down time
  absorbed by the outage.
- The replanning reference ``now`` comes from the disruption; all unfrozen
  operations start at or after it.
- Tardiness never implies infeasibility: late orders are soft costs in both
  planning and replanning.
- Lot-level tracking is not modeled (the schema has no lot inventory), so
  yarn delays apply at order level; at-risk uses the order-date-to-deadline
  window only.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .baseline import run_edf
from .durations import compute_duration
from .metrics import compute_metrics, is_order_at_risk
from .models import (
    Disruption,
    DisruptionType,
    DowntimeWindow,
    FrozenOperation,
    Machine,
    Order,
    Scenario,
    Schedule,
    ScheduledOperation,
    ScheduleMetrics,
    SolverStatus,
    Stage,
)
from .optimizer import optimize


@dataclass
class ReplanDiff:
    """Difference between the original and re-planned schedule."""

    moved_orders: list[dict]  # {order, old_completion, new_completion, delta_minutes}
    now_late: list[str]  # order IDs newly late in the new plan
    now_at_risk: list[str]  # order IDs at risk in the new plan
    newly_at_risk: list[str] = field(default_factory=list)
    recovered: list[str] = field(default_factory=list)  # late before, on time now
    moved_operations: list[dict] = field(default_factory=list)
    interrupted: list[dict] = field(default_factory=list)
    metrics_before: ScheduleMetrics | None = None
    metrics_after: ScheduleMetrics | None = None
    impact: dict = field(default_factory=dict)  # disruption event details
    frozen_count: int = 0
    split_count: int = 0


@dataclass
class ReplanResult:
    """Structured replanning outcome; failures carry an error, never a plan."""

    ok: bool
    new_scenario: Scenario
    schedule: Schedule | None
    previous_metrics: ScheduleMetrics
    diff: ReplanDiff
    error: str | None = None


def apply_disruption(
    scenario: Scenario,
    schedule_operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply a disruption, returning the modified scenario, warm-start ops, and diff.

    Returns new scenario, warm-start operations (kept originals plus frozen
    copies, deduplicated by key), and a provisional diff. Use :func:`replan`
    for the full solve-validate-diff flow.
    """
    if disruption.type == DisruptionType.MACHINE_DOWN:
        return _apply_machine_breakdown(scenario, schedule_operations, disruption)
    if disruption.type == DisruptionType.YARN_DELAY:
        return _apply_yarn_delay(scenario, schedule_operations, disruption)
    raise ValueError(f"Unknown disruption type: {disruption.type}")


def _split_quantities(
    metres: int, rate_m_per_hour: int, elapsed_minutes: int
) -> tuple[int, int, int]:
    """Split an interrupted operation into completed and remaining metres.

    Returns ``(completed, remaining, exact_minutes)`` where ``exact_minutes``
    is ``compute_duration(completed, rate)`` and never exceeds the elapsed
    time. Completed plus remaining always equals ``metres``. A zero completed
    quantity means negligible progress: restart from scratch.
    """
    total = compute_duration(metres, rate_m_per_hour)
    if metres <= 1 or elapsed_minutes <= 0:
        return 0, metres, 0
    completed = min(metres - 1, (metres * elapsed_minutes) // total)
    while completed > 0 and compute_duration(completed, rate_m_per_hour) > elapsed_minutes:
        completed -= 1
    if completed <= 0:
        return 0, metres, 0
    return completed, metres - completed, compute_duration(completed, rate_m_per_hour)


def _remainder_id(order_id: str, existing_ids: set[str]) -> str:
    """Deterministic remainder-sub-lot ID that cannot collide."""
    candidate = f"{order_id}-R"
    while candidate in existing_ids:
        candidate += "R"
    return candidate


def _apply_machine_breakdown(
    scenario: Scenario,
    operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply machine breakdown disruption with explicit interruption modeling."""
    now = disruption.now
    machine_id = disruption.machine
    dt_from = disruption.from_minute
    dt_to = disruption.to_minute

    if dt_from is None or dt_to is None or machine_id is None:
        raise ValueError("machine_down disruption requires machine, from, and to")
    machine_by_id = {m.id: m for m in scenario.machines}
    if machine_id not in machine_by_id:
        raise ValueError(f"machine_down references unknown machine: {machine_id}")
    order_by_id = {o.id: o for o in scenario.orders}
    reason = disruption.reason or "Breakdown"

    # The running operation on the broken machine overlapping the downtime.
    broken_op = None
    for op in operations:
        if op.machine == machine_id and op.start < dt_to and op.end > dt_from:
            broken_op = op
            break

    # Operations running at 'now' on healthy machines (to freeze).
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

    # Split the interrupted operation into completed and remaining sub-lots.
    # Totals always balance: completed + remaining == original metres.
    new_orders: list[Order] = list(scenario.orders)
    interrupted: list[dict] = []
    split_count = 0
    if broken_op is not None and broken_op.start < dt_from < broken_op.end:
        split_order = order_by_id.get(broken_op.order)
        if split_order is not None:
            rate = machine_by_id[machine_id].rate_m_per_hour
            elapsed = dt_from - broken_op.start
            completed, remaining, exact = _split_quantities(split_order.metres, rate, elapsed)
            remainder_id: str | None = None
            if completed > 0:
                frozen_ops.append(
                    FrozenOperation(
                        order=split_order.id,
                        stage=broken_op.stage,
                        machine=machine_id,
                        start=broken_op.start,
                        end=broken_op.start + exact,
                        quantity_metres=completed,
                    )
                )
                remainder_id = _remainder_id(split_order.id, {o.id for o in new_orders})
                remainder = Order(
                    **{
                        **split_order.model_dump(),
                        "id": remainder_id,
                        "metres": remaining,
                    }
                )
                reduced = Order(**{**split_order.model_dump(), "metres": completed})
                new_orders = [reduced if o.id == split_order.id else o for o in new_orders]
                new_orders.append(remainder)
            interrupted.append(
                {
                    "order": split_order.id,
                    "stage": broken_op.stage.value,
                    "machine": machine_id,
                    "breakdown_from": dt_from,
                    "breakdown_to": dt_to,
                    "completed_metres": completed,
                    "remaining_metres": remaining,
                    "remainder_order": remainder_id,
                    "restart_policy": (
                        "resume-remaining"
                        if completed > 0
                        else "restart-negligible-progress-scrapped"
                    ),
                }
            )
            split_count += 1

    # Build new scenario with the downtime event applied.
    new_machines = []
    for m in scenario.machines:
        if m.id == machine_id:
            new_downtime = [
                *m.downtime,
                DowntimeWindow(start=dt_from, end=dt_to, reason=reason),
            ]
            new_machines.append(
                Machine(
                    id=m.id,
                    stage=m.stage,
                    rate_m_per_hour=m.rate_m_per_hour,
                    downtime=new_downtime,
                    available_until=m.available_until,
                    status=m.status,
                    current_order=m.current_order,
                    progress_pct=m.progress_pct,
                )
            )
        else:
            new_machines.append(m)

    # Warm-start list: drop the broken operation (re-solved), freeze history
    # (completed work is immutable), and never duplicate a frozen copy.
    new_operations = []
    prefrozen_keys = {(fo.order, fo.stage, fo.machine) for fo in frozen_ops}
    for op in operations:
        if (
            op.machine == machine_id
            and broken_op
            and op.order == broken_op.order
            and op.stage == broken_op.stage
        ):
            continue  # interrupted or blocked: re-solved, never kept as-is
        if op.machine == machine_id and op.start >= dt_to:
            pass  # entirely after downtime: re-solved
        elif op.end <= now:
            completed_order = order_by_id.get(op.order)
            frozen_ops.append(
                FrozenOperation(
                    order=op.order,
                    stage=op.stage,
                    machine=op.machine,
                    start=op.start,
                    end=op.end,
                    quantity_metres=(completed_order.metres if completed_order else None),
                )
            )
        elif (op.order, op.stage, op.machine) in prefrozen_keys:
            pass  # represented by its frozen copy below
        else:
            new_operations.append(op)

    for fo in frozen_ops:
        fo_order = order_by_id.get(fo.order)
        if fo_order is None:
            fo_order = next((o for o in new_orders if o.id == fo.order), None)
        new_operations.append(
            ScheduledOperation(
                order=fo.order,
                stage=fo.stage,
                machine=fo.machine,
                start=fo.start,
                end=fo.end,
                quantity_metres=(fo.quantity_metres or (fo_order.metres if fo_order else None)),
            )
        )

    new_scenario = Scenario(
        scenario_id=f"{scenario.scenario_id}_replan",
        synthetic_data=True,
        now=now,
        horizon=scenario.horizon,
        route=scenario.route,
        machines=new_machines,
        orders=new_orders,
        frozen=frozen_ops,
    )

    diff = _compute_diff(
        scenario,
        operations,
        new_scenario,
        new_operations,
        frozen_ops,
        split_count,
        disruption,
        interrupted,
    )
    return new_scenario, new_operations, diff


def _apply_yarn_delay(
    scenario: Scenario,
    operations: list[ScheduledOperation],
    disruption: Disruption,
) -> tuple[Scenario, list[ScheduledOperation], ReplanDiff]:
    """Apply yarn delay disruption (order-level; no lot tracking in schema)."""
    now = disruption.now
    order_id = disruption.order
    delay_minutes = disruption.delay_total_minutes

    order_by_id = {o.id: o for o in scenario.orders}
    if order_id not in order_by_id:
        raise ValueError(f"yarn_delay references unknown order: {order_id}")

    # Operations running at 'now' (to freeze).
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

    # Operations completed before 'now' are immutable history.
    for op in operations:
        if op.end <= now and not any(
            fo.order == op.order and fo.stage == op.stage and fo.machine == op.machine
            for fo in frozen_ops
        ):
            completed_order = order_by_id.get(op.order)
            frozen_ops.append(
                FrozenOperation(
                    order=op.order,
                    stage=op.stage,
                    machine=op.machine,
                    start=op.start,
                    end=op.end,
                    quantity_metres=(completed_order.metres if completed_order else None),
                )
            )

    # Build new scenario with delayed yarn_ready.
    new_orders = []
    for order in scenario.orders:
        if order.id == order_id:
            new_orders.append(
                Order(
                    id=order.id,
                    buyer=order.buyer,
                    fabric=order.fabric,
                    colour=order.colour,
                    metres=order.metres,
                    ordered_at=order.ordered_at,
                    due=order.due,
                    priority_weight=order.priority_weight,
                    yarn_ready=order.yarn_ready + delay_minutes,
                    eligible=order.eligible,
                )
            )
        else:
            new_orders.append(order)

    new_scenario = Scenario(
        scenario_id=f"{scenario.scenario_id}_replan",
        synthetic_data=True,
        now=now,
        horizon=scenario.horizon,
        route=scenario.route,
        machines=scenario.machines,
        orders=new_orders,
        frozen=frozen_ops,
    )

    # Warm-start list mirrors the breakdown path (no duplicates).
    new_operations = []
    frozen_keys = {(fo.order, fo.stage, fo.machine) for fo in frozen_ops}
    for op in operations:
        if op.end <= now or (op.order, op.stage, op.machine) in frozen_keys:
            frozen_copy = next(
                fo
                for fo in frozen_ops
                if (fo.order, fo.stage, fo.machine) == (op.order, op.stage, op.machine)
            )
            new_operations.append(
                ScheduledOperation(
                    order=op.order,
                    stage=op.stage,
                    machine=op.machine,
                    start=frozen_copy.start,
                    end=frozen_copy.end,
                    quantity_metres=op.quantity_metres,
                )
            )
        # Operations after 'now' on non-frozen machines will be re-scheduled

    diff = _compute_diff(
        scenario, operations, new_scenario, new_operations, frozen_ops, 0, disruption, []
    )

    return new_scenario, new_operations, diff


def _compute_diff(
    original_scenario: Scenario,
    original_ops: list[ScheduledOperation],
    new_scenario: Scenario,
    new_ops: list[ScheduledOperation],
    frozen_ops: list[FrozenOperation],
    split_count: int,
    disruption: Disruption | None = None,
    interrupted: list[dict] | None = None,
) -> ReplanDiff:
    """Compute the before-and-after difference between two operation lists."""
    orig_completion = _get_completions(original_ops)
    new_completion = _get_completions(new_ops)

    moved_orders = []
    moved_operations = []
    now_late = []
    new_risk_set: set[str] = set()
    old_risk_set: set[str] = set()
    recovered = []

    for order in new_scenario.orders:
        new_c = new_completion.get(order.id)
        orig_c = orig_completion.get(order.id)
        if orig_c is not None and new_c is not None and new_c != orig_c:
            moved_orders.append(
                {
                    "order": order.id,
                    "old_completion": orig_c,
                    "new_completion": new_c,
                    "delta_minutes": new_c - orig_c,
                }
            )
        if new_c is not None:
            if new_c > order.due and (orig_c is None or orig_c <= order.due):
                now_late.append(order.id)
            if is_order_at_risk(new_c, order):
                new_risk_set.add(order.id)
        if orig_c is not None and new_c is not None and orig_c > order.due and new_c <= order.due:
            recovered.append(order.id)

    for order in original_scenario.orders:
        orig_c = orig_completion.get(order.id)
        if orig_c is not None and is_order_at_risk(orig_c, order):
            old_risk_set.add(order.id)

    old_index = {(op.order, op.stage): op for op in original_ops}
    new_index: dict[tuple[str, Stage], list[ScheduledOperation]] = {}
    for op in new_ops:
        new_index.setdefault((op.order, op.stage), []).append(op)
    for (order_id, stage), ops in sorted(
        new_index.items(), key=lambda kv: (kv[0][0], kv[0][1].value)
    ):
        new_op = ops[0]
        old_op = old_index.get((order_id, stage))
        moved_operations.append(
            {
                "order": order_id,
                "stage": stage.value,
                "old_start": old_op.start if old_op else None,
                "new_start": new_op.start,
                "delta_minutes": (new_op.start - old_op.start if old_op else None),
                "old_machine": old_op.machine if old_op else None,
                "new_machine": new_op.machine,
                "machine_changed": bool(old_op and old_op.machine != new_op.machine),
            }
        )

    impact: dict = {}
    if disruption is not None:
        if disruption.type == DisruptionType.MACHINE_DOWN:
            impact = {
                "kind": "machine_down",
                "machine": disruption.machine,
                "from": disruption.from_minute,
                "to": disruption.to_minute,
                "reason": disruption.reason,
            }
        else:
            impact = {
                "kind": "yarn_delay",
                "order": disruption.order,
                "delay_minutes": disruption.delay_total_minutes,
            }

    return ReplanDiff(
        moved_orders=moved_orders,
        now_late=now_late,
        now_at_risk=sorted(new_risk_set),
        newly_at_risk=sorted(new_risk_set - old_risk_set),
        recovered=recovered,
        moved_operations=moved_operations,
        interrupted=interrupted or [],
        metrics_before=compute_metrics(original_scenario, original_ops),
        metrics_after=compute_metrics(new_scenario, new_ops),
        impact=impact,
        frozen_count=len(frozen_ops),
        split_count=split_count,
    )


def replan(
    scenario: Scenario,
    operations: list[ScheduledOperation],
    disruption: Disruption,
    *,
    solver: str = "cpsat",
    time_limit_seconds: float = 10.0,
    random_seed: int = 42,
    num_workers: int = 8,
) -> ReplanResult:
    """Full replan flow: apply, re-solve movable work, validate, diff.

    Returns a structured result. When no valid complete plan exists the
    result carries an explicit error and no schedule -- never a fabricated
    plan. Tardiness alone never fails a replan.
    """
    new_scenario, warm_ops, provisional = apply_disruption(scenario, operations, disruption)
    previous_metrics = compute_metrics(scenario, operations)

    if solver == "cpsat":
        schedule = optimize(
            new_scenario,
            time_limit_seconds=time_limit_seconds,
            random_seed=random_seed,
            warm_start_ops=warm_ops,
            num_workers=num_workers,
        )
    elif solver == "edf":
        try:
            schedule = run_edf(new_scenario)
        except RuntimeError as exc:
            return ReplanResult(
                ok=False,
                new_scenario=new_scenario,
                schedule=None,
                previous_metrics=previous_metrics,
                diff=provisional,
                error=f"replan failed: {exc}",
            )
    else:
        raise ValueError(f"Unknown solver: {solver}")

    final_diff = _compute_diff(
        scenario,
        operations,
        new_scenario,
        schedule.operations,
        new_scenario.frozen,
        provisional.split_count,
        disruption,
        provisional.interrupted,
    )

    if schedule.status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
        return ReplanResult(
            ok=True,
            new_scenario=new_scenario,
            schedule=schedule,
            previous_metrics=previous_metrics,
            diff=final_diff,
        )
    detail = "; ".join(v.code for v in schedule.validation.violations[:5])
    return ReplanResult(
        ok=False,
        new_scenario=new_scenario,
        schedule=None,
        previous_metrics=previous_metrics,
        diff=final_diff,
        error=(
            f"replan found no valid complete plan "
            f"(solver status {schedule.status.value}"
            + (f": {detail}" if detail else "")
            + "); warnings: "
            + "; ".join(schedule.warnings)
        ),
    )


def _get_completions(operations: list[ScheduledOperation]) -> dict[str, int]:
    """Get completion time per order (last operation end)."""
    completions: dict[str, int] = {}
    for op in operations:
        if op.order not in completions or op.end > completions[op.order]:
            completions[op.order] = op.end
    return completions
