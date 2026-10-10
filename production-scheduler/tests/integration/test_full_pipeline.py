"""Integration tests for full scheduling pipeline."""

import pytest

from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    Stage,
    SchedulerType,
    SolverStatus,
    ValidationResult,
)
from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.optimizer import run_cpsat_optimizer
from textile_scheduler.validator import validate_schedule
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import Schedule


def create_feasible_scenario() -> Scenario:
    """Create a feasible scenario for integration testing."""
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=55),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="WEAVE-02", stage=Stage.WEAVING, rate_m_per_hour=45),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        Machine(id="DYE-02", stage=Stage.DYEING, rate_m_per_hour=32),
    ]
    orders = [
        Order(
            id="ORD-001",
            buyer="Buyer A",
            fabric="Cotton Twill",
            colour="Navy",
            metres=1200,
            due=9000,
            priority_weight=3,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-01", "SPIN-02"],
                weaving=["WEAVE-01", "WEAVE-02"],
                dyeing=["DYE-01"],
            ),
        ),
        Order(
            id="ORD-002",
            buyer="Buyer B",
            fabric="Linen",
            colour="Natural",
            metres=1000,
            due=8000,
            priority_weight=2,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-01", "SPIN-02"],
                weaving=["WEAVE-01", "WEAVE-02"],
                dyeing=["DYE-01", "DYE-02"],
            ),
        ),
        Order(
            id="ORD-003",
            buyer="Buyer C",
            fabric="Polyester",
            colour="Red",
            metres=800,
            due=9000,
            priority_weight=1,
            yarn_ready=0,
            eligible=OrderEligibility(
                spinning=["SPIN-02"],
                weaving=["WEAVE-02"],
                dyeing=["DYE-02"],
            ),
        ),
    ]
    return Scenario(
        name="integration_feasible",
        synthetic=True,
        now=0,
        horizon=10080,
        machines=machines,
        orders=orders,
    )


class TestFullPipeline:
    """Integration tests for the full scheduling pipeline."""

    def test_edf_baseline_then_validate(self) -> None:
        """EDF baseline followed by validation should work end-to-end."""
        scenario = create_feasible_scenario()

        # Run EDF
        operations = run_edf_baseline(scenario)
        assert len(operations) == 9  # 3 orders * 3 stages

        # Compute metrics
        metrics = compute_metrics(scenario, operations)

        # Validate
        validation = validate_schedule(
            scenario,
            Schedule(
                scenario=scenario.name,
                scheduler=SchedulerType.EDF,
                status=SolverStatus.FEASIBLE,
                compute_seconds=0.1,
                validation=ValidationResult(violations=[]),
                metrics=metrics,
                operations=operations,
            ),
        )

        assert validation.is_valid, f"EDF schedule invalid: {validation.violations}"

    def test_cpsat_optimizer_with_warm_start(self) -> None:
        """CP-SAT with EDF warm start should produce valid schedule."""
        scenario = create_feasible_scenario()

        # Get EDF warm start
        edf_ops = run_edf_baseline(scenario)

        # Run CP-SAT (skip if OR-Tools not installed)
        try:
            status, cpsat_ops, solve_time = run_cpsat_optimizer(
                scenario=scenario,
                time_limit_seconds=10.0,
                random_seed=42,
                warm_start_ops=edf_ops,
            )

            assert status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
            assert len(cpsat_ops) == 9
            assert solve_time > 0

            # Validate CP-SAT schedule
            metrics = compute_metrics(scenario, cpsat_ops)
            validation = validate_schedule(
                scenario,
                Schedule(
                    scenario=scenario.name,
                    scheduler=SchedulerType.CP_SAT,
                    status=status,
                    compute_seconds=solve_time,
                    validation=ValidationResult(violations=[]),
                    metrics=metrics,
                    operations=cpsat_ops,
                ),
            )

            assert validation.is_valid, f"CP-SAT schedule invalid: {validation.violations}"

            # CP-SAT should not be worse than EDF on weighted tardiness
            edf_metrics = compute_metrics(scenario, edf_ops)
            assert metrics.weighted_tardiness <= edf_metrics.weighted_tardiness + 1e-9

        except RuntimeError as e:
            if "OR-Tools not installed" in str(e):
                pytest.skip("OR-Tools not installed")
            raise

    def test_replan_after_breakdown(self) -> None:
        """Full re-plan pipeline after machine breakdown."""
        from textile_scheduler.disruptions import apply_disruption
        from textile_scheduler.models import Disruption, DisruptionType

        scenario = create_feasible_scenario()

        # Get initial schedule
        edf_ops = run_edf_baseline(scenario)

        # Apply breakdown
        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=480,
            to_minute=960,
            now=360,
        )

        new_scenario, frozen_ops, diff = apply_disruption(scenario, edf_ops, disruption)

        assert diff.frozen_count > 0
        assert len(new_scenario.frozen) == diff.frozen_count

        # Re-solve with CP-SAT
        try:
            status, new_ops, solve_time = run_cpsat_optimizer(
                scenario=new_scenario,
                time_limit_seconds=10.0,
                random_seed=42,
                warm_start_ops=frozen_ops,
            )

            assert status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)

            # Validate re-plan
            all_ops = frozen_ops + new_ops
            metrics = compute_metrics(new_scenario, all_ops)
            validation = validate_schedule(
                new_scenario,
                Schedule(
                    scenario=new_scenario.name,
                    scheduler=SchedulerType.CP_SAT,
                    status=status,
                    compute_seconds=solve_time,
                    validation=ValidationResult(violations=[]),
                    metrics=metrics,
                    operations=all_ops,
                ),
            )

            assert validation.is_valid, f"Re-plan invalid: {validation.violations}"

        except RuntimeError as e:
            if "OR-Tools not installed" in str(e):
                pytest.skip("OR-Tools not installed")
            raise

    def test_scenario_serialization_roundtrip(self) -> None:
        """Scenario should serialize and deserialize correctly."""
        scenario = create_feasible_scenario()

        # Serialize to JSON
        json_str = scenario.model_dump_json(indent=2)

        # Deserialize
        restored = Scenario.model_validate_json(json_str)

        assert restored.name == scenario.name
        assert len(restored.orders) == len(scenario.orders)
        assert len(restored.machines) == len(scenario.machines)
        assert restored.horizon == scenario.horizon
        assert restored.now == scenario.now

    def test_schedule_serialization_roundtrip(self) -> None:
        """Schedule should serialize and deserialize correctly."""
        scenario = create_feasible_scenario()
        operations = run_edf_baseline(scenario)
        metrics = compute_metrics(scenario, operations)

        validation = validate_schedule(
            scenario,
            Schedule(
                scenario=scenario.name,
                scheduler=SchedulerType.EDF,
                status=SolverStatus.FEASIBLE,
                compute_seconds=0.1,
                validation=ValidationResult(violations=[]),
                metrics=metrics,
                operations=operations,
            ),
        )

        schedule = Schedule(
            scenario=scenario.name,
            scheduler=SchedulerType.EDF,
            status=SolverStatus.FEASIBLE,
            compute_seconds=0.1,
            validation=validation,
            metrics=metrics,
            operations=operations,
        )

        # Serialize
        json_str = schedule.model_dump_json(indent=2)

        # Deserialize
        restored = Schedule.model_validate_json(json_str)

        assert restored.scenario == schedule.scenario
        assert restored.scheduler == schedule.scheduler
        assert restored.status == schedule.status
        assert len(restored.operations) == len(schedule.operations)
