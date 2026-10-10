"""
Tests for Buyers, Orders, Materials, Suppliers, and Yarn Feasibility.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest


def test_buyer_crud_and_validation(client):
    uid = uuid.uuid4().hex[:6]
    # 1. Create buyer
    resp = client.post("/buyers", json={
        "name": f"Nordic Textiles {uid}",
        "contact": "Elin Larsson",
        "email": f"elin.{uid}@nordic.example.com",
        "address": "Gothenburg, Sweden",
    })
    assert resp.status_code == 201
    buyer = resp.json()
    assert buyer["id"] is not None
    assert buyer["name"] == f"Nordic Textiles {uid}"
    buyer_id = buyer["id"]

    # 2. Get buyer by ID
    resp_get = client.get(f"/buyers/{buyer_id}")
    assert resp_get.status_code == 200
    assert resp_get.json()["id"] == buyer_id

    # 3. List buyers
    resp_list = client.get("/buyers")
    assert resp_list.status_code == 200
    assert any(b["id"] == buyer_id for b in resp_list.json())

    # 4. Non-existent buyer
    resp_404 = client.get("/buyers/999999")
    assert resp_404.status_code == 404


def test_material_and_supplier_crud(client):
    uid = uuid.uuid4().hex[:6]
    # 1. Create supplier
    s_resp = client.post("/suppliers", json={
        "name": f"Flax Spinner {uid}",
        "contact": "1234567890",
        "email": f"spinner.{uid}@flax.example.com",
    })
    assert s_resp.status_code == 201
    sup_id = s_resp.json()["id"]

    # 2. Duplicate supplier returns 409
    dup_resp = client.post("/suppliers", json={
        "name": f"Flax Spinner {uid}",
        "contact": "999",
    })
    assert dup_resp.status_code == 409

    # 3. Create material
    m_resp = client.post("/materials", json={
        "material_type": f"Linen_{uid}",
        "colour": "Natural",
        "specification": "60s Count Combed Flax",
        "reorder_threshold_kg": 50.0,
        "yarn_kg_per_metre": 0.250,
    })
    assert m_resp.status_code == 201
    assert float(m_resp.json()["yarn_kg_per_metre"]) == 0.250

    # 4. Duplicate material returns 409
    m_dup = client.post("/materials", json={
        "material_type": f"Linen_{uid}",
        "colour": "Natural",
        "specification": "60s Count Combed Flax",
        "reorder_threshold_kg": 10.0,
        "yarn_kg_per_metre": 0.200,
    })
    assert m_dup.status_code == 409


def test_order_creation_and_lifecycle(client):
    uid = uuid.uuid4().hex[:6]
    b_resp = client.post("/buyers", json={"name": f"Buyer {uid}"})
    buyer_id = b_resp.json()["id"]

    s_resp = client.post("/suppliers", json={"name": f"Supplier {uid}"})
    sup_id = s_resp.json()["id"]

    # Material: Cotton Blue
    fabric = f"Cotton_{uid}"
    colour = "Blue"
    m_resp = client.post("/materials", json={
        "material_type": fabric,
        "colour": colour,
        "specification": "30s",
        "reorder_threshold_kg": 20.0,
        "yarn_kg_per_metre": 0.20,
    })
    mat_id = m_resp.json()["id"]

    # Attempt to create order without stock -> Expect 409 (feasibility check)
    now = datetime.now(timezone.utc)
    future = now + timedelta(days=30)
    infeasible_resp = client.post("/orders", json={
        "buyer_id": buyer_id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 500.0,
        "agreed_rate": 180.0,
        "deadline": future.isoformat(),
        "priority": "high",
    })
    assert infeasible_resp.status_code == 409

    # Receive sufficient yarn into inventory (500m * 0.20 kg/m = 100 kg)
    rcpt = client.post("/inventory/receipts", json={
        "lot_code": f"LOT-ORD-{uid}",
        "material_id": mat_id,
        "supplier_id": sup_id,
        "quantity_kg": 150.0,
        "lot_cost": 1500.0,
    })
    assert rcpt.status_code == 201

    # 1. Valid order now succeeds because feasibility passes
    ord_resp = client.post("/orders", json={
        "buyer_id": buyer_id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 500.0,
        "agreed_rate": 180.0,
        "deadline": future.isoformat(),
        "priority": "high",
    })
    assert ord_resp.status_code == 201
    order = ord_resp.json()
    assert order["id"] is not None
    order_id = order["id"]

    # 2. Order negative validation: non-existent buyer
    bad_buyer = client.post("/orders", json={
        "buyer_id": 999999,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 100.0,
        "agreed_rate": 100.0,
        "deadline": future.isoformat(),
    })
    assert bad_buyer.status_code == 404

    # 3. Negative validation: non-positive quantity
    bad_qty = client.post("/orders", json={
        "buyer_id": buyer_id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": -50.0,
        "agreed_rate": 100.0,
        "deadline": future.isoformat(),
    })
    assert bad_qty.status_code in (422, 409)

    # 4. Operations auto-created for order
    ops_resp = client.get(f"/orders/{order_id}/operations")
    assert ops_resp.status_code == 200
    ops = ops_resp.json()
    assert len(ops) == 6
    stages = [op["stage"] for op in ops]
    assert "spinning" in stages
    assert "weaving" in stages

    # 5. Order listing and retrieval
    get_ord = client.get(f"/orders/{order_id}")
    assert get_ord.status_code == 200
    assert get_ord.json()["derived_status"] is not None


def test_yarn_feasibility_calculations(client):
    uid = uuid.uuid4().hex[:6]
    # Supplier
    s_resp = client.post("/suppliers", json={"name": f"Feasibility Supplier {uid}"})
    supplier_id = s_resp.json()["id"]

    # Material: 0.250 kg/m
    fabric = f"Flax_{uid}"
    colour = "SkyBlue"
    m_resp = client.post("/materials", json={
        "material_type": fabric,
        "colour": colour,
        "specification": "Test Count",
        "reorder_threshold_kg": 20.0,
        "yarn_kg_per_metre": 0.250,
    })
    material_id = m_resp.json()["id"]

    # 1. Zero stock scenario: feasibility endpoint reports feasible=False
    f_resp1 = client.post("/orders/feasibility", json={
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 800.0,
    })
    assert f_resp1.status_code == 200
    f_data1 = f_resp1.json()
    assert f_data1["feasible"] is False
    assert len(f_data1["options"]) == 1
    opt1 = f_data1["options"][0]
    assert float(opt1["required_kg"]) == 200.0
    assert float(opt1["available_kg"]) == 0.0
    assert float(opt1["shortfall_kg"]) == 200.0

    # 2. Partial stock scenario: Receive 100 kg
    client.post("/inventory/receipts", json={
        "lot_code": f"LOT-PARTIAL-{uid}",
        "material_id": material_id,
        "supplier_id": supplier_id,
        "quantity_kg": 100.0,
        "lot_cost": 1500.0,
    })

    f_resp2 = client.post("/orders/feasibility", json={
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 800.0,
    })
    assert f_resp2.status_code == 200
    f_data2 = f_resp2.json()
    assert f_data2["feasible"] is False
    opt2 = f_data2["options"][0]
    assert float(opt2["available_kg"]) == 100.0
    assert float(opt2["shortfall_kg"]) == 100.0

    # 3. Sufficient stock scenario: Receive another 120 kg (total 220 kg >= 200 kg)
    client.post("/inventory/receipts", json={
        "lot_code": f"LOT-SUFF-{uid}",
        "material_id": material_id,
        "supplier_id": supplier_id,
        "quantity_kg": 120.0,
        "lot_cost": 1800.0,
    })

    f_resp3 = client.post("/orders/feasibility", json={
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 800.0,
    })
    assert f_resp3.status_code == 200
    f_data3 = f_resp3.json()
    assert f_data3["feasible"] is True
    opt3 = f_data3["options"][0]
    assert float(opt3["available_kg"]) == 220.0
    assert float(opt3["shortfall_kg"]) == 0.0
