"""CLI entry point for textile-scheduler.

Machine-readable JSON is the only content ever written to stdout (or the
explicit ``-o`` file); all diagnostics go to stderr. Exit codes: 0 success,
1 malformed input or usage error, 2 infeasible scenario, solver failure, or
invalid schedule (a JSON failure/result record is still emitted first).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import NoReturn

import click
from pydantic import ValidationError as PydanticValidationError

from .baseline import run_edf, run_edf_baseline
from .durations import compute_duration
from .gantt import export_gantt_json
from .loader import load_scenario_file
from .models import (
    Disruption,
    DisruptionType,
    FailureResult,
    Scenario,
    Schedule,
    SchedulerType,
    SolverStatus,
)
from .optimizer import optimize as run_cpsat_optimize

EXIT_USAGE = 1
EXIT_SOLVER = 2


def load_scenario(path: str) -> Scenario:
    """Load scenario from JSON file."""
    return load_scenario_file(path)


def _load_or_exit(scenario_path: Path) -> Scenario:
    """Load a scenario file; malformed input exits with code 1."""
    try:
        return load_scenario(str(scenario_path))
    except FileNotFoundError:
        click.echo(f"Error: scenario file not found: {scenario_path}", err=True)
        sys.exit(EXIT_USAGE)
    except json.JSONDecodeError as exc:
        click.echo(f"Error: malformed JSON in {scenario_path}: {exc}", err=True)
        sys.exit(EXIT_USAGE)
    except PydanticValidationError as exc:
        click.echo(f"Error: scenario validation failed: {exc}", err=True)
        sys.exit(EXIT_USAGE)
    raise AssertionError("unreachable")


def _emit_json(model: Schedule | FailureResult, output: str | None) -> None:
    """Write machine-readable JSON to stdout or the requested file."""
    text = json.dumps(model.model_dump(mode="json", by_alias=True), indent=2)
    if output:
        Path(output).write_text(text)
        click.echo(f"Wrote {output}", err=True)
    else:
        click.echo(text)


def save_schedule(schedule: Schedule, output: str | None) -> None:
    """Save schedule to file or stdout (JSON only)."""
    _emit_json(schedule, output)


def _emit_failure(
    scenario_id: str | None,
    solver: SchedulerType | None,
    status: SolverStatus,
    error: str,
    output: str | None,
) -> NoReturn:
    """Emit an explicit JSON failure record, then exit with code 2."""
    _emit_json(
        FailureResult(scenario_id=scenario_id, solver=solver, status=status, error=error),
        output,
    )
    sys.exit(EXIT_SOLVER)


@click.group()
@click.version_option(version="0.1.0")
def main() -> None:
    """Textile Production Scheduler - CP-SAT based scheduling engine."""
    pass


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "-o", "--output", type=click.Path(path_type=Path), help="Output file (default: stdout)"
)
@click.option("--validate/--no-validate", default=True, help="Show validation warnings")
def run(scenario_path: Path, output: Path | None, validate: bool) -> None:
    """Run EDF baseline scheduler on a scenario."""
    scenario = _load_or_exit(scenario_path)
    click.echo(
        f"Loaded scenario: {scenario.scenario_id} ({len(scenario.orders)} orders, "
        f"{len(scenario.machines)} machines)",
        err=True,
    )

    try:
        schedule = run_edf(scenario)
    except RuntimeError as exc:
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.EDF,
            SolverStatus.UNKNOWN,
            f"EDF failed: {exc}",
            str(output) if output else None,
        )

    click.echo(
        f"Scheduled {len(schedule.operations)} operations "
        f"({schedule.status.value} in {schedule.compute_seconds:.3f}s)",
        err=True,
    )
    if validate and not schedule.validation.is_valid:
        click.echo(
            f"WARNING: Validation found {len(schedule.validation.violations)} violations",
            err=True,
        )
        for v in schedule.validation.violations:
            click.echo(f"  {v.code}: {v.message}", err=True)

    save_schedule(schedule, str(output) if output else None)
    if schedule.status != SolverStatus.FEASIBLE or not schedule.validation.is_valid:
        sys.exit(EXIT_SOLVER)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "-o", "--output", type=click.Path(path_type=Path), help="Output file (default: stdout)"
)
@click.option("--time-limit", default=10.0, help="Solver time limit in seconds")
@click.option("--seed", default=42, help="Random seed for reproducibility")
@click.option("--workers", default=8, help="CP-SAT worker count")
@click.option("--warm-start/--no-warm-start", default=True, help="Use EDF baseline as warm start")
def optimize(
    scenario_path: Path,
    output: Path | None,
    time_limit: float,
    seed: int,
    workers: int,
    warm_start: bool,
) -> None:
    """Run CP-SAT optimizer on a scenario (requires ortools)."""
    scenario = _load_or_exit(scenario_path)
    click.echo(
        f"Loaded scenario: {scenario.scenario_id} ({len(scenario.orders)} orders, "
        f"{len(scenario.machines)} machines)",
        err=True,
    )

    warm_start_ops = None
    if warm_start:
        click.echo("Computing EDF warm start...", err=True)
        try:
            warm_start_ops = run_edf_baseline(scenario)
        except RuntimeError as exc:
            # Hints are optional guidance: a failed baseline must not abort
            # the optimisation itself.
            click.echo(
                f"WARNING: EDF warm start failed ({exc}); continuing without hints.", err=True
            )
            warm_start_ops = None
        else:
            click.echo(f"EDF scheduled {len(warm_start_ops)} operations", err=True)

    click.echo(
        f"Running CP-SAT optimizer (time_limit={time_limit}s, seed={seed}, workers={workers})...",
        err=True,
    )
    try:
        schedule = run_cpsat_optimize(
            scenario=scenario,
            time_limit_seconds=time_limit,
            random_seed=seed,
            warm_start_ops=warm_start_ops,
            num_workers=workers,
        )
    except RuntimeError as exc:
        if "OR-Tools not installed" in str(exc):
            click.echo(
                "Error: OR-Tools not installed. Run: pip install -e .[optimizer]",
                err=True,
            )
            sys.exit(EXIT_USAGE)
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.CP_SAT,
            SolverStatus.UNKNOWN,
            f"CP-SAT failed: {exc}",
            str(output) if output else None,
        )
    click.echo(
        f"Solver status: {schedule.status.value} (took {schedule.compute_seconds:.2f}s)",
        err=True,
    )
    click.echo(f"Scheduled {len(schedule.operations)} operations", err=True)
    for warning in schedule.warnings:
        click.echo(f"NOTE: {warning}", err=True)

    if not schedule.validation.is_valid:
        click.echo(
            f"WARNING: Validation found {len(schedule.validation.violations)} violations",
            err=True,
        )
        for v in schedule.validation.violations:
            click.echo(f"  {v.code}: {v.message}", err=True)

    save_schedule(schedule, str(output) if output else None)
    if schedule.status not in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE):
        sys.exit(EXIT_SOLVER)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option("--machine-down", help="Machine ID for breakdown")
@click.option("--from", "from_minute", type=int, help="Downtime start minute")
@click.option("--to", "to_minute", type=int, help="Downtime end minute")
@click.option("--yarn-delay", help="Order ID for yarn delay")
@click.option("--hours", type=int, help="Delay in hours")
@click.option("--delay-minutes", type=int, help="Delay in minutes (canonical)")
@click.option("--reason", default=None, help="Breakdown reason")
@click.option("--solver", type=click.Choice(["cpsat", "edf"]), default="cpsat")
@click.option("--now", type=int, default=0, help="Current time (minutes)")
@click.option("--time-limit", default=10.0, help="Solver time limit")
@click.option("--seed", default=42, help="Random seed")
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Output file")
def replan(
    scenario_path: Path,
    machine_down: str | None,
    from_minute: int | None,
    to_minute: int | None,
    yarn_delay: str | None,
    hours: int | None,
    delay_minutes: int | None,
    reason: str | None,
    solver: str,
    now: int,
    time_limit: float,
    seed: int,
    output: Path | None,
) -> None:
    """Re-plan after a disruption (machine breakdown or yarn delay)."""
    from .disruptions import replan as run_replan

    scenario = _load_or_exit(scenario_path)
    click.echo(f"Loaded scenario: {scenario.scenario_id}", err=True)

    # Build disruption object
    if machine_down:
        if from_minute is None or to_minute is None:
            click.echo("Error: --from and --to required for machine breakdown", err=True)
            sys.exit(EXIT_USAGE)
        try:
            disruption = Disruption(
                type=DisruptionType.MACHINE_DOWN,
                machine=machine_down,
                from_minute=from_minute,
                to_minute=to_minute,
                reason=reason,
                now=now,
            )
        except PydanticValidationError as exc:
            click.echo(f"Error: invalid disruption: {exc}", err=True)
            sys.exit(EXIT_USAGE)
    elif yarn_delay:
        if hours is None and delay_minutes is None:
            click.echo("Error: --hours or --delay-minutes required for yarn delay", err=True)
            sys.exit(EXIT_USAGE)
        try:
            disruption = Disruption(
                type=DisruptionType.YARN_DELAY,
                order=yarn_delay,
                hours=hours,
                delay_minutes=delay_minutes,
                now=now,
            )
        except PydanticValidationError as exc:
            click.echo(f"Error: invalid disruption: {exc}", err=True)
            sys.exit(EXIT_USAGE)
    else:
        click.echo("Error: Either --machine-down or --yarn-delay required", err=True)
        sys.exit(EXIT_USAGE)

    # Current validated schedule, then the full replan flow
    click.echo("Computing current schedule (EDF)...", err=True)
    try:
        current_ops = run_edf_baseline(scenario)
    except RuntimeError as exc:
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.EDF,
            SolverStatus.UNKNOWN,
            f"EDF failed: {exc}",
            str(output) if output else None,
        )

    click.echo(f"Applying disruption: {disruption.type.value}...", err=True)
    try:
        result = run_replan(
            scenario,
            current_ops,
            disruption,
            solver=solver,
            time_limit_seconds=time_limit,
            random_seed=seed,
        )
    except (RuntimeError, ValueError) as exc:
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.CP_SAT if solver == "cpsat" else SchedulerType.EDF,
            SolverStatus.UNKNOWN,
            f"Re-plan failed: {exc}",
            str(output) if output else None,
        )
    diff = result.diff
    click.echo(
        f"Frozen {diff.frozen_count} operations, split {diff.split_count} operations",
        err=True,
    )
    if diff.interrupted:
        for record in diff.interrupted:
            click.echo(
                f"Interrupted {record['order']} {record['stage']} on "
                f"{record['machine']}: {record['completed_metres']}m done, "
                f"{record['remaining_metres']}m -> {record['remainder_order']}",
                err=True,
            )
    if diff.moved_orders:
        click.echo(f"Moved orders: {len(diff.moved_orders)}", err=True)
    if diff.now_late:
        click.echo(f"Now late: {', '.join(diff.now_late)}", err=True)
    if diff.now_at_risk:
        click.echo(f"Now at risk: {', '.join(diff.now_at_risk)}", err=True)
    if diff.recovered:
        click.echo(f"Recovered: {', '.join(diff.recovered)}", err=True)

    if not result.ok or result.schedule is None:
        _emit_failure(
            result.new_scenario.scenario_id,
            SchedulerType.CP_SAT if solver == "cpsat" else SchedulerType.EDF,
            SolverStatus.INFEASIBLE
            if result.error and "INFEASIBLE" in result.error
            else SolverStatus.UNKNOWN,
            result.error or "Re-plan failed without a schedule.",
            str(output) if output else None,
        )

    schedule = result.schedule
    click.echo(
        f"Re-plan status: {schedule.status.value} (took {schedule.compute_seconds:.2f}s)",
        err=True,
    )
    click.echo(
        f"Tardiness {result.previous_metrics.weighted_tardiness:.1f} -> "
        f"{schedule.metrics.weighted_tardiness:.1f}",
        err=True,
    )

    save_schedule(schedule, str(output) if output else None)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Output file")
@click.option("--format", type=click.Choice(["standard", "frappe"]), default="standard")
def gantt(scenario_path: Path, output: Path | None, format: str) -> None:
    """Export schedule to Gantt JSON format."""
    scenario = _load_or_exit(scenario_path)
    try:
        schedule = run_edf(scenario)
    except RuntimeError as exc:
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.EDF,
            SolverStatus.UNKNOWN,
            f"EDF failed: {exc}",
            str(output) if output else None,
        )

    if schedule.status != SolverStatus.FEASIBLE or not schedule.validation.is_valid:
        _emit_failure(
            scenario.scenario_id,
            SchedulerType.EDF,
            schedule.status,
            "Schedule invalid: " + "; ".join(v.code for v in schedule.validation.violations),
            str(output) if output else None,
        )

    if output:
        export_gantt_json(schedule, scenario, str(output), format)
        click.echo(f"Gantt data exported to {output}", err=True)
    else:
        import json as _json

        from .gantt import build_gantt_data

        click.echo(_json.dumps(build_gantt_data(schedule, scenario), indent=2))


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
def validate(scenario_path: Path) -> None:
    """Validate a scenario for basic consistency (diagnostics to stderr)."""
    scenario = _load_or_exit(scenario_path)
    click.echo(f"Scenario: {scenario.scenario_id}", err=True)
    click.echo(f"  Orders: {len(scenario.orders)}", err=True)
    click.echo(f"  Machines: {len(scenario.machines)}", err=True)
    click.echo(f"  Horizon: {scenario.horizon} minutes", err=True)
    click.echo(f"  Now: {scenario.now}", err=True)
    click.echo(f"  Route: {[s.value for s in scenario.route]}", err=True)
    click.echo(f"  Frozen ops: {len(scenario.frozen)}", err=True)

    # Check each order has eligible machines for each stage
    for order in scenario.orders:
        for stage in scenario.route:
            eligible = order.eligible.get_machines(stage)
            if not eligible:
                click.echo(
                    f"  WARNING: Order {order.id} has no eligible machines for {stage.value}",
                    err=True,
                )
            else:
                missing = [m for m in eligible if m not in {mm.id for mm in scenario.machines}]
                if missing:
                    click.echo(
                        f"  WARNING: Order {order.id} references unknown machines "
                        f"for {stage.value}: {missing}",
                        err=True,
                    )

    click.echo("Scenario validation complete.", err=True)


@main.command()
def duration() -> None:
    """Test the duration function with sample values."""
    test_cases = [
        (2400, 60),  # 2400m at 60 m/hr = 40h = 2400 min
        (2000, 40),  # 2000m at 40 m/hr = 50h = 3000 min
        (1500, 30),  # 1500m at 30 m/hr = 50h = 3000 min
        (100, 100),  # 100m at 100 m/hr = 1h = 60 min
        (1, 1),  # 1m at 1 m/hr = 1h = 60 min
    ]

    click.echo("Duration function tests:")
    for metres, rate in test_cases:
        dur = compute_duration(metres, rate)
        click.echo(f"  {metres}m @ {rate}m/hr = {dur} min ({dur / 60:.1f}h)")


@main.command()
@click.argument("scenarios", nargs=-1, type=click.Path(exists=True, path_type=Path))
@click.option("--out", "out_dir", default="benchmark", help="Output directory")
@click.option("--time-limit", default=10.0, help="CP-SAT time limit in seconds")
@click.option("--seed", default=42, help="Random seed for reproducibility")
@click.option("--workers", default=8, help="CP-SAT worker count")
@click.option("--target", default=20.0, help="Target tardiness improvement percent")
def benchmark(
    scenarios: tuple[Path, ...],
    out_dir: str,
    time_limit: float,
    seed: int,
    workers: int,
    target: float,
) -> None:
    """Compare EDF against CP-SAT on identical scenario snapshots."""
    from .benchmark import (
        BenchmarkConfig,
        comparison_to_csv,
        report_to_json,
        run_benchmark,
        write_markdown,
    )

    if scenarios:
        paths: list[str | Path] = [str(p) for p in scenarios]
    else:
        base = Path("scenarios")
        paths = [
            str(base / name)
            for name in (
                "feasible_load.json",
                "weaving_breakdown.json",
                "late_yarn_lot.json",
                "infeasible_load.json",
            )
        ]
        missing = [p for p in paths if not Path(p).exists()]
        if missing:
            click.echo(f"Error: default scenarios missing: {missing}", err=True)
            sys.exit(EXIT_USAGE)

    config = BenchmarkConfig(
        time_limit_seconds=time_limit,
        random_seed=seed,
        num_workers=workers,
        target_improvement_pct=target,
    )
    click.echo(f"Benchmarking {len(paths)} scenario(s)...", err=True)
    report = run_benchmark(paths, config)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    report_to_json(report, out / "results.json")
    comparison_to_csv(report, out / "comparison.csv")
    write_markdown(report, out / "report.md")
    click.echo(
        f"Wrote {out / 'results.json'}, {out / 'comparison.csv'}, {out / 'report.md'}",
        err=True,
    )

    for comparison in report.comparisons:
        improvement = comparison.tardiness_improvement_pct
        verdict = (
            "N/A"
            if improvement is None
            else f"{improvement:.2f}% ({'MET' if comparison.target_met else 'NOT MET'})"
        )
        click.echo(f"  {comparison.scenario_id}: tardiness improvement {verdict}", err=True)
    for failure in report.failures:
        click.echo(f"  {failure.scenario_id}: FAILED separately ({failure.reason})", err=True)


if __name__ == "__main__":
    main()
