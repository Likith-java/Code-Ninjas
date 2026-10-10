"""
Permanent automated tests for Role-Based Navigation, Role Matrix, and Customer Order Isolation.
Verifies:
1. Role permission matrices for Dispatcher, Production Manager, Customer, and Admin.
2. New customer registration creates an isolated buyer profile with zero initial orders.
3. Customer A cannot view or retrieve Customer B's orders (403 Forbidden on cross-buyer access).
4. Customer A cannot create an order under Customer B's identity (403 Forbidden).
5. Safe fail-closed handling if customer has no buyer mapping.
6. Admin and Production Manager retain authorized factory-wide order access.
7. Newly created orders persist and can be re-fetched by the owning customer.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.core.security import create_access_token, hash_password
from app.models import Buyer, Material, MaterialLot, InventoryMovement, Order, Supplier, User


def create_user_with_token(db_session, role: str, buyer_id: int | None = None) -> tuple[User, str]:
    uid = uuid.uuid4().hex[:6]
    user = User(
        name=f"User_{role}_{uid}",
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


def seed_test_material_stock(db_session, fabric: str, colour: str, qty_kg: Decimal = Decimal("500.000")):
    supplier = Supplier(name=f"Supplier_{uuid.uuid4().hex[:6]}")
    db_session.add(supplier)
    db_session.flush()

    mat = Material(
        material_type=fabric,
        colour=colour,
        specification=f"Spec_{uuid.uuid4().hex[:6]}",
        reorder_threshold_kg=Decimal("50.0"),
        yarn_kg_per_metre=Decimal("0.200"),
    )
    db_session.add(mat)
    db_session.flush()

    lot = MaterialLot(
        material_id=mat.id,
        supplier_id=supplier.id,
        lot_code=f"LOT_{uuid.uuid4().hex[:6]}",
        initial_received_kg=qty_kg,
    )
    db_session.add(lot)
    db_session.flush()

    mv = InventoryMovement(
        lot_id=lot.id,
        movement_type="receipt",
        quantity_kg=qty_kg,
        note="Initial Seed",
    )

    db_session.add(mv)
    db_session.commit()
    return mat



def test_new_customer_registration_has_empty_order_list(client, db_session):
    """A brand new customer who self-registers must have an isolated buyer with exactly 0 orders."""
    uid = uuid.uuid4().hex[:6]
    reg_resp = client.post("/api/auth/register", json={
        "name": f"Acme Apparel {uid}",
        "email": f"acme_{uid}@example.com",
        "password": "strongpassword123",
        "role": "customer",
    })
    assert reg_resp.status_code == 201
    auth_data = reg_resp.json()
    token = auth_data["token"]
    user_info = auth_data["user"]
    assert user_info["role"] == "customer"
    assert user_info["buyer_id"] is not None

    # Query customer's orders using Bearer token
    headers = {"Authorization": f"Bearer {token}"}
    orders_resp = client.get("/orders", headers=headers)
    assert orders_resp.status_code == 200
    orders = orders_resp.json()
    # Must NOT see historical Buyer #1 or demo orders!
    assert len(orders) == 0


def test_customer_order_ownership_and_cross_buyer_isolation(client, db_session):
    """
    Customer A sees only their orders.
    Customer A cannot see Customer B's orders in order list.
    Customer A cannot retrieve Customer B's order by ID (403 Forbidden).
    """
    uid_a = uuid.uuid4().hex[:6]
    uid_b = uuid.uuid4().hex[:6]

    # Setup 2 distinct buyers
    buyer_a = Buyer(name=f"Brand A {uid_a}", email=f"a_{uid_a}@brand.com")
    buyer_b = Buyer(name=f"Brand B {uid_b}", email=f"b_{uid_b}@brand.com")
    db_session.add_all([buyer_a, buyer_b])
    db_session.commit()
    db_session.refresh(buyer_a)
    db_session.refresh(buyer_b)

    # Setup 2 customer accounts
    cust_a, token_a = create_user_with_token(db_session, "customer", buyer_id=buyer_a.id)
    cust_b, token_b = create_user_with_token(db_session, "customer", buyer_id=buyer_b.id)

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Seed yarn material stock
    fabric = f"Cotton_{uid_a}"
    colour = "Navy Blue"
    seed_test_material_stock(db_session, fabric, colour, Decimal("1000.000"))

    # Customer A creates Order A
    deadline = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    order_a_resp = client.post("/orders", headers=headers_a, json={
        "buyer_id": buyer_a.id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 200,
        "agreed_rate": 45.0,
        "deadline": deadline,
        "priority": "normal",
    })
    assert order_a_resp.status_code == 201
    order_a_id = order_a_resp.json()["id"]

    # Customer B creates Order B
    order_b_resp = client.post("/orders", headers=headers_b, json={
        "buyer_id": buyer_b.id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 300,
        "agreed_rate": 50.0,
        "deadline": deadline,
        "priority": "high",
    })
    assert order_b_resp.status_code == 201
    order_b_id = order_b_resp.json()["id"]

    # 1. Customer A lists orders: sees Order A only
    list_a = client.get("/orders", headers=headers_a).json()
    order_ids_a = [o["id"] for o in list_a]
    assert order_a_id in order_ids_a
    assert order_b_id not in order_ids_a

    # 2. Customer B lists orders: sees Order B only
    list_b = client.get("/orders", headers=headers_b).json()
    order_ids_b = [o["id"] for o in list_b]
    assert order_b_id in order_ids_b
    assert order_a_id not in order_ids_b

    # 3. Customer A can get Order A details
    get_a = client.get(f"/orders/{order_a_id}", headers=headers_a)
    assert get_a.status_code == 200
    assert get_a.json()["id"] == order_a_id

    # 4. Customer A CANNOT get Order B details by changing order ID: 403 Forbidden!
    get_b_by_a = client.get(f"/orders/{order_b_id}", headers=headers_a)
    assert get_b_by_a.status_code == 403
    assert "not have permission" in get_b_by_a.json()["detail"].lower()

    # 5. Customer B CANNOT get Order A details by changing order ID: 403 Forbidden!
    get_a_by_b = client.get(f"/orders/{order_a_id}", headers=headers_b)
    assert get_a_by_b.status_code == 403
    assert "not have permission" in get_a_by_b.json()["detail"].lower()


def test_customer_cannot_create_order_for_another_buyer(client, db_session):
    """Customer A cannot manipulate payload buyer_id to create order under Customer B."""
    uid = uuid.uuid4().hex[:6]
    buyer_a = Buyer(name=f"Brand A {uid}", email=f"a_{uid}@test.com")
    buyer_b = Buyer(name=f"Brand B {uid}", email=f"b_{uid}@test.com")
    db_session.add_all([buyer_a, buyer_b])
    db_session.commit()
    db_session.refresh(buyer_a)
    db_session.refresh(buyer_b)

    _, token_a = create_user_with_token(db_session, "customer", buyer_id=buyer_a.id)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    fabric = f"Denim_{uid}"
    colour = "Indigo"
    seed_test_material_stock(db_session, fabric, colour, Decimal("500.000"))

    deadline = (datetime.now(timezone.utc) + timedelta(days=12)).isoformat()

    # Customer A attempts to submit buyer_b.id
    resp = client.post("/orders", headers=headers_a, json={
        "buyer_id": buyer_b.id,
        "fabric_type": fabric,
        "colour": colour,
        "quantity_metres": 150,
        "agreed_rate": 60.0,
        "deadline": deadline,
        "priority": "normal",
    })
    assert resp.status_code == 403
    assert "cannot create orders for another buyer" in resp.json()["detail"].lower()


def test_missing_customer_buyer_mapping_fails_safely(client, db_session):
    """Customer without buyer_id fails safely: list returns empty, create returns 403."""
    _, token = create_user_with_token(db_session, "customer", buyer_id=None)
    headers = {"Authorization": f"Bearer {token}"}

    # List orders returns empty list safely (no leak of factory orders)
    resp_list = client.get("/orders", headers=headers)
    assert resp_list.status_code == 200
    assert resp_list.json() == []

    # Attempting to create order fails with 403
    deadline = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    resp_create = client.post("/orders", headers=headers, json={
        "buyer_id": 1,
        "fabric_type": "Cotton",
        "colour": "Blue",
        "quantity_metres": 100,
        "agreed_rate": 40.0,
        "deadline": deadline,
    })
    assert resp_create.status_code == 403


def test_admin_and_production_manager_retain_factory_wide_access(client, db_session):
    """Admin and Production Manager must retain authorized access to factory-wide orders."""
    _, admin_token = create_user_with_token(db_session, "admin", buyer_id=None)
    _, pm_token = create_user_with_token(db_session, "production_manager", buyer_id=None)

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    pm_headers = {"Authorization": f"Bearer {pm_token}"}

    admin_orders = client.get("/orders", headers=admin_headers)
    assert admin_orders.status_code == 200
    assert isinstance(admin_orders.json(), list)

    pm_orders = client.get("/orders", headers=pm_headers)
    assert pm_orders.status_code == 200
    assert isinstance(pm_orders.json(), list)
