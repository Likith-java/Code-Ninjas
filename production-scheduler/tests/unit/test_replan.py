"""Tests for disruption simulation and the replan orchestrator."""

from __future__ import annotations

import importlib.util

import pytest

from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.disruptions import (
    _compute_diff,
    apply_disruption,
    replan,
)
from textile_scheduler.models import (
    Disruption,
    DisruptionType,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    SolverStatus,
    Stage,
)

HAS_ORTOOLS = importlib.util.find_spec("ortools") is not None
needs_ortools = pytest.mark.skipif(not HAS_ORTOOLS, reason="OR-Tools not installed")


def single_order_scenario(**overrides) -> Scenario:
    params: dict = {
        "scenario_id": "replan-test",
        "horizon": 20000,
        "machines": [
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ],
        "orders": [
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
        ],
    }
    params.update(overrides)
    return Scenario(**params)


def interrupt_spin() -> tuple[Scenario, list[ScheduledOperation], Disruption]:
    scenario = single_order_scenario()
    operations = run_edf_baseline(scenario)
    disruption = Disruption(
        type=DisruptionType.MACHINE_DOWN,
        machine="SPIN-01",
        from_minute=500,
        to_minute=900,
        now=100,
        reason="spindle failure",
    )
    return scenario, operations, disruption


