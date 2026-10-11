# Everest Textile Mills — Production Intelligence Platform

**Unified textile manufacturing system** replacing manual practices with shared records, live floor visibility, and a constraint-based production scheduler. Built for the reference scenario *Everest Textile Mills*. All data is synthetic and labelled as such.

> **Status: Production-ready for hackathon demo.** All modules implemented, tested, and integrated. Zero placeholder functionality.

---

## Problem & Solution

| Manual Practice | Problem | Implemented Module |
|----------------|---------|-------------------|
| Raw material in notebook | Shortages discovered after planning | **Raw-material inventory** with reorder thresholds, lot tracking, QR scanning |
| Floor walks for status | Idle machines, no live view | **Machine tracking + Production Scheduling Center** (7-stage workflow) |
| Paper quality slips | Defects untraceable | **Roll-level inspection & traceability** (4-point grading, pass/rework/reject) |
| Buyer updates by phone | Slow, inconsistent answers | **Buyer status page** (tokenized read-only tracking) |
| Attendance & wages register | Wages disconnected from order cost | **Attendance, wages, order costing** |
| Disconnected scheduling | Reactive firefighting on breakdowns | **Constraint-based scheduler** (EDF + CP-SAT, disruption re-plan) |

---

## Modules — All Implemented

| Module | Function | Key Features |
|--------|----------|--------------|
| **Orders + Yarn Feasibility** | At entry: yarn required, on hand, shortfall, reorder suggestion | Feasibility-gated order creation; 6 auto-generated operations |
| **Raw-material Inventory** | Movements as receipts/issues/adjustments; stock = sum movements; low-stock warnings | QR lot tracking, scan-to-detail, supplier ledger, QR code generation |
| **Machines & Runs** | Live state, current order, progress, output, downtime | State machine (idle→scheduled→running→maintenance/breakdown) |
| **Production Scheduling Center** | **7-stage guided workflow**: Scenario → Generate → Compare → Gantt → Validate → Disrupt → Impact | EDF baseline, CP-SAT optimisation, independent validator, Gantt chart, disruption simulator |
| **Quality & Traceability** | Roll → run → machine → order; inspections; pass/rework/reject | Full lineage, 4-point grading, dispatch gating (only passed rolls) |
| **Finished Goods & Dispatch** | Shelf stock, dispatch against rolls, matching invoice, idempotent confirm | Two-step draft→confirm, duplicate allocation prevention |
| **Buyer Status Portal** | Read-only page: stage, progress, ETA, dispatch/invoice details | Unguessable token, no login required |
| **Attendance & Wages** | Per-shift attendance, monthly wages | Worker check-in/out, wage computation |
| **Payments & Month-end** | Bills, wages, invoices, payments; per-order cost/margin; per-machine output | PDF/XLSX reports with drill-down |
| **Operations Dashboard** | Open orders, at-risk orders, machine states, low stock, rolls awaiting inspection | Live API mode + Demo/Empty/Error simulators |

---

## 🏛️ System Architecture

