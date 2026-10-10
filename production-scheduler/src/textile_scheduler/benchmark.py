"""EDF vs CP-SAT benchmark runner on identical immutable scenario snapshots.

Both schedulers receive the exact same frozen :class:`Scenario` object and a
canonical input hash is recorded to prove the comparison used identical
inputs. All numbers come from the shared :mod:`metrics` functions; raw
values are preserved and any rounding happens only when rendering reports.

Reading the comparison honestly:
- Percentage change is ``None`` (reported as N/A) when the baseline is zero.
- Higher utilisation is reported, never celebrated: it is not automatically
  better when delivery (tardiness / on-time rate) worsens.
- Failed or invalid runs are never scored as successful plans; they are
  reported separately with their status and reason.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from . import metrics as metrics_module
from .baseline import run_edf
from .loader import load_scenario_file
from .models import (
    Scenario,
    Schedule,
    SchedulerType,
    SolverStatus,
    ValidationStatus,
)
from .optimizer import optimize

#: PRD target: CP-SAT weighted tardiness at least this much lower (percent).
TARGET_IMPROVEMENT_PCT = 20.0

SUCCESS_STATUSES = (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)


@dataclass(frozen=True)
class BenchmarkConfig:
    """Reproducible benchmark configuration."""

    time_limit_seconds: float = 10.0
    random_seed: int = 42
    num_workers: int = 8
    target_improvement_pct: float = TARGET_IMPROVEMENT_PCT


class SolverRun(BaseModel):
    """One solver's measured run on a scenario snapshot."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    solver: SchedulerType
    status: SolverStatus
    validation_status: ValidationStatus
    violation_count: int = Field(ge=0)
    compute_seconds: float = Field(ge=0)
    weighted_tardiness: float = Field(ge=0)
    on_time_rate: float = Field(ge=0, le=1)
    makespan: int = Field(ge=0)
    utilisation: float = Field(ge=0, le=1)
    orders_total: int = Field(ge=0)
    orders_completed: int = Field(ge=0)
    orders_late: int = Field(ge=0)
    orders_at_risk: int = Field(ge=0)
    ok: bool
    error: str | None = None


class MetricDelta(BaseModel):
    """Absolute and percentage change for one metric (raw values)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    metric: str
    lower_is_better: bool
    advisory_only: bool = False
    edf: float
    cpsat: float
    absolute_change: float
    percent_change: float | None = None


class ScenarioComparison(BaseModel):
    """Side-by-side comparison for one scenario snapshot."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    scenario_id: str
    input_hash: str
    solver_config: dict[str, str | int | float | bool | None]
    edf: SolverRun
    cpsat: SolverRun
    deltas: list[MetricDelta]
    tardiness_improvement_pct: float | None = None
    target_pct: float
    target_met: bool | None = None
    note: str = ""


class ScenarioFailure(BaseModel):
    """A scenario that could not be compared, reported separately."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    scenario_id: str
    input_hash: str
    edf: SolverRun
    cpsat: SolverRun
    reason: str


class BenchmarkReport(BaseModel):
    """Full benchmark outcome across scenarios."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    generated_at: str
    target_pct: float
    comparisons: list[ScenarioComparison]
    failures: list[ScenarioFailure]
    summary: dict[str, str | int | float | bool | None]


