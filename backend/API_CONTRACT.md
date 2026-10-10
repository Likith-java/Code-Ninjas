# Everest Textile Intelligence Platform - API Integration Contract

**Document Version:** 1.0.0  
**Backend Framework:** FastAPI / SQLAlchemy 2.0 / Alembic / PostgreSQL  
**Target Consumers:** React / Next.js Web Application  
**Base URL (Local):** `http://localhost:8000`  
**Interactive API Documentation:** `http://localhost:8000/docs` (Swagger UI) / `http://localhost:8000/redoc` (ReDoc)

---

## 1. System Overview & Integration Protocol

This document serves as the formal API contract between the Everest Textile Intelligence Platform backend and the React / Next.js frontend team. It establishes the stable HTTP methods, route paths, payload structures, query filters, pagination contracts, and status code behaviors for all active factory endpoints.

### Key Architectural Conventions
1. **Serialization & Types**: All numerical quantities (`quantity_kg`, `quantity_metres`, `output_metres`, `capacity_rate`) and currencies (`agreed_rate`, `lot_cost`, `line_total`, `invoice_total`) use fixed-precision `Decimal` representations and serialize as strings or exact decimal JSON values to prevent floating-point drift.
2. **Date & Time**: All timestamps (`order_date`, `deadline`, `received_at`, `movement_date`, `start_time`, `end_time`, `created_at`, `inspected_at`, `dispatch_date`, `confirmed_at`) use ISO-8601 strings with explicit UTC offsets (`YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS+00:00`).
3. **ORM Decoupling**: Database models never leak SQLAlchemy internals or raw SQL exceptions. All responses serialize through strict Pydantic schemas.
4. **Append-Only Ledger**: Raw yarn inventory changes are recorded exclusively via movements (`receipt`, `issue`, `adjustment`). Finished-goods movements are recorded exclusively via `dispatches` and `dispatch_items`.
5. **CORS Security**: CORS origins are managed through the `FRONTEND_ORIGINS` / `FRONTEND_ORIGIN` environment settings without broad wildcard access or leaking sensitive credentials.

---

## 2. Standard Error & Response Formats

All endpoints conform to standardized HTTP status codes and response bodies:

### Standard Error Shapes

#### 422 Unprocessable Entity (Schema Validation Failure)
Standard FastAPI / Pydantic validation error returned when required fields are missing, formats are invalid, or constraints (e.g. `gt=0`, `min_length=1`) fail:
```json
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "quantity_metres"],
      "msg": "Input should be greater than 0",
      "input": 0,
      "ctx": { "gt": 0 }
    }
  ]
}
```

#### 404 Not Found (Missing Resource)
```json
{
  "detail": "Order 101 not found"
}
```

#### 409 Conflict (Business Invariant Violation / Database Constraint)
Returned on domain conflicts (e.g., infeasible orders, insufficient lot stock, uninspected roll dispatch, overlapping machine downtime, duplicate roll allocations, duplicate confirmations):
```json
{
  "detail": "Dispatch 12 has already been confirmed"
}
```
Or structured domain conflict (such as feasibility shortfall details during order rejection):
```json
{
  "detail": {
    "message": "Order cannot be accepted because yarn feasibility failed.",
    "feasibility": {
      "feasible": false,
      "requested_quantity_metres": "1500.00",
      "options": [
        {
          "material_id": 1,
          "material_type": "Cotton",
          "colour": "Blue",
          "specification": "30s Combed",
          "required_kg": "375.000",
          "available_kg": "200.000",
          "shortfall_kg": "175.000",
          "feasible": false
        }
      ],
      "message": "Insufficient yarn in stock. Review shortfall options."
    }
  }
}
```

#### 500 Internal Server Error (Unexpected Database Failure)
SQLAlchemy exceptions are intercepted by a global exception handler to protect connection parameters, database credentials, table layouts, and query internals from being exposed:
```json
{
  "detail": "A database error occurred while processing the request."
}
```

---

## 3. PRD Endpoint Inventory & Coverage Matrix

