# Textile Production Scheduler

Standalone CP-SAT based production scheduling engine for textile manufacturing.
Processes orders through spinning → weaving → dyeing with disruption recovery.

## Installation

```bash
# Core package (baseline scheduler, validator, metrics)
pip install -e .

# With OR-Tools CP-SAT optimizer
pip install -e .[optimizer]

# Development dependencies
pip install -e .[dev]
```

## Quick Start

```bash
# CLI help
textile-scheduler --help

# Run EDF baseline on a scenario
textile-scheduler run scenarios/feasible_load.json

# Run CP-SAT optimizer (requires [optimizer] extra)
textile-scheduler optimize scenarios/feasible_load.json --time-limit 10

# Re-plan after machine breakdown
textile-scheduler replan scenarios/feasible_load.json \
  --machine-down WEAVE-03 --from 1200 --to 2400 --now 100 \
  --reason "loom breakdown" --solver cpsat

# Re-plan after yarn delay
textile-scheduler replan scenarios/feasible_load.json \
  --yarn-delay ORD-007 --delay-minutes 1440 --now 100
```

## Project Structure

```
production-scheduler/
├── pyproject.toml
├── README.md
├── CONTRACT.md              # Stable JSON contract (v1)
├── INTERFACE.md             # Integration reference
├── AUDIT.md                 # Reliability audit record
├── scenarios/               # Seed scenarios (4 named, deterministic)
├── fixtures/                # Valid/invalid contract fixtures
├── schemas/                 # JSON Schemas (generated)
├── src/textile_scheduler/
│   ├── models.py            # Pydantic domain models (17 models)
│   ├── contracts.py         # Contract registry + schema generation
│   ├── loader.py            # Scenario loading, stats, consistency checks
│   ├── time_utils.py        # Time conversion utilities
│   ├── durations.py         # Shared duration function
│   ├── exceptions.py        # Custom exceptions
│   ├── validator.py         # Independent schedule validator (17 rules)
│   ├── baseline.py          # EDF baseline scheduler
│   ├── optimizer.py         # CP-SAT optimizer
│   ├── metrics.py           # Tardiness, utilisation, on-time rate
│   ├── disruptions.py       # Disruption handling (freeze, split, shift)
│   ├── gantt.py             # Machine-row Gantt JSON export
│   └── cli.py               # CLI entry point
├── tests/
│   ├── unit/                # 19 test modules, 312 tests
│   ├── integration/
│   └── property/
└── scripts/
    └── generate_schemas.py
```

## Core Capabilities

| Component | Description |
|-----------|-------------|
| **Validator** | 17 hard constraints (R01–R17), independent of solvers, stable codes |
| **EDF Baseline** | Event-driven ready-set dispatcher, deterministic tie-breaks |
| **CP-SAT Optimizer** | Per-machine durations, lexicographic objective (K = n·horizon+1), warm-start hints |
| **Disruptions** | Proportional split on interruption, remainder sub-lots, history freeze |
| **Metrics** | Tardiness (priority-weighted minutes), makespan (from now), utilisation (downtime-excluded) |
| **Benchmark** | Canonical input hash, raw deltas, 20% tardiness target, JSON/CSV/Markdown reports |
| **Gantt Export** | Machine-row JSON, operation/downtime bars, no colours, stable sort |

## Contracts & Schemas

- **CONTRACT.md** — Stable JSON contract v1 (canonical keys, aliases, violation codes, stability policy)
- **INTERFACE.md** — Integration reference (functions, CLI, future HTTP endpoints)
- **schemas/** — JSON Schemas for `scenario`, `schedule`, `failure` (regenerated via `scripts/generate_schemas.py`)
- **fixtures/** — Valid/invalid contract fixtures + golden Gantt/comparison outputs

## Scenario Format

Canonical keys (legacy aliases accepted on input, canonical always emitted):

```json
{
  "scenario_id": "feasible-load",
  "synthetic_data": true,
  "start": "2026-01-05T06:00:00",
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [
    {"id": "SPIN-01", "stage": "spinning", "rate_m_per_hour": 60, "downtime": []}
  ],
  "orders": [
    {
      "id": "ORD-001",
      "metres": 1200,
      "due": 9000,
      "priority_weight": 3,
      "yarn_ready": 0,
      "eligible": {"spinning": ["SPIN-01"], "weaving": ["WEAVE-01"], "dyeing": ["DYE-01"]}
    }
  ],
  "frozen": []
}
```

See `CONTRACT.md` for full specification, alias table, and stability policy.

## Seed Scenarios (Deterministic, Seed `20260105`)

| File | Description |
|------|-------------|
| `feasible_load.json` | 12 orders, 10 machines, all routable |
| `weaving_breakdown.json` | + WEAVE-03 down 1200–2400 |
| `late_yarn_lot.json` | + ORD-007/008 yarn delayed 1440 min |
| `infeasible_load.json` | ORD-012 no eligible dyeing machine |

Regenerate: `python scripts/generate_scenarios.py`

## Testing

```bash
# All tests
pytest

# Unit only
pytest -m unit

# Property-based
pytest -m property

# With coverage
pytest --cov=textile_scheduler
```

**308 passed, 4 skipped** (4 hypothesis infeasible draws)

## Development

```bash
# Format
ruff format .

# Lint
ruff check .

# Type check
mypy src/textile_scheduler

# Pre-commit
pre-commit install && pre-commit run --all-files
```

## Architecture Invariants

- **Validator Independence** — Validator imports nothing from solver modules
- **Single Duration Function** — `durations.compute_duration()` used by all components
- **Integer Minutes** — All times are integer minutes from scenario start
- **Deterministic Seeds** — Fixed random seed for reproducible CP-SAT runs
- **Honest Status** — OPTIMAL only when proved; FEASIBLE/INFEASIBLE/UNKNOWN/MODEL_INVALID otherwise

## CLI Contract

- **stdout** — Pure machine-readable JSON only
- **stderr** — All diagnostics, progress, warnings
- **Exit codes** — 0 success, 1 malformed input, 2 infeasible/solver failure/invalid schedule
- **Failure output** — `FailureResult` JSON emitted on exit 2

## Integration

```bash
# Backend integration (5 min)
echo 'textile-scheduler @ file://../production-scheduler' >> backend/requirements.txt
pip install -r requirements.txt

# Use in backend code
from textile_scheduler import optimize
from textile_scheduler.models import Scenario, Machine, Order

schedule = optimize(scenario, time_limit_seconds=30)
```

The scheduler is a standalone library — zero coupling to backend/frontend, no FastAPI, no database, no HTTP layer.