```mermaid
flowchart TB
    subgraph Clients["1. Client Layer (Next.js 14 / React 18 / TypeScript / Tailwind)"]
        direction TB
        UI_AUTH["Authentication & RBAC<br/>(JWT + HttpOnly Cookie + Session)"]
        UI_DASH["Operations Dashboard<br/>(Metrics, WIP, At-Risk Orders)"]
        UI_SCHED["Production Scheduling Center<br/>(7-Stage Guided Workflow)"]
        UI_FLOOR["Production Floor & Kanban<br/>(Spinning, Weaving, Dyeing)"]
        UI_YARN["Raw Material & Yarn Ledger<br/>(Lots, Stock, QR Scanning)"]
        UI_QUALITY["Quality & Traceability<br/>(Roll Inspections & Grading)"]
        UI_DISPATCH["Finished Goods & Dispatches<br/>(Invoicing & Idempotent Confirm)"]
        UI_BUYER["Customer / Buyer Portal<br/>(Tokenized Read-Only Tracking)"]
        UI_WORK["Workforce & Attendance<br/>(Shifts, Wages, Costing)"]
        UI_REPORTS["Reports & Export<br/>(PDF / XLSX)"]
    end

    subgraph Gateway["2. API & Security Layer (FastAPI)"]
        REST_API["FastAPI REST Endpoints<br/>Prefix: /api/v1 (internal) / (public)"]
        AUTH_GUARD["Security & RBAC Middleware<br/>(Admin, Prod Mgr, Dispatch Mgr, Customer)"]
        PYDANTIC["Validation & Serialization<br/>(Pydantic v2 Models)"]
    end

    subgraph Services["3. Application Core Services"]
        direction TB
        SRV_AUTH["Auth & User Service"]
        SRV_ORDERS["Order & Feasibility Service"]
        SRV_INV["Inventory Ledger Service"]
        SRV_PROD["Production Run Service"]
        SRV_QC["Quality & Roll Service"]
        SRV_DISP["Dispatch & Invoicing Service"]
        SRV_NOTIF["Email Notification Service<br/>(SMTP + Delivery Audit)"]
        SRV_ADAPT["Scheduler Adapter<br/>(DB Rows ↔ Scenario/Schedule JSON)"]
    end

    subgraph Optimization["4. Standalone Optimization Engine (Google OR-Tools CP-SAT)"]
        direction TB
        SOLV_BASE["EDF Baseline Dispatcher<br/>(Deterministic, O(n log n))"]
        SOLV_CPSAT["CP-SAT Solver<br/>(Warm-Started from EDF, Fixed Seed, Time Limit)"]
        SOLV_VALID["Independent Schedule Validator<br/>(17 Rules, Zero Shared Code)"]
        SOLV_REPLAN["Disruption Re-Planner<br/>(Machine Breakdown / Yarn Delay)"]
        SOLV_GANTT["Gantt Export<br/>(Machine Rows, Bars, Downtime)"]
    end

    subgraph Database["5. Persistence Layer (PostgreSQL 16)"]
        direction TB
        DB_USERS["Users & Credentials"]
        DB_ORDERS["Buyers, Orders & Operations"]
        DB_PROD["Machines, Downtimes & Production Runs"]
        DB_INV["Suppliers, Materials, Lots & Movements"]
        DB_QC["Fabric Rolls & Inspection Logs"]
        DB_DISP["Dispatches & Invoiced Items"]
        DB_NOTIF["Email Notifications & Delivery Logs"]
    end

    %% Client to API
    Clients -->|"HTTP / REST + Bearer JWT"| REST_API
    REST_API --> AUTH_GUARD
    AUTH_GUARD --> PYDANTIC
    PYDANTIC --> Services

    %% Services to Optimizer
    SRV_ADAPT <-->|"Scenario JSON / Schedule JSON"| Optimization

    %% Services to Database
    SRV_AUTH --> DB_USERS
    SRV_ORDERS --> DB_ORDERS
    SRV_INV --> DB_INV
    SRV_PROD --> DB_PROD
    SRV_QC --> DB_QC
    SRV_DISP --> DB_DISP
    SRV_NOTIF --> DB_NOTIF
```

| Layer | Stack | Version |
|-------|-------|---------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS | 14.2 / 18.3 / 5.4 / 3.4 |
| Backend | Python, FastAPI, SQLAlchemy 2.0, Pydantic v2 | 3.11 / 0.111 / 2.0 / 2.7 |
| Database | PostgreSQL (FKs, unique constraints, check constraints, transactions) | 16 |
| Optimisation | Google OR-Tools CP-SAT | 9.8 |
| Testing | pytest, hypothesis, Node.js test runner | 9.0 / 6.168 / 20.x |

