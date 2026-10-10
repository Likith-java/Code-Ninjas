# Textile Scheduler JSON Contracts (version 1)

This document is the stable external contract for the standalone
`textile-scheduler` package. The contracts are implemented as frozen Pydantic
models in `src/textile_scheduler/models.py` with `extra="forbid"`: unknown
fields are rejected. JSON Schemas are checked in under `schemas/` and are
regenerated with `python scripts/generate_schemas.py`.

## Time and duration

- All times are **integer minutes** relative to the scenario `start`
  timestamp (or relative to minute 0 when `start` is null).
- Processing duration is defined once, in `durations.compute_duration`, as
  `ceil(quantity_metres / rate_m_per_hour * 60)`.
- The duration is computed **separately for every eligible machine** because
  rates differ per machine. Intermediate values are never rounded; only the
  final minute count is rounded up.

## Scenario (input)

| Field | Type | Required | Notes |
|---|---|---|---|
| `scenario_id` | string | yes | stable scenario identifier |
| `description` | string | no | default `""` |
| `synthetic_data` | boolean | no | default `true` |
| `start` | datetime \| null | no | ISO-8601 scenario start, default `null` |
| `now` | integer ≥ 0 | no | current time in minutes, default `0` |
| `horizon` | integer > 0 | no | planning horizon in minutes, default `10080` |
| `route` | stage list | no | default `["spinning", "weaving", "dyeing"]`; must be non-empty with unique stages |
| `machines` | machine list | yes | unique machine IDs |
| `orders` | order list | yes | unique order IDs |
| `frozen` | operation refs | no | default `[]`; must reference known orders/machines |

### Machine

`id`, `stage` (`spinning` \| `weaving` \| `dyeing`),
`rate_m_per_hour` (integer > 0),
`downtime` (default `[]`),
`available_until` (integer ≥ 0 \| null, default `null`; operations on the
machine must end at or before it),
`status` (default `"idle"`),
`current_order` (default `null`),
`progress_pct` (default `0`).

### Downtime window

`start` (≥ 0), `end` (> `start`), `reason` (string \| null, default `null`).
Windows on one machine must not overlap. Rejected: non-positive rates,
`end <= start`, overlapping windows, duplicate IDs.

### Order

`id`, `buyer`/`fabric`/`colour` (optional metadata, default `null`),
`metres` (integer > 0),
`ordered_at` (integer ≥ 0, default `0`),
`due` (integer ≥ 0),
`priority_weight` (integer 1–10),
`yarn_ready` (integer ≥ 0, default `0`),
`eligible` (`spinning`/`weaving`/`dyeing` machine-ID lists).
Rejected: negative quantities, non-positive priorities, duplicate IDs.

### Route

Defaults to the required three-stage route
`spinning → weaving → dyeing`. A custom route is accepted only when it is
non-empty with unique stages; the validator, EDF baseline, and CP-SAT model
all follow `scenario.route` generically, so configured routes are supported
by every rule.

## Schedule (output)

| Field | Type | Notes |
|---|---|---|
| `id` | string | schedule ID (generated when omitted) |
| `scenario_id` | string | echoes the input scenario |
| `solver` | `edf` \| `cpsat` | solver name |
| `status` | `OPTIMAL` \| `FEASIBLE` \| `INFEASIBLE` \| `UNKNOWN` \| `MODEL_INVALID` | honest solver status |
| `compute_seconds` | float ≥ 0 | solver wall-clock time |
| `validation` | object | independent validation outcome (see below) |
| `metrics` | object | `weighted_tardiness`, `on_time_rate`, `utilisation`, `makespan` |
| `operations` | operation list | one per order per route stage |
| `warnings` | string list | default `[]` |
| `diagnostics` | object | default `{}` |

### Scheduled operation

`order`, `stage`, `machine`, `start`, `end`,
`duration` (filled from `end - start` when omitted; rejected when it
contradicts `start`/`end`),
`quantity_metres` (optional echo of the order quantity; rejected when
non-positive, flagged by validation rule 3 when it contradicts the order).

### Validation result

