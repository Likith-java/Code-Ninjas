"""Tests for the four representative scenarios and the scenario loader.

Files under scenarios/ are generated deterministically by
scripts/generate_scenarios.py (fixed seed); these tests pin their content,
verify route/eligibility/time-window consistency, and check that the
feasible variants schedule cleanly while the infeasible one fails
explicitly (no fabricated schedule).
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.loader import (
    check_consistency,
    describe_scenario,
    load_scenario_file,
    scenario_stats,
)
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import (
    Schedule,
    SchedulerType,
    SolverStatus,
    Stage,
    ValidationResult,
)
from textile_scheduler.validator import validate_schedule

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "scenarios"
SCRIPTS = ROOT / "scripts"

FILES = [
    "feasible_load.json",
    "weaving_breakdown.json",
    "late_yarn_lot.json",
    "infeasible_load.json",
]

EXPECTED_ORDER_IDS = [f"ORD-{i:03d}" for i in range(1, 13)]
EXPECTED_MACHINE_IDS = (
    ["SPIN-01", "SPIN-02", "SPIN-03"] + [f"WEAVE-0{i}" for i in range(1, 6)] + ["DYE-01", "DYE-02"]
)


def load_generator():
    spec = importlib.util.spec_from_file_location(
        "generate_scenarios", SCRIPTS / "generate_scenarios.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validated_schedule(path: Path) -> tuple:
    scenario = load_scenario_file(path)
    operations = run_edf_baseline(scenario)
    metrics = compute_metrics(scenario, operations)
    draft = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=SolverStatus.FEASIBLE,
        compute_seconds=0.0,
        validation=ValidationResult(violations=[]),
        metrics=metrics,
        operations=operations,
    )
    return scenario, operations, metrics, validate_schedule(scenario, draft)


class TestScenarioFiles:
    @pytest.mark.parametrize("name", FILES)
    def test_file_loads_and_parses(self, name: str) -> None:
        scenario = load_scenario_file(SCENARIOS / name)
        assert scenario.horizon == 10080
        assert scenario.now == 0
        assert list(scenario.route) == [Stage.SPINNING, Stage.WEAVING, Stage.DYEING]

    def test_seed_data_shape(self) -> None:
        for name in FILES:
            scenario = load_scenario_file(SCENARIOS / name)
            assert [o.id for o in scenario.orders] == EXPECTED_ORDER_IDS
            assert [m.id for m in scenario.machines] == EXPECTED_MACHINE_IDS
            stages = [m.stage for m in scenario.machines]
            assert stages.count(Stage.SPINNING) == 3
            assert stages.count(Stage.WEAVING) == 5
            assert stages.count(Stage.DYEING) == 2

    def test_generation_is_deterministic(self) -> None:
        module = load_generator()
        assert module.SEED == 20260105
        for stem, built in module.build_all().items():
            on_disk = json.loads((SCENARIOS / f"{stem}.json").read_text())
            assert built == on_disk, f"{stem}.json differs from generator output"

    def test_machine_rates_vary(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "feasible_load.json")
        rates = {m.stage for m in scenario.machines}
        assert rates == {Stage.SPINNING, Stage.WEAVING, Stage.DYEING}
        by_stage: dict[Stage, set[int]] = {}
        for m in scenario.machines:
            by_stage.setdefault(m.stage, set()).add(m.rate_m_per_hour)
        assert all(len(v) > 1 for v in by_stage.values())

    def test_orders_vary(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "feasible_load.json")
        assert len({o.metres for o in scenario.orders}) > 1
        assert len({o.due for o in scenario.orders}) > 1
        assert len({o.priority_weight for o in scenario.orders}) > 1
        assert len({o.yarn_ready for o in scenario.orders}) > 1


class TestFeasibleLoad:
    def test_schedules_and_validates(self) -> None:
        scenario, operations, metrics, result = validated_schedule(SCENARIOS / "feasible_load.json")
        assert len(operations) == 36  # 12 orders x 3 stages
        assert result.is_valid, result.violations
        assert metrics.makespan <= scenario.horizon

    def test_route_coverage(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "feasible_load.json")
        machine_ids = {m.id for m in scenario.machines}
        for order in scenario.orders:
            for stage in scenario.route:
                eligible = order.eligible.get_machines(stage)
                assert eligible, f"{order.id} has no {stage.value} eligibility"
                assert set(eligible) <= machine_ids


class TestWeavingBreakdown:
    def test_breakdown_window_present(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "weaving_breakdown.json")
        weave03 = next(m for m in scenario.machines if m.id == "WEAVE-03")
        matches = [w for w in weave03.downtime if w.start == 1200 and w.end == 2400]
        assert len(matches) == 1
        assert "breakdown" in (matches[0].reason or "")

    def test_only_documented_delta_from_base(self) -> None:
        base = json.loads((SCENARIOS / "feasible_load.json").read_text())
        variant = json.loads((SCENARIOS / "weaving_breakdown.json").read_text())
        assert variant["orders"] == base["orders"]
        assert variant["horizon"] == base["horizon"]
        base_machines = {m["id"]: m for m in base["machines"]}
        for machine in variant["machines"]:
            if machine["id"] != "WEAVE-03":
                assert machine == base_machines[machine["id"]]
        weave03_base = base_machines["WEAVE-03"]
        weave03 = next(m for m in variant["machines"] if m["id"] == "WEAVE-03")
        assert len(weave03["downtime"]) == len(weave03_base["downtime"]) + 1

    def test_schedules_and_validates(self) -> None:
        _, operations, metrics, result = validated_schedule(SCENARIOS / "weaving_breakdown.json")
        assert len(operations) == 36
        assert result.is_valid, result.violations
        assert metrics.makespan <= 10080


class TestLateYarnLot:
    def test_identified_orders_delayed(self) -> None:
        base = load_scenario_file(SCENARIOS / "feasible_load.json")
        variant = load_scenario_file(SCENARIOS / "late_yarn_lot.json")
        base_yarn = {o.id: o.yarn_ready for o in base.orders}
        variant_yarn = {o.id: o.yarn_ready for o in variant.orders}
        for oid in ("ORD-007", "ORD-008"):
            assert variant_yarn[oid] - base_yarn[oid] == 1440
        for oid in base_yarn:
            if oid not in ("ORD-007", "ORD-008"):
                assert variant_yarn[oid] == base_yarn[oid]

    def test_schedules_and_validates(self) -> None:
        _, operations, metrics, result = validated_schedule(SCENARIOS / "late_yarn_lot.json")
        assert len(operations) == 36
        assert result.is_valid, result.violations
        assert metrics.makespan <= 10080


class TestInfeasibleLoad:
    def test_missing_route_identified(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "infeasible_load.json")
        ord012 = next(o for o in scenario.orders if o.id == "ORD-012")
        assert ord012.eligible.get_machines(Stage.DYEING) == []
        warnings = check_consistency(scenario)
        assert any("ORD-012" in w and "dyeing" in w for w in warnings)

    def test_scheduling_fails_explicitly(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "infeasible_load.json")
        with pytest.raises(RuntimeError, match="ORD-012"):
            run_edf_baseline(scenario)


class TestLoader:
    def test_missing_file_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_scenario_file(SCENARIOS / "does_not_exist.json")

    def test_stats_shape(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "feasible_load.json")
        stats = scenario_stats(scenario)
        assert stats["scenario_id"] == "feasible-load"
        assert stats["orders"] == 12
        assert stats["machines"] == 10
        assert stats["machines_by_stage"] == {
            "spinning": 3,
            "weaving": 5,
            "dyeing": 2,
        }
        assert stats["horizon"] == 10080
        assert stats["due_min"] < stats["due_max"]
        assert stats["yarn_ready_min"] < stats["yarn_ready_max"]
        assert set(stats["best_case_load_minutes"]) == {"spinning", "weaving", "dyeing"}
        json.dumps(stats)  # must stay JSON-serializable

    def test_consistency_clean_for_feasible_variants(self) -> None:
        for name in (
            "feasible_load.json",
            "weaving_breakdown.json",
            "late_yarn_lot.json",
        ):
            scenario = load_scenario_file(SCENARIOS / name)
            assert check_consistency(scenario) == [], name

    def test_describe_mentions_scenario(self) -> None:
        scenario = load_scenario_file(SCENARIOS / "feasible_load.json")
        text = describe_scenario(scenario)
        assert "feasible-load" in text
        assert "12 orders" in text