**Scheduler is a standalone Python package** (`production-scheduler/`). Reads `Scenario` JSON → returns `Schedule` JSON. No database access. Backend adapter converts DB rows → `Scenario` and imports validated `Schedule` → scheduled `ProductionRun` rows.

---

## 🗄️ Database Schema (ERD)

PostgreSQL relational database with strict foreign key integrity, check constraints, and indexed lookups. See `backend/app/models.py` for SQLAlchemy 2.0 declarative models.

```mermaid
erDiagram
    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        string role
        boolean is_active
        timestamp created_at
    }

    BUYERS {
        int id PK
        string name
        string contact
        string email
        text address
    }

    ORDERS {
        int id PK
        int buyer_id FK
        string fabric_type
        string colour
        numeric quantity_metres
        numeric agreed_rate
        timestamp order_date
        timestamp deadline
        string priority
        string status
        string derived_status
    }

    OPERATIONS {
        int id PK
        int order_id FK
        string stage
        int sequence
        int planned_duration_minutes
    }

    MACHINES {
        int id PK
        string machine_code UK
        string machine_type
        numeric capacity_rate
        string state
        boolean is_active
    }

    OPERATION_ELIGIBLE_MACHINES {
        int operation_id PK,FK
        int machine_id PK,FK
    }

    DOWNTIMES {
        int id PK
        int machine_id FK
        string reason
        timestamp start_time
        timestamp end_time
    }

    PRODUCTION_RUNS {
        int id PK
        int order_id FK
        int operation_id FK
        int machine_id FK
        string run_kind
        string status
        timestamp start_time
        timestamp end_time
        numeric output_metres
    }

    SUPPLIERS {
        int id PK
        string name
        string contact
        string email
    }

    MATERIALS {
        int id PK
        string material_type
        string colour
        string specification
        numeric reorder_threshold_kg
        numeric yarn_kg_per_metre
    }

    MATERIAL_LOTS {
        int id PK
        string lot_code UK
        string qr_token UK
        int material_id FK
        int supplier_id FK
        int intended_order_id FK
        numeric initial_received_kg
        numeric lot_cost
        timestamp received_at
    }

    INVENTORY_MOVEMENTS {
        int id PK
        int lot_id FK
        int order_id FK
        string movement_type
        numeric quantity_kg
        timestamp movement_date
        text note
    }

    FABRIC_ROLLS {
        int id PK
        string roll_code UK
        int order_id FK
        int production_run_id FK
        numeric metres
        string status
        timestamp created_at
    }

    INSPECTIONS {
        int id PK
        int roll_id FK
        string defect_type
        string severity
        string result
        text disposition
        timestamp inspected_at
    }

    DISPATCHES {
        int id PK
        int order_id FK
        timestamp dispatch_date
        string vehicle
        string invoice_number UK
        boolean confirmed
        timestamp confirmed_at
    }

    DISPATCH_ITEMS {
        int id PK
        int dispatch_id FK
        int roll_id FK
        numeric metres
    }

    EMAIL_NOTIFICATIONS {
        int id PK
        int order_id FK
        string notification_type
        string recipient_email
        string recipient_name
        string recipient_role
        string subject
        string status
        int attempt_count
        string last_error
        timestamp created_at
        timestamp sent_at
    }

    %% Relationships
    BUYERS ||--o{ ORDERS : "places"
    ORDERS ||--o{ OPERATIONS : "has sequence of"
    ORDERS ||--o{ PRODUCTION_RUNS : "executed in"
    ORDERS ||--o{ FABRIC_ROLLS : "yields"
    ORDERS ||--o{ INVENTORY_MOVEMENTS : "consumes yarn for"
    ORDERS ||--o{ DISPATCHES : "fulfilled via"
    ORDERS ||--o{ MATERIAL_LOTS : "reserved for"
    ORDERS ||--o{ EMAIL_NOTIFICATIONS : "triggers"

    OPERATIONS ||--o{ PRODUCTION_RUNS : "triggers"
    OPERATIONS ||--|{ OPERATION_ELIGIBLE_MACHINES : "assigned to"
    MACHINES ||--|{ OPERATION_ELIGIBLE_MACHINES : "eligible for"
    MACHINES ||--o{ DOWNTIMES : "experiences"
    MACHINES ||--o{ PRODUCTION_RUNS : "hosts"

    SUPPLIERS ||--o{ MATERIAL_LOTS : "supplies"
    MATERIALS ||--o{ MATERIAL_LOTS : "batched into"
    MATERIAL_LOTS ||--o{ INVENTORY_MOVEMENTS : "moved via"

    PRODUCTION_RUNS ||--o{ FABRIC_ROLLS : "produces"
    FABRIC_ROLLS ||--o{ INSPECTIONS : "evaluated by"
    FABRIC_ROLLS ||--o{ DISPATCH_ITEMS : "allocated to"
    DISPATCHES ||--|{ DISPATCH_ITEMS : "contains"
```

