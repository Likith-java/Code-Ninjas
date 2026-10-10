# Textile Manufacturing Intelligence Platform

Unified platform for textile manufacturing operations, replacing manual floor records with real-time operational traceability and constraint-based scheduling. Built for the reference scenario **Everest Textile Mills**.

---

## 🏛️ System Architecture

```mermaid
flowchart TB
    subgraph Clients["1. Client Layer (Next.js 14 / TypeScript)"]
        direction TB
        UI_AUTH["Authentication & RBAC<br/>(JWT Token & User Session)"]
        UI_DASH["Operations Dashboard<br/>(Metrics, WIP, At-Risk Orders)"]
        UI_FLOOR["Production Floor & Kanban<br/>(Spinning, Weaving, Dyeing)"]
        UI_YARN["Raw Material & Yarn Ledger<br/>(Lots, Stock & Reorder Alerts)"]
        UI_QUALITY["Quality & Traceability<br/>(Roll Inspections & Grading)"]
        UI_DISPATCH["Finished Goods & Dispatches<br/>(Invoicing & Confirmation)"]
        UI_BUYER["Customer / Buyer Portal<br/>(Tokenized Read-Only Tracking)"]
    end

    subgraph Gateway["2. API & Security Layer (FastAPI)"]
        REST_API["FastAPI REST Endpoints<br/>(/api/v1/*)"]
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
        SRV_ADAPT["Scheduler Adapter"]
    end

    subgraph Optimization["4. Standalone Optimization Engine (OR-Tools)"]
        direction TB
        SOLV_BASE["EDF Baseline Dispatcher"]
        SOLV_CPSAT["Google OR-Tools CP-SAT Solver<br/>(Warm-Started from Baseline)"]
        SOLV_VALID["Independent Schedule Validator"]
        SOLV_REPLAN["Disruption Re-Planner<br/>(Machine Breakdown / Yarn Delay)"]
    end

    subgraph Database["5. Persistence Layer (PostgreSQL 16)"]
        direction TB
        DB_USERS["Users & Credentials"]
        DB_ORDERS["Buyers, Orders & Operations"]
        DB_PROD["Machines, Downtimes & Production Runs"]
        DB_INV["Suppliers, Materials, Lots & Movements"]
        DB_QC["Fabric Rolls & Inspection Logs"]
        DB_DISP["Dispatches & Invoiced Items"]
    end

    %% Client to API
    Clients -->|HTTP / REST + Bearer JWT| REST_API
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
```

---

## 🗄️ Database Schema Diagram (ERD)

The PostgreSQL relational database is structured with strict foreign key integrity, check constraints, and indexed lookups.

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

    %% Relationships
    BUYERS ||--o{ ORDERS : "places"
    ORDERS ||--o{ OPERATIONS : "has sequence of"
    ORDERS ||--o{ PRODUCTION_RUNS : "executed in"
    ORDERS ||--o{ FABRIC_ROLLS : "yields"
    ORDERS ||--o{ INVENTORY_MOVEMENTS : "consumes yarn for"
    ORDERS ||--o{ DISPATCHES : "fulfilled via"
    ORDERS ||--o{ MATERIAL_LOTS : "reserved for"

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

## 📊 Database Entities & Data Dictionary

| Entity | Primary Key | Key Foreign Keys | Purpose & Constraints |
|---|---|---|---|
| `users` | `id` | — | Authenticated users; roles: `admin`, `production_manager`, `dispatch_manager`, `customer`. |
| `buyers` | `id` | — | Customer profiles, commercial contracts, and contact channels. |
| `orders` | `id` | `buyer_id` → `buyers` | Production orders with quantities, deadlines, priorities, and agreed fabric specs. |
| `operations` | `id` | `order_id` → `orders` | Route steps (`spinning` → `weaving` → `dyeing` → `inspection` → `packing` → `dispatch`). |
| `machines` | `id` | — | Production machinery with capacity rates and state (`idle`, `running`, `breakdown`). |
| `operation_eligible_machines` | `(op_id, mach_id)` | `operations`, `machines` | Association matrix mapping which machines are capable of running each operation. |
| `downtimes` | `id` | `machine_id` → `machines` | Breakdown and planned maintenance windows with start and end times. |
| `production_runs` | `id` | `orders`, `operations`, `machines` | Scheduled and actual execution runs with start/end timestamps and output metres. |
| `suppliers` | `id` | — | Raw material yarn and chemical vendors. |
| `materials` | `id` | — | Material catalog with yarn consumption factor (`yarn_kg_per_metre`) and reorder thresholds. |
| `material_lots` | `id` | `materials`, `suppliers`, `orders` | Batch lots with receipt weights, cost, and optional order reservation. |
| `inventory_movements` | `id` | `material_lots`, `orders` | Immutable double-entry material ledger (`receipt`, `issue`, `adjustment`). |
| `fabric_rolls` | `id` | `orders`, `production_runs` | Individual produced rolls tracked by unique QR/code with inspection status. |
| `inspections` | `id` | `fabric_rolls` | Roll inspection slips with defect type, severity, and verdict (`pass`, `rework`, `reject`). |
| `dispatches` | `id` | `orders` | Outbound shipments with vehicle details, invoice number, and confirmation lock. |
| `dispatch_items` | `id` | `dispatches`, `fabric_rolls` | Specific passed rolls included in a shipment manifest. |

---

## ⚙️ Scheduler Engine

- **Route:** `spinning` ➔ `weaving` ➔ `dyeing`.
- **Inputs:** Open orders (deadlines, priorities), processing rates (metres/rate), machine eligibility, maintenance windows, yarn-ready availability.
- **Constraints:**
  1. Exactly one machine per scheduled operation.
  2. Strict stage route order per order.
  3. No machine overlapping operations.
  4. No scheduling during machine downtime.
  5. Cannot begin before yarn-ready time.
- **Solvers:**
  - **Baseline:** Earliest-Deadline-First (EDF) dispatch heuristic.
  - **Optimised:** Google OR-Tools CP-SAT with warm-start from baseline.
- **Disruption Simulation & Re-Planning:** Supports live machine breakdown injection and yarn delivery delay shifts with frozen op preservation.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (or Docker)

### 1. Database Setup
```bash
docker compose up -d db
```

### 2. Backend Setup
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env

# Run database migrations
alembic upgrade head

# Seed synthetic demo data
python -m scripts.seed_users

# Start FastAPI server
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
Interactive Swagger API documentation: `http://localhost:8000/docs`

### 3. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```
Open application: `http://localhost:3000`

---

## 🧪 Testing

```powershell
# Run backend test suite (FastAPI, business rules, scheduler adapter)
cd backend
.\.venv\Scripts\python.exe -m pytest

# Run scheduler optimization benchmarks
cd scheduler
python -m pytest
```

---

*All operational data across this platform is synthetic and created for evaluation purposes.*