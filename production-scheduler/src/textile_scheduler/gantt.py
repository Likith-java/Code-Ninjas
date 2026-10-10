"""Gantt chart export for schedules.

Converts schedule to JSON format suitable for Gantt chart libraries.
"""

from __future__ import annotations

from .models import Schedule, Scenario, ScheduledOperation
from .time_utils import minutes_to_hm


def schedule_to_gantt(schedule: Schedule, scenario: Scenario) -> dict:
    """Convert schedule to Gantt-compatible JSON structure.

    Returns dict with:
    - tasks: list of task objects for Gantt
    - machines: machine definitions
    - metadata: scenario info
    """
    machine_by_id = {m.id: m for m in scenario.machines}
    order_by_id = {o.id: o for o in scenario.orders}

    tasks = []
    for op in schedule.operations:
        order = order_by_id.get(op.order)
        machine = machine_by_id.get(op.machine)

        tasks.append(
            {
                "id": f"{op.order}_{op.stage.value}_{op.machine}",
                "order_id": op.order,
                "order_name": f"{order.fabric} {order.colour}" if order else op.order,
                "buyer": order.buyer if order else "Unknown",
                "stage": op.stage.value,
                "machine": op.machine,
                "machine_stage": machine.stage.value if machine else op.stage.value,
                "start": op.start,
                "end": op.end,
                "duration": op.end - op.start,
                "start_label": minutes_to_hm(op.start),
                "end_label": minutes_to_hm(op.end),
                "duration_label": minutes_to_hm(op.end - op.start),
                "priority": order.priority_weight if order else 1,
                "due": order.due if order else None,
                "yarn_ready": order.yarn_ready if order else None,
            }
        )

    machines = []
    for m in scenario.machines:
        machines.append(
            {
                "id": m.id,
                "stage": m.stage.value,
                "rate_m_per_hour": m.rate_m_per_hour,
                "downtime": [
                    {"from": dt.from_minute, "to": dt.to_minute, "reason": dt.reason}
                    for dt in m.downtime
                ],
            }
        )

    return {
        "scenario": schedule.scenario,
        "scheduler": schedule.scheduler.value,
        "status": schedule.status.value,
        "compute_seconds": schedule.compute_seconds,
        "now": scenario.now,
        "horizon": scenario.horizon,
        "tasks": tasks,
        "machines": machines,
        "metrics": {
            "weighted_tardiness": schedule.metrics.weighted_tardiness,
            "on_time_rate": schedule.metrics.on_time_rate,
            "utilisation": schedule.metrics.utilisation,
            "makespan": schedule.metrics.makespan,
        },
        "validation": {
            "is_valid": schedule.validation.is_valid,
            "violations": [
                {
                    "rule": v.rule,
                    "message": v.message,
                    "order": v.order,
                    "machine": v.machine,
                    "stage": v.stage.value if v.stage else None,
                }
                for v in schedule.validation.violations
            ],
        },
    }


def gantt_to_frappe_gantt(schedule: Schedule, scenario: Scenario) -> list[dict]:
    """Export to Frappe Gantt format (simple array of tasks)."""
    order_by_id = {o.id: o for o in scenario.orders}

    tasks = []
    for op in schedule.operations:
        order = order_by_id.get(op.order)
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
        data = schedule_to_gantt(schedule, scenario)
    elif format == "frappe":
        data = gantt_to_frappe_gantt(schedule, scenario)
    else:
        raise ValueError(f"Unknown format: {format}")

    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
