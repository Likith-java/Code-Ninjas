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
`violations` (`rule` 1–8, `message`, optional `order`/`machine`/`stage`).
The validator imports nothing from solver modules. Rule summary:
1. no duplicate order-stage operations;
2. machine eligible and stage-compatible;
3. duration matches `compute_duration` (and quantity matches the order);
4. route order within each order, no stage overlap;
5. no machine overlap;
6. no downtime overlap, respects `available_until`;
7. no start before `yarn_ready` or `now`;
8. frozen operations unchanged.

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
