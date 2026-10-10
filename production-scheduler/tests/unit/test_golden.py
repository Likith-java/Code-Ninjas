"""Golden contract fixtures and JSON-Schema validation tests.

Golden files pin byte-stable outputs for deterministic inputs; schema tests
prove fixtures validate against the checked-in schemas. Rules that JSON
Schema cannot express (window ordering, ID uniqueness, downtime overlap,
route usability) are pydantic-only and documented as such.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from textile_scheduler.baseline import run_edf
from textile_scheduler.benchmark import (
    BenchmarkConfig,
    SolverRun,
    compare_runs,
)
from textile_scheduler.gantt import build_gantt_data
from textile_scheduler.loader import load_scenario_file
from textile_scheduler.models import (
    FailureResult,
    Schedule,
    SchedulerType,
    SolverStatus,
    ValidationStatus,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"
GOLDEN = FIXTURES / "golden"
SCHEMAS = ROOT / "schemas"


def load_schema(name: str) -> dict:
    return json.loads((SCHEMAS / f"{name}.schema.json").read_text())


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


class TestGoldenFixtures:
    def test_gantt_golden_stable(self) -> None:
        scenario = load_scenario_file(FIXTURES / "valid_scenario_full.json")
        schedule = run_edf(scenario).model_copy(update={"id": "golden0001", "compute_seconds": 0.5})
        expected = load_json(GOLDEN / "gantt_full.json")
        assert build_gantt_data(schedule, scenario) == expected

    def test_gantt_golden_shape(self) -> None:
        gantt = load_json(GOLDEN / "gantt_full.json")
        assert gantt["scenario_id"] == "full"
        assert gantt["schedule_id"] == "golden0001"
        assert gantt["time"]["unit"] == "minutes"
        assert gantt["time"]["scenario_start"] == "2026-01-05T06:00:00"
        assert gantt["status"] == "FEASIBLE"
        assert gantt["validation"]["status"] == "valid"
        machine_ids = [row["machine_id"] for row in gantt["rows"]]
        assert machine_ids == sorted(machine_ids)
        for row in gantt["rows"]:
            starts = [bar["start"] for bar in row["bars"]]
            assert starts == sorted(starts)
            for bar in row["bars"]:
                if bar["kind"] == "operation":
                    assert {"order_id", "late", "frozen", "quantity_metres"} <= set(bar)
                    assert "color" not in bar and "colour" not in bar
                else:
                    assert bar["kind"] == "downtime"
                    assert "reason" in bar

    def test_comparison_golden_stable(self) -> None:
        scenario = load_scenario_file(FIXTURES / "valid_scenario_full.json")

        def run(solver: SchedulerType, tardiness: float) -> SolverRun:
            return SolverRun(
                solver=solver,
                status=SolverStatus.FEASIBLE,
                validation_status=ValidationStatus.VALID,
                violation_count=0,
                compute_seconds=1.0,
                weighted_tardiness=tardiness,
                on_time_rate=1.0,
                makespan=8000,
                utilisation=0.3,
                orders_total=12,
                orders_completed=12,
                orders_late=0,
                orders_at_risk=2,
                ok=True,
            )

        comparison = compare_runs(
            scenario,
            run(SchedulerType.EDF, 426.0),
            run(SchedulerType.CP_SAT, 0.0),
            BenchmarkConfig(),
        )
        expected = load_json(GOLDEN / "comparison_breakdown.json")
        assert comparison.model_dump(mode="json") == expected
        assert comparison.tardiness_improvement_pct == 100.0
        assert comparison.target_met is True


class TestJsonSchema:
    @pytest.mark.parametrize(
        "name",
        ["valid_scenario_minimal.json", "valid_scenario_full.json"],
    )
    def test_valid_scenarios_match_schema(self, name: str) -> None:
        jsonschema.validate(load_json(FIXTURES / name), load_schema("scenario"))

    @pytest.mark.parametrize(
        "name",
        [
            "feasible.json",
            "feasible_load.json",
            "weaving_breakdown.json",
            "late_yarn_lot.json",
            "infeasible_load.json",
        ],
    )
    def test_seed_scenarios_match_schema(self, name: str) -> None:
        jsonschema.validate(load_json(ROOT / "scenarios" / name), load_schema("scenario"))

    def test_valid_schedule_matches_schema(self) -> None:
        data = load_json(FIXTURES / "valid_schedule.json")
        jsonschema.validate(data, load_schema("schedule"))
        # And the pydantic contract agrees.
        assert Schedule.model_validate(data).validation.is_valid

    def test_failure_result_matches_schema(self) -> None:
        failure = FailureResult(
            scenario_id="full",
            solver=SchedulerType.EDF,
            status=SolverStatus.UNKNOWN,
            error="EDF failed: no eligible machine",
        )
        jsonschema.validate(failure.model_dump(mode="json"), load_schema("failure"))

    @pytest.mark.parametrize(
        "name",
        [
            "invalid_negative_rate.json",
            "invalid_negative_metres.json",
            "invalid_zero_priority.json",
            "invalid_bad_stage.json",
            "invalid_unknown_field.json",
        ],
    )
    def test_schema_rejects_invalid_subset(self, name: str) -> None:
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(load_json(FIXTURES / name), load_schema("scenario"))

    @pytest.mark.parametrize(
        "name",
        [
            # Pydantic-only rules: window ordering, ID uniqueness, overlap.
            "invalid_bad_window.json",
            "invalid_duplicate_machine_ids.json",
            "invalid_duplicate_order_ids.json",
            "invalid_overlapping_windows.json",
        ],
    )
    def test_semantic_rules_are_pydantic_only(self, name: str) -> None:
        from pydantic import ValidationError

        data = load_json(FIXTURES / name)
        jsonschema.validate(data, load_schema("scenario"))  # schema cannot express it
        with pytest.raises(ValidationError):
            load_scenario_file(FIXTURES / name)

    def test_all_fixture_files_accounted(self) -> None:
        names = {p.name for p in FIXTURES.glob("*.json")}
        assert names == {
            "valid_scenario_minimal.json",
            "valid_scenario_full.json",
            "valid_schedule.json",
            "invalid_negative_rate.json",
            "invalid_bad_window.json",
            "invalid_overlapping_windows.json",
            "invalid_duplicate_machine_ids.json",
            "invalid_duplicate_order_ids.json",
            "invalid_negative_metres.json",
            "invalid_zero_priority.json",
            "invalid_unknown_field.json",
            "invalid_bad_stage.json",
        }
