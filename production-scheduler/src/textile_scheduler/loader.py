"""Scenario file loading, statistics, and consistency checks.

This module is the single place that reads scenario JSON files into
:class:`Scenario` models. It also reports per-scenario statistics and
data-consistency warnings (dangling eligibility references, empty route
coverage, out-of-range windows) without rejecting files: callers decide
whether a warning is fatal. In particular, deadline misses are soft costs
and an order with no eligible machine is reported -- never silently dropped.
"""

from __future__ import annotations

import json
from pathlib import Path

from .durations import compute_duration
from .models import Scenario


def load_scenario_file(path: str | Path) -> Scenario:
    """Load a scenario JSON file into a validated Scenario model."""
    with open(path) as f:
        data = json.load(f)
    return Scenario.model_validate(data)


def scenario_stats(scenario: Scenario) -> dict:
    """Compute JSON-able summary statistics for a scenario."""
    machine_by_id = {m.id: m for m in scenario.machines}
    by_stage: dict[str, list] = {}
    for machine in scenario.machines:
        by_stage.setdefault(machine.stage.value, []).append(machine.id)

    best_case_load: dict[str, int] = {}
    for stage in scenario.route:
        total = 0
        for order in scenario.orders:
            eligible = order.eligible.get_machines(stage)
            machines = [machine_by_id[mid] for mid in eligible if mid in machine_by_id]
            if machines:
                total += min(compute_duration(order.metres, m.rate_m_per_hour) for m in machines)
        best_case_load[stage.value] = total

    capacity: dict[str, int] = {}
    for stage_value, ids in by_stage.items():
        total = 0
        for mid in ids:
            machine = machine_by_id[mid]
            limit = scenario.horizon
            if machine.available_until is not None:
                limit = min(limit, machine.available_until)
            downtime = sum(dt.end - dt.start for dt in machine.downtime)
            total += max(0, limit - downtime)
        capacity[stage_value] = total

    dues = [o.due for o in scenario.orders]
    yarn = [o.yarn_ready for o in scenario.orders]
    quantities = [o.metres for o in scenario.orders]

    return {
        "scenario_id": scenario.scenario_id,
        "orders": len(scenario.orders),
        "machines": len(scenario.machines),
        "machines_by_stage": {k: len(v) for k, v in by_stage.items()},
        "horizon": scenario.horizon,
        "now": scenario.now,
        "total_metres": sum(quantities),
        "due_min": min(dues) if dues else None,
        "due_max": max(dues) if dues else None,
        "yarn_ready_min": min(yarn) if yarn else None,
        "yarn_ready_max": max(yarn) if yarn else None,
        "downtime_windows": sum(len(m.downtime) for m in scenario.machines),
        "best_case_load_minutes": best_case_load,
        "capacity_minutes": capacity,
        "frozen_operations": len(scenario.frozen),
    }


def check_consistency(scenario: Scenario) -> list[str]:
    """Return human-readable data-consistency warnings (empty when clean).

    Checks machine eligibility references, route coverage per order and
    stage, and time-window plausibility. Deadline position is reported as
    information only: missing a deadline is a soft cost, never infeasibility.
    """
    warnings: list[str] = []
    machine_by_id = {m.id: m for m in scenario.machines}

    for order in scenario.orders:
        for stage in scenario.route:
            eligible = order.eligible.get_machines(stage)
            if not eligible:
                warnings.append(f"Order {order.id} has no eligible machine for {stage.value}")
                continue
            missing = [mid for mid in eligible if mid not in machine_by_id]
            if missing:
                warnings.append(
                    f"Order {order.id} references unknown machines for {stage.value}: {missing}"
                )
            wrong_stage = [
                mid
                for mid in eligible
                if mid in machine_by_id and machine_by_id[mid].stage != stage
            ]
            if wrong_stage:
                warnings.append(
                    f"Order {order.id} lists wrong-stage machines for {stage.value}: {wrong_stage}"
                )

    for machine in scenario.machines:
        for dt in machine.downtime:
            if dt.end > scenario.horizon:
                warnings.append(
                    f"Downtime on {machine.id} ({dt.start}-{dt.end}) "
                    f"exceeds horizon {scenario.horizon}"
                )

    for order in scenario.orders:
        if order.yarn_ready > order.due:
            warnings.append(
                f"Order {order.id} yarn_ready ({order.yarn_ready}) is after due ({order.due})"
            )
        if order.due > scenario.horizon:
            warnings.append(
                f"Order {order.id} due ({order.due}) is beyond horizon "
                f"({scenario.horizon}); tardiness is a soft cost"
            )

    if scenario.now > scenario.horizon:
        warnings.append(f"now ({scenario.now}) is beyond horizon ({scenario.horizon})")

    return warnings


def describe_scenario(scenario: Scenario) -> str:
    """One-paragraph human-readable summary of a scenario."""
    stats = scenario_stats(scenario)
    lines = [
        f"Scenario {stats['scenario_id']}: "
        f"{stats['orders']} orders, {stats['machines']} machines "
        f"({', '.join(f'{k}={v}' for k, v in sorted(stats['machines_by_stage'].items()))}), "
        f"horizon {stats['horizon']} min from now={stats['now']}.",
        f"Total {stats['total_metres']}m; due {stats['due_min']}-{stats['due_max']}; "
        f"yarn_ready {stats['yarn_ready_min']}-{stats['yarn_ready_max']}; "
        f"{stats['downtime_windows']} downtime windows; "
        f"{stats['frozen_operations']} frozen operations.",
    ]
    for stage in sorted(stats["best_case_load_minutes"]):
        load = stats["best_case_load_minutes"][stage]
        cap = stats["capacity_minutes"].get(stage, 0)
        ratio = load / cap if cap else 0.0
        lines.append(f"  {stage}: best-case load {load} / capacity {cap} ({ratio:.0%}).")
    return "\n".join(lines)
