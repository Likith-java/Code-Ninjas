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
# Show CLI help
textile-scheduler --help

# Run baseline scheduler on a scenario
textile-scheduler run scenarios/feasible.json

# Run CP-SAT optimizer (requires [optimizer] extra)
textile-scheduler optimize scenarios/feasible.json

# Re-plan after machine breakdown
textile-scheduler replan scenarios/feasible.json --machine-down WEAVE-03 --from 480 --to 960 --now 360
```

## Project Structure

```
production-scheduler/
├── pyproject.toml
├── README.md
├── CONTRACT.md          # stable external JSON contract (version 1)
├── scenarios/           # representative scenario files (see scenarios/README.md)
│   ├── feasible.json
│   ├── feasible_load.json
│   ├── weaving_breakdown.json
│   ├── late_yarn_lot.json
│   └── infeasible_load.json
├── fixtures/            # representative valid/invalid contract fixtures
├── schemas/             # generated JSON Schemas (see scripts/generate_schemas.py)
├── src/
│   └── textile_scheduler/
│       ├── __init__.py
│       ├── models.py          # Pydantic domain models (Scenario, Schedule, ...)
│       ├── contracts.py       # public contract registry + schema generation
│       ├── loader.py          # scenario file loading, stats, consistency checks
│       ├── time_utils.py      # Time conversion utilities
│       ├── durations.py       # Shared duration function
│       ├── exceptions.py      # Custom exceptions
│       ├── validator.py       # Independent schedule validator
│       ├── baseline.py        # EDF baseline scheduler
│       ├── optimizer.py       # CP-SAT optimizer (optional)
│       ├── metrics.py         # Tardiness, utilisation, on-time rate
│       ├── disruptions.py     # Disruption handling (freeze, split, shift)
│       ├── gantt.py           # Schedule to Gantt JSON export
│       └── cli.py             # CLI entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── property/
└── scripts/
    └── generate_schemas.py
```

## Scenario Format

See `CONTRACT.md` for the stable contract (version 1). Canonical keys:

```json
{
  "scenario_id": "feasible",
  "description": "Small feasible two-order scenario.",
  "synthetic_data": true,
  "start": "2026-01-05T06:00:00",
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [
    {
      "id": "WEAVE-01",
      "stage": "weaving",
      "rate_m_per_hour": 40,
      "downtime": [{"start": 9000, "end": 9060, "reason": "planned maintenance"}],
      "available_until": 10080
    }
  ],
  "orders": [
    {
      "id": "ORD-001",
      "buyer": "Buyer A",
      "fabric": "cotton twill",
      "colour": "navy",
      "metres": 2400,
      "ordered_at": 0,
      "due": 5760,
      "priority_weight": 3,
      "yarn_ready": 0,
      "eligible": {
        "spinning": ["SPIN-01", "SPIN-02"],
        "weaving": ["WEAVE-01", "WEAVE-02"],
        "dyeing": ["DYE-01"]
      }
    }
  ],
  "frozen": []
}
```

## Schedule Output Format

```json
{
  "id": "a1b2c3d4e5f6",
  "scenario_id": "feasible",
  "solver": "cpsat",
  "status": "OPTIMAL",
  "compute_seconds": 3.4,
  "validation": {"status": "valid", "violations": []},
  "metrics": {
    "weighted_tardiness": 0,
    "on_time_rate": 1.0,
    "utilisation": 0.85,
    "makespan": 8400
  },
  "operations": [
    {
      "order": "ORD-001",
      "stage": "spinning",
      "machine": "SPIN-01",
      "start": 0,
      "end": 360,
      "duration": 360,
      "quantity_metres": 2400
    }
  ],
  "warnings": [],
  "diagnostics": {}
}
```

## Contracts, Schemas, Fixtures

```bash
# Regenerate the checked-in JSON Schemas from the Pydantic models
python scripts/generate_schemas.py

# Representative valid/invalid fixtures live in fixtures/
# Contract tests pin parsing, serialization, boundaries, and errors:
pytest tests/unit/test_contracts.py
```

## Testing

```bash
# Run all tests
pytest

# Run only unit tests
pytest -m unit

# Run property-based tests
pytest -m property

# With coverage
pytest --cov=textile_scheduler
```

## Development

```bash
# Format code
ruff format .

# Lint
ruff check .

# Type check
mypy src/textile_scheduler

# Pre-commit hooks
pre-commit install
pre-commit run --all-files
```

## Architecture

- **Validator Independence**: Validator imports nothing from solver modules
- **Single Duration Function**: All schedulers and validator use `durations.compute_duration()`
- **Integer Minutes**: All times are integer minutes from scenario start
- **Deterministic Seeds**: Fixed random seed for reproducible CP-SAT runs
- **Honest Status**: Reports OPTIMAL only when proven, FEASIBLE with elapsed time otherwise

## EDF baseline limitations

The event-driven EDF scheduler (`run_edf`) is a transparent comparison
baseline, not an optimizer: greedy dispatch with no backtracking or
lookahead, myopic earliest-completion machine choice, no preemption or
splitting. It always validates its own output (invalid output is marked
`MODEL_INVALID`, never successful) and raises an explicit error naming the
order and stage when an operation cannot be placed. See the module docstring
in `src/textile_scheduler/baseline.py` for details.