def canonical_scenario_hash(scenario: Scenario) -> str:
    """Canonical sha256 hash proving the exact input snapshot compared."""
    canonical = json.dumps(scenario.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _failed_run(
    solver: SchedulerType, scenario: Scenario, status: SolverStatus, error: str
) -> SolverRun:
    orders_total = len(scenario.orders)
    return SolverRun(
        solver=solver,
        status=status,
        validation_status=ValidationStatus.INVALID,
        violation_count=0,
        compute_seconds=0.0,
        weighted_tardiness=0.0,
        on_time_rate=0.0,
        makespan=0,
        utilisation=0.0,
        orders_total=orders_total,
        orders_completed=0,
        orders_late=0,
        orders_at_risk=0,
        ok=False,
        error=error,
    )


def _run_edf(scenario: Scenario) -> SolverRun:
    try:
        schedule = run_edf(scenario)
    except RuntimeError as exc:
        return _failed_run(SchedulerType.EDF, scenario, SolverStatus.UNKNOWN, f"EDF failed: {exc}")
    return _run_from_schedule(SchedulerType.EDF, scenario, schedule)


def _run_cpsat(scenario: Scenario, config: BenchmarkConfig) -> SolverRun:
    try:
        schedule = optimize(
            scenario,
            time_limit_seconds=config.time_limit_seconds,
            random_seed=config.random_seed,
            num_workers=config.num_workers,
        )
    except RuntimeError as exc:
        return _failed_run(
            SchedulerType.CP_SAT, scenario, SolverStatus.UNKNOWN, f"CP-SAT failed: {exc}"
        )
    return _run_from_schedule(SchedulerType.CP_SAT, scenario, schedule)


def _run_from_schedule(solver: SchedulerType, scenario: Scenario, schedule: Schedule) -> SolverRun:
    metrics = schedule.metrics
    ok = schedule.status in SUCCESS_STATUSES and schedule.validation.is_valid
    return SolverRun(
        solver=solver,
        status=schedule.status,
        validation_status=schedule.validation.status,
        violation_count=len(schedule.validation.violations),
        compute_seconds=schedule.compute_seconds,
        weighted_tardiness=metrics.weighted_tardiness,
        on_time_rate=metrics.on_time_rate,
        makespan=metrics.makespan,
        utilisation=metrics.utilisation,
        orders_total=len(scenario.orders),
        orders_completed=metrics_module.count_completed_within_horizon(
            scenario, schedule.operations
        ),
        orders_late=metrics_module.count_late_orders(scenario, schedule.operations),
        orders_at_risk=metrics_module.count_at_risk_orders(scenario, schedule.operations),
        ok=ok,
        error=None if ok else "Run was not successful and valid; not scored as a plan.",
    )


def percent_change(baseline: float, candidate: float) -> float | None:
    """Percentage change of candidate vs baseline; None when baseline is zero."""
    if baseline == 0:
        return None
    return (candidate - baseline) / baseline * 100.0


def tardiness_improvement_pct(edf: float, cpsat: float) -> float | None:
    """Percentage lower weighted tardiness; None when the baseline is zero."""
    if edf == 0:
        return None
    return (edf - cpsat) / edf * 100.0


#: (metric, attribute, lower-is-better, advisory-only)
DELTA_METRICS: tuple[tuple[str, str, bool, bool], ...] = (
    ("weighted_tardiness", "weighted_tardiness", True, False),
    ("on_time_rate", "on_time_rate", False, False),
    ("makespan", "makespan", True, False),
    ("utilisation", "utilisation", False, True),
    ("compute_seconds", "compute_seconds", True, True),
    ("violation_count", "violation_count", True, False),
    ("orders_completed", "orders_completed", False, False),
    ("orders_late", "orders_late", True, False),
    ("orders_at_risk", "orders_at_risk", True, False),
)


def compare_runs(
    scenario: Scenario,
    edf: SolverRun,
    cpsat: SolverRun,
    config: BenchmarkConfig,
) -> ScenarioComparison | ScenarioFailure:
    """Compare two runs on the same snapshot; failures stay separate."""
    input_hash = canonical_scenario_hash(scenario)
    config_dict: dict[str, str | int | float | bool | None] = {
        "time_limit_seconds": config.time_limit_seconds,
        "random_seed": config.random_seed,
        "num_workers": config.num_workers,
        "target_improvement_pct": config.target_improvement_pct,
    }
    if not (edf.ok and cpsat.ok):
        failed = [
            f"{run.solver.value} ({run.status.value}"
            + (f": {run.error}" if run.error else "")
            + ")"
            for run in (edf, cpsat)
            if not run.ok
        ]
        return ScenarioFailure(
            scenario_id=scenario.scenario_id,
            input_hash=input_hash,
            edf=edf,
            cpsat=cpsat,
            reason="Not comparable: " + "; ".join(failed),
        )

    deltas = [
        MetricDelta(
            metric=name,
            lower_is_better=lower_is_better,
            advisory_only=advisory,
            edf=float(getattr(edf, attr)),
            cpsat=float(getattr(cpsat, attr)),
            absolute_change=float(getattr(cpsat, attr)) - float(getattr(edf, attr)),
            percent_change=percent_change(float(getattr(edf, attr)), float(getattr(cpsat, attr))),
        )
        for name, attr, lower_is_better, advisory in DELTA_METRICS
    ]
    improvement = tardiness_improvement_pct(edf.weighted_tardiness, cpsat.weighted_tardiness)
    target_met = improvement is not None and improvement >= config.target_improvement_pct
    note = ""
    if improvement is None:
        note = "Baseline weighted tardiness is zero; percentage improvement is N/A."
    return ScenarioComparison(
        scenario_id=scenario.scenario_id,
        input_hash=input_hash,
        solver_config=config_dict,
        edf=edf,
        cpsat=cpsat,
        deltas=deltas,
        tardiness_improvement_pct=improvement,
        target_pct=config.target_improvement_pct,
        target_met=target_met,
        note=note,
    )


def compare_scenario(
    scenario: Scenario, config: BenchmarkConfig
) -> ScenarioComparison | ScenarioFailure:
    """Run both solvers on one immutable snapshot and compare."""
    before = scenario.model_dump()
    edf = _run_edf(scenario)
    cpsat = _run_cpsat(scenario, config)
    assert scenario.model_dump() == before, "Benchmark inputs must stay immutable"
    return compare_runs(scenario, edf, cpsat, config)


def run_benchmark(scenario_paths: list[str | Path], config: BenchmarkConfig) -> BenchmarkReport:
    """Run the benchmark over every given scenario file."""
    comparisons: list[ScenarioComparison] = []
    failures: list[ScenarioFailure] = []
    for path in scenario_paths:
        scenario = load_scenario_file(path)
        outcome = compare_scenario(scenario, config)
        if isinstance(outcome, ScenarioComparison):
            comparisons.append(outcome)
        else:
            failures.append(outcome)

    applicable = [c for c in comparisons if c.tardiness_improvement_pct is not None]
    met = [c for c in applicable if c.target_met]
    summary: dict[str, str | int | float | bool | None] = {
        "scenarios_compared": len(comparisons),
        "scenarios_failed": len(failures),
        "target_applicable": len(applicable),
        "target_met": len(met),
        "mean_improvement_pct": (
            sum(c.tardiness_improvement_pct for c in applicable) / len(applicable)
            if applicable
            else None
        ),
    }
    return BenchmarkReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        target_pct=config.target_improvement_pct,
        comparisons=comparisons,
        failures=failures,
        summary=summary,
    )