| Area | PRD Requirement | Method | Path | Status | Module Owner | Notes |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| **System** | Liveness Probe | `GET` | `/health` | **Implemented** | Core Platform | Returns `{"status": "ok"}` |
| **System** | Readiness Probe | `GET` | `/ready` | **Implemented** | Core Platform | Executes `SELECT 1` DB ping; returns 503 on failure without credential leak |
| **Buyers** | Create Buyer | `POST` | `/buyers` | **Implemented** | Core Platform | Validates non-empty name; returns 201 |
| **Buyers** | List Buyers | `GET` | `/buyers` | **Implemented** | Core Platform | Paginated (`offset`, `limit`) |
| **Orders** | Feasibility Check | `POST` | `/orders/feasibility` | **Implemented** | Core Platform | Yarn requirement vs ledger stock options |
| **Orders** | Create Order | `POST` | `/orders` | **Implemented** | Core Platform | Feasibility-gated; auto-creates 6 stage operations |
| **Orders** | List Orders | `GET` | `/orders` | **Implemented** | Core Platform | Paginated (`offset`, `limit`); calculates `derived_status` |
| **Orders** | Get Order Detail | `GET` | `/orders/{order_id}` | **Implemented** | Core Platform | Includes `derived_status` |
| **Orders** | List Order Operations | `GET` | `/orders/{order_id}/operations` | **Implemented** | Production | Lists 6 sequential operations with eligible machine IDs |
| **Materials**| Create Material | `POST` | `/materials` | **Implemented** | Materials | Enforces unique `(type, colour, spec)`, threshold, conversion |
| **Materials**| List Materials | `GET` | `/materials` | **Implemented** | Materials | Filterable by `material_type`, `colour`, with pagination |
| **Materials**| Get Material Detail| `GET` | `/materials/{id}` | **Implemented** | Materials | Material specs and conversion rate |
| **Suppliers**| Create Supplier | `POST` | `/suppliers` | **Implemented** | Procurement | Enforces unique supplier name |
| **Suppliers**| List Suppliers | `GET` | `/suppliers` | **Implemented** | Procurement | Paginated (`offset`, `limit`) |
| **Suppliers**| Get Supplier Detail| `GET` | `/suppliers/{id}` | **Implemented** | Procurement | Supplier contact and email info |
| **Inventory**| Receive Stock | `POST` | `/inventory/receipts`| **Implemented** | Inventory | Creates lot and initial `receipt` ledger movement |
| **Inventory**| Issue Stock | `POST` | `/inventory/issues` | **Implemented** | Inventory | Deducts lot balance; validates order & specification compatibility |
| **Inventory**| Adjust Stock | `POST` | `/inventory/adjustments` | **Implemented** | Inventory | Surplus (+kg) or shrinkage (-kg); rejects negative balances |
| **Inventory**| Stock Summary | `GET` | `/inventory` | **Implemented** | Inventory | Grouped by lot and material; flags `low_stock` |
| **Inventory**| Movement History | `GET` | `/inventory/movements`| **Implemented** | Inventory | Audit trail filtered by lot, order, material, type, date range |
| **Machines** | Create Machine | `POST` | `/machines` | **Implemented** | Production | Unique `machine_code`, validates machine type |
| **Machines** | List Machines | `GET` | `/machines` | **Implemented** | Production | Filterable by `machine_type`, `state`, `is_active`, `skip`, `limit` |
| **Machines** | Get Machine Detail | `GET` | `/machines/{id}` | **Implemented** | Production | Current state and capacity rate |
| **Machines** | Update Machine | `PATCH`| `/machines/{id}` | **Implemented** | Production | Partial update of `state`, `is_active`, `capacity_rate` |
| **Machines** | Map Eligibility | `POST` | `/operations/{op_id}/eligible-machines/{machine_id}` | **Implemented** | Production | Links machine to operation |
| **Machines** | Unmap Eligibility | `DELETE`| `/operations/{op_id}/eligible-machines/{machine_id}` | **Implemented** | Production | Unlinks machine from operation |
| **Downtime** | Log Downtime | `POST` | `/downtimes` | **Implemented** | Maintenance | Validates time sequence; prevents overlapping downtimes; syncs machine state |
| **Downtime** | List Downtimes | `GET` | `/downtimes` | **Implemented** | Maintenance | Filterable by `machine_id`, `start_date`, `end_date`, `skip`, `limit` |
| **Downtime** | Get Downtime Detail| `GET` | `/downtimes/{id}` | **Implemented** | Maintenance | Downtime details |
| **Downtime** | Update Downtime | `PATCH`| `/downtimes/{id}` | **Implemented** | Maintenance | Resolve downtime (`end_time`); syncs machine state |
| **Prod Runs**| Create Production Run | `POST`| `/production-runs` | **Implemented** | Production | Supports `scheduled` and `actual`; prevents downtime & run overlap |
| **Prod Runs**| List Production Runs| `GET` | `/production-runs` | **Implemented** | Production | Filterable by order, op, machine, kind, status |
| **Prod Runs**| Get Run Detail | `GET` | `/production-runs/{id}` | **Implemented** | Production | Run status and output metres |
| **Prod Runs**| Update Run Status | `PATCH`| `/production-runs/{id}` | **Implemented** | Production | Planned -> running -> completed; updates machine state |
| **Rolls** | Create Fabric Roll | `POST` | `/rolls` | **Implemented** | Quality | Initial status `awaiting_inspection`; validates run order |
| **Rolls** | List Rolls | `GET` | `/rolls` | **Implemented** | Quality | Filterable by `order_id`, `status`, `skip`, `limit` |
| **Rolls** | Get Roll Detail | `GET` | `/rolls/{id}` | **Implemented** | Quality | Includes `is_dispatch_eligible` flag |
| **Rolls** | Inspect Roll | `POST` | `/rolls/{id}/inspections` | **Implemented** | Quality | Append-only history; updates roll status (`pass`, `rework`, `reject`) |
| **Rolls** | Roll Traceability | `GET` | `/rolls/{id}/traceability`| **Implemented** | Quality | Full lineage: roll -> run -> machine -> order -> inspection history |
| **Dispatches**| Create Dispatch | `POST` | `/dispatches` | **Implemented** | Dispatch | Quality-gated; prevents duplicate allocations; calculates invoice total |
| **Dispatches**| List Dispatches | `GET` | `/dispatches` | **Implemented** | Dispatch | Filterable by `order_id`, `confirmed`, `skip`, `limit` |
| **Dispatches**| Get Dispatch Detail| `GET` | `/dispatches/{id}` | **Implemented** | Dispatch | Line items, roll codes, invoice details |
| **Dispatches**| Confirm Dispatch | `POST` | `/dispatches/{id}/confirm` | **Implemented** | Dispatch | Atomic confirmation; sets `confirmed_at`; marks rolls dispatched; rejects duplicates with 409 |
| **Scheduler**| Automated Scheduling | `POST` | `/schedules/optimize` | **Unimplemented (Ext)** | Member 1 | OR-Tools / Earliest Deadline First optimization |
| **Scheduler**| Disruption Simulation | `POST` | `/schedules/simulate-disruption`| **Unimplemented (Ext)** | Member 1 | Machine breakdown rescheduling simulator |
| **Scheduler**| Get Schedule Detail | `GET` | `/schedules/{id}` | **Unimplemented (Ext)** | Member 1 | Schedule timeline Gantt chart payload |
| **Workforce**| Shift Attendance | `POST` | `/attendance` | **Unimplemented (Ext)** | Member 3 | Worker check-in / check-out records |
| **Workforce**| Attendance Summary | `GET` | `/attendance/summary` | **Unimplemented (Ext)** | Member 3 | Worker attendance aggregations |
| **Finance** | Payment Logging | `POST` | `/payments` | **Unimplemented (Ext)** | Member 3 | Buyer payments against dispatch invoices |
| **Finance** | Invoice Ledger | `GET` | `/invoices` | **Unimplemented (Ext)** | Member 3 | Finance reconciliation and ledger queries |
| **Portal** | Buyer Public Tracking| `GET` | `/buyer/orders/{token}`| **Unimplemented (Ext)** | Member 3 | Read-only external order status tracking |
| **Reporting**| Factory KPIs | `GET` | `/reports/operations`| **Unimplemented (Ext)** | Member 3 | Factory throughput and downtime analytics |

