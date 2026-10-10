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
├── scenarios/           # JSON scenario files
│   ├── feasible.json
│   ├── machine_breakdown.json
│   ├── late_yarn.json
│   └── infeasible.json
├── src/
│   └── textile_scheduler/
│       ├── __init__.py
│       ├── models.py          # Pydantic models for Scenario, Schedule, Disruption
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
```

## Scenario Format

```json
{
  "name": "feasible",
  "synthetic": true,
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [
    {"id": "WEAVE-01", "stage": "weaving", "rate_m_per_hour": 40, "downtime": []}
  ],
  "orders": [
    {
      "id": "ORD-001",
      "buyer": "Buyer A",
      "fabric": "cotton twill",
      "colour": "navy",
      "metres": 2400,
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
  "scenario": "feasible",
  "scheduler": "cpsat",
  "status": "OPTIMAL",
  "compute_seconds": 3.4,
  "validation": {"violations": []},
  "metrics": {
    "weighted_tardiness": 0,
    "on_time_rate": 1.0,
    "utilisation": 0.85,
    "makespan": 8400
  },
  "operations": [
    {"order": "ORD-001", "stage": "spinning", "machine": "SPIN-01", "start": 0, "end": 360}
  ]
}
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