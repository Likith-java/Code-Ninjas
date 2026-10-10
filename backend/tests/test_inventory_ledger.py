"""
Tests for Yarn Inventory, Receipts, Issues, Adjustments, Ledger, and Stock Constraints.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest


def test_inventory_receipt_and_summary(client):
    uid = uuid.uuid4().hex[:6]
    # Create supplier & material
    s_resp = client.post("/suppliers", json={"name": f"Supplier {uid}"})
    sup_id = s_resp.json()["id"]

    m_resp = client.post("/materials", json={
        "material_type": f"Cotton_{uid}",
        "colour": "Navy",
        "specification": "30s Combed",
        "reorder_threshold_kg": 50.0,
        "yarn_kg_per_metre": 0.20,
    })
    mat_id = m_resp.json()["id"]

    # 1. Receive Yarn into Inventory
    lot_code = f"LOT-{uid}-001"
    rcpt_resp = client.post("/inventory/receipts", json={
        "lot_code": lot_code,
        "material_id": mat_id,
        "supplier_id": sup_id,
        "quantity_kg": 300.0,
        "lot_cost": 3600.0,
        "note": "Initial arrival",
    })
    assert rcpt_resp.status_code == 201
    movement = rcpt_resp.json()
    assert movement["movement_type"] == "receipt"
    assert float(movement["quantity_kg"]) == 300.0
    lot_id = movement["lot_id"]

    # 2. Duplicate lot_code returns 409
    dup_rcpt = client.post("/inventory/receipts", json={
        "lot_code": lot_code,
        "material_id": mat_id,
        "supplier_id": sup_id,
        "quantity_kg": 100.0,
        "lot_cost": 1000.0,
    })
    assert dup_rcpt.status_code == 409

    # 3. Check inventory summary
    inv_resp = client.get("/inventory")
    assert inv_resp.status_code == 200
    inv = inv_resp.json()
    lot_item = next((l for l in inv["lots"] if l["lot_id"] == lot_id), None)
    assert lot_item is not None
    assert lot_item["lot_code"] == lot_code
    assert float(lot_item["available_kg"]) == 300.0


def test_inventory_issues_and_rejections(client):
    uid = uuid.uuid4().hex[:6]
    b_resp = client.post("/buyers", json={"name": f"Buyer {uid}"})
    buyer_id = b_resp.json()["id"]

    s_resp = client.post("/suppliers", json={"name": f"Supplier {uid}"})
    sup_id = s_resp.json()["id"]

    # Material A: Cotton Navy
    mat_a = client.post("/materials", json={
        "material_type": f"Cotton_{uid}",
        "colour": "Navy",
        "specification": "30s",
        "reorder_threshold_kg": 40.0,
        "yarn_kg_per_metre": 0.20,
    }).json()

    # Material B (incompatible): Silk Crimson
    mat_b = client.post("/materials", json={
        "material_type": f"Silk_{uid}",
        "colour": "Crimson",
        "specification": "20/22 denier",
        "reorder_threshold_kg": 10.0,
        "yarn_kg_per_metre": 0.15,
    }).json()

    # Receive 100 kg into Lot A (Cotton Navy)
    lot_a = client.post("/inventory/receipts", json={
        "lot_code": f"LOT-A-{uid}",
        "material_id": mat_a["id"],
        "supplier_id": sup_id,
        "quantity_kg": 100.0,
        "lot_cost": 1200.0,
    }).json()
    lot_a_id = lot_a["lot_id"]

    # Receive 50 kg into Lot B (Silk Crimson)
    lot_b = client.post("/inventory/receipts", json={
        "lot_code": f"LOT-B-{uid}",
        "material_id": mat_b["id"],
        "supplier_id": sup_id,
        "quantity_kg": 50.0,
        "lot_cost": 2500.0,
    }).json()
    lot_b_id = lot_b["lot_id"]

    # Create Order for Cotton Navy: 400m * 0.20 = 80kg required (Lot A has 100kg -> feasible)
    now = datetime.now(timezone.utc)
    order = client.post("/orders", json={
        "buyer_id": buyer_id,
        "fabric_type": f"Cotton_{uid}",
        "colour": "Navy",
        "quantity_metres": 400.0,
        "agreed_rate": 150.0,
        "deadline": (now + timedelta(days=20)).isoformat(),
    }).json()
    order_id = order["id"]

    # 1. Zero quantity issue -> Expect 422
    z_res = client.post("/inventory/issues", json={
        "lot_id": lot_a_id,
        "order_id": order_id,
        "quantity_kg": 0.0,
    })
    assert z_res.status_code == 422

    # 2. Negative quantity issue -> Expect 422
    neg_res = client.post("/inventory/issues", json={
        "lot_id": lot_a_id,
        "order_id": order_id,
        "quantity_kg": -10.0,
    })
    assert neg_res.status_code == 422

    # 3. Incompatible yarn rejection (Silk lot issued to Cotton order) -> Expect 409
    incomp_res = client.post("/inventory/issues", json={
        "lot_id": lot_b_id,
        "order_id": order_id,
        "quantity_kg": 20.0,
    })
    assert incomp_res.status_code == 409
    detail_str = str(incomp_res.json()["detail"]).lower()
    assert "compatible" in detail_str or "incompatible" in detail_str or "mismatch" in detail_str

    # 4. Insufficient stock rejection (request 150 kg from 100 kg lot) -> Expect 409
    over_res = client.post("/inventory/issues", json={
        "lot_id": lot_a_id,
        "order_id": order_id,
        "quantity_kg": 150.0,
    })
    assert over_res.status_code == 409

    # 5. Successful issue of 65 kg -> Expect 201
    ok_res = client.post("/inventory/issues", json={
        "lot_id": lot_a_id,
        "order_id": order_id,
        "quantity_kg": 65.0,
        "note": "Production batch 1",
    })
    assert ok_res.status_code == 201
    issue_data = ok_res.json()
    assert issue_data["movement_type"] == "issue"
    assert float(issue_data["quantity_kg"]) == 65.0

    # 6. Check low-stock alert triggered (35kg remaining <= threshold 40kg)
    inv_low = client.get("/inventory?low_stock_only=true")
    assert inv_low.status_code == 200
    low_data = inv_low.json()
    assert any(l["lot_id"] == lot_a_id for l in low_data["lots"])


def test_inventory_adjustments_and_movements(client):
    uid = uuid.uuid4().hex[:6]
    s_resp = client.post("/suppliers", json={"name": f"Supplier {uid}"})
    sup_id = s_resp.json()["id"]

    m_resp = client.post("/materials", json={
        "material_type": f"Linen_{uid}",
        "colour": "Raw",
        "specification": "40s",
        "reorder_threshold_kg": 10.0,
        "yarn_kg_per_metre": 0.20,
    })
    mat_id = m_resp.json()["id"]

    lot = client.post("/inventory/receipts", json={
        "lot_code": f"LOT-ADJ-{uid}",
        "material_id": mat_id,
        "supplier_id": sup_id,
        "quantity_kg": 50.0,
        "lot_cost": 500.0,
    }).json()
    lot_id = lot["lot_id"]

    # 1. Zero adjustment rejection -> Expect 422
    z_adj = client.post("/inventory/adjustments", json={
        "lot_id": lot_id,
        "quantity_kg": 0.0,
        "reason": "Invalid zero adjustment",
    })
    assert z_adj.status_code == 422

    # 2. Negative adjustment exceeding available stock -> Expect 409
    over_neg = client.post("/inventory/adjustments", json={
        "lot_id": lot_id,
        "quantity_kg": -60.0,
        "reason": "Exceeding stock adjustment",
    })
    assert over_neg.status_code == 409

    # 3. Valid negative adjustment of -10 kg
    ok_neg = client.post("/inventory/adjustments", json={
        "lot_id": lot_id,
        "quantity_kg": -10.0,
        "reason": "Moisture loss during storage",
    })
    assert ok_neg.status_code == 201
    assert float(ok_neg.json()["quantity_kg"]) == -10.0

    # 4. Valid positive adjustment of +5 kg
    ok_pos = client.post("/inventory/adjustments", json={
        "lot_id": lot_id,
        "quantity_kg": 5.0,
        "reason": "Scale recount calibration",
    })
    assert ok_pos.status_code == 201
    assert float(ok_pos.json()["quantity_kg"]) == 5.0

    # 5. Verify movements ledger has complete audit trail
    mov_resp = client.get(f"/inventory/movements?lot_id={lot_id}")
    assert mov_resp.status_code == 200
    movements = mov_resp.json()
    types = [m["movement_type"] for m in movements]
    assert "receipt" in types
    assert "adjustment" in types
    assert len(movements) == 3
