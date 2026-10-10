# Textile Manufacturing Intelligence Platform

Unified system for textile manufacturing replacing manual practices with shared records and a constraint-based scheduler. Built for the reference scenario Everest Textile Mills. All data is synthetic and labelled as such.

> Status: hackathon build. Items marked (planned) are not implemented.

---

## Problem & Solution

| Manual Practice | Problem | Module |
|---------------|---------|--------|
| Raw material in notebook | Shortages found after planning | Raw-material inventory with reorder thresholds |
| Floor walks for status | Idle machines, no live view | Machine tracking + scheduler |
| Paper quality slips | Defects untraceable | Roll-level inspection & traceability |
| Buyer updates by phone | Slow, inconsistent answers | Buyer status page |
| Attendance & wages register | Wages disconnected from order cost | Attendance, wages, order costing |

---

## Modules

| Module | Function |
|--------|----------|
| **Orders + Yarn Feasibility** | At entry: yarn required, on hand, shortfall, reorder suggestion |
| **Raw-material Inventory** | Movements as receipts/issues; stock = sum of movements; low-stock warnings |
| **Machines & Runs** | Live state, current order, progress, output, downtime |
| **Scheduler** | Feasible plan, baseline comparison, re-plan on breakdown/yarn delay |
| **Quality & Traceability** | Roll → run → machine → order; inspections; pass/rework/reject |
| **Finished Goods & Dispatch** | Shelf stock, dispatch against rolls, matching invoice, idempotent confirm |
| **Buyer Status** | Read-only page: stage, progress, ETA, dispatch/invoice details |
| **Attendance & Wages** | Per-shift attendance, monthly wages (minimal) |
| **Payments & Month-end** | Bills, wages, invoices, payments; per-order cost/margin; per-machine output |
| **Dashboard** | Open orders, at-risk orders, machine states, low stock, rolls awaiting inspection |

---

## Scheduler

**Route:** spinning → weaving → dyeing (inspection & packing tracked, not scheduled).

**Inputs:** open orders (deadlines, priorities), processing time (metres/rate), machine eligibility, downtime windows, yarn-ready times.

**Constraints:** one machine per operation; route order; no machine overlap; no downtime overlap; no start before yarn-ready/now.

**Objective:** minimize priority-weighted tardiness; secondary: minimize idle time.

**Two solvers on identical inputs:**
1. **Baseline** — Earliest-deadline-first dispatch
2. **Optimised** — OR-Tools CP-SAT, warm-started from baseline, fixed time limit & seed

**Validator:** Independent checker (no shared code with solvers). Failed plans reported as failed. Status: `OPTIMAL` (proved), `FEASIBLE` (found, unproved), `INFEASIBLE`, `UNKNOWN`, `MODEL_INVALID`.

### Disruption & Re-planning
Re-solve on modified scenario:
- Set `now`, drop finished ops, freeze running ops on healthy machines
- **Machine breakdown:** add downtime; split interrupted op into completed + remainder sub-lot
- **Yarn delay:** push `yarn_ready`; downstream ops shift
- Output: diff (moved orders, delta minutes, newly late/at-risk, recovered)

---

## Architecture

```
Next.js (React/TS/Tailwind)  ──REST──►  FastAPI (Python)  ──►  PostgreSQL
                                       │
                                       └── Scheduler package (OR-Tools CP-SAT)
                                             └── Independent validator
```

| Layer | Stack |
|-------|-------|
| Frontend | Next.js, React, TypeScript, Tailwind, Recharts, Gantt |
| Backend | Python, FastAPI, modular single deployable |
| Database | PostgreSQL (FKs, unique constraints, transactions) |
| Optimisation | Google OR-Tools CP-SAT |

Scheduler is a standalone Python package. Reads `Scenario` → returns `Schedule`. No DB access. Backend adapts DB rows → `Scenario`.

---

## Repository Layout

```
.
├── docker-compose.yml          # PostgreSQL for local dev
├── scheduler/                  # Standalone scheduling package
│   ├── models.py               # Scenario, Schedule, Disruption types
│   ├── durations.py            # Single duration function
│   ├── baseline.py             # EDF baseline
│   ├── optimizer.py            # CP-SAT model
│   ├── validator.py            # Independent checker
│   ├── metrics.py              # Tardiness, on-time, utilisation, compute time
│   ├── replan.py               # Freeze, split, shift, diff
│   ├── gantt.py                # Schedule → Gantt JSON
│   └── cli.py                  # CLI entry point
├── scenarios/                  # Synthetic JSON scenarios
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   ├── services/
│   │   └── models/             # DB models
│   ├── scripts/seed.py
│   └── requirements.txt
├── frontend/
│   ├── app/ or pages/
│   ├── components/
│   └── lib/
└── README.md
```

