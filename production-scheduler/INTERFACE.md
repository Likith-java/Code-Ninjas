# Public interface (standalone functions + CLI JSON)

No UI or database in this phase, and no FastAPI: the integration team gets
stable standalone functions and a CLI whose stdout is pure machine-readable
JSON. Canonical contracts live in `CONTRACT.md`; JSON Schemas in `schemas/`;
golden fixtures in `fixtures/golden/`.

## Operations

| Operation | Standalone function | CLI | Future HTTP |
|---|---|---|---|
| Read scenario + baseline | `loader.load_scenario_file` + `baseline.run_edf` | `textile-scheduler run scenario.json` | `POST /schedules/optimize` with solver `edf` |
| Optimise scenario | `optimizer.optimize` | `textile-scheduler optimize scenario.json [--time-limit 10 --seed 42 --workers 8 [--no-warm-start]]` | `POST /schedules/optimize` |
| Retrieve schedule result | `Schedule` model JSON (`run`/`optimize` output) | stdout or `-o file` | `GET /schedules/{id}` |
| Simulate breakdown | `disruptions.replan(..., solver=...)` with `Disruption(type=machine_down, machine, from, to, reason?, now)` | `textile-scheduler replan scenario.json --machine-down M --from A --to B [--reason R] --now N [--solver cpsat\|edf]` | `POST /schedules/simulate-disruption` |
| Simulate yarn delay | `disruptions.replan(...)` with `Disruption(type=yarn_delay, order, delay_minutes, now)` | `textile-scheduler replan scenario.json --yarn-delay O (--delay-minutes M \| --hours H) --now N` | `POST /schedules/simulate-disruption` |
| Compare solvers | `benchmark.run_benchmark` | `textile-scheduler benchmark [scenarios...] --out DIR` | — (offline analysis) |
| Gantt export | `gantt.build_gantt_data` | `textile-scheduler gantt scenario.json [--format standard\|frappe]` | served from stored schedules |

## Representative request/response JSON

Scenario input: `scenarios/feasible_load.json` (canonical keys in
`CONTRACT.md`). Baseline response: `fixtures/valid_schedule.json`.
Gantt response: `fixtures/golden/gantt_full.json` (machine rows, operation
bars with `order_id`, `stage`, `machine_id`, `start`, `end`, `duration`,
`quantity_metres`, `late`, `frozen`; downtime bars with `reason`;
`scenario_start` timestamp plus integer-minute origin; solver, schedule, and
validation statuses; violations with stable codes). Comparison response:
`fixtures/golden/comparison_breakdown.json`.

## Field names, time units, statuses

- Times are integer minutes from the scenario start (`time_unit:
  "minutes"`, `origin_minute: 0`); `scenario_start` is ISO-8601 or null.
- Solver names: `edf`, `cpsat`. Solver statuses: `OPTIMAL` (proved),
  `FEASIBLE` (valid, unproved), `INFEASIBLE` (proved), `UNKNOWN`
  (inconclusive, e.g. timeout), `MODEL_INVALID` (failed validation).
- Validation: `valid`/`invalid` plus violations with stable `code`
  (`R01_…`–`R17_…`), severity, and affected IDs.
- No colours or visual properties are emitted; stable order IDs let the
  frontend assign colours consistently.

## Failure semantics and exit codes

- Exit `0`: successful schedule (stdout holds the `Schedule` JSON).
- Exit `1`: malformed input (bad JSON, schema violations) or usage errors;
  nothing machine-readable is emitted.
- Exit `2`: infeasible scenario, solver failure, or invalid schedule. A JSON
  record is still emitted first: the `Schedule` with its honest status, or a
  `FailureResult` (`scenario_id`, `solver`, `status`, `error`, `details`)
  when no schedule exists.
- Diagnostics and progress text always go to stderr; stdout carries JSON
  only. `benchmark` writes files and always exits `0` once its report is
  complete (scenario failures live inside the report).
