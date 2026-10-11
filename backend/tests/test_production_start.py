"""
Comprehensive automated tests for Start Production workflow, Dispatch confirmation idempotency,
and Dispatch Manager role restrictions.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Buyer,
    Dispatch,
    DispatchItem,
    FabricRoll,
    InventoryMovement,
    Machine,
    Material,
    MaterialLot,
    Operation,
    Order,
    ProductionRun,
    Supplier,
    User,
)


def create_user_with_token(db_session, role: str, buyer_id: int | None = None) -> tuple[User, str]:
    uid = uuid.uuid4().hex[:6]
    user = User(
        name=f"Test {role.title()} {uid}",
        email=f"{role}_{uid}@example.com",
        password_hash=hash_password("password123"),
        role=role,
        buyer_id=buyer_id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token(user)
    return user, token


def setup_factory_environment(db_session):
    """Sets up buyer, supplier, material, lots, inventory movements, machine, and an order."""
    uid = uuid.uuid4().hex[:6]

    # Buyer
    buyer = Buyer(name=f"Premier Apparel {uid}", email=f"buyer_{uid}@example.com")
    # Supplier
    supplier = Supplier(name=f"Yarn Mills {uid}", contact="John Doe", email=f"supp_{uid}@example.com")
    db_session.add_all([buyer, supplier])
    db_session.commit()
    db_session.refresh(buyer)
    db_session.refresh(supplier)

    # Material: Cotton Poplin / Sky Blue, 0.20 kg/m
    material = Material(
        material_type="Cotton Poplin",
        colour="Sky Blue",
        specification="40s Combed Cotton",
        reorder_threshold_kg=Decimal("100.000"),
        yarn_kg_per_metre=Decimal("0.200000"),
    )
    db_session.add(material)
    db_session.commit()
    db_session.refresh(material)

    # Material Lot & Receipt of 1,000 kg yarn (supports 5,000m)
    lot = MaterialLot(
        lot_code=f"LOT-{uid}",
        material_id=material.id,
        supplier_id=supplier.id,
        initial_received_kg=Decimal("1000.000"),
    )
    db_session.add(lot)
    db_session.commit()
    db_session.refresh(lot)

    movement = InventoryMovement(
        lot_id=lot.id,
        movement_type="receipt",
        quantity_kg=Decimal("1000.000"),
    )
    db_session.add(movement)

    # Spinning Machine
    machine = Machine(
        machine_code=f"SPIN-{uid}",
        machine_type="spinning",
        capacity_rate=Decimal("45.00"),
        state="idle",
        is_active=True,
    )
    db_session.add(machine)
    db_session.commit()
    db_session.refresh(machine)

    # Order for 1,000m (requires 200 kg yarn)
    now = datetime.now(timezone.utc)
    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton Poplin",
        colour="Sky Blue",
        quantity_metres=Decimal("1000.00"),
        agreed_rate=Decimal("5.50"),
        order_date=now - timedelta(days=1),
        deadline=now + timedelta(days=10),
        priority="high",
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    # Operations
    op1 = Operation(order_id=order.id, stage="spinning", sequence=1, planned_duration_minutes=120)
    op2 = Operation(order_id=order.id, stage="weaving", sequence=2, planned_duration_minutes=240)
    db_session.add_all([op1, op2])
    db_session.commit()
    db_session.refresh(op1)
    db_session.refresh(op2)

    op1.eligible_machines.append(machine)
    db_session.commit()

    return {
        "buyer": buyer,
        "supplier": supplier,
        "material": material,
        "lot": lot,
        "machine": machine,
        "order": order,
        "op1": op1,
        "op2": op2,
    }


# =========================================================================
# Feature A Tests: Start Production
# =========================================================================

def test_admin_and_production_manager_can_start_production(client, db_session):
    """Admin and Production Manager can start an eligible order."""
    env = setup_factory_environment(db_session)
    order_id = env["order"].id

    admin_user, admin_token = create_user_with_token(db_session, "admin")
    pm_user, pm_token = create_user_with_token(db_session, "production_manager")

    # 1. Admin inspects readiness
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    readiness_resp = client.get(f"/orders/{order_id}/readiness", headers=headers_admin)
    assert readiness_resp.status_code == 200
    readiness = readiness_resp.json()
    assert readiness["order_id"] == order_id
    assert readiness["yarn_feasible"] is True
    assert readiness["has_active_run"] is False
    assert readiness["target_operation"]["stage"] == "spinning"
    assert readiness["recommended_machine"]["id"] == env["machine"].id

    # 2. PM inspects readiness
    headers_pm = {"Authorization": f"Bearer {pm_token}"}
    readiness_pm_resp = client.get(f"/orders/{order_id}/readiness", headers=headers_pm)
    assert readiness_pm_resp.status_code == 200

    # 3. PM starts production
    start_resp = client.post(
        f"/orders/{order_id}/start-production",
        headers=headers_pm,
        json={"operation_id": env["op1"].id, "machine_id": env["machine"].id},
    )
    assert start_resp.status_code == 201
    start_data = start_resp.json()
    assert start_data["order_id"] == order_id
    assert start_data["stage"] == "spinning"
    assert start_data["machine_id"] == env["machine"].id
    assert start_data["status"] == "running"

    # 4. Machine state in DB is now 'running'
    db_session.expire_all()
    updated_machine = db_session.get(Machine, env["machine"].id)
    assert updated_machine.state == "running"

    # 5. Derived order status is now 'in_production'
    get_order_resp = client.get(f"/orders/{order_id}", headers=headers_pm)
    assert get_order_resp.status_code == 200
    assert get_order_resp.json()["derived_status"] == "in_production"


def test_customer_and_dispatch_manager_cannot_start_production(client, db_session):
    """Customer and Dispatch Manager roles must be rejected with 403 Forbidden."""
    env = setup_factory_environment(db_session)
    order_id = env["order"].id

    cust_user, cust_token = create_user_with_token(db_session, "customer", buyer_id=env["buyer"].id)
    dm_user, dm_token = create_user_with_token(db_session, "dispatch_manager")

    # Customer is blocked
    headers_cust = {"Authorization": f"Bearer {cust_token}"}
    resp_cust = client.post(f"/orders/{order_id}/start-production", headers=headers_cust, json={})
    assert resp_cust.status_code == 403
    assert "Access forbidden" in resp_cust.json()["detail"]

    resp_readiness_cust = client.get(f"/orders/{order_id}/readiness", headers=headers_cust)
    assert resp_readiness_cust.status_code == 403

    # Dispatch Manager is blocked
    headers_dm = {"Authorization": f"Bearer {dm_token}"}
    resp_dm = client.post(f"/orders/{order_id}/start-production", headers=headers_dm, json={})
    assert resp_dm.status_code == 403
    assert "Access forbidden" in resp_dm.json()["detail"]

    resp_readiness_dm = client.get(f"/orders/{order_id}/readiness", headers=headers_dm)
    assert resp_readiness_dm.status_code == 403


def test_insufficient_yarn_prevents_production_start(client, db_session):
    """Feasibility failure prevents production start with a descriptive 409 error."""
    env = setup_factory_environment(db_session)
    admin_user, admin_token = create_user_with_token(db_session, "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create an order with massive quantity (e.g. 100,000m) exceeding available 1,000kg stock
    now = datetime.now(timezone.utc)
    big_order = Order(
        buyer_id=env["buyer"].id,
        fabric_type="Cotton Poplin",
        colour="Sky Blue",
        quantity_metres=Decimal("100000.00"),
        agreed_rate=Decimal("5.50"),
        order_date=now - timedelta(days=1),
        deadline=now + timedelta(days=20),
        priority="high",
    )
    db_session.add(big_order)
    db_session.commit()
    db_session.refresh(big_order)

    # Attempt to start production
    resp = client.post(f"/orders/{big_order.id}/start-production", headers=headers, json={})
    assert resp.status_code == 409
    assert "Insufficient yarn stock" in resp.json()["detail"]


def test_duplicate_start_prevented_transactionally(client, db_session):
    """Starting an order that already has an active running run is blocked with 409."""
    env = setup_factory_environment(db_session)
    order_id = env["order"].id
    admin_user, admin_token = create_user_with_token(db_session, "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. First start succeeds
    resp1 = client.post(f"/orders/{order_id}/start-production", headers=headers, json={})
    assert resp1.status_code == 201

    # 2. Second start immediately fails
    resp2 = client.post(f"/orders/{order_id}/start-production", headers=headers, json={})
    assert resp2.status_code == 409
    assert "already has an active production run" in resp2.json()["detail"]


def test_broken_or_maintenance_machine_prevents_start(client, db_session):
    """If the target machine is under breakdown/maintenance, production cannot start."""
    env = setup_factory_environment(db_session)
    order_id = env["order"].id
    admin_user, admin_token = create_user_with_token(db_session, "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Mark machine as breakdown
    env["machine"].state = "breakdown"
    db_session.commit()

    resp = client.post(
        f"/orders/{order_id}/start-production",
        headers=headers,
        json={"machine_id": env["machine"].id},
    )
    assert resp.status_code == 409
    assert "breakdown" in resp.json()["detail"]


# =========================================================================
# Feature B Tests: Dispatch Confirmation Idempotency
# =========================================================================

def test_dispatch_confirmation_is_idempotent_and_no_side_effects(client, db_session):
    """
    Submitting confirmation on an already-confirmed dispatch returns the persisted state
    without mutating records or duplicating invoices.
    """
    env = setup_factory_environment(db_session)
    order = env["order"]

    # Create production run for the roll
    run = ProductionRun(
        order_id=order.id,
        operation_id=env["op1"].id,
        machine_id=env["machine"].id,
        run_kind="actual",
        status="completed",
        output_metres=Decimal("500.00"),
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)

    # Create passed fabric roll for the order
    roll = FabricRoll(
        order_id=order.id,
        production_run_id=run.id,
        roll_code=f"ROLL-{uuid.uuid4().hex[:6]}",
        metres=Decimal("500.00"),
        status="passed",
    )
    db_session.add(roll)
    db_session.commit()
    db_session.refresh(roll)

    # Create dispatch via API
    now = datetime.now(timezone.utc)
    disp_resp = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-{uuid.uuid4().hex[:6]}",
        "vehicle": "Truck TRK-99",
        "items": [{"roll_id": roll.id, "metres": 500.0}],
    })
    assert disp_resp.status_code == 201
    dispatch_id = disp_resp.json()["id"]

    # 1. First confirmation succeeds
    conf_resp1 = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert conf_resp1.status_code == 200
    res1 = conf_resp1.json()
    assert res1["confirmed"] is True
    assert res1["confirmed_at"] is not None

    # 2. Second confirmation call returns the same confirmed state idempotently
    conf_resp2 = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert conf_resp2.status_code == 200
    res2 = conf_resp2.json()
    assert res2["confirmed"] is True
    assert res2["confirmed_at"] == res1["confirmed_at"]
    assert res2["invoice_number"] == res1["invoice_number"]


# =========================================================================
# Feature C Tests: Reports Forbidden for Dispatch Manager
# =========================================================================

def test_dispatch_manager_cannot_access_reports(client, db_session):
    """
    Dispatch Manager accounts must receive 403 Forbidden on reports endpoints.
    Admin and Production Manager retain access.
    """
    dm_user, dm_token = create_user_with_token(db_session, "dispatch_manager")
    admin_user, admin_token = create_user_with_token(db_session, "admin")
    pm_user, pm_token = create_user_with_token(db_session, "production_manager")

    headers_dm = {"Authorization": f"Bearer {dm_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_pm = {"Authorization": f"Bearer {pm_token}"}

    # Dispatch Manager blocked from listing report types
    resp_types_dm = client.get("/reports/types", headers=headers_dm)
    assert resp_types_dm.status_code == 403
    assert "Dispatch Manager" in resp_types_dm.json()["detail"]

    # Dispatch Manager blocked from generating reports
    resp_gen_dm = client.post("/reports/generate", headers=headers_dm, json={
        "report_type": "production_summary",
        "format": "pdf",
    })
    assert resp_gen_dm.status_code == 403

    # Admin retains access
    resp_types_admin = client.get("/reports/types", headers=headers_admin)
    assert resp_types_admin.status_code == 200
    assert len(resp_types_admin.json()) > 0

    # Production Manager retains access
    resp_types_pm = client.get("/reports/types", headers=headers_pm)
    assert resp_types_pm.status_code == 200
    assert len(resp_types_pm.json()) > 0