---

## 4. Detailed Endpoint Contracts & Real Schemas

### 4.1 System Health & Readiness

#### `GET /health`
- **Purpose**: Lightweight container liveness check.
- **Request**: No parameters.
- **Response `200 OK`**:
```json
{
  "status": "ok"
}
```

#### `GET /ready`
- **Purpose**: Database connection readiness probe (safe; does not leak connection parameters).
- **Request**: No parameters.
- **Response `200 OK`**:
```json
{
  "status": "ready",
  "database": "connected"
}
```
- **Response `503 Service Unavailable`** (when DB down):
```json
{
  "status": "not_ready",
  "database": "unavailable"
}
```

---

### 4.2 Buyers & Orders

#### `POST /buyers`
- **Purpose**: Register a new client / buyer.
- **Request Body**:
```json
{
  "name": "Nordic Textiles AB",
  "contact": "Elin Larsson",
  "email": "elin@nordic.example.com",
  "address": "Gothenburg, Sweden"
}
```
- **Response `201 Created`**:
```json
{
  "id": 1,
  "name": "Nordic Textiles AB",
  "contact": "Elin Larsson",
  "email": "elin@nordic.example.com",
  "address": "Gothenburg, Sweden"
}
```

#### `GET /buyers`
- **Purpose**: Paginated listing of buyers.
- **Query Parameters**:
  - `offset` (int, default `0`, min `0`)
  - `limit` (int, default `50`, min `1`, max `200`)