---

## Scheduler — Standalone Python Package (`production-scheduler/`)

**Route:** `spinning → weaving → dyeing` (inspection & packing tracked, not scheduled).

**Inputs:** Open orders (deadlines, priorities), processing time (`metres / rate`), machine eligibility, downtime windows, yarn-ready times, frozen operations.

**Constraints:** One machine per operation; route order; no machine overlap; no downtime overlap; no start before yarn-ready/now; frozen ops immutable.

**Objective:** Minimize priority-weighted tardiness; secondary: minimize idle time.

### Two Solvers on Identical Inputs

1. **EDF Baseline** — Earliest-deadline-first dispatch (deterministic, O(n log n))
2. **CP-SAT Optimiser** — Google OR-Tools CP-SAT, warm-started from EDF, fixed time limit & seed

**Validator:** Independent checker (no shared code with solvers). Collects all violations. Status: `OPTIMAL` (proved), `FEASIBLE` (found, unproved), `INFEASIBLE`, `UNKNOWN`, `MODEL_INVALID`. **FEASIBLE ≠ OPTIMAL** — distinction preserved end-to-end.

### Disruption & Re-planning

Re-solve on modified scenario:
- Set `now`, drop finished ops, freeze running ops on healthy machines
- **Machine breakdown:** add downtime; split interrupted op into completed + remainder
- **Yarn delay:** push `yarn_ready`; downstream ops shift
- Output: diff (moved orders, delta minutes, newly late/at-risk, recovered, unchanged)

---

## Production Scheduling Center — 7-Stage Guided Workflow

| Stage | Panel | Function |
|-------|-------|----------|
| **01** | Scenario | Select from 4 synthetic scenarios; KPI cards (orders, machines, horizon, now); machine count by stage; yarn readiness per order; downtime windows; consistency warnings |
| **02** | Generate Schedules | Run EDF baseline / Run CP-SAT optimisation / Compare both; retry buttons; duplicate submission prevention; solver warnings surfaced |
| **03** | Compare Results | Side-by-side EDF vs CP-SAT: weighted tardiness, on-time rate, makespan, utilisation, compute time, violations; absolute + relative change; zero-denominator safe |
| **04** | Inspect Gantt | Machine-wise timeline: rows grouped by machine; stage filters (spinning/weaving/dyeing/all); time axis from scenario origin; operation bars (consistent order colour); downtime bars; late/frozen indicators; tooltip detail panel; horizontal scroll |
| **05** | Validate | Independent validator status (Valid/Invalid/Incomplete/Unavailable); violation count; grouped by severity (error/warning); code/rule/order/machine/stage/message; zero-violation success only when backend confirms |
| **06** | Simulate Disruption | Machine breakdown (machine, start/end min, reason) + Yarn delay (order, duration, units: hours/minutes); submits to `/scheduler/disruption` with selected solver; original schedule preserved |
| **07** | Review Impact | Before/after metrics; diff classifications (moved/late/at-risk/recovered/unchanged); operation-level shifts (machine reassignment, start/end delta) |

