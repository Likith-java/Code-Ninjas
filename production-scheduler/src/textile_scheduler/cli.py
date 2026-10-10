"""CLI entry point for textile-scheduler."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from .models import Scenario, Disruption, DisruptionType, SchedulerType, SolverStatus
from .loader import load_scenario_file
from .validator import validate_schedule
from .baseline import run_edf_baseline, run_edf
from .optimizer import optimize as run_cpsat_optimize
from .optimizer import run_cpsat_optimizer
from .metrics import compute_metrics
from .durations import compute_duration
from .disruptions import apply_disruption
from .gantt import schedule_to_gantt, export_gantt_json


def load_scenario(path: str) -> Scenario:
    """Load scenario from JSON file."""
    return load_scenario_file(path)


def save_schedule(schedule, output: str | None) -> None:
    """Save schedule to file or stdout."""
    data = schedule.model_dump(mode="json", by_alias=True)
    json_str = json.dumps(data, indent=2)
    if output:
        Path(output).write_text(json_str)
        click.echo(f"Schedule saved to {output}")
    else:
        click.echo(json_str)


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
@click.option("--validate/--no-validate", default=True, help="Run validation after scheduling")
def run(scenario_path: Path, output: Path | None, validate: bool) -> None:
    """Run EDF baseline scheduler on a scenario."""
    try:
        scenario = load_scenario(str(scenario_path))
        click.echo(
            f"Loaded scenario: {scenario.scenario_id} ({len(scenario.orders)} orders, {len(scenario.machines)} machines)"
        )

        schedule = run_edf(scenario)
        click.echo(f"Scheduled {len(schedule.operations)} operations")
        click.echo(f"Status: {schedule.status.value} ({schedule.compute_seconds:.3f}s)")

        # run_edf always validates; --no-validate only silences the warnings.
        validation = schedule.validation
        if validate and not validation.is_valid:
            click.echo(
                f"WARNING: Validation found {len(validation.violations)} violations", err=True
            )
            for v in validation.violations:
                click.echo(f"  {v.code}: {v.message}", err=True)

        save_schedule(schedule, str(output) if output else None)

    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


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
    try:
        scenario = load_scenario(str(scenario_path))
        click.echo(
            f"Loaded scenario: {scenario.scenario_id} ({len(scenario.orders)} orders, {len(scenario.machines)} machines)"
        )

        warm_start_ops = None
        if warm_start:
            click.echo("Computing EDF warm start...")
            warm_start_ops = run_edf_baseline(scenario)
            click.echo(f"EDF scheduled {len(warm_start_ops)} operations")

        click.echo(
            f"Running CP-SAT optimizer (time_limit={time_limit}s, seed={seed}, workers={workers})..."
        )
        schedule = run_cpsat_optimize(
            scenario=scenario,
            time_limit_seconds=time_limit,
            random_seed=seed,
            warm_start_ops=warm_start_ops,
            num_workers=workers,
        )
        click.echo(f"Solver status: {schedule.status.value} (took {schedule.compute_seconds:.2f}s)")
        click.echo(f"Scheduled {len(schedule.operations)} operations")
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

    except RuntimeError as e:
        if "OR-Tools not installed" in str(e):
            click.echo("Error: OR-Tools not installed. Run: pip install -e .[optimizer]", err=True)
        else:
            click.echo(f"Error: {e}", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option("--machine-down", help="Machine ID for breakdown")
@click.option("--from", "from_minute", type=int, help="Downtime start minute")
@click.option("--to", "to_minute", type=int, help="Downtime end minute")
@click.option("--yarn-delay", help="Order ID for yarn delay")
@click.option("--hours", type=int, help="Delay in hours")
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
    now: int,
    time_limit: float,
    seed: int,
    output: Path | None,
) -> None:
    """Re-plan after a disruption (machine breakdown or yarn delay)."""
    try:
        scenario = load_scenario(str(scenario_path))
        click.echo(f"Loaded scenario: {scenario.scenario_id}")

        # Build disruption object
        if machine_down:
            if from_minute is None or to_minute is None:
                click.echo("Error: --from and --to required for machine breakdown", err=True)
                sys.exit(1)
            disruption = Disruption(
                type=DisruptionType.MACHINE_DOWN,
                machine=machine_down,
                from_minute=from_minute,
                to_minute=to_minute,
                now=now,
            )
        elif yarn_delay:
            if hours is None:
                click.echo("Error: --hours required for yarn delay", err=True)
                sys.exit(1)
            disruption = Disruption(
                type=DisruptionType.YARN_DELAY,
                order=yarn_delay,
                hours=hours,
                now=now,
            )
        else:
            click.echo("Error: Either --machine-down or --yarn-delay required", err=True)
            sys.exit(1)

        # First run baseline to get current schedule
        click.echo("Computing current schedule (EDF)...")
        current_ops = run_edf_baseline(scenario)

        click.echo(f"Applying disruption: {disruption.type.value}...")
        new_scenario, frozen_ops, diff = apply_disruption(scenario, current_ops, disruption)
        click.echo(f"Frozen {diff.frozen_count} operations, split {diff.split_count} operations")
        if diff.moved_orders:
            click.echo(f"Moved orders: {len(diff.moved_orders)}")
        if diff.now_late:
            click.echo(f"Now late: {', '.join(diff.now_late)}")
        if diff.now_at_risk:
            click.echo(f"Now at risk: {', '.join(diff.now_at_risk)}")

        # Re-solve with CP-SAT
        click.echo("Re-solving with CP-SAT...")
        status, new_ops, solve_time = run_cpsat_optimizer(
            scenario=new_scenario,
            time_limit_seconds=time_limit,
            random_seed=seed,
            warm_start_ops=frozen_ops,
        )
        click.echo(f"Re-plan status: {status.value} (took {solve_time:.2f}s)")

        # Solver output is already complete: frozen operations are modelled
        # with presence forced, so combining them again would duplicate.
        all_ops = new_ops

        from .models import Schedule, ValidationResult

        metrics = compute_metrics(new_scenario, all_ops)
        validation = validate_schedule(
            new_scenario,
            Schedule(
                scenario_id=new_scenario.scenario_id,
                solver=SchedulerType.CP_SAT,
                status=status,
                compute_seconds=solve_time,
                validation=ValidationResult(violations=[]),
                metrics=metrics,
                operations=all_ops,
            ),
        )

        schedule = Schedule(
            scenario_id=new_scenario.scenario_id,
            solver=SchedulerType.CP_SAT,
            status=status,
            compute_seconds=solve_time,
            validation=validation,
            metrics=metrics,
            operations=all_ops,
        )

        save_schedule(schedule, str(output) if output else None)

    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
@click.option("-o", "--output", type=click.Path(path_type=Path), help="Output file")
@click.option("--format", type=click.Choice(["standard", "frappe"]), default="standard")
def gantt(scenario_path: Path, output: Path | None, format: str) -> None:
    """Export schedule to Gantt JSON format."""
    try:
        scenario = load_scenario(str(scenario_path))
        operations = run_edf_baseline(scenario)

        from .models import Schedule, ValidationResult

        metrics = compute_metrics(scenario, operations)
        validation = validate_schedule(
            scenario,
            Schedule(
                scenario_id=scenario.scenario_id,
                solver=SchedulerType.EDF,
                status=SolverStatus.FEASIBLE,
                compute_seconds=0.0,
                validation=ValidationResult(violations=[]),
                metrics=metrics,
                operations=operations,
            ),
        )

        schedule = Schedule(
            scenario_id=scenario.scenario_id,
            solver=SchedulerType.EDF,
            status=SolverStatus.FEASIBLE,
            compute_seconds=0.0,
            validation=validation,
            metrics=metrics,
            operations=operations,
        )

        gantt_data = schedule_to_gantt(schedule, scenario)

        output_path = str(output) if output else f"{scenario.scenario_id}_gantt.json"
        export_gantt_json(schedule, scenario, output_path, format)
        click.echo(f"Gantt data exported to {output_path}")

    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@main.command()
@click.argument("scenario_path", type=click.Path(exists=True, path_type=Path))
def validate(scenario_path: Path) -> None:
    """Validate a scenario for basic consistency."""
    try:
        scenario = load_scenario(str(scenario_path))
        click.echo(f"Scenario: {scenario.scenario_id}")
        click.echo(f"  Orders: {len(scenario.orders)}")
        click.echo(f"  Machines: {len(scenario.machines)}")
        click.echo(f"  Horizon: {scenario.horizon} minutes")
        click.echo(f"  Now: {scenario.now}")
        click.echo(f"  Route: {[s.value for s in scenario.route]}")
        click.echo(f"  Frozen ops: {len(scenario.frozen)}")

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
                            f"  WARNING: Order {order.id} references unknown machines for {stage.value}: {missing}",
                            err=True,
                        )

        click.echo("Scenario validation complete.")

    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


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


if __name__ == "__main__":
    main()
