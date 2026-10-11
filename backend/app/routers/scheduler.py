import sys
from typing import Any, Literal, Optional
from pathlib import Path

# Ensure production-scheduler package is importable if not installed in current env
_SCHEDULER_SRC = Path(__file__).resolve().parents[3] / "production-scheduler" / "src"
if _SCHEDULER_SRC.exists() and str(_SCHEDULER_SRC) not in sys.path:
    sys.path.insert(0, str(_SCHEDULER_SRC))

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.scheduler_adapter import import_scheduler_output
from sqlalchemy.orm import Session

from textile_scheduler.baseline import run_edf, run_edf_baseline
from textile_scheduler.disruptions import replan as run_replan
from textile_scheduler.gantt import build_gantt_data
from textile_scheduler.loader import load_scenario_file, scenario_stats, check_consistency, describe_scenario
from textile_scheduler.models import (
    Disruption,
    DisruptionType,
    FailureResult,
    Scenario,
    Schedule,
    SchedulerType,
    SolverStatus,
)
from textile_scheduler.optimizer import optimize as run_cpsat_optimize
from textile_scheduler.validator import validate_schedule, ScheduleValidator

router = APIRouter(tags=["Production Scheduling"])

SCENARIOS_DIR = Path(__file__).resolve().parents[3] / "production-scheduler" / "scenarios"
SCENARIO_FILES = {
    "feasible_load": "feasible_load.json",
    "weaving_breakdown": "weaving_breakdown.json",
    "late_yarn_lot": "late_yarn_lot.json",
    "infeasible_load": "infeasible_load.json",
}


class ScenarioListItem(BaseModel):
    id: str
    name: str
    description: str
    orders: int
    machines: int
    machines_by_stage: dict[str, int]
    horizon: int
    now: int
    total_metres: int
    downtime_windows: int
    frozen_operations: int


class ScenarioDetail(BaseModel):
    scenario_id: str
    description: str
    synthetic_data: bool
    start: str | None
    now: int
    horizon: int
    route: list[str]
    machines: list[dict[str, Any]]
    orders: list[dict[str, Any]]
    frozen: list[dict[str, Any]]
    stats: dict[str, Any]
    consistency_warnings: list[str]


class RunSchedulerRequest(BaseModel):
    scenario_id: str
    solver: Literal["edf", "cpsat"] = "cpsat"
    time_limit_seconds: float = Field(default=10.0, ge=1.0, le=300.0)
    seed: int = Field(default=42, ge=0)
    workers: int = Field(default=8, ge=1, le=32)
    warm_start: bool = True


class RunSchedulerResponse(BaseModel):
    schedule: dict[str, Any]
    warning: str | None = None


class ValidationRequest(BaseModel):
    scenario_id: str
    schedule: dict[str, Any]


class ValidationResponse(BaseModel):
    status: str
    violations: list[dict[str, Any]]
    violation_count: int


class DisruptionRequest(BaseModel):
    scenario_id: str
    current_schedule: dict[str, Any]
    disruption_type: Literal["machine_down", "yarn_delay"]
    machine: str | None = None
    from_minute: int | None = None
    to_minute: int | None = None
    reason: str | None = None
    order: str | None = None
    hours: int | None = None
    delay_minutes: int | None = None
    now: int = 0
    solver: Literal["edf", "cpsat"] = "cpsat"
    time_limit_seconds: float = Field(default=10.0, ge=1.0, le=300.0)
    seed: int = Field(default=42, ge=0)


class DisruptionResponse(BaseModel):
    ok: bool
    schedule: dict[str, Any] | None = None
    error: str | None = None
    diff: dict[str, Any] | None = None
    previous_metrics: dict[str, Any] | None = None
    new_metrics: dict[str, Any] | None = None


class GanttResponse(BaseModel):
    scenario_id: str
    schedule_id: str
    solver: str
    status: str
    validation: dict[str, Any]
    time: dict[str, Any]
    metrics: dict[str, Any]
    rows: list[dict[str, Any]]