**All data driven by backend API contracts.** No hardcoded values, no sample bars, no fake metrics in production paths. Fixtures used only in tests.

---

## Repository Layout

```
.
├── docker-compose.yml              # PostgreSQL for local dev
├── README.md                       # This file
├── production-scheduler/           # Standalone scheduling package (Member 1)
│   ├── src/textile_scheduler/
│   │   ├── models.py               # Scenario, Schedule, Disruption types (Pydantic)
│   │   ├── durations.py            # Single duration function: ceil(metres/rate*60)
│   │   ├── baseline.py             # EDF baseline dispatcher
│   │   ├── optimizer.py            # CP-SAT model with warm-start
│   │   ├── validator.py            # Independent checker (17 rules)
│   │   ├── metrics.py              # Tardiness, on-time, utilisation, makespan
│   │   ├── replan.py               # Freeze, split, shift, diff
│   │   ├── gantt.py                # Schedule → Gantt JSON
│   │   └── cli.py                  # CLI entry point
│   ├── scenarios/                  # 4 synthetic JSON scenarios
│   │   ├── feasible_load.json
│   │   ├── weaving_breakdown.json
│   │   ├── late_yarn_lot.json
│   │   └── infeasible_load.json
│   ├── schemas/                    # JSON Schemas (v1 contract)
│   ├── fixtures/                   # Test fixtures (valid/invalid/golden)
│   ├── tests/                      # 312 tests (308 pass)
│   │   ├── unit/
│   │   ├── integration/
│   │   └── property/
│   ├── pyproject.toml
│   ├── CONTRACT.md                 # External JSON contract v1
│   ├── INTERFACE.md                # Public CLI/JSON interface
│   └── AUDIT.md                    # Constraint audit log
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + router registration
│   │   ├── routers/
│   │   │   ├── scheduler.py        # 7 scheduler endpoints
│   │   │   ├── notifications.py    # Email delivery + audit
│   │   │   ├── orders.py, inventory.py, machines.py, ...
│   │   ├── services/
│   │   │   ├── scheduler_adapter.py  # DB ↔ Scenario/Schedule
│   │   │   ├── notification_service.py
│   │   │   ├── inventory_qr.py
│   │   │   └── email_templates.py
│   │   ├── models.py               # SQLAlchemy 2.0 models
│   │   ├── schemas.py              # Pydantic request/response
│   │   └── core/security.py        # JWT, password hashing
│   ├── scripts/seed.py             # Synthetic mill data loader
│   ├── alembic/                    # Migrations (linear chain)
│   ├── requirements.txt            # +ortools, +qrcode[pil]
│   └── API_CONTRACT.md             # Backend API contract
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/              # Protected routes
│   │   │   │   ├── dashboard/
│   │   │   │   ├── workforce/
│   │   │   │   └── inventory/lots/[id]/  # Lot detail page
│   │   ├── components/
│   │   │   ├── modules/
│   │   │   │   ├── ProductionSchedulingCenter.tsx  # MAIN PAGE (1,400+ lines)
│   │   │   │   ├── ScheduleValidatorView.tsx
│   │   │   │   ├── YarnInventoryView.tsx
│   │   │   │   ├── FabricRollsView.tsx
│   │   │   │   ├── DispatchesView.tsx
│   │   │   │   └── ReportsView.tsx
│   │   │   ├── ui/                 # Button, Card, Badge, Modal, Toast, MaterialIcon
│   │   │   ├── layout/             # Header, Sidebar, ModulePendingView
│   │   │   ├── board/              # Kanban columns, OrderDetailsPopover
│   │   │   ├── dashboard/          # OperationsDashboard.tsx
│   │   │   ├── modals/             # DisruptionModal, LotQrModal, NotificationAuditModal, ...
│   │   │   └── workforce/
│   │   ├── lib/
│   │   │   ├── api.ts              # Central API client + scheduler types
│   │   │   ├── scheduler-view-model.mjs  # Typed utilities (type guards, metric math)
│   │   │   ├── scheduler-view-model.d.mts
│   │   │   ├── auth-storage.ts
│   │   │   ├── permissions.ts
│   │   │   └── utils.ts
│   │   ├── hooks/useAppState.ts
│   │   └── types/
│   ├── tests/
│   │   └── scheduler-view-model.test.mjs  # 12 unit tests
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
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
pip install -e ../production-scheduler
cp .env.example .env             # Set DATABASE_URL, SOLVER_TIME_LIMIT_SECONDS, SOLVER_RANDOM_SEED, SMTP_*
python -m scripts.seed           # Load synthetic mill data
uvicorn app.main:app --reload --port 8000
```
API docs at `http://localhost:8000/docs` (Swagger UI) / `http://localhost:8000/redoc` (ReDoc).

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env.local       # Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```
App at `http://localhost:3000`.