class TestInterruption:
    def test_split_conserves_quantity(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        new_scenario, _, diff = apply_disruption(scenario, operations, disruption)

        assert diff.split_count == 1
        assert len(diff.interrupted) == 1
        record = diff.interrupted[0]
        assert record["order"] == "ORD-001"
        assert record["completed_metres"] == 500
        assert record["remaining_metres"] == 700
        assert record["remainder_order"] == "ORD-001-R"
        assert record["restart_policy"] == "resume-remaining"

        metres = {o.id: o.metres for o in new_scenario.orders}
        assert metres == {"ORD-001": 500, "ORD-001-R": 700}
        # No double-counting across the whole scenario.
        assert sum(metres.values()) == sum(o.metres for o in scenario.orders)

    def test_split_stage_totals_balance(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        assert result.schedule is not None
        assert result.schedule.validation.is_valid, result.schedule.validation.violations
        totals: dict[str, int] = {}
        for op in result.schedule.operations:
            assert op.quantity_metres is not None
            totals[op.stage.value] = totals.get(op.stage.value, 0) + op.quantity_metres
        assert totals == {"spinning": 1200, "weaving": 1200, "dyeing": 1200}

    def test_frozen_part_exact_and_unchanged(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        frozen_spin = next(
            op
            for op in result.schedule.operations
            if op.order == "ORD-001" and op.stage == Stage.SPINNING
        )
        assert (frozen_spin.start, frozen_spin.end) == (0, 500)
        assert frozen_spin.quantity_metres == 500
        codes = {v.code for v in result.schedule.validation.violations}
        assert "R15_FROZEN_CHANGED" not in codes
        assert "R02_DUPLICATE_OPERATION" not in codes
        assert "R06_DURATION_MISMATCH" not in codes
        assert "R13_QUANTITY_MISMATCH" not in codes

    def test_remainder_rescheduled_after_downtime(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        remainder_spin = next(
            op
            for op in result.schedule.operations
            if op.order == "ORD-001-R" and op.stage == Stage.SPINNING
        )
        assert remainder_spin.start >= 900
        assert remainder_spin.quantity_metres == 700

    @needs_ortools
    def test_interruption_with_cpsat(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        result = replan(scenario, operations, disruption, solver="cpsat")
        assert result.ok
        assert result.schedule.validation.is_valid


def two_order_scenario() -> Scenario:
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]

    def order(oid: str, due: int, priority: int) -> Order:
        return Order(
            id=oid,
            metres=600,
            due=due,
            priority_weight=priority,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        )

    return Scenario(
        scenario_id="yarn-test",
        horizon=30000,
        machines=machines,
        orders=[order("ORD-A", 3000, 3), order("ORD-B", 9000, 1)],
    )


class TestYarnDelay:
    def test_delay_moves_downstream_operations(self) -> None:
        scenario = two_order_scenario()
        operations = run_edf_baseline(scenario)
        before = {(op.order, op.stage): op.start for op in operations}
        assert before[("ORD-B", Stage.SPINNING)] == 600
        disruption = Disruption(
            type=DisruptionType.YARN_DELAY,
            order="ORD-B",
            delay_minutes=2000,
            now=100,
        )
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        after = {(op.order, op.stage): op.start for op in result.schedule.operations}
        # ORD-B spinning was movable (started after now); it shifts by the delay.
        assert after[("ORD-B", Stage.SPINNING)] == 2000
        assert after[("ORD-B", Stage.DYEING)] > before[("ORD-B", Stage.DYEING)]
        # ORD-A was already running: frozen exactly.
        assert after[("ORD-A", Stage.SPINNING)] == before[("ORD-A", Stage.SPINNING)]
        assert result.schedule.validation.is_valid

    def test_delay_minutes_field(self) -> None:
        disruption = Disruption(
            type=DisruptionType.YARN_DELAY, order="ORD-001", delay_minutes=90, now=0
        )
        assert disruption.delay_total_minutes == 90
        legacy = Disruption(type=DisruptionType.YARN_DELAY, order="ORD-001", hours=2, now=0)
        assert legacy.delay_total_minutes == 120

    def test_late_order_still_replans_successfully(self) -> None:
        """Tardiness is a soft cost, never infeasibility."""
        scenario = two_order_scenario()
        operations = run_edf_baseline(scenario)
        disruption = Disruption(
            type=DisruptionType.YARN_DELAY,
            order="ORD-B",
            delay_minutes=10000,
            now=100,
        )
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        assert result.schedule.validation.is_valid
        assert result.diff.now_late == ["ORD-B"]


class TestReplanFailure:
    def test_infeasible_replan_returns_explicit_failure(self) -> None:
        scenario = single_order_scenario()
        operations = run_edf_baseline(scenario)
        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=0,
            to_minute=20000,
            now=0,
            reason="loom destroyed",
        )
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok is False
        assert result.schedule is None
        assert result.error is not None

    @needs_ortools
    def test_infeasible_replan_with_cpsat(self) -> None:
        scenario = single_order_scenario()
        operations = run_edf_baseline(scenario)
        disruption = Disruption(
            type=DisruptionType.MACHINE_DOWN,
            machine="WEAVE-01",
            from_minute=0,
            to_minute=20000,
            now=0,
        )
        result = replan(scenario, operations, disruption, solver="cpsat")
        assert result.ok is False
        assert result.schedule is None
        assert "INFEASIBLE" in result.error

    def test_unknown_machine_rejected(self) -> None:
        scenario = single_order_scenario()
        with pytest.raises(ValueError, match="unknown machine"):
            apply_disruption(
                scenario,
                run_edf_baseline(scenario),
                Disruption(
                    type=DisruptionType.MACHINE_DOWN,
                    machine="WEAVE-99",
                    from_minute=0,
                    to_minute=100,
                    now=0,
                ),
            )

    def test_unknown_order_rejected(self) -> None:
        scenario = single_order_scenario()
        with pytest.raises(ValueError, match="unknown order"):
            apply_disruption(
                scenario,
                run_edf_baseline(scenario),
                Disruption(
                    type=DisruptionType.YARN_DELAY,
                    order="ORD-999",
                    delay_minutes=60,
                    now=0,
                ),
            )


class TestDiffAgainstKnownSchedules:
    def test_moved_operation_delta(self) -> None:
        scenario = single_order_scenario()
        before = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        after = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=100,
                end=1300,
            )
        ]
        diff = _compute_diff(scenario, before, scenario, after, [], 0)
        assert len(diff.moved_operations) == 1
        move = diff.moved_operations[0]
        assert move["old_start"] == 0
        assert move["new_start"] == 100
        assert move["delta_minutes"] == 100
        assert move["machine_changed"] is False

    def test_machine_change_flagged(self) -> None:
        scenario = single_order_scenario(
            machines=[
                Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ],
            orders=[
                Order(
                    id="ORD-001",
                    metres=1200,
                    due=15000,
                    priority_weight=3,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01", "SPIN-02"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ],
        )
        before = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=1200,
            )
        ]
        after = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-02",
                start=0,
                end=1200,
            )
        ]
        diff = _compute_diff(scenario, before, scenario, after, [], 0)
        move = diff.moved_operations[0]
        assert move["old_machine"] == "SPIN-01"
        assert move["new_machine"] == "SPIN-02"
        assert move["machine_changed"] is True
        assert move["delta_minutes"] == 0

    def test_recovered_orders_reported(self) -> None:
        scenario = single_order_scenario()
        before = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=14000,
                end=16400,  # late (due 15000)
            )
        ]
        after = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=12000,
                end=14400,  # recovered
            )
        ]
        diff = _compute_diff(scenario, before, scenario, after, [], 0)
        assert diff.recovered == ["ORD-001"]
        assert diff.now_late == []
        assert diff.moved_orders[0]["delta_minutes"] == -2000

    def test_interruption_diff_fields(self) -> None:
        scenario, operations, disruption = interrupt_spin()
        result = replan(scenario, operations, disruption, solver="edf")
        assert result.ok
        diff = result.diff
        assert diff.impact["kind"] == "machine_down"
        assert diff.impact["machine"] == "SPIN-01"
        assert diff.impact["reason"] == "spindle failure"
        assert diff.frozen_count == len(result.new_scenario.frozen)
        assert diff.split_count == 1
        assert diff.metrics_before is not None
        assert diff.metrics_after is not None
        remainder_moves = [m for m in diff.moved_operations if m["order"] == "ORD-001-R"]
        assert remainder_moves
        assert all(m["old_start"] is None for m in remainder_moves)
