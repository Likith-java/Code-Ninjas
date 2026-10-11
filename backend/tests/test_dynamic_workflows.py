import threading
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import (
    Buyer,
    Dispatch,
    DispatchItem,
    Downtime,
    FabricRoll,
    Machine,
    Material,
    MaterialLot,
    InventoryMovement,
    Operation,
    Order,
    ProductionRun,
    User,
)
from app.core.security import create_access_token


def create_test_buyer_and_user(db_session, role="customer"):
    uid = uuid.uuid4().hex[:6]
    buyer = Buyer(name=f"Buyer Test {uid}", email=f"buyer_{uid}@example.com")
    db_session.add(buyer)
    db_session.flush()

    user = User(
        name=f"User {uid}",
        email=f"user_{uid}@example.com",
        password_hash="testpasshash",
        role=role,
        buyer_id=buyer.id if role == "customer" else None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(buyer)
    db_session.refresh(user)

    token = create_access_token(user)
    return buyer, user, token


def seed_material_and_stock(db_session, material_type, colour, kg=Decimal("1000.000")):
    mat = db_session.scalar(
        select(Material).where(
            Material.material_type == material_type,
            Material.colour == colour,
        ).limit(1)
    )
    if not mat:
        mat = Material(
            material_type=material_type,
            colour=colour,
            specification=f"Spec for {material_type}",
            reorder_threshold_kg=Decimal("50.00"),
            yarn_kg_per_metre=Decimal("0.200"),
        )
        db_session.add(mat)
        db_session.flush()

    from app.models import Supplier
    sup = db_session.scalar(select(Supplier).limit(1))
    if not sup:
        sup = Supplier(name=f"Supplier {uuid.uuid4().hex[:6]}")
        db_session.add(sup)
        db_session.flush()

    lot = MaterialLot(
        lot_code=f"LOT-{uuid.uuid4().hex[:6]}",
        material_id=mat.id,
        supplier_id=sup.id,
        initial_received_kg=kg,
        lot_cost=Decimal("1000.00"),
    )
    db_session.add(lot)
    db_session.flush()

    mov = InventoryMovement(
        lot_id=lot.id,
        movement_type="receipt",
        quantity_kg=kg,
    )
    db_session.add(mov)
    db_session.commit()
    return mat


def test_fabrics_catalogue_and_supported_products(client, db_session):
    """
    Requirement 8: Fabric dropdown values correspond to supported products.
    """
    resp = client.get("/fabrics")
    assert resp.status_code == 200
    fabrics = resp.json()
    assert len(fabrics) >= 4
    types = {f["fabric_type"] for f in fabrics}
    assert "Cotton" in types
    assert "Polyester" in types
    assert "Linen" in types
    assert "Silk" in types

    # Each fabric has base_rate, MOQ, specification
    for f in fabrics:
        assert float(f["base_rate_per_metre"]) > 0
        assert float(f["min_order_metres"]) > 0
        assert f["specification"]


def test_unknown_fabric_rejected(client, db_session):
    """
    Requirement 9: Unknown fabric IDs are rejected.
    """
    # Quote with unknown fabric
    resp = client.post("/orders/quote", json={
        "fabric_type": "UnknownTitaniumFiber",
        "colour": "Neon",
        "quantity_metres": 500,
    })
    assert resp.status_code == 422
    assert "Unsupported fabric type" in resp.text

    # Create order with unknown fabric
    buyer, _, _ = create_test_buyer_and_user(db_session, role="admin")
    resp2 = client.post("/orders", json={
        "buyer_id": buyer.id,
        "fabric_type": "UnsupportedSyntheticKevlar",
        "colour": "Black",
        "quantity_metres": 500,
        "deadline": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        "priority": "normal",
    })
    assert resp2.status_code == 422


def test_quote_updates_with_fabric_and_length(client):
    """
    Requirement 10: Changing fabric or length updates the quote.
    """
    # Cotton 500m
    resp1 = client.post("/orders/quote", json={
        "fabric_type": "Cotton",
        "colour": "Navy Blue",
        "quantity_metres": 500,
    })
    assert resp1.status_code == 200
    q1 = resp1.json()
    assert float(q1["unit_price"]) == 170.0
    assert float(q1["subtotal"]) == 85000.0
    assert float(q1["tax_amount"]) == 4250.0
    assert float(q1["total_amount"]) == 89250.0

    # Changing length: Cotton 1000m
    resp2 = client.post("/orders/quote", json={
        "fabric_type": "Cotton",
        "colour": "Navy Blue",
        "quantity_metres": 1000,
    })
    assert resp2.status_code == 200
    q2 = resp2.json()
    assert float(q2["subtotal"]) == 170000.0

    # Changing fabric: Silk 500m
    resp3 = client.post("/orders/quote", json={
        "fabric_type": "Silk",
        "colour": "Crimson Red",
        "quantity_metres": 500,
    })
    assert resp3.status_code == 200
    q3 = resp3.json()
    assert float(q3["unit_price"]) == 450.0
    assert float(q3["subtotal"]) == 225000.0


def test_client_price_tampering_ignored_and_persisted(client, db_session):
    """
    Requirements 11 & 12:
    Client-supplied price tampering is rejected or ignored.
    Final pricing is authoritatively calculated and persisted by the backend.
    """
    buyer, user, token = create_test_buyer_and_user(db_session, role="customer")
    seed_material_and_stock(db_session, "Cotton", "Navy Blue", Decimal("1000.000"))

    deadline = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
    # Customer tries to tamper with agreed_rate = 1.00 instead of 170.00
    resp = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "buyer_id": buyer.id,
            "fabric_type": "Cotton",
            "colour": "Navy Blue",
            "quantity_metres": 200,
            "agreed_rate": 1.00,  # Tampered rate!
            "deadline": deadline,
            "priority": "normal",
        },
    )
    assert resp.status_code == 201
    order_data = resp.json()
    # Server overrode the tampered rate with the authoritative 170.00
    assert float(order_data["agreed_rate"]) == 170.00
    assert float(order_data["total_amount"]) == 34000.00


