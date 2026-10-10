"""Audit property tests: validity, honest failure, determinism, monotonicity.

Scenarios are valid by construction (generous dues, small lots, complete
eligibility), so EDF dispatch must always succeed and validate cleanly. A
deliberately broken variant per property then proves the honest response.
CP-SAT is intentionally excluded from the hypothesis loop (solver time per
example); optimality comparison lives in deterministic unit tests.
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import (
    DowntimeWindow,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    Schedule,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationResult,
)
from textile_scheduler.validator import ScheduleValidator, validate_schedule

MACHINES = [
    Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
    Machine(id="SPIN-02", stage=Stage.SPINNING, rate_m_per_hour=50),
    Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
    Machine(id="WEAVE-02", stage=Stage.WEAVING, rate_m_per_hour=35),
    Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
]
MACHINE_IDS = [m.id for m in MACHINES]
HORIZON = 10080


@st.composite
def valid_scenario(draw) -> Scenario:
    n_orders = draw(st.integers(min_value=1, max_value=3))
    orders = []
    for i in range(1, n_orders + 1):
        orders.append(
            Order(
                id=f"ORD-{i:03d}",
                metres=draw(st.integers(min_value=100, max_value=600)),
                due=HORIZON,
                priority_weight=draw(st.integers(min_value=1, max_value=5)),
                yarn_ready=0,
                eligible=OrderEligibility(
                    spinning=["SPIN-01", "SPIN-02"],
                    weaving=["WEAVE-01", "WEAVE-02"],
                    dyeing=["DYE-01"],
                ),
            )
        )
    return Scenario(
        scenario_id="audit-property",
        horizon=HORIZON,
        machines=list(MACHINES),
        orders=orders,
    )


def _validate(scenario: Scenario, operations):
    schedule = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=SolverStatus.FEASIBLE,
        compute_seconds=0.0,
        validation=ValidationResult(violations=[]),
        metrics=compute_metrics(scenario, operations),
        operations=operations,
    )
    return validate_schedule(scenario, schedule)


def _codes(result) -> set[str]:
    return {v.code for v in result.violations}


class TestAuditProperties:
    @given(valid_scenario())
    @settings(max_examples=20)
    def test_feasible_success_validates_clean(self, scenario: Scenario) -> None:
        """Every successful schedule passes the independent validator."""
        operations = run_edf_baseline(scenario)
        assert len(operations) == 3 * len(scenario.orders)
        result = _validate(scenario, operations)
        assert result.is_valid, result.violations

    @given(valid_scenario(), st.integers(min_value=0, max_value=2))
    @settings(max_examples=20)
    def test_infeasible_reports_failure_honestly(self, scenario: Scenario, victim: int) -> None:
        """Blanking one order-stage eligibility fails naming the order."""
        order = scenario.orders[victim % len(scenario.orders)]
        stage = scenario.route[victim % len(scenario.route)]
        eligibility = order.eligible.model_copy(update={stage.value: []})
        broken = order.model_copy(update={"eligible": eligibility})
        broken_scenario = scenario.model_copy(
            update={"orders": [broken if o.id == order.id else o for o in scenario.orders]}
        )
        with pytest.raises(RuntimeError, match=order.id):
            run_edf_baseline(broken_scenario)

    @given(valid_scenario())
    @settings(max_examples=20)
    def test_deterministic_dispatch(self, scenario: Scenario) -> None:
        """Identical input and configuration give identical logical results."""
        first = run_edf_baseline(scenario)
        second = run_edf_baseline(scenario)
        assert [(o.order, o.stage, o.machine, o.start, o.end) for o in first] == [
            (o.order, o.stage, o.machine, o.start, o.end) for o in second
        ]

    @given(valid_scenario())
    @settings(max_examples=20)
    def test_added_downtime_never_enlarges_space(self, scenario: Scenario) -> None:
        """A far-future window preserves validity; an overlapping one adds R09."""
        operations = run_edf_baseline(scenario)
        assert _validate(scenario, operations).is_valid

        far = DowntimeWindow(start=HORIZON - 50, end=HORIZON, reason="audit")
        machines = [
            m.model_copy(update={"downtime": [*m.downtime, far]}) if m.id == "SPIN-01" else m
            for m in scenario.machines
        ]
        augmented = scenario.model_copy(update={"machines": machines})
        assert _validate(augmented, operations).is_valid

        victim = operations[0]
        clash = DowntimeWindow(start=victim.start, end=victim.end, reason="audit")
        machines = [
            m.model_copy(update={"downtime": [*m.downtime, clash]}) if m.id == victim.machine else m
            for m in scenario.machines
        ]
        clashed = scenario.model_copy(update={"machines": machines})
        result = _validate(clashed, operations)
        assert "R09_DOWNTIME_OVERLAP" in _codes(result)

    @given(valid_scenario())
    @settings(max_examples=20)
    def test_raised_yarn_ready_never_enlarges_space(self, scenario: Scenario) -> None:
        """Raising yarn-ready past a first-op start adds R10, nothing else."""
        operations = run_edf_baseline(scenario)
        assert _validate(scenario, operations).is_valid

        first_spin = min(
            (o for o in operations if o.stage == Stage.SPINNING),
            key=lambda o: o.start,
        )
        orders = [
            o.model_copy(update={"yarn_ready": first_spin.start + 1})
            if o.id == first_spin.order
            else o
            for o in scenario.orders
        ]
        raised = scenario.model_copy(update={"orders": orders})
        result = _validate(raised, operations)
        assert "R10_YARN_READY" in _codes(result)

    @given(valid_scenario())
    @settings(max_examples=20)
    def test_validator_never_mutates(self, scenario: Scenario) -> None:
        operations = run_edf_baseline(scenario)
        schedule = Schedule(
            scenario_id=scenario.scenario_id,
            solver=SchedulerType.EDF,
            status=SolverStatus.FEASIBLE,
            compute_seconds=0.0,
            validation=ValidationResult(violations=[]),
            metrics=compute_metrics(scenario, operations),
            operations=operations,
        )
        before = schedule.model_dump()
        ScheduleValidator(scenario).validate(schedule)
        assert schedule.model_dump() == before
