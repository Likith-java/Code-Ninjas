from datetime import datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Material, MaterialLot, Order, Supplier, User, Buyer
from app.services.inventory import receive_yarn


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def setup_qr_inventory(db_session):
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    # 1. Ensure supplier exists
    supplier = db_session.query(Supplier).filter(Supplier.name == "QR Test Supplier").first()
    if not supplier:
        supplier = Supplier(
            name="QR Test Supplier",
            contact="Suresh QR",
            email="suresh_qr@test.com",
        )
        db_session.add(supplier)
        db_session.flush()

    # 2. Ensure material exists
    material = db_session.query(Material).filter(
        Material.material_type == "Cotton QR",
        Material.colour == "Amber QR",
    ).first()
    if not material:
        material = Material(
            material_type="Cotton QR",
            colour="Amber QR",
            specification="30s Ring Spun Combed",
            reorder_threshold_kg=Decimal("100.0"),
            yarn_kg_per_metre=Decimal("0.15"),
        )
        db_session.add(material)
        db_session.flush()

    # 3. Ensure buyer & order exist for testing issues
    buyer = db_session.query(Buyer).filter(Buyer.name == "QR Buyer").first()
    if not buyer:
        buyer = Buyer(name="QR Buyer", email="buyer_qr@test.com")
        db_session.add(buyer)
        db_session.flush()

    from datetime import timedelta
    order = db_session.query(Order).filter(
        Order.buyer_id == buyer.id,
        Order.fabric_type == "Cotton QR",
        Order.colour == "Amber QR",
    ).first()
    if not order:
        order = Order(
            buyer_id=buyer.id,
            fabric_type="Cotton QR",
            colour="Amber QR",
            quantity_metres=Decimal("200.0"),
            agreed_rate=Decimal("150.0"),
            order_date=datetime.now(timezone.utc),
            deadline=datetime.now(timezone.utc) + timedelta(days=30),
            priority="normal",
        )
        db_session.add(order)
        db_session.flush()

    # 4. Create an isolated test lot
    import uuid
    lot_code = f"LOT-QR-{uuid.uuid4().hex[:6]}"
    receipt = receive_yarn(
        db_session,
        lot_code=lot_code,
        material_id=material.id,
        supplier_id=supplier.id,
        quantity_kg=Decimal("250.0"),
        lot_cost=Decimal("75000.0"),
        intended_order_id=None,
        note="Initial lot for QR automated testing",
    )
    lot = db_session.query(MaterialLot).filter(MaterialLot.id == receipt.lot_id).first()

    # 5. Ensure user accounts for auth checks
    admin_user = db_session.query(User).filter(User.email == "admin_qr_test@test.com").first()
    if not admin_user:
        admin_user = User(
            email="admin_qr_test@test.com",
            name="Admin QR",
            password_hash="fakehash",
            role="admin",
        )
        db_session.add(admin_user)

    pm_user = db_session.query(User).filter(User.email == "pm_qr_test@test.com").first()
    if not pm_user:
        pm_user = User(
            email="pm_qr_test@test.com",
            name="PM QR",
            password_hash="fakehash",
            role="production_manager",
        )
        db_session.add(pm_user)

    customer_user = db_session.query(User).filter(User.email == "customer_qr_test@test.com").first()
    if not customer_user:
        customer_user = User(
            email="customer_qr_test@test.com",
            name="Customer QR",
            password_hash="fakehash",
            role="customer",
            buyer_id=buyer.id,
        )
        db_session.add(customer_user)

    db_session.commit()
    return {
        "supplier": supplier,
        "material": material,
        "buyer": buyer,
        "order": order,
        "lot": lot,
        "admin_user": admin_user,
        "pm_user": pm_user,
        "customer_user": customer_user,
    }


def test_qr_code_generation_valid_png(client, setup_qr_inventory):
    lot = setup_qr_inventory["lot"]

    # Request QR endpoint
    res = client.get(f"/inventory/lots/{lot.id}/qr")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert len(res.content) > 100
    # PNG signature check (first 8 bytes)
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Test download parameter
    res_dl = client.get(f"/inventory/lots/{lot.id}/qr?download=true")
    assert res_dl.status_code == 200
    assert "attachment" in res_dl.headers.get("content-disposition", "")


