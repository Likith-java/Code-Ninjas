"""Audit unit tests: loader consistency warnings, zero-late metrics, API surface."""

from __future__ import annotations

from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.loader import check_consistency
from textile_scheduler.metrics import (
    compute_metrics,
    count_at_risk_orders,
    count_late_orders,
)
from textile_scheduler.models import (
    DowntimeWindow,
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    Stage,
)


def base_parts(**overrides):
    machines = [
        Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
        Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
        Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
    ]
    orders = [
        Order(
            id="ORD-001",
            metres=600,
            due=10000,
            priority_weight=2,
            eligible=OrderEligibility(
                spinning=["SPIN-01"],
                weaving=["WEAVE-01"],
                dyeing=["DYE-01"],
            ),
        )
    ]
    params: dict = {
        "scenario_id": "audit-unit",
        "horizon": 10080,
        "machines": machines,
        "orders": orders,
    }
    params.update(overrides)
    return Scenario(**params)


class TestLoaderWarnings:
    def test_clean_scenario_no_warnings(self) -> None:
        assert check_consistency(base_parts()) == []

    def test_dangling_reference_warning(self) -> None:
        scenario = base_parts(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=10000,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["NOPE-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        warnings = check_consistency(scenario)
        assert any("unknown machines" in w and "NOPE-01" in w for w in warnings)

    def test_wrong_stage_warning(self) -> None:
        scenario = base_parts(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=10000,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["WEAVE-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        warnings = check_consistency(scenario)
        assert any("wrong-stage" in w for w in warnings)

    def test_downtime_beyond_horizon_warning(self) -> None:
        scenario = base_parts(
            machines=[
                Machine(
                    id="SPIN-01",
                    stage=Stage.SPINNING,
                    rate_m_per_hour=60,
                    downtime=[DowntimeWindow(start=9000, end=12000)],
                ),
                Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
                Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
            ]
        )
        warnings = check_consistency(scenario)
        assert any("exceeds horizon" in w for w in warnings)

    def test_yarn_after_due_warning(self) -> None:
        scenario = base_parts(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=1000,
                    priority_weight=2,
                    yarn_ready=2000,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        warnings = check_consistency(scenario)
        assert any("is after due" in w for w in warnings)

    def test_due_beyond_horizon_is_soft_cost_note(self) -> None:
        scenario = base_parts(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=20000,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                )
            ]
        )
        warnings = check_consistency(scenario)
        assert any("soft cost" in w for w in warnings)

    def test_now_beyond_horizon_warning(self) -> None:
        scenario = base_parts(now=20000)
        warnings = check_consistency(scenario)
        assert any("now" in w and "beyond horizon" in w for w in warnings)


class TestZeroLateMetrics:
    def test_all_on_time_zero_tardiness(self) -> None:
        scenario = base_parts()
        operations = run_edf_baseline(scenario)
        metrics = compute_metrics(scenario, operations)
        assert metrics.weighted_tardiness == 0.0
        assert metrics.on_time_rate == 1.0
        assert count_late_orders(scenario, operations) == 0
        assert count_at_risk_orders(scenario, operations) == 0


class TestApiSurface:
    def test_exception_hierarchy(self) -> None:
        from textile_scheduler.exceptions import (
            DataError,
            DisruptionError,
            InfeasibleScenarioError,
            SchedulerError,
            SolverError,
            SolverTimeoutError,
            ValidationError,
        )

        for cls in (
            ValidationError,
            InfeasibleScenarioError,
            SolverTimeoutError,
            SolverError,
            DisruptionError,
            DataError,
        ):
            assert issubclass(cls, SchedulerError)
            assert issubclass(cls, Exception)

    def test_public_modules_import_cleanly(self) -> None:
        import textile_scheduler.benchmark
        import textile_scheduler.contracts
        import textile_scheduler.loader

        assert textile_scheduler.benchmark.TARGET_IMPROVEMENT_PCT == 20.0
        assert textile_scheduler.contracts.CONTRACT_VERSION == "1"
        assert callable(textile_scheduler.loader.load_scenario_file)
