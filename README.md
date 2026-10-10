# Textile Manufacturing Intelligence Platform

One system to replace the notebooks, paper slips, phone calls and registers at a textile mill, with a production scheduler that re-plans when a machine breaks or yarn arrives late.

Built for the reference scenario Everest Textile Mills. All factory data in this repository is synthetic and labelled as such.

> Status: hackathon build. Items marked (planned) are not implemented yet. Update this file as modules land.

---

## Contents

1. [The problem](#the-problem)
2. [What the platform does](#what-the-platform-does)
3. [How the scheduler works](#how-the-scheduler-works)
4. [Architecture](#architecture)
5. [Repository layout](#repository-layout)
6. [Getting started](#getting-started)
7. [Running the scheduler on its own](#running-the-scheduler-on-its-own)
8. [Scenario and schedule formats](#scenario-and-schedule-formats)
9. [Validator rules](#validator-rules)
10. [Seed data and scenarios](#seed-data-and-scenarios)
11. [API overview](#api-overview)
12. [Data model](#data-model)
13. [Business rules](#business-rules)
14. [Testing](#testing)
15. [Evaluation method](#evaluation-method)
16. [Scope and limits](#scope-and-limits)
17. [Team](#team)
18. [Roadmap](#roadmap)

---

## The problem

Everest Textile Mills buys yarn, turns it into fabric through spinning, weaving and dyeing, inspects the fabric, and sells finished rolls to buyers. Today it runs on five manual practices:

| Today | What goes wrong |
| --- | --- |
| Raw material stock in a notebook | Shortages are found after planning, with no early warning |
| Machine and order status by walking the floor | Idle machines and no live view of progress |
| Quality checks on paper slips | A defect can't be traced to its machine or order |
| Buyer updates by phone | Slow, inconsistent answers |
| Attendance and wages in a register | Wages are disconnected from what an order cost |

The result is late orders, idle machines, and no one knowing what a single roll really cost.

## What the platform does

| Module | What it gives the mill |
| --- | --- |
| Orders and yarn feasibility | At order entry, shows yarn needed, yarn on hand, any shortfall and a suggested reorder quantity |
| Raw-material inventory | Every receipt and issue is a movement; stock is the sum of movements; low-stock warnings |
| Machines and production runs | Live state of each machine, current order, progress, output today, downtime |
| Scheduler | Feasible plan per machine, baseline comparison, re-plan after a breakdown or yarn delay |
| Quality and traceability | Roll to run to machine to order, inspection history, pass, rework or reject |
| Finished goods and dispatch | Shelf stock, dispatch against rolls, matching invoice, no double dispatch |
| Buyer status page | Read-only page showing where an order stands and the expected delivery date |
| Attendance and wages | Per-shift attendance and monthly wages (minimal version) |
| Payments and month-end report | Bills, wages, invoices, payments, per-order cost and margin, per-machine output |
| Dashboard | One screen for open orders, at-risk orders, machine states, stock and dispatches |

## How the scheduler works

Every order follows one route: **spinning, weaving, dyeing**, then inspection and packing (tracked, not scheduled in the MVP).

Inputs: open orders with deadlines and priorities, processing time per operation (metres divided by machine rate), the machines eligible for each operation, machine downtime windows, and the earliest time each order's yarn is available.

Rules the plan must respect:

- Each operation runs on exactly one eligible machine.
- Operations of one order run in route order.
- A machine runs one operation at a time.
- No operation overlaps a machine's downtime window.
- No operation starts before its yarn is available or before "now".

Objective: minimise priority-weighted tardiness. A small secondary term pulls work earlier, which cuts idle time. Changeover penalties are planned.

Two schedulers run on identical inputs:

1. **Baseline**: earliest-deadline-first dispatching with the same eligibility and precedence rules.
2. **Optimised**: a CP-SAT model (Google OR-Tools), warm-started from the baseline plan, with a fixed time limit and random seed.

Every plan from either scheduler goes through an **independent validator** that shares no code with them. A plan that fails validation is reported as failed, never shown as a result. The solver status is reported as it is: "optimal" only when the solver proves it, otherwise "feasible, best found in N seconds".

### Disruption and re-planning

A re-plan is the same solver run on a modified scenario:

- Set "now", drop finished operations, and freeze operations already running on healthy machines.
- **Machine breakdown**: add a downtime window. An operation cut by it is split, and the remaining metres become a new operation ready at "now".
- **Delayed yarn**: push the affected order's yarn-ready time later.
- The result includes a diff: which orders moved, by how long, and which are now late or at risk.

## Architecture

```
Next.js web app  --REST-->  FastAPI backend  --->  PostgreSQL
                                 |
                                 +--> Scheduler package (OR-Tools CP-SAT)
                                          +--> Independent validator
```

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, Recharts, Gantt view |
| Backend | Python, FastAPI, one deployable with modular code |
| Database | PostgreSQL with foreign keys, unique constraints and transactions |
| Optimisation | Google OR-Tools CP-SAT |

The scheduler is a standalone Python package. It reads a scenario object and returns a schedule object, with no database access. The backend has one adapter that turns database rows into a scenario.

## Repository layout

This is the target layout. Adjust paths if the repository differs.

```
.
├── README.md
├── docker-compose.yml          # PostgreSQL for local development
├── scheduler/                  # standalone scheduling package
│   ├── models.py               # scenario, schedule, disruption types
│   ├── durations.py            # the single duration function used everywhere
│   ├── baseline.py             # earliest-deadline-first
│   ├── cpsat_model.py          # CP-SAT model
│   ├── validator.py            # independent checker, imports nothing from the solvers
│   ├── metrics.py              # tardiness, on-time rate, utilisation, compute time
│   ├── replan.py               # freeze, split, shift, diff
│   ├── gantt.py                # schedule to Gantt JSON
│   ├── cli.py                  # run a scenario from the command line
│   └── tests/
├── scenarios/                  # synthetic scenarios as JSON
│   ├── feasible.json
│   ├── machine_breakdown.json
│   ├── late_yarn.json
│   └── infeasible.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   ├── models/             # database models
│   │   └── scheduling_adapter.py
│   ├── scripts/seed.py
│   └── tests/
├── frontend/
│   ├── app/ or pages/
│   ├── components/
│   └── lib/
└── docs/
    └── PRD.md
```

## Getting started

### Requirements

- Python 3.11 or newer
- Node.js 18 or newer
- PostgreSQL 14 or newer (or Docker)

### 1. Database

```bash
docker compose up -d db
```

Or point `DATABASE_URL` at your own PostgreSQL instance.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # set DATABASE_URL and any secrets
python -m scripts.seed             # load the synthetic mill
uvicorn app.main:app --reload --port 8000
```

API docs are served at `http://localhost:8000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local         # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

The app runs at `http://localhost:3000`.

### Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `SOLVER_TIME_LIMIT_SECONDS` | backend, scheduler | Upper bound on a CP-SAT run |
| `SOLVER_RANDOM_SEED` | backend, scheduler | Fixed seed so demo runs repeat |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL |

Keep secrets in `.env` files and out of version control.

## Running the scheduler on its own

The scheduler runs without the database or the UI.

```bash
cd scheduler
pip install -r requirements.txt

# Baseline and optimised plans on one scenario, validated, with a metrics table
python -m scheduler.cli run ../scenarios/feasible.json

# Re-plan after a machine breakdown
python -m scheduler.cli replan ../scenarios/feasible.json \
  --machine-down WEAVE-03 --from 480 --to 960 --now 360

# Re-plan after a delayed yarn lot
python -m scheduler.cli replan ../scenarios/feasible.json \
  --yarn-delay ORD-007 --hours 12 --now 360

# Run all scenarios and write the results table used in the demo
python -m scheduler.cli benchmark ../scenarios/ --out results.md
```

All times are integer minutes from the scenario start. Demo figures come only from `results.md`.

## Scenario and schedule formats

### Scenario (input)

```json
{
  "name": "feasible",
  "synthetic": true,
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [
    {
      "id": "WEAVE-01",
      "stage": "weaving",
      "rate_m_per_hour": 40,
      "downtime": [{"from": 2880, "to": 3120}]
    }
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

### Schedule (output)

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
    "utilisation": 0.0,
    "makespan": 0
  },
  "operations": [
    {
      "order": "ORD-001",
      "stage": "spinning",
      "machine": "SPIN-01",
      "start": 0,
      "end": 360
    }
  ]
}
```

The metric values above are placeholders showing the shape, not results.

### Disruption (input to re-plan)

```json
{"type": "machine_down", "machine": "WEAVE-03", "from": 480, "to": 960, "now": 360}
{"type": "yarn_delay", "order": "ORD-007", "hours": 12, "now": 360}
```

### Duration rule

Operation duration on a machine is `ceil(metres / rate_m_per_hour * 60)` minutes. Baseline, CP-SAT and validator all call the one function in `durations.py`, so rounding can't differ between them.

## Validator rules

The validator takes a scenario and a schedule and returns a list of violations. It checks:

1. Every operation appears exactly once.
2. The machine is eligible for that stage and order.
3. `end - start` equals the expected duration on that machine.
4. Route order holds within each order.
5. No two operations overlap on one machine.
6. No operation overlaps a downtime window.
7. No operation starts before its yarn-ready time or before "now".
8. In a re-plan, frozen operations are unchanged.

Each rule has a test that feeds in a deliberately broken schedule and asserts the violation is reported.

## Seed data and scenarios

All data is synthetic and flagged `synthetic: true`.

The seeded mill has about 5 buyers, about 12 open orders with varied fabrics, colours, quantities, deadlines and priorities, and machines at each stage with different rates: 3 spinning, 5 weaving and 2 dyeing. It also includes yarn lots sized so two orders compete for the same yarn, finished rolls with pass, rework and reject outcomes, and a month of attendance, wages, bills, invoices and part-payments.

| Scenario | Purpose |
| --- | --- |
| `feasible.json` | Contention between orders, so the baseline and optimised plans can differ |
| `machine_breakdown.json` | A weaving machine goes down mid-plan; tests re-planning |
| `late_yarn.json` | One yarn lot arrives late; tests yarn-aware planning |
| `infeasible.json` | More work than the horizon allows, or an order with no usable machine; must produce a clear failure message naming the blocking order |

## API overview

Illustrative contract. Request and response schemas are defined in the OpenAPI docs at `/docs`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/orders` | Create an order |
| GET | `/orders`, `/orders/{id}` | List orders; get one with derived status |
| POST | `/orders/feasibility` | Check yarn for a proposed order |
| POST | `/inventory/receipts` | Record a yarn receipt |
| POST | `/inventory/issues` | Issue yarn to an order |
| GET | `/inventory` | Stock by material with low-stock flags |
| GET | `/machines` | Machines, state, current run |
| POST | `/production/runs` | Create a run |
| PATCH | `/production/runs/{id}` | Update status or output |
| POST | `/machines/{id}/downtime` | Log downtime |
| POST | `/schedules/optimize` | Run baseline and optimised plans |
| POST | `/schedules/simulate-disruption` | Apply a breakdown or yarn delay and re-solve |
| GET | `/schedules/{id}` | Plan, metrics and validation result |
| POST | `/rolls/{id}/inspections` | Record an inspection |
| GET | `/rolls/{id}/traceability` | Roll history |
| POST | `/dispatches` | Create a dispatch |
| POST | `/dispatches/{id}/confirm` | Confirm a dispatch (idempotent) |
| GET | `/buyer/orders/{token}` | Buyer status page data |
| POST | `/attendance` | Mark attendance |
| POST | `/payments` | Record a buyer payment |
| GET | `/reports/operations` | Dashboard metrics |
| GET | `/reports/month-end?month=` | Month-end report |

## Data model

| Entity | Holds |
| --- | --- |
| Buyer | Name, contact |
| Order | Fabric, colour, metres, rate, deadline, priority |
| Operation | One route stage for an order, planned duration |
| Machine | Type, rate, state, availability windows |
| Production run | Scheduled or actual execution, start, end, output |
| Downtime | Machine, reason, start, end |
| Supplier | Name, contact |
| Material and material lot | Type, colour, specification, reorder threshold, supplier, quantity, lot cost |
| Inventory movement | Receipt, issue or adjustment, quantity, date |
| Fabric roll | Metres, status, link to run and order |
| Inspection | Defect type, severity, result, disposition, time |
| Dispatch and dispatch item | Date, vehicle, invoice number, rolls and metres |
| Invoice and payment | Amount, amount received, dates |
| Worker and attendance | Wage rate; present, absent or half-day per shift, overtime |
| Cost entry | Category, amount, actual or estimated |
| Schedule | Input snapshot, solver status, metrics, plan |

Integrity rules: stable IDs for orders, lots, runs and rolls; movements recorded rather than balances overwritten; scheduled and actual runs kept apart; inspection and dispatch history preserved; issue, inspection and dispatch confirmation wrapped in transactions.

## Business rules

**Order status** is derived from events, never typed in. Stages: not started, spinning, weaving, dyeing, inspection, ready to ship, partly dispatched, dispatched. An order sits at the furthest stage with recorded output.

**At risk** means projected completion falls in the last 10% of the window between order date and deadline, or a required yarn lot is short. **Late** means projected completion is after the deadline.

**Inventory**: an issue larger than available stock is rejected and changes nothing. Stock at or below the reorder threshold raises a warning.

**Quality**: rolls start as awaiting inspection. A roll that is awaiting inspection, in rework or rejected can't be dispatched. Inspections are appended, never overwritten.

**Dispatch**: a dispatch lists specific rolls for one order. Confirming it twice has no further effect. Invoice quantity equals the rolls loaded. Shelf stock plus dispatched stock equals total passed stock at all times.

**Costs**: every figure is marked actual or estimated. Missing cost data shows as incomplete, not zero. Every total opens to its underlying records.

## Testing

```bash
# scheduler: validator tests, baseline, CP-SAT, re-plan, property tests
cd scheduler && pytest

# backend: rules for inventory, inspection, dispatch, costing
cd backend && pytest

# frontend
cd frontend && npm test
```

Key tests:

- One test per validator rule using a deliberately broken schedule.
- A property test that generates small random scenarios, runs baseline and CP-SAT, asserts zero violations from both, and asserts CP-SAT weighted tardiness is no worse than the baseline's.
- Backend tests for over-issue rejection, rejected-roll dispatch refusal, and repeated dispatch confirmation leaving stock unchanged.
- Reconciliation test: shelf stock plus dispatched stock equals passed stock after a sequence of operations.

## Evaluation method

The scheduler is judged on a fixed dataset, independently of the UI.

| Metric | Definition |
| --- | --- |
| Weighted tardiness | Sum over orders of days late times priority weight |
| On-time rate | Orders finished by deadline divided by orders in the plan |
| Machine utilisation | Productive machine hours divided by available hours in the horizon, with downtime treated the same way in both runs |
| Compute time | Wall-clock seconds to produce the plan |
| Constraint violations | Breaches found by the validator |

Protocol: load the fixed dataset, run baseline then CP-SAT on the same snapshot, validate both, record metrics and solver status, inject a breakdown or yarn delay, re-solve, compare and explain trade-offs.

No improvement figure is quoted unless it came from a recorded run. Higher utilisation with more late orders is reported as a trade-off.

### Results

Fill this table from `results.md` after running the benchmark.

| Scenario | Scheduler | Weighted tardiness | On-time rate | Utilisation | Compute time | Violations | Solver status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| feasible | EDF baseline | | | | | | n/a |
| feasible | CP-SAT | | | | | | |
| machine_breakdown | CP-SAT re-plan | | | | | | |
| late_yarn | CP-SAT re-plan | | | | | | |
| infeasible | CP-SAT | | | | | | |

## Scope and limits

In scope: the modules listed above, running on seeded synthetic data.

Out of scope for the hackathon:

- Direct control of machines or PLCs.
- Production-grade computer vision for defects.
- Payroll compliance or tax filing.
- A full ERP replacement.
- Proof of global optimality in every scenario.

Known simplifications:

- Yarn is modelled as an earliest-start time per order, derived from received and expected lots. Treating stock as a resource inside the solver is planned.
- Inspection and packing are tracked but not scheduled.
- Changeover times and shift calendars are planned.
- The solver is sized for a small mill. Larger instances would need time limits and decomposition, and solve times would be measured, not assumed.
- The buyer page uses an unguessable link and no login in the MVP.

## Team

| Member | Area |
| --- | --- |
| Member 1 | Production and scheduling: CP-SAT engine, EDF baseline, validator, Gantt data, disruption re-planning |
| Member 2 | (fill in) |
| Member 3 | (fill in) |
| Member 4 | (fill in) |

## Roadmap

1. **Operational digitisation**: orders, inventory, floor, quality, dispatch, wages, payments.
2. **Decision support**: scheduling, disruption recovery, order costing, alerts.
3. **Learning from history**: defect-pattern analysis and delivery-risk estimates, once real data exists.
4. **Machine integration**: telemetry and equipment-system integration.

## Licence

(Add a licence, or state that the repository is for hackathon evaluation only.)