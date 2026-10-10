"""
Comprehensive End-to-End Factory Workflow and System Health Test.
Executes the full 11-step textile manufacturing lifecycle from raw yarn intake to dispatch invoicing.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest


def test_full_factory_lifecycle(client):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # 1. Health and Readiness Probes
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    assert ready.json()["database"] == "connected"

    # 2. Create Buyer
    buyer_resp = client.post("/buyers", json={
        "name": f"Nordic Apparels {uid}",
        "contact": "Elin Larsson",
        "email": f"elin.{uid}@nordic.example.com",
        "address": "Gothenburg, Sweden",
    })
    assert buyer_resp.status_code == 201
    buyer_id = buyer_resp.json()["id"]

    # 3. Create Yarn Material
    fabric_name = f"LinenTwist_{uid}"
    colour_name = "NordicBlue"
    mat_resp = client.post("/materials", json={
        "material_type": fabric_name,
        "colour": colour_name,
        "specification": "60s Count Combed Flax",
        "reorder_threshold_kg": 50.0,
        "yarn_kg_per_metre": 0.250,
    })
    assert mat_resp.status_code == 201
    material_id = mat_resp.json()["id"]

    # 4. Create Supplier
    sup_resp = client.post("/suppliers", json={
        "name": f"Baltic Flax Mills {uid}",
        "contact": "Oleg Petrov",
        "email": f"oleg.{uid}@balticflax.example.com",
    })
    assert sup_resp.status_code == 201
    supplier_id = sup_resp.json()["id"]

    # 5. Receive Yarn into Inventory (200 kg)
    lot_code = f"LOT-FLAX-{uid}"
    rcpt_resp = client.post("/inventory/receipts", json={
        "lot_code": lot_code,
        "material_id": material_id,
        "supplier_id": supplier_id,
        "quantity_kg": 200.0,
        "lot_cost": 3000.0,
        "note": "Initial factory intake",
    })
    assert rcpt_resp.status_code == 201
    lot_id = rcpt_resp.json()["lot_id"]

    # 6. Check Feasibility: 400 metres requires 400 * 0.250 = 100 kg yarn
    # Available = 200 kg >= 100 kg -> Feasible
    feas_resp = client.post("/orders/feasibility", json={
        "fabric_type": fabric_name,
        "colour": colour_name,
        "quantity_metres": 400.0,
    })
    assert feas_resp.status_code == 200
    feas_data = feas_resp.json()
    assert feas_data["feasible"] is True
    assert len(feas_data["options"]) == 1
    assert float(feas_data["options"][0]["available_kg"]) == 200.0
    assert float(feas_data["options"][0]["required_kg"]) == 100.0

    # 7. Create Order: 400 metres requested
    ord_resp = client.post("/orders", json={
        "buyer_id": buyer_id,
        "fabric_type": fabric_name,
        "colour": colour_name,
        "quantity_metres": 400.0,
        "agreed_rate": 180.0,
        "deadline": (now + timedelta(days=25)).isoformat(),
        "priority": "high",
    })
    assert ord_resp.status_code == 201
    order_id = ord_resp.json()["id"]

    # 8. Issue Yarn to Order (100 kg)
    issue_resp = client.post("/inventory/issues", json={
        "lot_id": lot_id,
        "order_id": order_id,
        "quantity_kg": 100.0,
        "note": "Allocated for Order 400m production",
    })
    assert issue_resp.status_code == 201
    assert float(issue_resp.json()["quantity_kg"]) == 100.0

    # 9. Create Machine and map Operation eligibility
    mach_resp = client.post("/machines", json={
        "machine_code": f"WEAV-E2E-{uid}",
        "machine_type": "weaving",
        "capacity_rate": 30.0,
        "state": "idle",
    })
    assert mach_resp.status_code == 201
    machine_id = mach_resp.json()["id"]

    # Retrieve operations auto-created for the order
    ops_resp = client.get(f"/orders/{order_id}/operations")
    assert ops_resp.status_code == 200
    ops = ops_resp.json()
    weaving_op = next(op for op in ops if op["stage"] == "weaving")
    weaving_op_id = weaving_op["id"]

    # Map machine eligibility
    elig_resp = client.post(f"/operations/{weaving_op_id}/eligible-machines/{machine_id}")
    assert elig_resp.status_code == 200
    assert machine_id in elig_resp.json()["eligible_machine_ids"]

    # 10. Production Run Lifecycle: Planned -> Running -> Completed
    run_resp = client.post("/production-runs", json={
        "order_id": order_id,
        "operation_id": weaving_op_id,
        "machine_id": machine_id,
        "run_kind": "actual",
        "status": "planned",
    })
    assert run_resp.status_code == 201
    run_id = run_resp.json()["id"]

    # Transition: planned -> running
    start_resp = client.patch(f"/production-runs/{run_id}", json={"status": "running"})
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "running"

    # Transition: running -> completed with 400 metres output
    comp_resp = client.patch(f"/production-runs/{run_id}", json={
        "status": "completed",
        "output_metres": 400.0,
    })
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "completed"
    assert float(comp_resp.json()["output_metres"]) == 400.0

    # 11. Create Fabric Rolls and Quality Inspections
    # Roll A: 250 metres
    roll_a = client.post("/rolls", json={
        "roll_code": f"ROLL-A-{uid}",
        "order_id": order_id,
        "production_run_id": run_id,
        "metres": 250.0,
    }).json()

    # Roll B: 150 metres
    roll_b = client.post("/rolls", json={
        "roll_code": f"ROLL-B-{uid}",
        "order_id": order_id,
        "production_run_id": run_id,
        "metres": 150.0,
    }).json()

    # Quality inspect both rolls -> pass
    insp_a = client.post(f"/rolls/{roll_a['id']}/inspections", json={"result": "pass"})
    assert insp_a.status_code == 201

    insp_b = client.post(f"/rolls/{roll_b['id']}/inspections", json={"result": "pass"})
    assert insp_b.status_code == 201

    # 12. Create Dispatch for Roll A + Roll B (400 metres total)
    disp_resp = client.post("/dispatches", json={
        "order_id": order_id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-E2E-{uid}",
        "vehicle": "KA-50-TR-1122",
        "items": [
            {"roll_id": roll_a["id"], "metres": 250.0},
            {"roll_id": roll_b["id"], "metres": 150.0},
        ],
    })
    assert disp_resp.status_code == 201
    disp_data = disp_resp.json()
    dispatch_id = disp_data["id"]
    assert float(disp_data["total_metres"]) == 400.0
    # Agreed rate: 180.0 * 400m = 72,000.00
    assert float(disp_data["invoice_total"]) == 72000.0

    # 13. Confirm Dispatch
    confirm_resp = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["confirmed"] is True

    # 14. Idempotent Repeated Confirmation
    reconfirm_resp = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert reconfirm_resp.status_code == 200
    assert reconfirm_resp.json()["confirmed"] is True

    # 15. Verify Traceability
    trace_a = client.get(f"/rolls/{roll_a['id']}/traceability").json()
    assert trace_a["status"] == "dispatched"
    assert trace_a["order_id"] == order_id
    assert trace_a["production_run_id"] == run_id
    assert len(trace_a["inspections"]) == 1