- **Response `200 OK`**: `list[BuyerOut]`

#### `POST /orders/feasibility`
- **Purpose**: Check warehouse yarn availability against proposed order specs before placing an order.
- **Request Body**:
```json
{
  "fabric_type": "Cotton",
  "colour": "Blue",
  "quantity_metres": 500.00
}
```
- **Response `200 OK`**:
```json
{
  "feasible": true,
  "requested_quantity_metres": "500.00",
  "options": [
    {
      "material_id": 1,
      "material_type": "Cotton",
      "colour": "Blue",
      "specification": "30s Combed",
      "required_kg": "125.000",
      "available_kg": "250.000",
      "shortfall_kg": "0.000",
      "feasible": true
    }
  ],
  "message": "Currently feasible based on warehouse ledger stock. Note: Yarn is NOT reserved until an issue movement is recorded."
}
```

#### `POST /orders`
- **Purpose**: Create a production order. Enforces feasibility; automatically initializes 6 stage operations (`spinning`, `weaving`, `dyeing`, `inspection`, `packing`, `dispatch`).
- **Request Body**:
```json
{
  "buyer_id": 1,
  "fabric_type": "Cotton",
  "colour": "Blue",
  "quantity_metres": 500.00,
  "agreed_rate": 18.50,
  "deadline": "2026-11-30T18:00:00Z",
  "priority": "normal"
}
```
- **Response `201 Created`**:
```json
{
  "id": 1,
  "buyer_id": 1,
  "fabric_type": "Cotton",
  "colour": "Blue",
  "quantity_metres": "500.00",
  "agreed_rate": "18.50",
  "order_date": "2026-10-10T09:30:00Z",
  "deadline": "2026-11-30T18:00:00Z",
  "priority": "normal",
  "derived_status": "pending"
}
```
- **Response `409 Conflict`**: Returned if yarn feasibility fails.

#### `GET /orders` & `GET /orders/{order_id}`
- **Purpose**: Retrieve orders with dynamic `derived_status` calculated from production runs and dispatches:
  - `pending`: No production runs started.
  - `scheduled`: Scheduled production runs exist.
  - `in_production`: At least one run running or completed.
  - `ready_for_dispatch`: Inspected passed rolls meet or exceed order metres.
  - `partially_dispatched`: Confirmed dispatch metres > 0 but < order metres.
  - `completed`: Confirmed dispatch metres >= order metres.

