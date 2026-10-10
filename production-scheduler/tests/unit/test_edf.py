"""Spec tests for the event-driven EDF baseline scheduler.

Covers dispatch order and deterministic tie-breaks, earliest-completion
machine choice across rates, downtime/yarn handling, explicit infeasibility,
empty/invalid input, and the structured result contract (wall-clock time,
independent validation, invalid output never published as successful).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from textile_scheduler.baseline import run_edf, run_edf_baseline
from textile_scheduler.loader import load_scenario_file
from textile_scheduler.models import (
    FrozenOperation,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    SolverStatus,
    Stage,
)

ROOT = Path(__file__).resolve().parents[2]


def spinning_order(
    oid: str, metres: int = 1200, due: int = 9000, priority: int = 3, yarn: int = 0
) -> Order:
    return Order(
        id=oid,
        metres=metres,
        due=due,
        priority_weight=priority,
        yarn_ready=yarn,
        eligible=OrderEligibility(spinning=["SPIN-01"], weaving=["WEAVE-01"], dyeing=["DYE-01"]),
    )


def basic_scenario(**overrides) -> Scenario:
    params: dict = {
        "scenario_id": "edf-test",
        "horizon": 20000,
        "machines": [
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ],
        "orders": [spinning_order("ORD-001")],
    }
    params.update(overrides)
    return Scenario(**params)


def spin_start(operations, order_id: str) -> int:
    return next(
        op.start for op in operations if op.order == order_id and op.stage == Stage.SPINNING
    )


class TestDispatch:
    def test_single_order_single_machine_per_stage(self) -> None:
        schedule = run_edf(basic_scenario())
        assert schedule.status == SolverStatus.FEASIBLE
        assert len(schedule.operations) == 3
        assert schedule.validation.is_valid

    def test_orders_sharing_one_machine_queue_without_overlap(self) -> None:
        scenario = basic_scenario(orders=[spinning_order("ORD-001"), spinning_order("ORD-002")])
        schedule = run_edf(scenario)
        assert schedule.validation.is_valid
        spins = sorted((op.start, op.end) for op in schedule.operations if op.machine == "SPIN-01")
        assert spins[0][1] <= spins[1][0]

    def test_earliest_completion_machine_choice(self) -> None:
        """A slow idle machine beats a fast busy one when it finishes first."""
        scenario = Scenario(
            scenario_id="machine-choice",
            horizon=20000,
            machines=[
                Machine(id="SPIN-FAST", stage=Stage.SPINNING, rate_m_per_hour=120),
                Machine(id="SPIN-SLOW", stage=Stage.SPINNING, rate_m_per_hour=30),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ],
            orders=[
                Order(
                    id="ORD-X",
                    metres=3000,  # 1500 min on FAST: occupies it 0-1500
                    due=2000,
                    priority_weight=1,
                    eligible=OrderEligibility(
                        spinning=["SPIN-FAST"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
                Order(
                    id="ORD-Y",
                    metres=600,  # 300 min on FAST (end 1800) vs 1200 on SLOW
                    due=5000,
                    priority_weight=1,
                    eligible=OrderEligibility(
                        spinning=["SPIN-FAST", "SPIN-SLOW"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
            ],
        )
        schedule = run_edf(scenario)
        assert schedule.validation.is_valid
        y_spin = next(
            op for op in schedule.operations if op.order == "ORD-Y" and op.stage == Stage.SPINNING
        )
        assert y_spin.machine == "SPIN-SLOW"
        assert (y_spin.start, y_spin.end) == (0, 1200)

    def test_higher_priority_wins_due_tie(self) -> None:
        scenario = basic_scenario(
            orders=[
                spinning_order("ORD-A", due=5000, priority=5),
                spinning_order("ORD-B", due=5000, priority=3),
            ]
        )
        schedule = run_edf(scenario)
        assert spin_start(schedule.operations, "ORD-A") == 0
        assert spin_start(schedule.operations, "ORD-B") == 1200

    def test_order_id_breaks_full_tie_deterministically(self) -> None:
        scenario = basic_scenario(
            orders=[
                spinning_order("ORD-002", due=5000, priority=3),
                spinning_order("ORD-001", due=5000, priority=3),
            ]
        )
        first = run_edf(scenario)
        second = run_edf(scenario)
        assert spin_start(first.operations, "ORD-001") == 0
        assert [(o.order, o.stage, o.machine, o.start, o.end) for o in first.operations] == [
            (o.order, o.stage, o.machine, o.start, o.end) for o in second.operations
        ]

    def test_downtime_avoided(self) -> None:
        from textile_scheduler.models import DowntimeWindow

        scenario = basic_scenario(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    downtime=[DowntimeWindow(start=0, end=1000)],
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        schedule = run_edf(scenario)
        assert schedule.validation.is_valid
        assert spin_start(schedule.operations, "ORD-001") == 1000

    def test_yarn_delay_gates_first_operation(self) -> None:
        scenario = basic_scenario(orders=[spinning_order("ORD-001", yarn=2500)])
        schedule = run_edf(scenario)
        assert schedule.validation.is_valid
        assert spin_start(schedule.operations, "ORD-001") == 2500


class TestStructuredResult:
    def test_result_contract(self) -> None:
        schedule = run_edf(basic_scenario())
        assert schedule.scenario_id == "edf-test"
        assert schedule.solver.value == "edf"
        assert schedule.status == SolverStatus.FEASIBLE
        assert schedule.compute_seconds >= 0
        assert schedule.validation.is_valid
        assert schedule.metrics.makespan > 0

    def test_invalid_output_marked_failed(self) -> None:
        """A frozen operation with a wrong duration fails validation."""
        scenario = basic_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=500,  # wrong: 1200m @ 60 needs 1200 min
                )
            ]
        )
        schedule = run_edf(scenario)
        assert schedule.status == SolverStatus.MODEL_INVALID
        assert not schedule.validation.is_valid
        assert any(v.code == "R06_DURATION_MISMATCH" for v in schedule.validation.violations)

    def test_empty_scenario_succeeds_empty(self) -> None:
        schedule = run_edf(Scenario(scenario_id="empty", machines=[], orders=[]))
        assert schedule.status == SolverStatus.FEASIBLE
        assert schedule.operations == []
        assert schedule.validation.is_valid

    def test_invalid_input_rejected(self) -> None:
        with pytest.raises(ValidationError, match="Duplicate order IDs"):
            basic_scenario(orders=[spinning_order("ORD-001"), spinning_order("ORD-001")])


class TestInfeasibility:
    def test_infeasible_horizon_raises(self) -> None:
        scenario = basic_scenario(horizon=500)
        with pytest.raises(RuntimeError, match="ORD-001"):
            run_edf_baseline(scenario)

    def test_no_eligible_machine_raises(self) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / "infeasible_load.json")
        with pytest.raises(RuntimeError, match="ORD-012"):
            run_edf(scenario)

    def test_no_orders_silently_omitted(self) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / "feasible_load.json")
        schedule = run_edf(scenario)
        by_order = {op.order for op in schedule.operations}
        assert by_order == {o.id for o in scenario.orders}
        assert len(schedule.operations) == 3 * len(scenario.orders)


class TestRepresentativeScenarios:
    @pytest.mark.parametrize(
        "name", ["feasible_load.json", "weaving_breakdown.json", "late_yarn_lot.json"]
    )
    def test_zero_violations(self, name: str) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / name)
        schedule = run_edf(scenario)
        assert schedule.status == SolverStatus.FEASIBLE
        assert schedule.validation.is_valid, schedule.validation.violations