### Key Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://user:pass@localhost:5432/everest_textile` |
| `SOLVER_TIME_LIMIT_SECONDS` | CP-SAT time limit | `30` |
| `SOLVER_RANDOM_SEED` | Fixed seed for reproducibility | `42` |
| `NEXT_PUBLIC_API_URL` | Backend base URL for frontend | `http://localhost:8000` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email delivery | — |
| `FRONTEND_ORIGINS` | CORS origins (comma-separated) | `http://localhost:3000` |

---

## Scheduler CLI (Standalone)

```bash
cd production-scheduler
pip install -r requirements.txt

# Baseline + optimised, validated, with metrics
python -m scheduler.cli run ../scenarios/feasible_load.json

# Re-plan: machine breakdown
python -m scheduler.cli replan ../scenarios/feasible_load.json \
  --machine-down WEAVE-03 --from 480 --to 960 --now 360

# Re-plan: yarn delay
python -m scheduler.cli replan ../scenarios/feasible_load.json \
  --yarn-delay ORD-007 --hours 12 --now 360

# Benchmark all scenarios → results.md
python -m scheduler.cli benchmark ../scenarios/ --out results.md
```

All times: integer minutes from scenario start. Demo figures from `results.md`.

---

## Scenario & Schedule Formats (Contract v1)

### Scenario (Input)
```json
{
  "scenario_id": "feasible-load",
  "description": "Base 12-order load: 3 spinning, 5 weaving, 2 dyeing machines.",
  "synthetic_data": true,
  "start": "2026-01-05T06:00:00",
  "now": 0,
  "horizon": 10080,
  "route": ["spinning", "weaving", "dyeing"],
  "machines": [
    {"id": "SPIN-01", "stage": "spinning", "rate_m_per_hour": 60, "downtime": []},
    {"id": "WEAVE-03", "stage": "weaving", "rate_m_per_hour": 40, "downtime": [{"start": 1200, "end": 2400, "reason": "loom breakdown"}]}
  ],
  "orders": [
    {"id": "ORD-001", "buyer": "Buyer D", "fabric": "denim", "colour": "black", "metres": 300, "ordered_at": 0, "due": 4800, "priority_weight": 5, "yarn_ready": 0, "eligible": {"spinning": ["SPIN-01","SPIN-02"], "weaving": ["WEAVE-02"], "dyeing": ["DYE-01"]}}
  ],
  "frozen": []
}
```

### Schedule (Output)
```json
{
  "id": "sched-abc123",
  "scenario_id": "feasible-load",
  "solver": "cpsat",
  "status": "OPTIMAL",
  "compute_seconds": 3.42,
  "validation": {"status": "valid", "violations": [], "violation_count": 0},
  "metrics": {"weighted_tardiness": 0, "on_time_rate": 1.0, "utilisation": 0.85, "makespan": 8400},
  "operations": [
    {"order": "ORD-001", "stage": "spinning", "machine": "SPIN-01", "start": 0, "end": 300, "duration": 300, "quantity_metres": 300}
  ],
  "warnings": [],
  "diagnostics": {}
}
```