---

### 4.3 Materials & Suppliers

#### `POST /materials`
- **Request Body**:
```json
{
  "material_type": "Cotton",
  "colour": "Blue",
  "specification": "30s Combed Ringspun",
  "reorder_threshold_kg": 50.000,
  "yarn_kg_per_metre": 0.250000
}
```
- **Response `201 Created`**: Returns `MaterialOut` with allocated `id`.

#### `GET /materials`
- **Query Parameters**: `material_type` (str), `colour` (str), `offset` (int), `limit` (int).

#### `POST /suppliers`
- **Request Body**:
```json
{
  "name": "Coimbatore Spinners Ltd",
  "contact": "K. Raman",
  "email": "raman@coimbatorespinners.example.com"
}
```
- **Response `201 Created`**: Returns `SupplierOut` with allocated `id`.

---

### 4.4 Inventory Receipts, Issues & Adjustments

#### `POST /inventory/receipts`
- **Purpose**: Receive yarn shipment from supplier. Atomically creates a `MaterialLot` and records a `receipt` movement.
- **Request Body**:
```json
{
  "lot_code": "LOT-CTN-2026-001",
  "material_id": 1,
  "supplier_id": 1,
  "quantity_kg": 500.000,
  "lot_cost": 4500.00,
  "intended_order_id": null,
  "note": "Initial dock intake batch"
}
```
- **Response `201 Created`**:
```json
{
  "id": 1,
  "lot_id": 1,
  "order_id": null,
  "movement_type": "receipt",
  "quantity_kg": "500.000",
  "movement_date": "2026-10-10T09:35:00Z",
  "note": "Initial dock intake batch"
}
```

#### `POST /inventory/issues`
- **Purpose**: Issue yarn from a specific lot to an order.
- **Request Body**:
```json
{
  "lot_id": 1,
  "order_id": 1,
  "quantity_kg": 125.000,
  "note": "Issued for spinning batch #1"
}
```
- **Response `201 Created`**: Returns `InventoryMovementOut`.
- **Response `409 Conflict`**: Returned if requested kg exceeds available lot balance, lot is reserved for another order, or material doesn't match order fabric/colour.

#### `POST /inventory/adjustments`
- **Purpose**: Record inventory count corrections.
  - Surplus / Gain: `quantity_kg > 0`
  - Shrinkage / Waste: `quantity_kg < 0`
- **Request Body**:
```json
{
  "lot_id": 1,
  "quantity_kg": -5.000,
  "reason": "Damaged cones found during moisture inspection"
}
```
- **Response `201 Created`**: Returns `InventoryMovementOut`.
- **Response `409 Conflict`**: Returned if shrinkage exceeds current lot balance.

#### `GET /inventory`
- **Purpose**: Live warehouse inventory summary with `low_stock` indicators.
- **Query Parameters**: `low_stock_only` (bool), `offset` (int), `limit` (int).
- **Response `200 OK`**:
```json
{
  "total_lots": 1,
  "low_stock_materials": 0,
  "lots": [
    {
      "lot_id": 1,
      "lot_code": "LOT-CTN-2026-001",
      "material_id": 1,
      "material_type": "Cotton",
      "colour": "Blue",
      "specification": "30s Combed Ringspun",
      "supplier_id": 1,
      "available_kg": "370.000",
      "reorder_threshold_kg": "50.000",
      "low_stock": false
    }
  ]
}
```

#### `GET /inventory/movements`
- **Purpose**: Complete ledger audit trail.
- **Query Parameters**: `material_id`, `lot_id`, `order_id`, `movement_type` (`receipt` | `issue` | `adjustment`), `start_date`, `end_date`, `offset`, `limit`.

---

### 4.5 Machines, Downtimes & Production Runs

#### `POST /machines`
- **Request Body**:
```json
{
  "machine_code": "LOOM-01",
  "machine_type": "weaving",
  "capacity_rate": 65.50,
  "state": "idle",
  "is_active": true
}
```
- **Response `201 Created`**: Returns `MachineOut`.