def test_customer_isolation_and_immediate_appearance(client, db_session):
    """
    Requirements 13 & 14:
    New orders immediately appear in customer's dashboard.
    Customers cannot retrieve another customer's orders (403 Forbidden).
    """
    buyer_a, cust_a, token_a = create_test_buyer_and_user(db_session, role="customer")
    buyer_b, cust_b, token_b = create_test_buyer_and_user(db_session, role="customer")

    seed_material_and_stock(db_session, "Polyester", "Charcoal Black")

    deadline = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    # Cust A places order
    ord_resp = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "buyer_id": buyer_a.id,
            "fabric_type": "Polyester",
            "colour": "Charcoal Black",
            "quantity_metres": 300,
            "deadline": deadline,
            "priority": "normal",
        },
    )
    assert ord_resp.status_code == 201
    order_id = ord_resp.json()["id"]

    # Order immediately appears in Customer A's list
    list_a = client.get("/orders", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert any(o["id"] == order_id for o in list_a)

    # Customer B cannot see Order A in order list
    list_b = client.get("/orders", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert not any(o["id"] == order_id for o in list_b)

    # Customer B cannot retrieve Order A by ID (403 Forbidden)
    get_b = client.get(f"/orders/{order_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert get_b.status_code == 403


def test_spinning_dropdown_only_shows_ready_and_eligible_machines(client, db_session):
    """
    Requirements 3, 4, 5, 6:
    - Only ready and eligible machines appear in Spinning readiness dropdown.
    - Machines with overlapping active or scheduled downtime are excluded.
    - Completed or cancelled downtime no longer blocks availability.
    - Machine becomes selectable again when genuinely available.
    """
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # Create 3 spinning machines
    spin1 = Machine(machine_code=f"SPIN-RDY-{uid}-1", machine_type="spinning", capacity_rate=Decimal("100.00"), state="idle")
    spin2 = Machine(machine_code=f"SPIN-DOWN-{uid}-2", machine_type="spinning", capacity_rate=Decimal("100.00"), state="idle")
    spin3 = Machine(machine_code=f"SPIN-RUN-{uid}-3", machine_type="spinning", capacity_rate=Decimal("100.00"), state="running")
    db_session.add_all([spin1, spin2, spin3])
    db_session.commit()

    # Machine 2 has active downtime
    dt = Downtime(
        machine_id=spin2.id,
        reason="Bearing failure",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=2),
    )
    db_session.add(dt)
    db_session.commit()

    # Create test order & material
    seed_material_and_stock(db_session, "Cotton", "Navy Blue")
    buyer, _, admin_token = create_test_buyer_and_user(db_session, role="admin")

    ord_resp = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "buyer_id": buyer.id,
            "fabric_type": "Cotton",
            "colour": "Navy Blue",
            "quantity_metres": 200,
            "deadline": (now + timedelta(days=10)).isoformat(),
            "priority": "normal",
        },
    )
    order_id = ord_resp.json()["id"]

    # Check readiness endpoint
    readiness = client.get(
        f"/orders/{order_id}/readiness",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()

    eligible_ids = [m["id"] for m in readiness["eligible_machines"]]
    # spin1 is ready -> included
    assert spin1.id in eligible_ids
    # spin2 has active downtime -> excluded!
    assert spin2.id not in eligible_ids
    # spin3 is currently running -> excluded!
    assert spin3.id not in eligible_ids

    # Requirement 5 & 6: Close downtime on spin2 (simulate completion)
    dt.end_time = now - timedelta(minutes=5)
    db_session.commit()

    # Re-check readiness: spin2 is now genuinely available and reappears!
    readiness2 = client.get(
        f"/orders/{order_id}/readiness",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    eligible_ids2 = [m["id"] for m in readiness2["eligible_machines"]]
    assert spin2.id in eligible_ids2


def test_started_production_run_appears_on_product_floor_and_persists(client, db_session):
    """
    Requirements 1 & 2:
    - A started production run appears on the Product Floor.
    - Production-run changes persist after reload.
    """
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    # Create spinning machine
    spin = Machine(machine_code=f"SPIN-FLR-{uid}", machine_type="spinning", capacity_rate=Decimal("150.00"), state="idle")
    db_session.add(spin)
    db_session.commit()

    seed_material_and_stock(db_session, "Cotton", "Navy Blue")
    buyer, _, admin_token = create_test_buyer_and_user(db_session, role="admin")

    ord_resp = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "buyer_id": buyer.id,
            "fabric_type": "Cotton",
            "colour": "Navy Blue",
            "quantity_metres": 300,
            "deadline": (now + timedelta(days=10)).isoformat(),
            "priority": "normal",
        },
    )
    order_id = ord_resp.json()["id"]

    # Start production
    start_resp = client.post(
        f"/orders/{order_id}/start-production",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"machine_id": spin.id},
    )
    assert start_resp.status_code == 201
    start_data = start_resp.json()
    run_id = start_data["production_run_id"]
    assert start_data["status"] == "running"

    # Verify Product Floor query (GET /production-runs) contains the new run with full details
    runs_resp = client.get("/production-runs?status=running")
    assert runs_resp.status_code == 200
    runs = runs_resp.json()
    target_run = next((r for r in runs if r["id"] == run_id), None)
    assert target_run is not None
    assert target_run["order_id"] == order_id
    assert target_run["stage"] == "spinning"
    assert target_run["machine_code"] == spin.machine_code
    assert target_run["fabric_type"] == "Cotton"
    assert target_run["status"] == "running"

    # Simulate reload: query directly again
    reloaded_resp = client.get(f"/production-runs/{run_id}")
    assert reloaded_resp.status_code == 200
    assert reloaded_resp.json()["status"] == "running"