def test_qr_generation_unknown_lot_404(client):
    res = client.get("/inventory/lots/999999/qr")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_lot_details_live_balance_and_scan_resolution(client, setup_qr_inventory):
    lot = setup_qr_inventory["lot"]
    admin = setup_qr_inventory["admin_user"]
    token = create_access_token(admin)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get details by integer ID
    res = client.get(f"/inventory/lots/{lot.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["lot_id"] == lot.id
    assert data["lot_code"] == lot.lot_code
    assert data["material_type"] == "Cotton QR"
    assert data["colour"] == "Amber QR"
    assert float(data["available_kg"]) == 250.0
    assert data["quality_status"] == "Released"
    assert len(data["movements"]) >= 1

    # 2. Resolve via scan endpoint with qr_token
    assert lot.qr_token is not None
    res_scan_token = client.get(f"/inventory/lots/scan/{lot.qr_token}", headers=headers)
    assert res_scan_token.status_code == 200
    assert res_scan_token.json()["lot_id"] == lot.id

    # 3. Resolve via scan endpoint with URL path
    encoded_path = f"/inventory/lots/{lot.id}?token={lot.qr_token}"
    res_scan_url = client.post(
        "/inventory/lots/scan",
        headers=headers,
        json={"query": encoded_path},
    )
    assert res_scan_url.status_code == 200
    assert res_scan_url.json()["lot_id"] == lot.id


def test_customer_role_forbidden_from_raw_yarn_and_issues(client, setup_qr_inventory):
    lot = setup_qr_inventory["lot"]
    order = setup_qr_inventory["order"]
    customer = setup_qr_inventory["customer_user"]
    token = create_access_token(customer)
    headers = {"Authorization": f"Bearer {token}"}

    # Customer cannot view lot details
    res_detail = client.get(f"/inventory/lots/{lot.id}", headers=headers)
    assert res_detail.status_code == 403

    # Customer cannot scan lot
    res_scan = client.get(f"/inventory/lots/scan/{lot.qr_token}", headers=headers)
    assert res_scan.status_code == 403

    # Customer cannot issue yarn
    res_issue = client.post(
        "/inventory/issues",
        headers=headers,
        json={
            "lot_id": lot.id,
            "order_id": order.id,
            "quantity_kg": 20.0,
            "note": "Customer trying to issue",
        },
    )
    assert res_issue.status_code == 403


def test_yarn_issue_workflow_validation_and_stock_deduction(client, setup_qr_inventory):
    lot = setup_qr_inventory["lot"]
    order = setup_qr_inventory["order"]
    pm = setup_qr_inventory["pm_user"]
    token = create_access_token(pm)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Invalid non-positive quantity rejected with 422
    res_zero = client.post(
        "/inventory/issues",
        headers=headers,
        json={"lot_id": lot.id, "order_id": order.id, "quantity_kg": 0.0},
    )
    assert res_zero.status_code == 422

    res_neg = client.post(
        "/inventory/issues",
        headers=headers,
        json={"lot_id": lot.id, "order_id": order.id, "quantity_kg": -10.0},
    )
    assert res_neg.status_code == 422

    # 2. Insufficient stock rejected with 409
    res_excess = client.post(
        "/inventory/issues",
        headers=headers,
        json={"lot_id": lot.id, "order_id": order.id, "quantity_kg": 99999.0},
    )
    assert res_excess.status_code == 409
    assert "insufficient" in str(res_excess.json()).lower()

    # 3. Successful valid issue
    initial_balance = float(client.get(f"/inventory/lots/{lot.id}", headers=headers).json()["available_kg"])
    issue_qty = 30.0

    res_valid = client.post(
        "/inventory/issues",
        headers=headers,
        json={
            "lot_id": lot.id,
            "order_id": order.id,
            "quantity_kg": issue_qty,
            "note": "QR scanner test issue",
        },
    )
    assert res_valid.status_code == 201

    # 4. Verify updated stock in lot details
    updated_detail = client.get(f"/inventory/lots/{lot.id}", headers=headers).json()
    new_balance = float(updated_detail["available_kg"])
    assert round(new_balance, 2) == round(initial_balance - issue_qty, 2)

    # 5. Verify movement appears in lot movement history
    assert any(float(m["quantity_kg"]) == issue_qty for m in updated_detail["movements"])