#### `POST /downtimes`
- **Request Body**:
```json
{
  "machine_id": 1,
  "reason": "Scheduled motor lubrication and warp check",
  "start_time": "2026-10-11T08:00:00Z",
  "end_time": "2026-10-11T12:00:00Z"
}
```
- **Response `201 Created`**: Returns `DowntimeOut`.
- **Response `409 Conflict`**: Returned if downtime conflicts with another overlapping downtime or active run.

#### `POST /production-runs`
- **Request Body**:
```json
{
  "order_id": 1,
  "operation_id": 2,
  "machine_id": 1,
  "run_kind": "actual",
  "status": "planned"
}
```
- **Response `201 Created`**: Returns `ProductionRunOut`.

#### `PATCH /production-runs/{run_id}`
- **Purpose**: Progress run state (`planned` -> `running` -> `completed`). Automatically updates machine state to `running` or `idle`.
- **Request Body**:
```json
{
  "status": "completed",
  "output_metres": 500.00
}
```

---

### 4.6 Quality Inspections & Fabric Rolls

#### `POST /rolls`
- **Request Body**:
```json
{
  "roll_code": "ROLL-CTN-001",
  "order_id": 1,
  "production_run_id": 1,
  "metres": 500.00
}
```
- **Response `201 Created`**:
```json
{
  "id": 1,
  "roll_code": "ROLL-CTN-001",
  "order_id": 1,
  "production_run_id": 1,
  "metres": "500.00",
  "status": "awaiting_inspection",
  "created_at": "2026-10-10T10:00:00Z",
  "is_dispatch_eligible": false
}
```

#### `POST /rolls/{roll_id}/inspections`
- **Purpose**: Record an inspection result. Append-only history; updates roll `status` and `is_dispatch_eligible`.
- **Request Body**:
```json
{
  "result": "pass",
  "defect_type": null,
  "severity": null,
  "disposition": "Grade A approved for export dispatch"
}
```
- **Response `201 Created`**: Returns `InspectionOut`. Roll status transitions to `passed`. If result was `rework`, roll transitions to `rework`. If `reject`, transitions to terminal `rejected`.

#### `GET /rolls/{roll_id}/traceability`
- **Purpose**: Full backwards and forwards traceability graph for a fabric roll.
- **Response `200 OK`**:
```json
{
  "roll_id": 1,
  "roll_code": "ROLL-CTN-001",
  "order_id": 1,
  "production_run_id": 1,
  "machine_id": 1,
  "metres": "500.00",
  "status": "passed",
  "created_at": "2026-10-10T10:00:00Z",
  "is_dispatch_eligible": true,
  "fabric_type": "Cotton",
  "colour": "Blue",
  "machine_code": "LOOM-01",
  "machine_type": "weaving",
  "run_kind": "actual",
  "run_status": "completed",
  "inspections": [
    {
      "id": 1,
      "roll_id": 1,
      "defect_type": null,
      "severity": null,
      "result": "pass",
      "disposition": "Grade A approved for export dispatch",
      "inspected_at": "2026-10-10T10:05:00Z"
    }
  ],
  "latest_inspection": {
    "id": 1,
    "roll_id": 1,
    "defect_type": null,
    "severity": null,
    "result": "pass",
    "disposition": "Grade A approved for export dispatch",
    "inspected_at": "2026-10-10T10:05:00Z"
  }
}
```

---

### 4.7 Finished Goods Dispatches & Invoices

#### `POST /dispatches`
- **Purpose**: Create a draft dispatch invoice for finished goods.
- **Business Rules**:
  - Requires at least 1 fabric roll item.
  - Every roll must exist, belong to the target order, and have status `passed`.
  - Rejects rolls with status `awaiting_inspection`, `rework`, `rejected`, or `dispatched` (409 Conflict).
  - Rejects duplicate roll IDs in request line items (409 Conflict).
  - Validates that allocated metres do not exceed remaining roll metres or order metres.
  - Reconciles client `expected_invoice_total` against `line_total = metres * order.agreed_rate` (422 Unprocessable Entity on discrepancy).
