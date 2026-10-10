"""CLI contract tests: pure-JSON stdout, stderr diagnostics, exit codes."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from textile_scheduler.cli import main

ROOT = Path(__file__).resolve().parents[2]
HAS_ORTOOLS = importlib.util.find_spec("ortools") is not None
needs_ortools = pytest.mark.skipif(not HAS_ORTOOLS, reason="OR-Tools not installed")


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

    @needs_ortools
    def test_optimize_workflow(self) -> None:
        result = invoke(
            "optimize",
            str(ROOT / "fixtures" / "valid_scenario_minimal.json"),
            "--time-limit",
            "10",
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.stdout)
        assert payload["solver"] == "cpsat"
        assert payload["status"] == "OPTIMAL"
        assert payload["validation"]["status"] == "valid"
        assert len(payload["operations"]) == 3

    @needs_ortools
    def test_optimize_infeasible_exit_code(self, tmp_path: Path) -> None:
        out = tmp_path / "out.json"
        result = invoke(
            "optimize",
            str(ROOT / "scenarios" / "infeasible_load.json"),
            "--time-limit",
            "5",
            "-o",
            str(out),
        )
        assert result.exit_code == 2, result.output
        payload = json.loads(out.read_text())
        assert payload["status"] == "INFEASIBLE"
        assert payload["operations"] == []

    @needs_ortools
    def test_benchmark_workflow(self, tmp_path: Path) -> None:
        base = json.loads((ROOT / "fixtures" / "valid_scenario_minimal.json").read_text())
        paths = []
        for stem in ("bench-a", "bench-b"):
            data = dict(base, scenario_id=stem)
            path = tmp_path / f"{stem}.json"
            path.write_text(json.dumps(data))
            paths.append(str(path))
        out = tmp_path / "bench"
        result = invoke("benchmark", *paths, "--out", str(out), "--time-limit", "5")
        assert result.exit_code == 0, result.output
        report = json.loads((out / "results.json").read_text())
        assert report["summary"]["scenarios_compared"] == 2
        assert report["summary"]["scenarios_failed"] == 0
        assert (out / "comparison.csv").exists()
        assert (out / "report.md").exists()
        assert report["comparisons"][0]["input_hash"].startswith("sha256:")
