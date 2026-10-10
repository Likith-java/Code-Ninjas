"""Tests for shared metric definitions and the benchmark runner."""

from __future__ import annotations

import csv
import importlib.util
import json
from pathlib import Path

import pytest

from textile_scheduler.benchmark import (
    BenchmarkConfig,
    SolverRun,
    canonical_scenario_hash,
    compare_runs,
    compare_scenario,
    comparison_to_csv,
    percent_change,
    report_to_json,
    report_to_markdown,
    run_benchmark,
    tardiness_improvement_pct,
    write_markdown,
)
from textile_scheduler.metrics import (
    compute_metrics,
    count_at_risk_orders,
    count_completed_within_horizon,
    count_late_orders,
    is_order_at_risk,
    order_completions,
)
from textile_scheduler.models import (
    Machine,
    Order,
    OrderEligibility,
    Scenario,
    ScheduledOperation,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationStatus,
)

HAS_ORTOOLS = importlib.util.find_spec("ortools") is not None
needs_ortools = pytest.mark.skipif(not HAS_ORTOOLS, reason="OR-Tools not installed")


def make_scenario(**overrides) -> Scenario:
    params: dict = {
        "scenario_id": "bench-test",
        "now": 0,
        "horizon": 10000,
        "machines": [
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=60),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ],
        "orders": [
            Order(
                id="ORD-001",
                metres=600,
                due=1000,
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


def make_run(solver: SchedulerType, **overrides) -> SolverRun:
    params: dict = {
        "solver": solver,
        "status": SolverStatus.FEASIBLE,
        "validation_status": ValidationStatus.VALID,
        "violation_count": 0,
        "compute_seconds": 1.5,
        "weighted_tardiness": 100.0,
        "on_time_rate": 0.5,
        "makespan": 2000,
        "utilisation": 0.4,
        "orders_total": 2,
        "orders_completed": 2,
        "orders_late": 1,
        "orders_at_risk": 0,
        "ok": True,
    }
    params.update(overrides)
    return SolverRun(**params)


class TestMetricDefinitions:
    def test_weighted_tardiness_in_minutes(self) -> None:
        scenario = make_scenario()
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=0,
                end=600,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.WEAVING,
                machine="WEAVE-01",
                start=600,
                end=1500,
            ),
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.DYEING,
                machine="DYE-01",
                start=1500,
                end=1500 + 1200,
            ),
        ]
        metrics = compute_metrics(scenario, ops)
        # Completes at 2700, due 1000 -> 1700 late x weight 2 = 3400.
        assert metrics.weighted_tardiness == 1700 * 2

    def test_makespan_measured_from_now(self) -> None:
        scenario = make_scenario(now=500)
        ops = [
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=500,
                end=1700,
            )
        ]
        assert compute_metrics(scenario, ops).makespan == 1200

    def test_zero_denominator_utilisation(self) -> None:
        scenario = Scenario(scenario_id="empty", machines=[], orders=[])
        metrics = compute_metrics(scenario, [])
        assert metrics.utilisation == 0.0
        assert metrics.makespan == 0
        assert metrics.on_time_rate == 1.0
        assert metrics.weighted_tardiness == 0.0

    def test_delivery_counts(self) -> None:
        scenario = make_scenario(
            orders=[
                Order(
                    id="ORD-001",
                    metres=600,
                    due=1000,
                    priority_weight=2,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
                Order(
                    id="ORD-002",
                    metres=600,
                    due=5000,
                    priority_weight=1,
                    eligible=OrderEligibility(
                        spinning=["SPIN-01"],
                        weaving=["WEAVE-01"],
                        dyeing=["DYE-01"],
                    ),
                ),
                Order(
                    id="ORD-003",
                    metres=600,
                    due=5000,
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
            # ORD-001 completes at 1500: late (due 1000).
            ScheduledOperation(
                order="ORD-001", stage=Stage.DYEING, machine="DYE-01", start=0, end=1500
            ),
            # ORD-002 completes at 4900: on time, inside last 10% (4500-5000).
            ScheduledOperation(
                order="ORD-002", stage=Stage.DYEING, machine="DYE-01", start=0, end=4900
            ),
            # ORD-003 completes at 2000: on time, not at risk.
            ScheduledOperation(
                order="ORD-003", stage=Stage.DYEING, machine="DYE-01", start=0, end=2000
            ),
        ]
        completions = order_completions(scenario, ops)
        assert completions == {"ORD-001": 1500, "ORD-002": 4900, "ORD-003": 2000}
        assert count_completed_within_horizon(scenario, ops) == 3
        assert count_late_orders(scenario, ops) == 1
        assert count_at_risk_orders(scenario, ops) == 1

    def test_at_risk_boundaries(self) -> None:
        def order(due: int, ordered_at: int = 0) -> Order:
            return Order(
                id="ORD-X",
                metres=100,
                due=due,
                ordered_at=ordered_at,
                priority_weight=1,
                eligible=OrderEligibility(),
            )

        assert is_order_at_risk(900, order(1000)) is True  # threshold inclusive
        assert is_order_at_risk(899, order(1000)) is False
        assert is_order_at_risk(1000, order(1000)) is True  # on time at window end
        assert is_order_at_risk(1001, order(1000)) is False  # late, not at risk
        assert is_order_at_risk(5, order(5, ordered_at=10)) is False  # negative window


class TestImprovementMath:
    def test_percent_change(self) -> None:
        assert percent_change(100.0, 80.0) == pytest.approx(-20.0)
        assert percent_change(100.0, 120.0) == pytest.approx(20.0)
        assert percent_change(0.0, 5.0) is None

    def test_tardiness_improvement(self) -> None:
        assert tardiness_improvement_pct(100.0, 80.0) == pytest.approx(20.0)
        assert tardiness_improvement_pct(100.0, 100.0) == pytest.approx(0.0)
        assert tardiness_improvement_pct(100.0, 120.0) == pytest.approx(-20.0)
        assert tardiness_improvement_pct(0.0, 0.0) is None

    def test_failed_runs_reported_separately(self) -> None:
        scenario = make_scenario()
        config = BenchmarkConfig()
        edf = make_run(SchedulerType.EDF)
        cpsat = make_run(
            SchedulerType.CP_SAT,
            ok=False,
            status=SolverStatus.INFEASIBLE,
            error="proved infeasible",
        )
        outcome = compare_runs(scenario, edf, cpsat, config)
        assert outcome.__class__.__name__ == "ScenarioFailure"
        assert "cpsat" in outcome.reason
        assert "infeasible" in outcome.reason

    def test_comparison_deltas_and_target(self) -> None:
        scenario = make_scenario()
        config = BenchmarkConfig(target_improvement_pct=20.0)
        edf = make_run(SchedulerType.EDF, weighted_tardiness=100.0)
        cpsat = make_run(SchedulerType.CP_SAT, weighted_tardiness=70.0)
        outcome = compare_runs(scenario, edf, cpsat, config)
        assert outcome.__class__.__name__ == "ScenarioComparison"
        assert outcome.tardiness_improvement_pct == pytest.approx(30.0)
        assert outcome.target_met is True
        tardiness = next(d for d in outcome.deltas if d.metric == "weighted_tardiness")
        assert tardiness.absolute_change == pytest.approx(-30.0)
        assert tardiness.percent_change == pytest.approx(-30.0)
        utilisation = next(d for d in outcome.deltas if d.metric == "utilisation")
        assert utilisation.advisory_only is True

    def test_zero_baseline_target_not_applicable(self) -> None:
        scenario = make_scenario()
        config = BenchmarkConfig()
        outcome = compare_runs(
            scenario,
            make_run(SchedulerType.EDF, weighted_tardiness=0.0),
            make_run(SchedulerType.CP_SAT, weighted_tardiness=0.0),
            config,
        )
        assert outcome.tardiness_improvement_pct is None
        assert outcome.target_met is False
        assert "N/A" in outcome.note


class TestInputHash:
    def test_hash_stable(self) -> None:
        scenario = make_scenario()
        assert canonical_scenario_hash(scenario) == canonical_scenario_hash(scenario)
        assert canonical_scenario_hash(scenario).startswith("sha256:")

    def test_hash_sensitive_to_inputs(self) -> None:
        assert canonical_scenario_hash(make_scenario()) != canonical_scenario_hash(
            make_scenario(now=60)
        )


class TestReportOutputs:
    def test_json_csv_markdown_roundtrip(self, tmp_path: Path) -> None:
        scenario = make_scenario()
        config = BenchmarkConfig()
        outcome = compare_runs(
            scenario,
            make_run(SchedulerType.EDF, weighted_tardiness=100.0),
            make_run(SchedulerType.CP_SAT, weighted_tardiness=70.0),
            config,
        )
        from textile_scheduler.benchmark import BenchmarkReport

        report = BenchmarkReport(
            generated_at="2026-01-01T00:00:00+00:00",
            target_pct=20.0,
            comparisons=[outcome],
            failures=[],
            summary={
                "scenarios_compared": 1,
                "scenarios_failed": 0,
                "target_applicable": 1,
                "target_met": 1,
                "mean_improvement_pct": 30.0,
            },
        )
        json_path = report_to_json(report, tmp_path / "results.json")
        assert json.loads(json_path.read_text())["summary"]["target_met"] == 1

        csv_path = comparison_to_csv(report, tmp_path / "comparison.csv")
        with csv_path.open(newline="") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 9  # one row per compared metric
        tardiness = next(r for r in rows if r["metric"] == "weighted_tardiness")
        assert tardiness["scenario_id"] == "bench-test"
        assert float(tardiness["absolute_change"]) == pytest.approx(-30.0)

        markdown = report_to_markdown(report)
        assert "bench-test" in markdown
        assert "MET" in markdown
        assert "not automatically better" in markdown
        md_path = write_markdown(report, tmp_path / "report.md")
        assert md_path.read_text() == markdown


@needs_ortools
class TestBenchmarkRunner:
    def test_same_snapshot_same_hash(self) -> None:
        scenario = make_scenario()
        config = BenchmarkConfig(time_limit_seconds=5)
        outcome = compare_scenario(scenario, config)
        assert outcome.__class__.__name__ == "ScenarioComparison"
        assert outcome.edf.ok and outcome.cpsat.ok
        # Both runs prove the identical input snapshot.
        assert outcome.input_hash == canonical_scenario_hash(scenario)

    def test_run_benchmark_reports_infeasible_separately(self, tmp_path: Path) -> None:
        from textile_scheduler.benchmark import ScenarioComparison

        root = Path(__file__).resolve().parents[2] / "scenarios"
        report = run_benchmark(
            [root / "feasible_load.json", root / "infeasible_load.json"],
            BenchmarkConfig(time_limit_seconds=5),
        )
        assert len(report.comparisons) == 1
        assert isinstance(report.comparisons[0], ScenarioComparison)
        assert len(report.failures) == 1
        assert report.failures[0].scenario_id == "infeasible-load"
        assert report.summary["scenarios_compared"] == 1
        assert report.summary["scenarios_failed"] == 1
        # Raw values preserved: compute_seconds is an unrounded float.
        assert isinstance(report.comparisons[0].edf.compute_seconds, float)