---

## Getting Started

### Requirements
- Python 3.11+, Node.js 18+, PostgreSQL 14+ (or Docker)

### 1. Database
```bash
docker compose up -d db
# Or set DATABASE_URL to your PostgreSQL instance
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Set DATABASE_URL, SOLVER_TIME_LIMIT_SECONDS, SOLVER_RANDOM_SEED
python -m scripts.seed           # Load synthetic mill data
uvicorn app.main:app --reload --port 8000
```
API docs at `http://localhost:8000/docs`.

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env.local       # Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```
App at `http://localhost:3000`.

### Key Environment Variables
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SOLVER_TIME_LIMIT_SECONDS` | CP-SAT time limit |
| `SOLVER_RANDOM_SEED` | Fixed seed for reproducibility |
| `NEXT_PUBLIC_API_URL` | Backend base URL for frontend |

---

## Scheduler (Standalone)

```bash
cd scheduler
pip install -r requirements.txt

# Baseline + optimised, validated, with metrics
python -m scheduler.cli run ../scenarios/feasible.json

# Re-plan: machine breakdown
python -m scheduler.cli replan ../scenarios/feasible.json \
  --machine-down WEAVE-03 --from 480 --to 960 --now 360

# Re-plan: yarn delay
python -m scheduler.cli replan ../scenarios/feasible.json \
  --yarn-delay ORD-007 --hours 12 --now 360

# Benchmark all scenarios
python -m scheduler.cli benchmark ../scenarios/ --out results.md
```

All times: integer minutes from scenario start. Demo figures from `results.md`.

---

## Scenario & Schedule Formats

### Scenario (input)
```json
{
  "name": "feasible",
  "synthetic": true,
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [{"id": "WEAVE-01", "stage": "weaving", "rate_m_per_hour": 40, "downtime": [{"from": 2880, "to": 3120}]}],
  "orders": [{"id": "ORD-001", "buyer": "Buyer A", "fabric": "cotton twill", "colour": "navy", "metres": 2400, "due": 5760, "priority_weight": 3, "yarn_ready": 0, "eligible": {"spinning": ["SPIN-01","SPIN-02"], "weaving": ["WEAVE-01","WEAVE-02"], "dyeing": ["DYE-01"]}}],
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
  "metrics": {"weighted_tardiness": 0, "on_time_rate": 1.0, "utilisation": 0.85, "makespan": 8400},
  "operations": [{"order": "ORD-001", "stage": "spinning", "machine": "SPIN-01", "start": 0, "end": 360}]
}
```

### Disruption input
```json
{"type": "machine_down", "machine": "WEAVE-03", "from": 480, "to": 960, "now": 360}
{"type": "yarn_delay", "order": "ORD-007", "hours": 12, "now": 360}
```

### Duration rule
`ceil(metres / rate_m_per_hour * 60)` — single function in `durations.py` used by baseline, CP-SAT, validator.

---

## Validator Rules
1. Every operation appears exactly once
2. Machine eligible for stage & order
3. `end - start` = expected duration
4. Route order within each order
5. No machine overlap
6. No downtime overlap
7. No start before yarn-ready or now
8. Frozen ops unchanged in re-plan

---

## Seed Data (synthetic, `synthetic: true`)

| Scenario | Purpose |
|----------|---------|
| `feasible.json` | Contention between orders |
| `machine_breakdown.json` | Weaving machine down mid-plan |
| `late_yarn.json` | Yarn lot arrives late |
| `infeasible.json` | More work than horizon / no usable machine |

---

## API Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/orders` | Create order |
| GET | `/orders`, `/orders/{id}` | List / get with derived status |
| POST | `/orders/feasibility` | Yarn check for proposed order |
| POST | `/inventory/receipts` | Record yarn receipt |
| POST | `/inventory/issues` | Issue yarn to order |
| GET | `/inventory` | Stock by material, low-stock flags |
| GET | `/machines` | Machines, state, current run |
| POST | `/production/runs` | Create run |
| PATCH | `/production/runs/{id}` | Update status/output |
| POST | `/machines/{id}/downtime` | Log downtime |
| POST | `/schedules/optimize` | Run baseline + optimised |
| POST | `/schedules/simulate-disruption` | Breakdown/yarn delay, re-solve |
| GET | `/schedules/{id}` | Plan, metrics, validation |
| POST | `/rolls/{id}/inspections` | Record inspection |
| GET | `/rolls/{id}/traceability` | Roll history |
| POST | `/dispatches` | Create dispatch |
| POST | `/dispatches/{id}/confirm` | Confirm (idempotent) |
| GET | `/buyer/orders/{token}` | Buyer status page |
| POST | `/attendance` | Mark attendance |
| POST | `/payments` | Record buyer payment |
| GET | `/reports/operations` | Dashboard metrics |
| GET | `/reports/month-end?month=` | Month-end report |