def test_customer_order_tracking_lifecycle(client, db_session):
    """
    Requirement 15:
    Production and dispatch status updates appear correctly on customer order tracking.
    """
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4().hex[:6]

    spin = Machine(machine_code=f"SPIN-TRK-{uid}", machine_type="spinning", capacity_rate=Decimal("150.00"), state="idle")
    db_session.add(spin)
    db_session.commit()

    seed_material_and_stock(db_session, "Cotton", "Navy Blue")
    buyer, cust, cust_token = create_test_buyer_and_user(db_session, role="customer")
    _, _, admin_token = create_test_buyer_and_user(db_session, role="admin")

    ord_resp = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {cust_token}"},
        json={
            "buyer_id": buyer.id,
            "fabric_type": "Cotton",
            "colour": "Navy Blue",
            "quantity_metres": 200,
            "deadline": (now + timedelta(days=15)).isoformat(),
            "priority": "normal",
        },
    )
    order_id = ord_resp.json()["id"]

    # Check tracking before start
    trk1 = client.get(f"/orders/{order_id}/tracking", headers={"Authorization": f"Bearer {cust_token}"}).json()
    assert trk1["derived_status"] == "pending"
    order_placed_step = next(s for s in trk1["timeline"] if s["key"] == "order_placed")
    assert order_placed_step["completed"] is True

    # Start production
    client.post(
        f"/orders/{order_id}/start-production",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"machine_id": spin.id},
    )

    # Check tracking: now In Production
    trk2 = client.get(f"/orders/{order_id}/tracking", headers={"Authorization": f"Bearer {cust_token}"}).json()
    assert trk2["derived_status"] == "in_production"
    assert trk2["active_machine"] == spin.machine_code
    in_prod_step = next(s for s in trk2["timeline"] if s["key"] == "in_production")
    assert in_prod_step["completed"] is True