class CompareSchedulersRequest(BaseModel):
    scenario_id: str | None = None
    time_limit_seconds: float = Field(default=10.0, ge=1.0, le=300.0)
    seed: int = Field(default=42, ge=0)
    workers: int = Field(default=8, ge=1, le=32)



def _load_scenario(scenario_id: str) -> Scenario:
    """Load a scenario by ID."""
    if scenario_id not in SCENARIO_FILES:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found. Available: {list(SCENARIO_FILES.keys())}")
    
    scenario_path = SCENARIOS_DIR / SCENARIO_FILES[scenario_id]
    if not scenario_path.exists():
        raise HTTPException(status_code=404, detail=f"Scenario file not found: {scenario_path}")
    
    try:
        return load_scenario_file(scenario_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load scenario: {e}")


@router.get(
    "/scheduler/scenarios",
    response_model=list[ScenarioListItem],
    summary="List available scheduling scenarios",
)
def list_scenarios():
    """Return all available scenarios with summary statistics."""
    scenarios = []
    for scenario_id, filename in SCENARIO_FILES.items():
        scenario_path = SCENARIOS_DIR / filename
        if not scenario_path.exists():
            continue
        try:
            scenario = load_scenario_file(scenario_path)
            stats = scenario_stats(scenario)
            scenarios.append(ScenarioListItem(
                id=scenario_id,
                name=scenario_id.replace("_", " ").title(),
                description=scenario.description or "",
                orders=stats["orders"],
                machines=stats["machines"],
                machines_by_stage=stats["machines_by_stage"],
                horizon=stats["horizon"],
                now=stats["now"],
                total_metres=stats["total_metres"],
                downtime_windows=stats["downtime_windows"],
                frozen_operations=stats["frozen_operations"],
            ))
        except Exception:
            continue
    return scenarios


@router.get(
    "/scheduler/scenarios/{scenario_id}",
    response_model=ScenarioDetail,
    summary="Get detailed scenario information",
)
def get_scenario(scenario_id: str):
    """Return full scenario details including machines, orders, and statistics."""
    scenario = _load_scenario(scenario_id)
    stats = scenario_stats(scenario)
    warnings = check_consistency(scenario)
    
    return ScenarioDetail(
        scenario_id=scenario.scenario_id,
        description=scenario.description or "",
        synthetic_data=scenario.synthetic_data,
        start=scenario.start.isoformat() if scenario.start else None,
        now=scenario.now,
        horizon=scenario.horizon,
        route=[s.value for s in scenario.route],
        machines=[m.model_dump(mode="json") for m in scenario.machines],
        orders=[o.model_dump(mode="json") for o in scenario.orders],
        frozen=[f.model_dump(mode="json") for f in scenario.frozen],
        stats=stats,
        consistency_warnings=warnings,
    )


def _run_scheduler(scenario: Scenario, solver: str, time_limit: float, seed: int, workers: int, warm_start: bool) -> Schedule:
    """Run the specified scheduler on a scenario."""
    if solver == "edf":
        return run_edf(scenario)
    
    # CP-SAT
    warm_start_ops = None
    if warm_start:
        try:
            warm_start_ops = run_edf_baseline(scenario)
        except RuntimeError:
            warm_start_ops = None
    
    return run_cpsat_optimize(
        scenario=scenario,
        time_limit_seconds=time_limit,
        random_seed=seed,
        warm_start_ops=warm_start_ops,
        num_workers=workers,
    )


@router.post(
    "/scheduler/run",
    response_model=RunSchedulerResponse,
    summary="Run EDF baseline or CP-SAT optimizer on a scenario",
)
def run_scheduler(request: RunSchedulerRequest):
    """Execute EDF baseline or CP-SAT optimizer on the specified scenario."""
    scenario = _load_scenario(request.scenario_id)
    
    try:
        schedule = _run_scheduler(
            scenario=scenario,
            solver=request.solver,
            time_limit=request.time_limit_seconds,
            seed=request.seed,
            workers=request.workers,
            warm_start=request.warm_start,
        )
    except RuntimeError as e:
        if "OR-Tools not installed" in str(e):
            raise HTTPException(
                status_code=503,
                detail="CP-SAT optimizer unavailable: OR-Tools not installed. Install with: pip install -e '.[optimizer]'"
            )
        raise HTTPException(status_code=500, detail=f"Solver failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheduler error: {e}")
    
    warning = None
    if schedule.status != SolverStatus.FEASIBLE and schedule.status != SolverStatus.OPTIMAL:
        warning = f"Solver returned {schedule.status.value}"
    elif not schedule.validation.is_valid:
        warning = f"Validation found {len(schedule.validation.violations)} violations"
    
    return RunSchedulerResponse(
        schedule=schedule.model_dump(mode="json", by_alias=True),
        warning=warning,
    )


@router.post(
    "/scheduler/validate",
    response_model=ValidationResponse,
    summary="Run independent validation on a schedule",
)
def validate_schedule_endpoint(request: ValidationRequest):
    """Validate a schedule against its scenario using independent validation."""
    scenario = _load_scenario(request.scenario_id)
    
    try:
        schedule = Schedule.model_validate(request.schedule)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid schedule format: {e}")
    
    try:
        validator = ScheduleValidator(scenario)
        validation_result = validator.validate(schedule)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {e}")
    
    violations = [
        {
            "code": v.code,
            "rule": v.rule,
            "severity": v.severity.value,
            "message": v.message,
            "order": v.order,
            "machine": v.machine,
            "stage": v.stage.value if v.stage else None,
        }
        for v in validation_result.violations
    ]
    
    return ValidationResponse(
        status=validation_result.status.value,
        violations=violations,
        violation_count=len(violations),
    )


@router.post(
    "/scheduler/disruption",
    response_model=DisruptionResponse,
    summary="Simulate a disruption and re-plan",
)
def simulate_disruption(request: DisruptionRequest):
    """Apply a disruption to the current schedule and re-plan."""
    scenario = _load_scenario(request.scenario_id)
    
    # Build disruption object
    try:
        if request.disruption_type == "machine_down":
            if not request.machine or request.from_minute is None or request.to_minute is None:
                raise HTTPException(status_code=422, detail="machine_down requires machine, from_minute, to_minute")
            disruption = Disruption(
                type=DisruptionType.MACHINE_DOWN,
                machine=request.machine,
                from_minute=request.from_minute,
                to_minute=request.to_minute,
                reason=request.reason,
                now=request.now,
            )
        elif request.disruption_type == "yarn_delay":
            if not request.order:
                raise HTTPException(status_code=422, detail="yarn_delay requires order")
            if request.hours is None and request.delay_minutes is None:
                raise HTTPException(status_code=422, detail="yarn_delay requires hours or delay_minutes")
            disruption = Disruption(
                type=DisruptionType.YARN_DELAY,
                order=request.order,
                hours=request.hours,
                delay_minutes=request.delay_minutes,
                now=request.now,
            )
        else:
            raise HTTPException(status_code=422, detail=f"Unknown disruption type: {request.disruption_type}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid disruption: {e}")
    
    # Load current schedule
    try:
        current_schedule = Schedule.model_validate(request.current_schedule)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid current_schedule format: {e}")
    
    current_ops = current_schedule.operations
    
    # Run re-plan
    solver_type = SchedulerType.CP_SAT if request.solver == "cpsat" else SchedulerType.EDF
    try:
        result = run_replan(
            scenario=scenario,
            operations=current_ops,
            disruption=disruption,
            solver=request.solver,
            time_limit_seconds=request.time_limit_seconds,
            random_seed=request.seed,
        )
    except (RuntimeError, ValueError) as e:
        if "OR-Tools not installed" in str(e):
            raise HTTPException(
                status_code=503,
                detail="CP-SAT optimizer unavailable: OR-Tools not installed"
            )
        return DisruptionResponse(
            ok=False,
            error=f"Re-plan failed: {e}",
        )
    
    diff = result.diff
    
    if not result.ok or result.schedule is None:
        return DisruptionResponse(
            ok=False,
            error=result.error or "Re-plan failed without a schedule.",
            previous_metrics=result.previous_metrics.model_dump() if result.previous_metrics else None,
            new_metrics=None,
        )
    
    moved_order_list = [m["order"] if isinstance(m, dict) and "order" in m else str(m) for m in diff.moved_orders]
    moved_order_ids = set(moved_order_list)
    unchanged_orders = getattr(diff, "unchanged", [o.id for o in scenario.orders if o.id not in moved_order_ids])

    return DisruptionResponse(
        ok=True,
        schedule=result.schedule.model_dump(mode="json", by_alias=True),
        diff={
            "frozen_count": diff.frozen_count,
            "split_count": diff.split_count,
            "interrupted": diff.interrupted,
            "moved_orders": moved_order_list,
            "now_late": diff.now_late,
            "now_at_risk": diff.now_at_risk,
            "recovered": diff.recovered,
            "unchanged": unchanged_orders,
        },
        previous_metrics=result.previous_metrics.model_dump() if result.previous_metrics else None,
        new_metrics=result.schedule.metrics.model_dump() if result.schedule.metrics else None,
    )


@router.get(
    "/scheduler/gantt/{scenario_id}",
    response_model=GanttResponse,
    summary="Get Gantt chart data for a schedule",
)
def get_gantt_data(
    scenario_id: str,
    solver: Literal["edf", "cpsat"] = Query("cpsat", description="Scheduler used"),
    time_limit_seconds: float = Query(10.0, ge=1.0, le=300.0),
    seed: int = Query(42, ge=0),
    workers: int = Query(8, ge=1, le=32),
    warm_start: bool = Query(True),
):
    """Generate a schedule and return Gantt chart data."""
    scenario = _load_scenario(scenario_id)
    
    try:
        schedule = _run_scheduler(
            scenario=scenario,
            solver=solver,
            time_limit=time_limit_seconds,
            seed=seed,
            workers=workers,
            warm_start=warm_start,
        )
    except RuntimeError as e:
        if "OR-Tools not installed" in str(e):
            raise HTTPException(
                status_code=503,
                detail="CP-SAT optimizer unavailable: OR-Tools not installed"
            )
        raise HTTPException(status_code=500, detail=f"Scheduler error: {e}")
    
    gantt_data = build_gantt_data(schedule, scenario)
    return GanttResponse(**gantt_data)


@router.post(
    "/scheduler/compare",
    summary="Compare EDF vs CP-SAT on a scenario",
)
def compare_schedulers(
    scenario_id: str | None = Query(None, description="Scenario ID to compare"),
    payload: CompareSchedulersRequest | None = Body(None),
):
    """Run both EDF and CP-SAT on a scenario and return comparison."""
    actual_scenario_id = scenario_id or (payload.scenario_id if payload else None)
    if not actual_scenario_id:
        raise HTTPException(status_code=422, detail="scenario_id is required")

    time_limit_seconds = payload.time_limit_seconds if payload else 10.0
    seed = payload.seed if payload else 42
    workers = payload.workers if payload else 8

    scenario = _load_scenario(actual_scenario_id)
    
    results = {}
    
    # Run EDF
    try:
        edf_schedule = run_edf(scenario)
        results["edf"] = edf_schedule.model_dump(mode="json", by_alias=True)
    except RuntimeError as e:
        results["edf"] = {"error": f"EDF failed: {e}"}
    
    # Run CP-SAT
    try:
        cpsat_schedule = run_cpsat_optimize(
            scenario=scenario,
            time_limit_seconds=time_limit_seconds,
            random_seed=seed,
            warm_start_ops=run_edf_baseline(scenario),
            num_workers=workers,
        )
        results["cpsat"] = cpsat_schedule.model_dump(mode="json", by_alias=True)
    except RuntimeError as e:
        if "OR-Tools not installed" in str(e):
            results["cpsat"] = {"error": "CP-SAT unavailable: OR-Tools not installed"}
        else:
            results["cpsat"] = {"error": f"CP-SAT failed: {e}"}
    
    # Compute comparison metrics
    comparison = {}
    if "edf" in results and "cpsat" in results and "error" not in results["edf"] and "error" not in results["cpsat"]:
        edf_metrics = results["edf"].get("metrics", {})
        cpsat_metrics = results["cpsat"].get("metrics", {})
        
        def safe_pct_change(before: float, after: float) -> float | None:
            if before == 0:
                return None
            return ((after - before) / abs(before)) * 100
        
        comparison = {
            "weighted_tardiness": {
                "edf": edf_metrics.get("weighted_tardiness"),
                "cpsat": cpsat_metrics.get("weighted_tardiness"),
                "absolute_change": (
                    (cpsat_metrics.get("weighted_tardiness", 0) - edf_metrics.get("weighted_tardiness", 0))
                    if edf_metrics.get("weighted_tardiness") is not None and cpsat_metrics.get("weighted_tardiness") is not None
                    else None
                ),
                "percent_improvement": safe_pct_change(
                    edf_metrics.get("weighted_tardiness", 0),
                    cpsat_metrics.get("weighted_tardiness", 0)
                ),
            },
            "on_time_rate": {
                "edf": edf_metrics.get("on_time_rate"),
                "cpsat": cpsat_metrics.get("on_time_rate"),
                "absolute_change": (
                    (cpsat_metrics.get("on_time_rate", 0) - edf_metrics.get("on_time_rate", 0))
                    if edf_metrics.get("on_time_rate") is not None and cpsat_metrics.get("on_time_rate") is not None
                    else None
                ),
                "percent_improvement": safe_pct_change(
                    edf_metrics.get("on_time_rate", 0),
                    cpsat_metrics.get("on_time_rate", 0)
                ),
            },
            "makespan": {
                "edf": edf_metrics.get("makespan"),
                "cpsat": cpsat_metrics.get("makespan"),
                "absolute_change": (
                    (cpsat_metrics.get("makespan", 0) - edf_metrics.get("makespan", 0))
                    if edf_metrics.get("makespan") is not None and cpsat_metrics.get("makespan") is not None
                    else None
                ),
                "percent_improvement": safe_pct_change(
                    edf_metrics.get("makespan", 0),
                    cpsat_metrics.get("makespan", 0)
                ),
            },
            "utilisation": {
                "edf": edf_metrics.get("utilisation"),
                "cpsat": cpsat_metrics.get("utilisation"),
                "absolute_change": (
                    (cpsat_metrics.get("utilisation", 0) - edf_metrics.get("utilisation", 0))
                    if edf_metrics.get("utilisation") is not None and cpsat_metrics.get("utilisation") is not None
                    else None
                ),
                "percent_improvement": safe_pct_change(
                    edf_metrics.get("utilisation", 0),
                    cpsat_metrics.get("utilisation", 0)
                ),
            },
            "compute_seconds": {
                "edf": results["edf"].get("compute_seconds"),
                "cpsat": results["cpsat"].get("compute_seconds"),
            },
            "validation": {
                "edf": {"status": results["edf"].get("validation", {}).get("status"), "violations": len(results["edf"].get("validation", {}).get("violations", []))},
                "cpsat": {"status": results["cpsat"].get("validation", {}).get("status"), "violations": len(results["cpsat"].get("validation", {}).get("violations", []))},
            },
            "solver_status": {
                "edf": results["edf"].get("status"),
                "cpsat": results["cpsat"].get("status"),
            },
        }
    
    return {
        "scenario_id": scenario_id,
        "results": results,
        "comparison": comparison,
    }