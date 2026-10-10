"""Gantt data export for schedules.

Canonical output is one row per machine with operation and downtime bars,
stable-sorted for the frontend team. No colours or visual properties are
invented here: stable order IDs let the frontend assign colours
consistently. Times are integer minutes from the scenario start; the
scenario start timestamp is echoed explicitly when the scenario defines one.
"""

from __future__ import annotations

from .metrics import order_completions
from .models import Schedule, Scenario, ScheduledOperation


def _late_orders(scenario: Scenario, operations: list[ScheduledOperation]) -> set[str]:
    completions = order_completions(scenario, operations)
    return {
        order.id
        for order in scenario.orders
        if (c := completions.get(order.id)) is not None and c > order.due
    }


def build_gantt_data(schedule: Schedule, scenario: Scenario) -> dict:
    """Build the canonical machine-row Gantt structure.

    Rows are sorted by machine ID; bars within a row are sorted by
    ``(start, kind, order/machine)``. Operation bars carry order, stage,
    machine, start, end, duration, quantity, and late/frozen flags.
    Downtime windows are separate bars with their reason.
    """
    frozen_keys = {(f.order, f.stage, f.machine) for f in scenario.frozen}
    late = _late_orders(scenario, schedule.operations)

    ops_by_machine: dict[str, list] = {m.id: [] for m in scenario.machines}
    for op in schedule.operations:
        ops_by_machine.setdefault(op.machine, []).append(op)

    rows = []
    for machine in sorted(scenario.machines, key=lambda m: m.id):
        bars: list[dict] = []
        for op in ops_by_machine.get(machine.id, []):
            bars.append(
                {
                    "kind": "operation",
                    "order_id": op.order,
                    "stage": op.stage.value,
                    "machine_id": op.machine,
                    "start": op.start,
                    "end": op.end,
                    "duration": op.end - op.start,
                    "quantity_metres": op.quantity_metres,
                    "late": op.order in late,
                    "frozen": (op.order, op.stage, op.machine) in frozen_keys,
                }
            )
        for dt in machine.downtime:
            bars.append(
                {
                    "kind": "downtime",
                    "start": dt.start,
                    "end": dt.end,
                    "reason": dt.reason,
                }
            )
        bars.sort(
            key=lambda b: (
                b["start"],
                b["kind"],
                b.get("order_id", ""),
                b.get("machine_id", ""),
            )
        )
        rows.append(
            {
                "machine_id": machine.id,
                "stage": machine.stage.value,
                "rate_m_per_hour": machine.rate_m_per_hour,
                "bars": bars,
            }
        )

    # Operations referencing unknown machines (validator-flagged) are still
    # exported under their own row so no data is silently dropped.
    known_ids = {m.id for m in scenario.machines}
    for machine_id in sorted(set(ops_by_machine) - known_ids):
        bars = [
            {
                "kind": "operation",
                "order_id": op.order,
                "stage": op.stage.value,
                "machine_id": op.machine,
                "start": op.start,
                "end": op.end,
                "duration": op.end - op.start,
                "quantity_metres": op.quantity_metres,
                "late": op.order in late,
                "frozen": False,
            }
            for op in sorted(ops_by_machine[machine_id], key=lambda o: o.start)
        ]
        rows.append(
            {
                "machine_id": machine_id,
                "stage": None,
                "rate_m_per_hour": None,
                "bars": bars,
            }
        )

    start = scenario.start.isoformat() if scenario.start is not None else None
    return {
        "scenario_id": scenario.scenario_id,
        "schedule_id": schedule.id,
        "solver": schedule.solver.value,
        "status": schedule.status.value,
        "validation": {
            "status": schedule.validation.status.value,
            "violations": [
                {
                    "code": v.code,
                    "rule": v.rule,
                    "message": v.message,
                    "order": v.order,
                    "machine": v.machine,
                    "stage": v.stage.value if v.stage else None,
                }
                for v in schedule.validation.violations
            ],
        },
        "time": {
            "scenario_start": start,
            "unit": "minutes",
            "origin_minute": 0,
            "now": scenario.now,
            "horizon": scenario.horizon,
        },
        "metrics": {
            "weighted_tardiness": schedule.metrics.weighted_tardiness,
            "on_time_rate": schedule.metrics.on_time_rate,
            "utilisation": schedule.metrics.utilisation,
            "makespan": schedule.metrics.makespan,
        },
        "rows": rows,
    }


def schedule_to_gantt(schedule: Schedule, scenario: Scenario) -> dict:
    """Canonical Gantt export (machine rows)."""
    return build_gantt_data(schedule, scenario)


def gantt_to_frappe_gantt(schedule: Schedule, scenario: Scenario) -> list[dict]:
    """Export to Frappe Gantt format (simple array of tasks)."""
    tasks = []
    for op in schedule.operations:
        tasks.append(
            {
                "id": f"{op.order}_{op.stage.value}_{op.machine}",
                "name": f"{op.order} - {op.stage.value} on {op.machine}",
                "start": _minutes_to_date_string(op.start, scenario.now),
                "end": _minutes_to_date_string(op.end, scenario.now),
                "progress": 0,
                "dependencies": "",
                "custom_class": f"stage-{op.stage.value}",
            }
        )

    return tasks


def _minutes_to_date_string(minutes: int, base_minutes: int) -> str:
    """Convert minutes to ISO date string for Gantt libraries.

    Uses a fixed base date (2024-01-01) plus minutes offset.
    """
    from datetime import datetime, timedelta

    base = datetime(2024, 1, 1)
    dt = base + timedelta(minutes=minutes + base_minutes)
    return dt.strftime("%Y-%m-%d %H:%M")


def export_gantt_json(
    schedule: Schedule,
    scenario: Scenario,
    output_path: str,
    format: str = "standard",
) -> None:
    """Export schedule to Gantt JSON file."""
    import json

    if format == "standard":
        data = build_gantt_data(schedule, scenario)
    elif format == "frappe":
        data = gantt_to_frappe_gantt(schedule, scenario)
    else:
        raise ValueError(f"Unknown format: {format}")

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
