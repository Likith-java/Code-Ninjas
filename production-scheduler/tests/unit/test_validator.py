"""Unit tests for validator module - one test per rule with deliberately broken schedules."""

import textile_scheduler.metrics
import textile_scheduler.models
from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.models import (
    DowntimeWindow,
    FrozenOperation,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    Stage,
)
from textile_scheduler.validator import ScheduleValidator


def create_test_scenario(
    *,
    yarn_ready: int = 0,
    downtime: list | None = None,
    frozen: list | None = None,
    extra_machines: list | None = None,
) -> Scenario:
    """Create a simple test scenario (single order, feasible within horizon)."""
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
    if downtime:
        machines[0] = Machine(
            id="SPIN-01",
            stage=Stage.SPINNING,
            rate_m_per_hour=60,
            downtime=downtime,
        )
    if extra_machines:
        machines.extend(extra_machines)
    orders = [
        Order(
            id="ORD-001",
            buyer="Buyer A",
            fabric="Cotton",
            colour="Blue",
            metres=1200,
            due=15000,
            priority_weight=3,
            yarn_ready=yarn_ready,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        ),
    ]
    return Scenario(
        name="test",
        synthetic=True,
        now=0,
        horizon=20000,
        machines=machines,
        orders=orders,
        frozen=frozen or [],
    )


def _make_schedule(scenario, operations):
    metrics = textile_scheduler.metrics.compute_metrics(scenario, operations)
    return textile_scheduler.models.Schedule(
        scenario="test",
        scheduler=textile_scheduler.models.SchedulerType.EDF,
        status=textile_scheduler.models.SolverStatus.FEASIBLE,
        compute_seconds=0.1,
        validation=textile_scheduler.models.ValidationResult(violations=[]),
        metrics=metrics,
        operations=operations,
    )


class TestValidator:
    """Tests for ScheduleValidator."""

    def test_valid_schedule_passes(self) -> None:
        """A valid baseline schedule should pass validation."""
        scenario = create_test_scenario()
        operations = run_edf_baseline(scenario)
        # 1200m: spin 1200, weave 1800, dye 2400
        assert len(operations) == 3

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, operations))
        assert result.is_valid, f"Expected valid, got violations: {result.violations}"

    def test_duplicate_operation_fails(self) -> None:
        """Duplicate operations for same order-stage should fail Rule 1."""
        scenario = create_test_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
            ),
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=1200, end=2400
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 1 for v in result.violations)

    def test_wrong_machine_stage_fails(self) -> None:
        """Operation on wrong stage machine should fail Rule 2."""
        scenario = create_test_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="WEAVE-01", start=0, end=1200
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 2 for v in result.violations)

    def test_ineligible_machine_fails(self) -> None:
        """Operation on ineligible machine should fail Rule 2."""
        scenario = create_test_scenario(
            extra_machines=[Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=50)]
        )
        # SPIN-02 exists but is not in ORD-001 eligible list; duration correct for it
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-02", start=0, end=1440
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 2 for v in result.violations)

    def test_wrong_duration_fails(self) -> None:
        """Wrong duration should fail Rule 3."""
        scenario = create_test_scenario()
        # 1200m at 60 m/hr = 1200 min, but we use 1000 min
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1000
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 3 for v in result.violations)

    def test_route_order_violation_fails(self) -> None:
        """Stages out of order should fail Rule 4."""
        scenario = create_test_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.WEAVING, machine="WEAVE-01", start=0, end=1800
            ),
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=1800, end=3000
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 4 for v in result.violations)

    def test_machine_overlap_fails(self) -> None:
        """Overlapping operations on same machine should fail Rule 5."""
        scenario = create_test_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
            ),
            ScheduledOperation(
                order="ORD-001", stage=Stage.WEAVING, machine="SPIN-01", start=1000, end=4000
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 5 for v in result.violations)

    def test_downtime_overlap_fails(self) -> None:
        """Operation overlapping downtime should fail Rule 6."""
        scenario = create_test_scenario(downtime=[DowntimeWindow(from_minute=1000, to_minute=2000)])
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=500, end=1700
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 6 for v in result.violations)

    def test_starts_before_yarn_ready_fails(self) -> None:
        """Operation starting before yarn_ready should fail Rule 7."""
        scenario = create_test_scenario(yarn_ready=1000)
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 7 for v in result.violations)

    def test_frozen_operation_changed_fails(self) -> None:
        """Changing a frozen operation should fail Rule 8."""
        scenario = create_test_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=100, end=1300
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert not result.is_valid
        assert any(v.rule == 8 for v in result.violations)

    def test_frozen_operation_unchanged_passes(self) -> None:
        """Keeping frozen operation unchanged should pass Rule 8."""
        scenario = create_test_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
            ),
        ]

        validator = ScheduleValidator(scenario)
        result = validator.validate(_make_schedule(scenario, ops))
        assert result.is_valid, f"Expected valid, got violations: {result.violations}"