def report_to_json(report: BenchmarkReport, path: str | Path) -> Path:
    """Write machine-readable JSON benchmark results (raw values)."""
    out = Path(path)
    out.write_text(report.model_dump_json(indent=2) + "\n")
    return out


def comparison_to_csv(report: BenchmarkReport, path: str | Path) -> Path:
    """Write the machine-readable side-by-side comparison table."""
    out = Path(path)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "scenario_id",
            "input_hash",
            "metric",
            "edf",
            "cpsat",
            "absolute_change",
            "percent_change",
            "lower_is_better",
            "advisory_only",
        ]
    )
    for comparison in report.comparisons:
        for delta in comparison.deltas:
            writer.writerow(
                [
                    comparison.scenario_id,
                    comparison.input_hash,
                    delta.metric,
                    delta.edf,
                    delta.cpsat,
                    delta.absolute_change,
                    "" if delta.percent_change is None else delta.percent_change,
                    delta.lower_is_better,
                    delta.advisory_only,
                ]
            )
    out.write_text(buffer.getvalue())
    return out


def _fmt(value: float | None, digits: int = 2) -> str:
    return "N/A" if value is None else f"{value:.{digits}f}"


def report_to_markdown(report: BenchmarkReport) -> str:
    """Render the concise Markdown benchmark report."""
    lines = [
        "# EDF vs CP-SAT benchmark",
        "",
        f"Generated at {report.generated_at}; target: CP-SAT weighted tardiness "
        f"at least {report.target_pct:.0f}% lower.",
        "",
        "## Summary",
        "",
        f"- Scenarios compared: {report.summary['scenarios_compared']}",
        f"- Scenarios failed/infeasible (reported separately): {report.summary['scenarios_failed']}",
        f"- Target applicable: {report.summary['target_applicable']}",
        f"- Target met: {report.summary['target_met']}",
        f"- Mean tardiness improvement: {_fmt(report.summary['mean_improvement_pct'])}%",
        "",
    ]
    for comparison in report.comparisons:
        lines += [
            f"## {comparison.scenario_id}",
            "",
            f"Input hash `{comparison.input_hash}`; "
            f"EDF {comparison.edf.status.value} "
            f"({comparison.edf.compute_seconds:.3f}s), "
            f"CP-SAT {comparison.cpsat.status.value} "
            f"({comparison.cpsat.compute_seconds:.3f}s).",
            "",
            "| metric | edf | cpsat | abs change | % change |",
            "|---|---|---|---|---|",
        ]
        for delta in comparison.deltas:
            lines.append(
                f"| {delta.metric} | {delta.edf:.4g} | {delta.cpsat:.4g} | "
                f"{delta.absolute_change:+.4g} | {_fmt(delta.percent_change)} |"
            )
        verdict = (
            "N/A (baseline tardiness is zero)"
            if comparison.tardiness_improvement_pct is None
            else (
                f"{comparison.tardiness_improvement_pct:.2f}% "
                f"({'MET' if comparison.target_met else 'NOT MET'})"
            )
        )
        lines += [
            "",
            f"Tardiness improvement: {verdict}.",
        ]
        if comparison.note:
            lines.append(f"Note: {comparison.note}")
        lines.append("")
    if report.failures:
        lines += ["## Failures and infeasible scenarios", ""]
        for failure in report.failures:
            lines += [
                f"### {failure.scenario_id}",
                "",
                f"Input hash `{failure.input_hash}`.",
                "",
                f"Reason: {failure.reason}.",
                f"EDF status {failure.edf.status.value}; "
                f"CP-SAT status {failure.cpsat.status.value}.",
                "",
            ]
    lines += [
        "## Reading guidance",
        "",
        "- Raw values are preserved in `results.json`; this report rounds display only.",
        "- Higher utilisation is not automatically better: it is reported alongside "
        "delivery metrics and must not override worsened tardiness or on-time rate.",
        "- Percentage change is N/A whenever the EDF baseline value is zero.",
        "",
    ]
    return "\n".join(lines)


def write_markdown(report: BenchmarkReport, path: str | Path) -> Path:
    """Write the Markdown benchmark report."""
    out = Path(path)
    out.write_text(report_to_markdown(report))
    return out
