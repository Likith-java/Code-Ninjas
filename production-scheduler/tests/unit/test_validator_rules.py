"""Per-rule validator tests: one hand-crafted invalid schedule per rule code.

Each test proves the expected stable violation code is reported, plus
positive tests for a fully valid schedule and adjacent half-open intervals.
The suite imports nothing from solver modules.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

import textile_scheduler.validator as validator_module
from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import (
    DowntimeWindow,
    FrozenOperation,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    Schedule,
    ScheduledOperation,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationResult,
)
from textile_scheduler.validator import ScheduleValidator

SPIN_DUR = 1200  # 1200m @ 60 m/hr
WEAVE_DUR = 1800  # 1200m @ 40 m/hr
DYE_DUR = 2400  # 1200m @ 30 m/hr


def create_scenario(**overrides) -> Scenario:
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
    orders = [
        Order(
            id="ORD-001",
            metres=1200,
            due=15000,
            priority_weight=3,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        )
    ]
    params: dict = {
        "scenario_id": "rule-test",
        "now": 0,
        "horizon": 20000,
        "machines": machines,
        "orders": orders,
    }
    params.update(overrides)
    return Scenario(**params)


def validate_ops(scenario, ops, status=SolverStatus.FEASIBLE):
    schedule = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=status,
        compute_seconds=0.0,
        validation=ValidationResult(violations=[]),
        metrics=compute_metrics(scenario, ops),
        operations=ops,
    )
    return ScheduleValidator(scenario).validate(schedule), schedule


def codes(result) -> set[str]:
    return {v.code for v in result.violations}


def valid_ops() -> list[ScheduledOperation]:
    return [
        ScheduledOperation(
            order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
        ),
        ScheduledOperation(
            order="ORD-001",
            stage=Stage.WEAVING,
            machine="WEAVE-01",
            start=1200,
            end=3000,
        ),
        ScheduledOperation(
            order="ORD-001", stage=Stage.DYEING, machine="DYE-01", start=3000, end=5400
        ),
    ]


class TestPositive:
    def test_valid_schedule_has_no_violations(self) -> None:
        scenario = create_scenario()
        result, _ = validate_ops(scenario, run_edf_baseline(scenario))
        assert result.is_valid, result.violations
        assert result.status.value == "valid"

    def test_adjacent_intervals_do_not_overlap(self) -> None:
        """End == start on one machine is allowed (half-open [start, end))."""
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
                Order(
                    id="ORD-002",
                    metres=600,
                    due=15000,
                    priority_weight=1,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            ),
            # Adjacent: starts exactly when the previous ends.
            ScheduledOperation(
                order="ORD-002",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=1200,
                end=1800,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=1200,
                end=3000,
            ),
            ScheduledOperation(
                order="ORD-002",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=3000,
                end=3900,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=3000,
                end=5400,
            ),
            ScheduledOperation(
                order="ORD-002",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=5400,
                end=6600,
            ),
        ]
        result, _ = validate_ops(scenario, ops)
        assert result.is_valid, result.violations


class TestRules:
    def test_r01_missing_operation(self) -> None:
        result, _ = validate_ops(create_scenario(), [])
        assert "R01_MISSING_OPERATION" in codes(result)
        assert not result.is_valid

    def test_r02_duplicate_operation(self) -> None:
        ops = valid_ops() + [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R02_DUPLICATE_OPERATION" in codes(result)

    def test_r03_machine_ineligible(self) -> None:
        scenario = create_scenario(
            machines=[
                Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=50),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        # SPIN-02 exists but is not eligible; duration correct for it (1440).
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-02",
                start=0,
                end=1440,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R03_MACHINE_INELIGIBLE" in codes(result)

    def test_r04_stage_mismatch(self) -> None:
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01", "WEAVE-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        # Eligible by list but the machine serves another stage.
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="WEAVE-01",
                start=0,
                end=1800,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R04_STAGE_MISMATCH" in codes(result)

    def test_r05_bad_interval_rejected_at_parse(self) -> None:
        """R05 is schema-enforced: inverted intervals never reach the validator."""
        with pytest.raises(ValidationError):
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=100,
                end=100,
            )

    def test_r06_duration_mismatch(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1000,  # expected 1200
            )
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R06_DURATION_MISMATCH" in codes(result)

    def test_r07_route_precedence(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=0,
                end=1800,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=1800,
                end=3000,
            ),
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R07_ROUTE_PRECEDENCE" in codes(result)

    def test_r07_stage_overlap(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=1000,  # overlaps spinning, durations otherwise right
                end=2800,
            ),
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R07_ROUTE_PRECEDENCE" in codes(result)

    def test_r08_machine_overlap(self) -> None:
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
                Order(
                    id="ORD-002",
                    metres=1200,
                    due=15000,
                    priority_weight=1,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            ),
            ScheduledOperation(
                order="ORD-002",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=600,  # overlaps, durations otherwise right
                end=1800,
            ),
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R08_MACHINE_OVERLAP" in codes(result)

    def test_r09_downtime_overlap(self) -> None:
        scenario = create_scenario(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    downtime=[DowntimeWindow(start=500, end=1700)],
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R09_DOWNTIME_OVERLAP" in codes(result)

    def test_r09_availability_horizon(self) -> None:
        scenario = create_scenario(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    available_until=500,
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R09_DOWNTIME_OVERLAP" in codes(result)
        assert any("availability" in v.message for v in result.violations)

    def test_r10_yarn_ready(self) -> None:
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    yarn_ready=1000,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R10_YARN_READY" in codes(result)

    def test_r10_provisioned_successor_exempt(self) -> None:
        """A later stage fed by frozen history keeps provisioned material."""
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    yarn_ready=2000,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ],
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=1200,
                )
            ],
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=1200,
                end=3000,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=3000,
                end=5400,
            ),
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R10_YARN_READY" not in codes(result)
        assert result.is_valid, result.violations

    def test_r11_start_before_now(self) -> None:
        scenario = create_scenario(now=500)
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R11_START_BEFORE_NOW" in codes(result)

    def test_r11_frozen_operations_exempt(self) -> None:
        """Frozen work belongs to the past; R11 must not flag it."""
        scenario = create_scenario(
            now=500,
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=1200,
                )
            ],
        )
        result, _ = validate_ops(scenario, valid_ops())
        assert result.is_valid, result.violations
        assert "R11_START_BEFORE_NOW" not in codes(result)
        assert "R15_FROZEN_CHANGED" not in codes(result)

    def test_r12_beyond_horizon(self) -> None:
        scenario = create_scenario(horizon=1000)
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R12_BEYOND_HORIZON" in codes(result)

    def test_r13_quantity_mismatch(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=600,  # duration right for 600m, wrong for the 1200m order
                quantity_metres=600,
            )
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R13_QUANTITY_MISMATCH" in codes(result)
        assert "R06_DURATION_MISMATCH" not in codes(result)

    def test_r14_success_status_requires_completeness(self) -> None:
        result, _ = validate_ops(create_scenario(), [])
        assert "R01_MISSING_OPERATION" in codes(result)
        assert "R14_UNRESOLVED_MANDATORY" in codes(result)

    def test_r14_absent_for_infeasible_status(self) -> None:
        """An INFEASIBLE status explains missing work: no R14."""
        result, _ = validate_ops(create_scenario(), [], status=SolverStatus.INFEASIBLE)
        assert "R01_MISSING_OPERATION" in codes(result)
        assert "R14_UNRESOLVED_MANDATORY" not in codes(result)

    def test_r15_frozen_changed(self) -> None:
        scenario = create_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=1200,
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=100,  # moved
                end=1300,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R15_FROZEN_CHANGED" in codes(result)

    def test_r15_frozen_dropped(self) -> None:
        scenario = create_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=1200,
                )
            ]
        )
        result, _ = validate_ops(scenario, [])
        assert "R15_FROZEN_CHANGED" in codes(result)

    def test_r15_frozen_quantity(self) -> None:
        scenario = create_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=600,
                    quantity_metres=1200,
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=600,
                quantity_metres=600,
            )
        ]
        result, _ = validate_ops(scenario, ops)
        assert "R15_FROZEN_CHANGED" in codes(result)

    def test_r16_unknown_order(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-999",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R16_UNKNOWN_REFERENCE" in codes(result)

    def test_r16_unknown_machine(self) -> None:
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-99",
                start=0,
                end=1200,
            )
        ]
        result, _ = validate_ops(create_scenario(), ops)
        assert "R16_UNKNOWN_REFERENCE" in codes(result)

    def test_r17_bad_time_rejected_at_parse(self) -> None:
        """R17 is schema-enforced: bad times never reach the validator."""
        with pytest.raises(ValidationError):
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=-5,
                end=1200,
            )
        with pytest.raises(ValidationError):
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0.5,  # type: ignore[arg-type]
                end=1200,
            )


class TestValidatorProperties:
    def test_returns_all_violations(self) -> None:
        """Independent problems are all reported, not just the first."""
        scenario = create_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    yarn_ready=5000,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,  # before yarn_ready (R10)
                end=600,  # wrong duration (R06)
            ),
            ScheduledOperation(
                order="ORD-999",  # unknown order (R16)
                stage=Stage.SPINNING,
                machine="SPIN-01",  # overlaps (R08)
                start=100,
                end=1300,
            ),
        ]
        result, _ = validate_ops(scenario, ops)
        found = codes(result)
        assert {"R06_DURATION_MISMATCH", "R10_YARN_READY", "R16_UNKNOWN_REFERENCE"} <= found
        assert len(result.violations) >= 4  # plus R01/R14 for missing stages

    def test_never_repairs_input(self) -> None:
        scenario = create_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1000,
            )
        ]
        _, schedule = validate_ops(scenario, ops)
        before = schedule.model_dump()
        ScheduleValidator(scenario).validate(schedule)
        assert schedule.model_dump() == before
        assert schedule.operations[0].end == 1000

    def test_independent_of_solvers(self) -> None:
        """validator.py must not reference any scheduling implementation."""
        source = Path(validator_module.__file__).read_text()
        for token in ("optimizer", "baseline", "ortools", "cpsat", "AddHint"):
            assert token not in source, f"validator references {token!r}"

    def test_violation_contract_shape(self) -> None:
        result, _ = validate_ops(create_scenario(), [])
        assert result.violations
        for violation in result.violations:
            assert violation.code.startswith("R")
            assert 1 <= violation.rule <= 17
            assert violation.severity.value == "error"
            assert violation.message