`status` (`valid` \| `invalid`, derived from the violation list) plus
`violations`. Each violation carries a stable `code` (the contract),
a numeric `rule` (1–17), a `severity` (`error`; `warning` reserved),
a human-readable `message`, and the applicable `order`/`machine`/`stage`.
The validator imports only domain models and the shared duration utility —
never solver code. It collects every discoverable violation, never repairs
schedules, and never declares scenarios (in)feasible. Machine conflicts use
half-open `[start, end)` intervals, so adjacent operations never overlap.
Completeness (R01/R02) is checked separately from the status claim (R14):
a non-success status explains missing work instead of duplicating it.

| Code | Rule | Check |
|---|---|---|
| `R01_MISSING_OPERATION` | 1 | every required order-stage appears exactly once |
| `R02_DUPLICATE_OPERATION` | 2 | no duplicate order-stage operations |
| `R03_MACHINE_INELIGIBLE` | 3 | machine eligible for the order and stage |
| `R04_STAGE_MISMATCH` | 4 | machine supports the operation's stage |
| `R05_BAD_INTERVAL` | 5 | start earlier than end (schema-enforced, defensive) |
| `R06_DURATION_MISMATCH` | 6 | duration matches `ceil(quantity / rate * 60)` for the assigned machine and scheduled quantity |
| `R07_ROUTE_PRECEDENCE` | 7 | route order respected, no stage overlap within an order |
| `R08_MACHINE_OVERLAP` | 8 | no overlap on one machine |
| `R09_DOWNTIME_OVERLAP` | 9 | no downtime or `available_until` overlap |
| `R10_YARN_READY` | 10 | no start before the order's yarn-ready time |
| `R11_START_BEFORE_NOW` | 11 | no unfrozen start before `scenario.now` (frozen work belongs to the past) |
| `R12_BEYOND_HORIZON` | 12 | no operation ends past the horizon |
| `R13_QUANTITY_MISMATCH` | 13 | scheduled quantity matches the order quantity |
| `R14_UNRESOLVED_MANDATORY` | 14 | `OPTIMAL`/`FEASIBLE` status with missing mandatory work |
| `R15_FROZEN_CHANGED` | 15 | frozen/completed operations unchanged in replans |
| `R16_UNKNOWN_REFERENCE` | 16 | order and machine IDs resolve in the scenario |
| `R17_BAD_TIME_VALUE` | 17 | integer minutes ≥ 0 (schema-enforced, defensive) |

Schema-enforcement notes: R05 and R17 cannot trigger through the public
models because Pydantic rejects non-integer, negative, or inverted times at
parse time; the validator still checks them defensively so no rule is
silently skipped. Replanning context is `scenario.frozen` (optionally with
per-operation `quantity_metres` for partially completed work, checked when
both sides report it). There is no cumulative inventory model: completed
quantities are tracked per frozen operation only.

## Failure result

`scenario_id` (nullable), `solver` (nullable), `status` (defaults to
`MODEL_INVALID`), `error` (non-empty message), `details` (default `{}`).

## Legacy input spellings

Files written against the pre-1.0 scaffold keep parsing. Accepted aliases:
`name` → `scenario_id`, `synthetic` → `synthetic_data`,
`start_time`/`scenario_start` → `start`, `planning_horizon` → `horizon`,
`quantity_metres`/`quantity` → `metres`,
`order_time`/`order_timestamp` → `ordered_at`, `due_time` → `due`,
`yarn_ready_time` → `yarn_ready`,
`from`/`from_minute` → downtime `start`, `to`/`to_minute` → downtime `end`,
`scenario` → schedule `scenario_id`, `scheduler`/`solver_name` → `solver`,
`solve_time_seconds`/`wall_clock_seconds` → `compute_seconds`.
Serialization always emits canonical keys.

## Stability policy

- Additive optional fields are backward compatible.
- Renaming or removing a canonical key requires a contract version bump and
  a migration note here.
- `schemas/*.schema.json` and `fixtures/` are versioned alongside the code;
  representative valid and invalid fixtures live in `fixtures/`.
