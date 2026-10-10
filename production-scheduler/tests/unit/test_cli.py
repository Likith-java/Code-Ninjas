"""CLI contract tests: pure-JSON stdout, stderr diagnostics, exit codes."""

from __future__ import annotations

import json
from pathlib import Path

from click.testing import CliRunner

from textile_scheduler.cli import main

ROOT = Path(__file__).resolve().parents[2]


def invoke(*args: str):
    return CliRunner().invoke(main, list(args))


class TestStdoutPurity:
    def test_run_stdout_is_pure_json(self) -> None:
        result = invoke("run", str(ROOT / "fixtures" / "valid_scenario_full.json"))
        assert result.exit_code == 0, result.output
        payload = json.loads(result.stdout)
        assert payload["scenario_id"] == "full"
        assert payload["status"] == "FEASIBLE"
        assert "Loaded scenario" not in result.stdout
        assert "Loaded scenario" in result.stderr

    def test_run_infeasible_exit_code_and_failure_record(self, tmp_path: Path) -> None:
        out = tmp_path / "out.json"
        result = invoke(
            "run",
            str(ROOT / "scenarios" / "infeasible_load.json"),
            "-o",
            str(out),
        )
        assert result.exit_code == 2, result.output
        payload = json.loads(out.read_text())
        assert payload["status"] == "UNKNOWN"
        assert "ORD-012" in payload["error"]

    def test_malformed_input_exit_code(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad.json"
        bad.write_text("{not json")
        result = invoke("run", str(bad))
        assert result.exit_code == 1
        assert result.stdout == ""

    def test_schema_invalid_input_exit_code(self, tmp_path: Path) -> None:
        bad = tmp_path / "bad.json"
        bad.write_text(json.dumps({"scenario_id": "x"}))
        result = invoke("run", str(bad))
        assert result.exit_code == 1
        assert result.stdout == ""

    def test_gantt_stdout_is_pure_json(self) -> None:
        result = invoke("gantt", str(ROOT / "fixtures" / "valid_scenario_full.json"))
        assert result.exit_code == 0, result.output
        payload = json.loads(result.stdout)
        assert payload["scenario_id"] == "full"
        assert len(payload["rows"]) == 3

    def test_replan_stdout_is_pure_json(self) -> None:
        result = invoke(
            "replan",
            str(ROOT / "fixtures" / "valid_scenario_full.json"),
            "--yarn-delay",
            "ORD-001",
            "--delay-minutes",
            "500",
            "--now",
            "0",
            "--solver",
            "edf",
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.stdout)
        assert payload["scenario_id"] == "full_replan"
        assert payload["status"] == "FEASIBLE"

    def test_replan_failure_exit_code(self) -> None:
        result = invoke(
            "replan",
            str(ROOT / "scenarios" / "infeasible_load.json"),
            "--yarn-delay",
            "ORD-001",
            "--delay-minutes",
            "60",
            "--now",
            "0",
            "--solver",
            "edf",
        )
        assert result.exit_code == 2, result.output
        payload = json.loads(result.stdout)
        assert "error" in payload
