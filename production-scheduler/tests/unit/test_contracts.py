"""Contract tests: parsing, serialization, boundaries, and validation errors.

These tests pin the stable external JSON format documented in CONTRACT.md
(contract version 1) for the public models: Scenario (input), Schedule and
FailureResult (output).
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from textile_scheduler.baseline import run_edf_baseline
from textile_scheduler.contracts import (
    PUBLIC_INPUT_MODELS,
    PUBLIC_OUTPUT_MODELS,
    generate_schemas,
)
from textile_scheduler.durations import compute_duration
from textile_scheduler.metrics import compute_metrics
from textile_scheduler.models import (
    CONTRACT_VERSION,
    DEFAULT_ROUTE,
    DowntimeWindow,
    FailureResult,
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
    ValidationStatus,
)
from textile_scheduler.validator import ScheduleValidator, validate_schedule

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
SCHEMAS = Path(__file__).resolve().parents[2] / "schemas"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def make_scenario(**overrides) -> Scenario:
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
                spinning=["SPIN-01"], weaving=["WEAVE-01"], dyeing=["DYE-01"]
            ),
        )
    ]
    params: dict = {
        "scenario_id": "contract-test",
        "machines": machines,
        "orders": orders,
    }
    params.update(overrides)
    return Scenario(**params)


def make_schedule(scenario: Scenario, operations) -> Schedule:
    metrics = compute_metrics(scenario, operations)
    draft = Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=SolverStatus.FEASIBLE,
        compute_seconds=0.1,
        validation=ValidationResult(violations=[]),
        metrics=metrics,
        operations=operations,
    )
    validation = validate_schedule(scenario, draft)
    return Schedule(
        scenario_id=scenario.scenario_id,
        solver=SchedulerType.EDF,
        status=SolverStatus.FEASIBLE,
        compute_seconds=0.1,
        validation=validation,
        metrics=metrics,
        operations=operations,
    )


class TestValidFixtures:
    def test_minimal_fixture_parses_with_defaults(self) -> None:
        scenario = Scenario.model_validate(load_fixture("valid_scenario_minimal.json"))
        assert scenario.scenario_id == "minimal"
        assert scenario.description == ""
        assert scenario.synthetic_data is True
        assert scenario.start is None
        assert scenario.now == 0
        assert scenario.horizon == 10080
        assert list(scenario.route) == list(DEFAULT_ROUTE)
        assert scenario.frozen == []
        order = scenario.orders[0]
        assert order.ordered_at == 0
        assert order.yarn_ready == 0
        assert order.buyer is None and order.fabric is None and order.colour is None
        machine = scenario.machines[0]
        assert machine.downtime == [] and machine.available_until is None

    def test_full_fixture_parses_all_fields(self) -> None:
        scenario = Scenario.model_validate(load_fixture("valid_scenario_full.json"))
        assert scenario.description.startswith("Full-coverage")
        assert scenario.start == datetime(2026, 1, 5, 6, 0, 0)
        assert scenario.now == 120
        spin = next(m for m in scenario.machines if m.id == "SPIN-01")
        assert spin.downtime[0].start == 9000
        assert spin.downtime[0].end == 9120
        assert spin.downtime[0].reason == "planned maintenance"
        dye = next(m for m in scenario.machines if m.id == "DYE-01")
        assert dye.available_until == 10080
        order = scenario.orders[0]
        assert (order.buyer, order.fabric, order.colour) == (
            "Buyer A",
            "cotton twill",
            "navy",
        )
        assert order.ordered_at == 0 and order.yarn_ready == 120

    def test_full_fixture_schedules_and_validates(self) -> None:
        scenario = Scenario.model_validate(load_fixture("valid_scenario_full.json"))
        operations = run_edf_baseline(scenario)
        assert len(operations) == 3
        schedule = make_schedule(scenario, operations)
        assert schedule.validation.is_valid
        assert schedule.validation.status == ValidationStatus.VALID

    def test_valid_schedule_fixture_parses(self) -> None:
        data = json.loads((FIXTURES / "valid_schedule.json").read_text())
        schedule = Schedule.model_validate(data)
        assert schedule.scenario_id == "full"
        assert schedule.solver == SchedulerType.EDF
        assert schedule.validation.status == ValidationStatus.VALID
        assert len(schedule.operations) == 3
        for op in schedule.operations:
            assert op.duration == op.end - op.start
            assert op.quantity_metres == 1200


class TestInvalidFixtures:
    @pytest.mark.parametrize(
        "name",
        [
            "invalid_negative_rate.json",
            "invalid_bad_window.json",
            "invalid_overlapping_windows.json",
            "invalid_duplicate_machine_ids.json",
            "invalid_duplicate_order_ids.json",
            "invalid_negative_metres.json",
            "invalid_zero_priority.json",
            "invalid_unknown_field.json",
            "invalid_bad_stage.json",
        ],
    )
    def test_invalid_fixtures_rejected(self, name: str) -> None:
        with pytest.raises(ValidationError):
            Scenario.model_validate(load_fixture(name))

    def test_duplicate_order_ids_message(self) -> None:
        with pytest.raises(ValidationError, match="Duplicate order IDs"):
            Scenario.model_validate(load_fixture("invalid_duplicate_order_ids.json"))

    def test_unknown_field_rejected(self) -> None:
        with pytest.raises(ValidationError, match="shift_pattern"):
            Scenario.model_validate(load_fixture("invalid_unknown_field.json"))


class TestBoundaryConditions:
    def test_duration_exact_division(self) -> None:
        assert compute_duration(1200, 60) == 1200

    def test_duration_rounds_up_per_machine(self) -> None:
        # Same quantity on different-rate machines gives different durations.
        assert compute_duration(1000, 60) == 1000
        assert compute_duration(1000, 40) == 1500
        assert compute_duration(1000, 30) == 2000
        # 100m at 45 m/hr = 133.33 -> 134 minutes (ceiling, no float drift).
        assert compute_duration(100, 45) == 134

    def test_zero_metres_rejected(self) -> None:
        with pytest.raises(ValidationError, match="greater than 0"):
            Order(
                id="ORD-001",
                metres=0,
                due=100,
                priority_weight=1,
                eligible=OrderEligibility(),
            )

    def test_zero_rate_rejected(self) -> None:
        with pytest.raises(ValidationError, match="greater than 0"):
            Machine(id="SPIN-01", stage=Stage.SPINNING, rate_m_per_hour=0)

    def test_zero_priority_rejected(self) -> None:
        with pytest.raises(ValidationError, match="greater than or equal to 1"):
            Order(
                id="ORD-001",
                metres=100,
                due=100,
                priority_weight=0,
                eligible=OrderEligibility(),
            )

    def test_zero_length_window_rejected(self) -> None:
        with pytest.raises(ValidationError, match="greater than start"):
            DowntimeWindow(start=500, end=500)

    def test_empty_route_rejected(self) -> None:
        with pytest.raises(ValidationError, match="at least one stage"):
            make_scenario(route=[])

    def test_duplicate_route_stage_rejected(self) -> None:
        with pytest.raises(ValidationError, match="unique"):
            make_scenario(route=[Stage.SPINNING, Stage.SPINNING])

    def test_custom_route_accepted_and_supported(self) -> None:
        scenario = make_scenario(route=[Stage.SPINNING, Stage.WEAVING])
        assert scenario.is_default_route is False
        operations = run_edf_baseline(scenario)
        assert {op.stage for op in operations} == {Stage.SPINNING, Stage.WEAVING}
        schedule = make_schedule(scenario, operations)
        assert schedule.validation.is_valid

    def test_default_route_flag(self) -> None:
        assert make_scenario().is_default_route is True

    def test_unknown_stage_rejected(self) -> None:
        with pytest.raises(ValidationError):
            Machine(id="X-01", stage="knitting", rate_m_per_hour=10)  # type: ignore[arg-type]

    def test_unknown_solver_status_rejected(self) -> None:
        with pytest.raises(ValueError):
            SolverStatus("BOGUS")


class TestLegacyAliases:
    def test_legacy_scenario_keys_parse(self) -> None:
        data = load_fixture("valid_scenario_minimal.json")
        data["name"] = data.pop("scenario_id")
        data["synthetic"] = data.pop("synthetic_data", True)
        scenario = Scenario.model_validate(data)
        assert scenario.scenario_id == "minimal"
        assert scenario.synthetic_data is True

    def test_legacy_downtime_keys_parse(self) -> None:
        window = DowntimeWindow.model_validate({"from": 100, "to": 200})
        assert (window.start, window.end) == (100, 200)
        legacy = DowntimeWindow.model_validate(
            {"from_minute": 100, "to_minute": 200, "reason": "fix"}
        )
        assert (legacy.start, legacy.end, legacy.reason) == (100, 200, "fix")

    def test_legacy_schedule_keys_parse(self) -> None:
        scenario = make_scenario()
        operations = run_edf_baseline(scenario)
        schedule = make_schedule(scenario, operations)
        data = schedule.model_dump(mode="json")
        data["scenario"] = data.pop("scenario_id")
        data["scheduler"] = data.pop("solver")
        restored = Schedule.model_validate(data)
        assert restored.scenario_id == scenario.scenario_id
        assert restored.solver == SchedulerType.EDF

    def test_serialization_emits_canonical_keys(self) -> None:
        scenario = Scenario.model_validate(
            {"name": "legacy", "synthetic": False, "machines": [], "orders": []}
        )
        dumped = scenario.model_dump(mode="json")
        assert dumped["scenario_id"] == "legacy"
        assert dumped["synthetic_data"] is False
        assert "name" not in dumped and "synthetic" not in dumped
        window = DowntimeWindow.model_validate({"from": 1, "to": 2})
        assert window.model_dump(mode="json") == {
            "start": 1,
            "end": 2,
            "reason": None,
        }


class TestSerializationRoundtrip:
    def test_scenario_roundtrip(self) -> None:
        scenario = Scenario.model_validate(load_fixture("valid_scenario_full.json"))
        restored = Scenario.model_validate_json(scenario.model_dump_json())
        assert restored == scenario

    def test_schedule_roundtrip(self) -> None:
        scenario = make_scenario()
        operations = run_edf_baseline(scenario)
        schedule = make_schedule(scenario, operations)
        restored = Schedule.model_validate_json(schedule.model_dump_json())
        assert restored == schedule
        op = restored.operations[0]
        assert op.duration == op.end - op.start
        assert op.quantity_metres == 1200

    def test_failure_result_roundtrip(self) -> None:
        failure = FailureResult(
            scenario_id="full",
            solver=SchedulerType.CP_SAT,
            status=SolverStatus.INFEASIBLE,
            error="No feasible assignment within horizon",
            details={"orders": 1, "horizon": 10080},
        )
        restored = FailureResult.model_validate_json(failure.model_dump_json())
        assert restored == failure

    def test_failure_result_defaults(self) -> None:
        failure = FailureResult(error="boom")
        assert failure.scenario_id is None
        assert failure.solver is None
        assert failure.status == SolverStatus.MODEL_INVALID
        assert failure.details == {}

    def test_schedule_defaults(self) -> None:
        scenario = make_scenario()
        schedule = make_schedule(scenario, run_edf_baseline(scenario))
        assert len(schedule.id) == 12
        assert schedule.warnings == []
        assert schedule.diagnostics == {}

    def test_schedule_rejects_unknown_field(self) -> None:
        scenario = make_scenario()
        schedule = make_schedule(scenario, run_edf_baseline(scenario))
        data = schedule.model_dump(mode="json")
        data["shift_pattern"] = "nights"
        with pytest.raises(ValidationError):
            Schedule.model_validate(data)


class TestOperationContract:
    def test_duration_autofilled(self) -> None:
        op = ScheduledOperation(
            order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=10, end=70
        )
        assert op.duration == 60

    def test_duration_mismatch_rejected(self) -> None:
        with pytest.raises(ValidationError, match="contradicts start/end"):
            ScheduledOperation(
                order="ORD-001",
                stage=Stage.SPINNING,
                machine="SPIN-01",
                start=10,
                end=70,
                duration=61,
            )

    def test_matching_duration_accepted(self) -> None:
        op = ScheduledOperation(
            order="ORD-001",
            stage=Stage.SPINNING,
            machine="SPIN-01",
            start=10,
            end=70,
            duration=60,
            quantity_metres=1200,
        )
        assert op.duration == 60 and op.quantity_metres == 1200

    def test_quantity_mismatch_flagged_by_validator(self) -> None:
        scenario = make_scenario()
        op = ScheduledOperation(
            order="ORD-001",
            stage=Stage.SPINNING,
            machine="SPIN-01",
            start=0,
            end=1200,
            quantity_metres=600,
        )
        result = ScheduleValidator(scenario).validate(make_schedule(scenario, [op]))
        assert any(v.rule == 3 and "Quantity" in v.message for v in result.violations)

    def test_availability_horizon_flagged_by_validator(self) -> None:
        machines = [
            Machine(
                id="SPIN-01",
                stage=Stage.SPINNING,
                rate_m_per_hour=60,
                available_until=500,
            ),
            Machine(id="WEAVE-01", stage=Stage.WEAVING, rate_m_per_hour=40),
            Machine(id="DYE-01", stage=Stage.DYEING, rate_m_per_hour=30),
        ]
        scenario = make_scenario(machines=machines)
        op = ScheduledOperation(
            order="ORD-001", stage=Stage.SPINNING, machine="SPIN-01", start=0, end=1200
        )
        result = ScheduleValidator(scenario).validate(make_schedule(scenario, [op]))
        assert any(v.rule == 6 and "availability" in v.message for v in result.violations)


class TestValidationStatus:
    def test_valid_status_derived(self) -> None:
        result = ValidationResult(violations=[])
        assert result.status == ValidationStatus.VALID
        assert result.is_valid is True

    def test_invalid_status_derived_even_when_claimed_valid(self) -> None:
        from textile_scheduler.models import ValidationViolation

        result = ValidationResult(
            status=ValidationStatus.VALID,
            violations=[ValidationViolation(rule=1, message="dupe")],
        )
        assert result.status == ValidationStatus.INVALID
        assert result.is_valid is False


class TestSchemas:
    def test_schema_files_exist_and_parse(self) -> None:
        for stem in [*PUBLIC_INPUT_MODELS, *PUBLIC_OUTPUT_MODELS]:
            path = SCHEMAS / f"{stem}.schema.json"
            assert path.exists(), f"missing schema: {path}"
            schema = json.loads(path.read_text())
            assert schema["$schema"].startswith("https://json-schema.org/")
            assert CONTRACT_VERSION in schema["$comment"]

    def test_scenario_schema_requires_key_fields(self) -> None:
        schema = json.loads((SCHEMAS / "scenario.schema.json").read_text())
        required = schema["required"]
        for field in ("scenario_id", "machines", "orders"):
            assert field in required
        props = schema["properties"]
        for field in ("scenario_id", "description", "synthetic_data", "now", "horizon"):
            assert field in props

    def test_schedule_schema_covers_output_contract(self) -> None:
        schema = json.loads((SCHEMAS / "schedule.schema.json").read_text())
        props = schema["properties"]
        for field in (
            "id",
            "scenario_id",
            "solver",
            "status",
            "compute_seconds",
            "validation",
            "metrics",
            "operations",
            "warnings",
            "diagnostics",
        ):
            assert field in props, f"schedule schema missing {field}"

    def test_regeneration_is_stable(self, tmp_path) -> None:
        written = generate_schemas(tmp_path)
        assert set(written) == {*PUBLIC_INPUT_MODELS, *PUBLIC_OUTPUT_MODELS}
        for stem, path in written.items():
            fresh = json.loads(path.read_text())
            checked_in = json.loads((SCHEMAS / f"{stem}.schema.json").read_text())
            assert fresh == checked_in