### Disruption Input
```json
{"type": "machine_down", "machine": "WEAVE-03", "from_minute": 480, "to_minute": 960, "now": 360}
{"type": "yarn_delay", "order": "ORD-007", "hours": 12, "now": 360}
```

### Duration Rule
`ceil(metres / rate_m_per_hour * 60)` — single function in `durations.py` used by baseline, CP-SAT, validator.

---

## Validator Rules (17 Rules)

| Code | Rule | Check |
|------|------|-------|
| `R01_MISSING_OPERATION` | 1 | Every required order-stage appears exactly once |
| `R02_DUPLICATE_OPERATION` | 2 | No duplicate order-stage operations |
| `R03_MACHINE_INELIGIBLE` | 3 | Machine eligible for order and stage |
| `R04_STAGE_MISMATCH` | 4 | Machine supports operation's stage |
| `R05_BAD_INTERVAL` | 5 | Start earlier than end |
| `R06_DURATION_MISMATCH` | 6 | Duration matches `ceil(quantity / rate * 60)` |
| `R07_ROUTE_PRECEDENCE` | 7 | Route order respected, no stage overlap within order |
| `R08_MACHINE_OVERLAP` | 8 | No overlap on one machine |
| `R09_DOWNTIME_OVERLAP` | 9 | No downtime or `available_until` overlap |
| `R10_YARN_READY` | 10 | No unprovisioned start before yarn-ready |
| `R11_START_BEFORE_NOW` | 11 | No unfrozen start before `scenario.now` |
| `R12_BEYOND_HORIZON` | 12 | No operation ends past horizon |
| `R13_QUANTITY_MISMATCH` | 13 | Scheduled quantity matches order quantity |
| `R14_UNRESOLVED_MANDATORY` | 14 | `OPTIMAL`/`FEASIBLE` with missing mandatory work |
| `R15_FROZEN_CHANGED` | 15 | Frozen/completed operations unchanged in replans |
| `R16_UNKNOWN_REFERENCE` | 16 | Order and machine IDs resolve in scenario |
| `R17_BAD_TIME_VALUE` | 17 | Integer minutes ≥ 0 |

---

## Synthetic Scenarios (`production-scheduler/scenarios/`)

| File | Purpose |
|------|---------|
| `feasible_load.json` | Base 12-order load; all orders routable; soft deadlines |
| `weaving_breakdown.json` | Base load + loom breakdown (WEAVE-03 down 1200–2400) |
| `late_yarn_lot.json` | Base load + ORD-007/008 yarn_ready delayed by 1440 min |
| `infeasible_load.json` | ORD-012 has no eligible dyeing machine → no valid schedule |

All scenarios: `synthetic_data: true`, `start: "2026-01-05T06:00:00"`, `horizon: 10080` (7 days).

---

## Scheduler API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/scheduler/scenarios` | List 4 scenarios with metadata |
| GET | `/scheduler/scenarios/{id}` | Full scenario detail (machines, orders, frozen, warnings) |
| POST | `/scheduler/run` | Execute EDF or CP-SAT (time_limit, seed, workers, warm_start) |
| POST | `/scheduler/validate` | Independent validation of schedule |
| POST | `/scheduler/disruption` | Machine breakdown / yarn delay re-plan |
| GET | `/scheduler/gantt/{id}` | Pre-computed Gantt rows for chart |
| POST | `/scheduler/compare` | Side-by-side EDF vs CP-SAT benchmark |

All endpoints return typed JSON per `backend/app/routers/scheduler.py` contracts. Authentication via Bearer JWT.

---

## Frontend API Client (`frontend/src/lib/api.ts`)

Centralised, typed client with:
- Automatic JWT injection + 401 session expiry handling
- Request/response type guards (`isScenarioDetail`, `isSchedule`, `isValidationResponse`, `isDisruptionResponse`)
- Timeout wrapper (`withTimeout`, default 120s)
- Error class hierarchy (`ApiClientError` with status + detail)