- **Request Body**:
```json
{
  "order_id": 1,
  "dispatch_date": "2026-10-15T12:00:00Z",
  "vehicle": "Truck TN-38-AX-9912",
  "invoice_number": "INV-2026-1001",
  "items": [
    {
      "roll_id": 1,
      "metres": 500.00
    }
  ],
  "expected_invoice_total": 9250.00
}
```
- **Response `201 Created`**:
```json
{
  "id": 1,
  "order_id": 1,
  "dispatch_date": "2026-10-15T12:00:00Z",
  "vehicle": "Truck TN-38-AX-9912",
  "invoice_number": "INV-2026-1001",
  "confirmed": false,
  "confirmed_at": null,
  "total_metres": "500.00",
  "agreed_rate": "18.50",
  "invoice_total": "9250.00",
  "items": [
    {
      "id": 1,
      "dispatch_id": 1,
      "roll_id": 1,
      "roll_code": "ROLL-CTN-001",
      "metres": "500.00",
      "agreed_rate": "18.50",
      "line_total": "9250.00"
    }
  ],
  "order_fabric_type": "Cotton",
  "order_colour": "Blue"
}
```

#### `POST /dispatches/{dispatch_id}/confirm`
- **Purpose**: Atomically confirm a dispatch and lock finished goods.
- **Business Rules**:
  - Re-validates that referenced rolls are still `passed` and have sufficient undispatched metres.
  - Sets `confirmed = true` and `confirmed_at = utc_now()`.
  - For each roll whose cumulative confirmed metres >= total metres, updates roll status to `dispatched`.
  - Rejects duplicate confirmation with `409 Conflict` if the dispatch is already confirmed.
- **Response `200 OK`**:
```json
{
  "id": 1,
  "order_id": 1,
  "dispatch_date": "2026-10-15T12:00:00Z",
  "vehicle": "Truck TN-38-AX-9912",
  "invoice_number": "INV-2026-1001",
  "confirmed": true,
  "confirmed_at": "2026-10-10T10:15:00Z",
  "total_metres": "500.00",
  "agreed_rate": "18.50",
  "invoice_total": "9250.00",
  "items": [
    {
      "id": 1,
      "dispatch_id": 1,
      "roll_id": 1,
      "roll_code": "ROLL-CTN-001",
      "metres": "500.00",
      "agreed_rate": "18.50",
      "line_total": "9250.00"
    }
  ],
  "order_fabric_type": "Cotton",
  "order_colour": "Blue"
}
```

---

## 5. External Integration Dependencies (Non-Core Scopes)

The following capabilities are specified in the system PRD but are assigned to separate team modules and are intentionally **unimplemented** in this backend phase:

1. **Member 1 (OR-Tools / EDF Scheduler)**:
   - `POST /schedules/optimize`: Algorithmic job shop solver with Earliest Deadline First heuristics.
   - `POST /schedules/simulate-disruption`: Rescheduling simulation in response to machine breakdown.
   - `GET /schedules/{id}`: Detailed machine timeline scheduling output.
   - *Integration Interface*: Will query our `GET /orders`, `GET /orders/{id}/operations`, and `GET /machines` endpoints and write `scheduled` runs via `POST /production-runs`.

2. **Member 3 (Workforce, Finance & Reporting)**:
   - `POST /attendance` & `GET /attendance/summary`: Operator shifts and clock-ins.
   - `POST /payments` & `GET /invoices`: Cash receipt reconciliation against confirmed dispatch invoices.
   - `GET /buyer/orders/{token}`: Customer-facing public tracking portal.
   - `GET /reports/operations` & `GET /reports/month-end`: Factory throughput and financial roll-up analytics.

---

## 6. Environment Configuration & Deployment Readiness

### Required Environment Variables

Configure these settings in `backend/.env` (use `.env.example` as a template):

