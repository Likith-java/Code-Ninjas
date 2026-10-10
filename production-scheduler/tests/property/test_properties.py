"""Property-based tests using Hypothesis."""

import pytest
from hypothesis import given, settings, strategies as st
from hypothesis.strategies import integers, lists, sampled_from, text

from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    Stage,
    DowntimeWindow,
)
from textile_scheduler.durations import compute_duration
from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.validator import validate_schedule
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import Schedule, SchedulerType, SolverStatus, ValidationResult


# Hypothesis strategies for generating test data


@st.composite
def stage_strategy(draw):
    return draw(sampled_from([Stage.SPINNING, Stage.WEAVING, Stage.DYEING]))


@st.composite
def machine_strategy(draw):
    return Machine(
        id=draw(text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-", min_size=1, max_size=10)),
        stage=draw(stage_strategy()),
        rate_m_per_hour=draw(integers(min_value=10, max_value=100)),
    )


@st.composite
def order_eligibility_strategy(draw, machine_ids: list[str]):
    if not machine_ids:
        return OrderEligibility()
    spinning = draw(lists(sampled_from(machine_ids), min_size=0, max_size=3, unique=True))
    weaving = draw(lists(sampled_from(machine_ids), min_size=0, max_size=3, unique=True))
    dyeing = draw(lists(sampled_from(machine_ids), min_size=0, max_size=3, unique=True))
    return OrderEligibility(spinning=spinning, weaving=weaving, dyeing=dyeing)


@st.composite
def order_strategy(draw, machine_ids: list[str]):
    return Order(
        id=draw(text(alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-", min_size=1, max_size=10)),
        buyer=draw(text(min_size=1, max_size=20)),
        fabric=draw(text(min_size=1, max_size=20)),
        colour=draw(text(min_size=1, max_size=20)),
        metres=draw(integers(min_value=100, max_value=10000)),
        due=draw(integers(min_value=1000, max_value=20000)),
        priority_weight=draw(integers(min_value=1, max_value=10)),
        yarn_ready=draw(integers(min_value=0, max_value=5000)),
        eligible=draw(order_eligibility_strategy(machine_ids)),
    )


@st.composite
def scenario_strategy(draw):
    num_machines = draw(integers(min_value=3, max_value=6))
    machines = draw(
        lists(
            machine_strategy(),
            min_size=num_machines,
            max_size=num_machines,
            unique_by=lambda m: m.id,
        )
    )

    machine_ids = [m.id for m in machines]
    num_orders = draw(integers(min_value=1, max_value=4))
    orders = draw(
        lists(
            order_strategy(machine_ids),
            min_size=num_orders,
            max_size=num_orders,
            unique_by=lambda o: o.id,
        )
    )

    # Ensure at least one machine per stage
    stages_present = {m.stage for m in machines}
    if len(stages_present) < 3:
        # Skip scenarios without all stages
        return None

    return Scenario(
        name="property_test",
        synthetic=True,
        now=draw(integers(min_value=0, max_value=1000)),
        horizon=draw(integers(min_value=5000, max_value=15000)),
        machines=machines,
        orders=orders,
    )


class TestDurationProperties:
    """Property tests for duration function."""

    @given(integers(min_value=1, max_value=10000), integers(min_value=1, max_value=100))
    @settings(max_examples=100)
    def test_duration_positive(self, metres: int, rate: int) -> None:
        """Duration should always be positive."""
        dur = compute_duration(metres, rate)
        assert dur > 0

    @given(integers(min_value=1, max_value=10000), integers(min_value=1, max_value=100))
    @settings(max_examples=100)
    def test_duration_monotonic_metres(self, rate: int) -> None:
        """Duration should increase with metres."""
        m1 = 1000
        m2 = 2000
        assert compute_duration(m2, rate) >= compute_duration(m1, rate)

    @given(integers(min_value=1, max_value=10000), integers(min_value=1, max_value=100))
    @settings(max_examples=100)
    def test_duration_monotonic_rate(self, metres: int) -> None:
        """Duration should decrease with rate."""
        r1 = 30
        r2 = 60
        assert compute_duration(metres, r2) <= compute_duration(metres, r1)

    @given(integers(min_value=1, max_value=10000), integers(min_value=1, max_value=100))
    @settings(max_examples=100)
    def test_duration_formula(self, metres: int, rate: int) -> None:
        """Duration should equal ceil(metres * 60 / rate)."""
        from math import ceil

        expected = ceil(metres * 60 / rate)
        assert compute_duration(metres, rate) == expected


class TestBaselineProperties:
    """Property tests for EDF baseline scheduler."""

    @given(scenario_strategy())
    @settings(max_examples=20, suppress_health_check=[pytest.FunctionScopedFixture])
    def test_baseline_schedules_all_stages(self, scenario: Scenario | None) -> None:
        """If scenario is valid, baseline should schedule all stages for each order."""
        if scenario is None:
            pytest.skip("Invalid scenario generated")

        try:
            operations = run_edf_baseline(scenario)
        except RuntimeError:
            # Scenario may be infeasible
            pytest.skip("Scenario infeasible for EDF")

        # Each order should have exactly 3 operations (one per stage)
        by_order: dict[str, list] = {}
        for op in operations:
            by_order.setdefault(op.order, []).append(op)

        for order in scenario.orders:
            if order.id in by_order:
                stages = {op.stage for op in by_order[order.id]}
                # Should have all stages that are in route and have eligible machines
                expected_stages = {s for s in scenario.route if order.eligible.get_machines(s)}
                assert stages == expected_stages

    @given(scenario_strategy())
    @settings(max_examples=20)
    def test_baseline_no_machine_overlap(self, scenario: Scenario | None) -> None:
        """Baseline schedule should never have machine overlaps."""
        if scenario is None:
            pytest.skip("Invalid scenario generated")

        try:
            operations = run_edf_baseline(scenario)
        except RuntimeError:
            pytest.skip("Scenario infeasible for EDF")

        by_machine: dict[str, list] = {}
        for op in operations:
            by_machine.setdefault(op.machine, []).append(op)

        for ops in by_machine.values():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                assert ops_sorted[i].end <= ops_sorted[i + 1].start

    @given(scenario_strategy())
    @settings(max_examples=20)
    def test_baseline_respects_route_order(self, scenario: Scenario | None) -> None:
        """Operations for each order should follow route order."""
        if scenario is None:
            pytest.skip("Invalid scenario generated")

        try:
            operations = run_edf_baseline(scenario)
        except RuntimeError:
            pytest.skip("Scenario infeasible for EDF")

        by_order: dict[str, list] = {}
        for op in operations:
            by_order.setdefault(op.order, []).append(op)

        route_idx = {s: i for i, s in enumerate(scenario.route)}
        for ops in by_order.values():
            ops_sorted = sorted(ops, key=lambda o: o.start)
            for i in range(len(ops_sorted) - 1):
                curr_idx = route_idx.get(ops_sorted[i].stage, -1)
                next_idx = route_idx.get(ops_sorted[i + 1].stage, -1)
                assert curr_idx <= next_idx, (
                    f"Route order violated: {ops_sorted[i].stage} -> {ops_sorted[i + 1].stage}"
                )
                assert ops_sorted[i].end <= ops_sorted[i + 1].start


class TestValidatorProperties:
    """Property tests for validator."""

    @given(scenario_strategy())
    @settings(max_examples=10)
    def test_validator_rejects_broken_schedule(self, scenario: Scenario | None) -> None:
        """Validator should reject schedules with known violations."""
        if scenario is None:
            pytest.skip("Invalid scenario generated")

        # Create a schedule with deliberate violation: wrong duration
        operations = []
        for order in scenario.orders[:1]:
            for stage in scenario.route:
                eligible = order.eligible.get_machines(stage)
                if eligible:
                    machine = eligible[0]
                    m = next((m for m in scenario.machines if m.id == machine), None)
                    if m:
                        # Use wrong duration (1 minute instead of correct)
                        operations.append(
                            ScheduledOperation(
                                order=order.id, stage=stage, machine=machine, start=0, end=1
                            )
                        )

        if not operations:
            pytest.skip("No valid operations generated")

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

        # Should have Rule 3 violation (duration mismatch)
        assert not validation.is_valid
        assert any(v.rule == 3 for v in validation.violations)
