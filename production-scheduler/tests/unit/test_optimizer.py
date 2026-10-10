"""Tests for the CP-SAT optimizer: objective math, hand-solvable models,
infeasibility semantics, and honest status reporting.

Objective and configuration tests run without OR-Tools; solver tests skip
when the `[optimizer]` extra is not installed. No test promises an
improvement margin -- optimisation is verified correct first, then measured.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from textile_scheduler.baseline import run_edf
from textile_scheduler.durations import compute_duration
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
from textile_scheduler.optimizer import (
    DEFAULT_TIME_LIMIT_SECONDS,
    SolverConfig,
    lexicographic_coefficient,
    objective_terms,
    optimize,
    run_cpsat_optimizer,
)

ROOT = Path(__file__).resolve().parents[2]
HAS_ORTOOLS = importlib.util.find_spec("ortools") is not None
needs_ortools = pytest.mark.skipif(not HAS_ORTOOLS, reason="OR-Tools not installed")


def tiny_scenario(**overrides) -> Scenario:
    params: dict = {
        "scenario_id": "cpsat-tiny",
        "horizon": 5000,
        "machines": [
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ],
        "orders": [
            Order(
                id="ORD-001",
                metres=600,
                due=4000,
                priority_weight=2,
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


class TestSolverConfig:
    def test_defaults(self) -> None:
        assert DEFAULT_TIME_LIMIT_SECONDS == 10.0
        config = SolverConfig()
        assert config.time_limit_seconds == 10.0
        assert config.num_workers == 8
        assert config.random_seed == 42


class TestObjectiveMath:
    def test_terms_hand_computed(self) -> None:
        scenario = tiny_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=100,
                    priority_weight=2,
                    eligible=OrderEligibility(),
                ),
                Order(
                    id="ORD-002",
                    metres=600,
                    due=200,
                    priority_weight=3,
                    eligible=OrderEligibility(),
                ),
            ]
        )
        # ORD-001 completes at 150: tardy 50 x weight 2 = 100.
        # ORD-002 completes at 180: on time.
        primary, secondary, total = objective_terms({"ORD-001": 150, "ORD-002": 180}, scenario)
        assert primary == 100
        assert secondary == 330
        n, horizon = 2, scenario.horizon
        assert total == (n * horizon + 1) * 100 + 330

    def test_coefficient_dominates_secondary(self) -> None:
        scenario = tiny_scenario()
        n, horizon = len(scenario.orders), scenario.horizon
        coefficient = lexicographic_coefficient(scenario)
        assert coefficient == n * horizon + 1
        # Worst case: A has the maximum secondary swing but one unit less
        # primary than B; A must still win.
        due = scenario.orders[0].due
        total_a = coefficient * 0 + n * horizon
        total_b = coefficient * 1 + 0
        assert total_a < total_b
        assert due >= 0  # due values are ordinary inputs to the same math

    def test_missing_orders_skipped(self) -> None:
        scenario = tiny_scenario()
        primary, secondary, _ = objective_terms({}, scenario)
        assert (primary, secondary) == (0, 0)


@needs_ortools
class TestHandSolvable:
    def test_single_order_proves_optimal(self) -> None:
        schedule = optimize(tiny_scenario(), time_limit_seconds=10)
        assert schedule.status == SolverStatus.OPTIMAL
        assert len(schedule.operations) == 3
        assert schedule.validation.is_valid

    def test_machine_dependent_durations(self) -> None:
        """The chosen machine determines the duration (rates differ)."""
        scenario = tiny_scenario(
            machines=[
                Machine(id="SPIN-FAST", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="SPIN-SLOW", stage=Stage.SPINNING, rate_m_per_hour=30),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ],
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=4000,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["SPIN-FAST", "SPIN-SLOW"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ],
        )
        assert compute_duration(600, 60) != compute_duration(600, 30)
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.status == SolverStatus.OPTIMAL
        assert schedule.validation.is_valid
        spin = next(op for op in schedule.operations if op.stage == Stage.SPINNING)
        rate = 60 if spin.machine == "SPIN-FAST" else 30
        assert spin.end - spin.start == compute_duration(600, rate)

    def test_downtime_avoided(self) -> None:
        from textile_scheduler.models import DowntimeWindow

        scenario = tiny_scenario(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    downtime=[DowntimeWindow(start=0, end=500)],
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        spin = next(op for op in schedule.operations if op.stage == Stage.SPINNING)
        assert spin.start >= 500

    def test_precedence_and_horizon(self) -> None:
        schedule = optimize(tiny_scenario(), time_limit_seconds=10)
        by_stage = {op.stage: op for op in schedule.operations}
        assert by_stage[Stage.SPINNING].end <= by_stage[Stage.WEAVING].start
        assert by_stage[Stage.WEAVING].end <= by_stage[Stage.DYEING].start
        assert all(op.end <= 5000 for op in schedule.operations)

    def test_reproducible_with_fixed_seed(self) -> None:
        scenario = tiny_scenario()
        first = optimize(scenario, time_limit_seconds=5, random_seed=42)
        second = optimize(scenario, time_limit_seconds=5, random_seed=42)
        assert [(o.order, o.stage, o.machine, o.start, o.end) for o in first.operations] == [
            (o.order, o.stage, o.machine, o.start, o.end) for o in second.operations
        ]

    def test_warm_start_from_validated_edf(self) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / "late_yarn_lot.json")
        hints = run_edf(scenario).operations
        status, operations, _ = run_cpsat_optimizer(
            scenario, time_limit_seconds=5, warm_start_ops=hints
        )
        assert status in (SolverStatus.OPTIMAL, SolverStatus.FEASIBLE)
        assert len(operations) == 36


@needs_ortools
class TestStatusSemantics:
    def test_horizon_infeasible(self) -> None:
        schedule = optimize(tiny_scenario(horizon=100), time_limit_seconds=5)
        assert schedule.status == SolverStatus.INFEASIBLE
        assert schedule.operations == []
        assert schedule.warnings

    def test_infeasible_scenario_file(self) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / "infeasible_load.json")
        schedule = optimize(scenario, time_limit_seconds=5)
        assert schedule.status == SolverStatus.INFEASIBLE
        assert schedule.operations == []
        assert any("infeasible" in w for w in schedule.warnings)

    def test_timeout_returns_no_partial_plan(self) -> None:
        scenario = load_scenario_file(ROOT / "scenarios" / "feasible_load.json")
        schedule = optimize(scenario, time_limit_seconds=0)
        assert schedule.status == SolverStatus.UNKNOWN
        assert schedule.operations == []
        assert any("partial plan" in w for w in schedule.warnings)

    def test_contradictory_frozen_interval_proves_infeasible(self) -> None:
        """A frozen interval contradicting the machine duration is refused.

        The model enforces duration consistency as a hard constraint, so a
        bad frozen interval yields proven INFEASIBLE rather than a published
        invalid schedule. The MODEL_INVALID branch in optimize() remains as
        a defensive net for any future divergence.
        """
        scenario = tiny_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=0,
                    end=100,  # wrong: 600m @ 60 needs 600 min
                )
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.status == SolverStatus.INFEASIBLE
        assert schedule.operations == []


@needs_ortools
class TestHardConstraints:
    """CP-SAT honors the same hard constraints as EDF and the validator."""

    def test_machine_eligibility_honored(self) -> None:
        scenario = tiny_scenario(
            machines=[
                Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=60),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        for op in schedule.operations:
            order = next(o for o in scenario.orders if o.id == op.order)
            assert op.machine in order.eligible.get_machines(op.stage)

    def test_yarn_ready_honored(self) -> None:
        scenario = tiny_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=4000,
                    priority_weight=2,
                    yarn_ready=1000,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        first = min(op for op in schedule.operations if op.stage == Stage.SPINNING)
        assert first.start >= 1000

    def test_availability_horizon_honored(self) -> None:
        scenario = tiny_scenario(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    available_until=2000,
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        for op in schedule.operations:
            if op.machine == "SPIN-01":
                assert op.end <= 2000

    def test_frozen_operations_preserved(self) -> None:
        scenario = tiny_scenario(
            frozen=[
                FrozenOperation(
                    order="ORD-001",
                    stage=Stage.SPINNING,
                    machine="SPIN-01",
                    start=100,
                    end=700,
                )
            ]
        )
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        spin = next(op for op in schedule.operations if op.stage == Stage.SPINNING)
        assert (spin.start, spin.end, spin.machine) == (100, 700, "SPIN-01")

    def test_unfrozen_work_starts_after_now(self) -> None:
        scenario = tiny_scenario(now=500)
        schedule = optimize(scenario, time_limit_seconds=10)
        assert schedule.validation.is_valid
        assert all(op.start >= 500 for op in schedule.operations)


@needs_ortools
class TestOptimalityComparison:
    """CP-SAT at OPTIMAL is no worse than EDF under the same objective."""

    @pytest.mark.parametrize("metres,due", [(600, 4000), (1200, 9000), (300, 2000)])
    def test_optimal_dominates_edf_primary(self, metres: int, due: int) -> None:
        from textile_scheduler.baseline import run_edf
        from textile_scheduler.metrics import order_completions
        from textile_scheduler.optimizer import objective_terms

        scenario = tiny_scenario(
            horizon=20000,
            orders=[
                Order(
                    id="ORD-001",
                    metres=metres,
                    due=due,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ],
        )
        edf = run_edf(scenario)
        cpsat = optimize(scenario, time_limit_seconds=10)
        assert cpsat.status == SolverStatus.OPTIMAL
        edf_primary, _, _ = objective_terms(
            {
                oid: c
                for oid, c in order_completions(scenario, edf.operations).items()
                if c is not None
            },
            scenario,
        )
        cpsat_primary, _, _ = objective_terms(
            {
                oid: c
                for oid, c in order_completions(scenario, cpsat.operations).items()
                if c is not None
            },
            scenario,
        )
        assert cpsat_primary <= edf_primary

    def test_measures_against_edf_without_promises(self) -> None:
        """Correctness first: CP-SAT tardiness is measured, not promised."""
        scenario = load_scenario_file(ROOT / "scenarios" / "feasible_load.json")
        edf = run_edf(scenario)
        cpsat = optimize(scenario, time_limit_seconds=3)
        assert cpsat.validation.is_valid
        assert cpsat.metrics.weighted_tardiness <= edf.metrics.weighted_tardiness + 1e-9