| Variable | Description | Safe Default | Production Note |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URL (psycopg v3/v2) | `postgresql+psycopg://username:password@localhost:5432/everest_textile` | Use managed RDS / Cloud SQL credentials. Never commit passwords. |
| `FRONTEND_ORIGINS` | Comma-separated list of allowed frontend origins | `http://localhost:3000,http://127.0.0.1:3000` | Set to your Vercel or production Next.js domain (e.g. `https://app.everesttextile.com`). |
| `FRONTEND_ORIGIN` | Single allowed origin (fallback for `FRONTEND_ORIGINS`) | `http://localhost:3000` | Supported for backward compatibility. |

---

## 7. Database Migration Verification & Backup Instructions

The database schema is managed via linear Alembic migrations.

### Current Migration Chain
```
<base>
  └── 05be858920c9 (Initial schema: buyers, orders, inventory, quality, dispatches)
        └── 93bcbe93cd2a (Harden inventory movement and order deadline constraints)
              └── cc44d72126a7 [HEAD] (Add dispatch confirmation check constraint)
```

### Safety & Backup Warning
> [!CAUTION]
> **DO NOT DROP OR RECREATE THE DATABASE.**  
> Before applying any database migration or schema alteration in staging or production, always take a full point-in-time snapshot or dump:
> ```bash
> pg_dump -U <username> -h <host> -d everest_textile -Fc -f everest_textile_backup.dump
> ```

### Verification Commands
```bash
# 1. Inspect current applied migration revision
cd backend
.venv/Scripts/alembic current

# 2. Inspect migration history
.venv/Scripts/alembic history

# 3. Dry-run SQL generation for clean database upgrades
.venv/Scripts/alembic upgrade head --sql

# 4. Apply pending migrations on a clean test database
.venv/Scripts/alembic upgrade head
```

---

## 8. Frontend End-to-End Workflow & Negative Test Checklist

When developing the Next.js UI, use this verified end-to-end flow to validate state transitions:

- [x] **Step 1: Check Readiness**: Call `GET /ready` to verify database health before rendering dashboard.
- [x] **Step 2: Create Buyer & Material**: Register buyer (`POST /buyers`) and fabric material specs (`POST /materials`).
- [x] **Step 3: Receive Raw Yarn**: Intake shipment (`POST /inventory/receipts`). Verify stock appears in `GET /inventory`.
- [x] **Step 4: Check Feasibility**: Execute `POST /orders/feasibility`. Verify green/red banner with shortfall kg.
- [x] **Negative Test 1 (Infeasible Order)**: Attempt `POST /orders` with quantity exceeding yarn stock. Expect `409 Conflict`.
- [x] **Step 5: Create Feasible Order**: Execute `POST /orders`. Verify 6 operations are created in `GET /orders/{id}/operations`.
- [x] **Step 6: Issue Yarn**: Execute `POST /inventory/issues`. Verify lot balance decreases in `GET /inventory`.
- [x] **Negative Test 2 (Over-Issue)**: Attempt `POST /inventory/issues` exceeding remaining lot stock. Expect `409 Conflict`.
- [x] **Step 7: Production Run**: Create machine (`POST /machines`), map eligibility, and create actual run (`POST /production-runs`). Complete run via `PATCH /production-runs/{id}` with output metres.
- [x] **Step 8: Produce Fabric Roll**: Create roll (`POST /rolls`). Status starts as `awaiting_inspection`.
- [x] **Negative Test 3 (Quality Gated Dispatch)**: Attempt `POST /dispatches` containing the uninspected roll. Expect `409 Conflict`.
- [x] **Step 9: Inspect Roll**: Call `POST /rolls/{id}/inspections` with `result: "pass"`. Verify roll `is_dispatch_eligible` becomes `true`.
- [x] **Step 10: Create Draft Dispatch**: Call `POST /dispatches`. Verify invoice calculation equals `metres * agreed_rate`.
- [x] **Step 11: Confirm Dispatch**: Call `POST /dispatches/{id}/confirm`. Verify roll status transitions to `dispatched` in `GET /rolls/{id}/traceability`.
- [x] **Negative Test 4 (Duplicate Confirmation)**: Attempt `POST /dispatches/{id}/confirm` a second time. Expect `409 Conflict`.
- [x] **Step 12: Order Completion**: Inspect `GET /orders/{id}`. Verify `derived_status` is `completed`.