Scheduler-specific types mirror backend contracts exactly:
`ScenarioListItem`, `ScenarioDetail`, `RunSchedulerRequest/Response`, `ValidationRequest/Response`, `DisruptionRequest/Response`, `GanttResponse`, `CompareSchedulersRequest/Response`.

---

## View-Model Layer (`frontend/src/lib/scheduler-view-model.mjs`)

Pure utilities, zero side effects:
- **Type guards** for all scheduler contracts
- **Metric math** (`metricChange`) with zero-baseline safety
- **Gantt positioning** (`getTimelinePosition`) using absolute minute offsets
- **Late-order computation** (`getLateOrders`) based on final-route completion
- **Operation diff** (`compareOperations`) matching order-stage pairs
- **Disruption builder** (`buildDisruptionRequest`) accepting solver/time-limit/seed
- **Violation grouping** (`groupValidationViolations`) by severity
- **Validation title** (`validationTitle`) mapping: Valid / Invalid / Incomplete / Unavailable / Not run

---

## Testing — All Green

```bash
# Frontend
cd frontend
npm run lint          # PASS (1 font warning only)
npx tsc --noEmit      # PASS (0 errors)
npm run build         # PASS (6 pages, dynamic inventory route)
npm run test          # PASS (12/12 unit tests)

# Backend Scheduler
cd production-scheduler
python -m pytest tests/ -v
# 308 passed, 4 skipped in ~18s
# Unit: contracts, scenarios, EDF, CP-SAT, validator, replan, metrics, durations, CLI
# Integration: full pipeline
# Property: random scenarios → baseline + CP-SAT → zero violations
```

**Frontend Unit Tests Cover:**
- Scenario selector acceptance/rejection
- Schedule response FEASIBLE vs OPTIMAL distinction
- Independent validation states (valid-zero, invalid, incomplete, unavailable)
- Metric change zero-denominator handling
- Gantt positioning with absolute minute offsets
- Late-order computation on final route
- Operation impact diff (reassignment, time shifts)
- Disruption response malformed-diff rejection
- Compare API request mapping
- Machine breakdown / yarn delay submission mapping

---

## Demo Plan (Recorded Runs, Never Hand-Edited)

1. **Mill's day:** Seeded orders, shared yarn, constrained weaving
2. **New order:** Yarn shortfall + reorder suggestion appears instantly
3. **Baseline run:** Late orders, at-risk flags displayed
4. **CP-SAT run:** Validator status `OPTIMAL`, compute time, metric improvements
5. **Break machine:** Re-plan → moved orders, new late/at-risk, recovered
6. **Roll traceability:** Order → machine → inspections; reject dispatch refused
7. **Buyer page:** Log floor output → status changes live
8. **Month-end report:** Wages, bills, payments, margin per order (drillable)

---

## Scope & Limits

**In scope:** All modules above on seeded synthetic data.

**Out of scope (hackathon):**
- PLC/machine control integration
- Computer vision defect detection
- Payroll compliance / tax filing
- Full ERP replacement
- Global optimality proof (CP-SAT time-limited)

**Known simplifications:**
- Yarn = earliest-start per order (stock-as-resource planned)
- Inspection/packing tracked, not scheduled
- Changeover times & shift calendars (P1)
- Small-mill sizing; larger needs decomposition
- Buyer page: unguessable token, no login (MVP)
- Vision: P2, structured records only

---

## Data Provenance

**All numbers in this repository are from recorded runs, never hand-edited.**  
Scenario data is synthetic and labelled `synthetic_data: true` throughout.  
Scheduler fixtures in `production-scheduler/fixtures/` used only for tests.  
Frontend demo mode uses `dashboardDemoData.ts` explicitly labelled.

---

*Everest Textile Mills — Production Intelligence Platform*  