---

## Data Model

| Entity | Links To |
|--------|----------|
| Buyer | Many orders |
| Order | Fabric, colour, metres, rate, deadline, priority |
| Operation | One route stage, planned duration |
| Machine | Type, rate, state, availability windows |
| Production Run | Scheduled/actual execution, start, end, output |
| Downtime | Machine, reason, start, end |
| Material & Lot | Type, colour, spec, supplier, qty, lot cost |
| Inventory Movement | Receipt/issue/adjustment, qty, date |
| Fabric Roll | Metres, status, links to run & order |
| Inspection | Defect type, severity, result, disposition, time |
| Dispatch & Item | Date, vehicle, invoice; roll, metres |
| Invoice & Payment | Amount, due, received, date |
| Worker & Attendance | Wage rate; present/absent/half-day, overtime |
| Cost Entry | Category, amount, actual/estimated |
| Schedule | Input snapshot, solver status, metrics, plan |

---

## Business Rules

- **Order status** derived from events (not typed): not started → spinning → weaving → dyeing → inspection → ready → partly dispatched → dispatched
- **Late** = projected completion > deadline; **At risk** = in last 10% of order→deadline window or yarn lot short
- **Inventory**: over-issue rejected; low-stock warning at threshold
- **Quality**: rolls await inspection; rejected/in-rework cannot dispatch; inspections appended
- **Dispatch**: idempotent confirm; rolls specific; invoice qty = rolls loaded
- **Costs**: actual/estimated flagged; missing = incomplete (not zero); per-order & per-roll totals with drill-down

---

## Testing

```bash
# Scheduler: validator, baseline, CP-SAT, replan, property tests
cd scheduler && pytest

# Backend: inventory, inspection, dispatch, costing rules
cd backend && pytest

# Frontend
cd frontend && npm test
```

Key tests:
- One test per validator rule with deliberately broken schedule
- Property test: random scenarios → baseline + CP-SAT → zero violations; CP-SAT tardiness ≤ baseline
- Backend: over-issue rejection, rejected-roll dispatch refusal, idempotent confirm
- Reconciliation: shelf + dispatched = passed stock after operations

---

## Evaluation Method

Scheduler judged on fixed dataset, no UI.

| Metric | Definition |
|--------|------------|
| Weighted tardiness | Σ (days late × priority) |
| On-time rate | Orders finished by deadline / total |
| Machine utilisation | Productive hrs / available hrs (downtime excluded) |
| Compute time | Wall-clock seconds |
| Constraint violations | Validator breaches |

Protocol: load fixed seed → run baseline & CP-SAT → validate → record metrics → inject disruption → re-solve → compare trade-offs. Higher utilisation with more late = trade-off, not win.

Results table filled from `results.md` after benchmark run.

---

## Scope & Limits

**In scope:** Modules above on seeded synthetic data.

**Out of scope (hackathon):**
- PLC/machine control
- Computer vision defects
- Payroll compliance / tax filing
- Full ERP replacement
- Global optimality proof

**Known simplifications:**
- Yarn = earliest-start per order (stock-as-resource planned)
- Inspection/packing tracked, not scheduled
- Changeover times & shift calendars (P1)
- Small-mill sizing; larger needs decomposition
- Buyer page: unguessable link, no login (MVP)
- Vision: P2, structured records only

---

## Demo Plan

1. Mill's day: seeded orders, shared yarn, constrained weaving
2. New order → yarn shortfall + reorder suggestion
3. Baseline → late orders, at-risk flags
4. CP-SAT → validator, status, compute time, metric changes
5. Break machine → re-plan → moved orders, new late
6. Roll traceability → order, machine, inspections; reject dispatch refused
7. Buyer page → log floor output → status changes live
8. Month-end → wages, bills, payments, margin per order (all drillable)

All numbers from recorded runs, never hand-edited cards.

---

*Data in this repository is synthetic and labelled as such throughout.*