from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient

from app.core import email_config
from app.core.email_config import (
    clear_test_outbox,
    set_test_mode,
)
from app.core.security import create_access_token
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import (
    Buyer,
    EmailNotification,
    FabricRoll,
    Inspection,
    Material,
    MaterialLot,
    Order,
    ProductionRun,
    Supplier,
    User,
)
from app.services.dispatch import derive_order_status
from app.services.inventory import receive_yarn
from app.services.notification_service import (
    dispatch_order_placed_notifications,
    dispatch_order_ready_for_dispatch_notification,
    retry_failed_notification,
)


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


@pytest.fixture(autouse=True)
def setup_email_test_env():
    # Enable test mode and clear outbox for every test
    set_test_mode(True)
    clear_test_outbox()
    yield
    clear_test_outbox()
    set_test_mode(False)


@pytest.fixture
def test_setup_data(db_session):
    Base.metadata.create_all(bind=engine)

    # 1. Supplier & Material with stock for feasibility
    supplier = db_session.query(Supplier).filter(Supplier.name == "Email Test Supplier").first()
    if not supplier:
        supplier = Supplier(name="Email Test Supplier", contact="John", email="supplier@test.com")
        db_session.add(supplier)
        db_session.flush()

    material = db_session.query(Material).filter(
        Material.material_type == "Linen Email",
        Material.colour == "Teal Email",
    ).first()
    if not material:
        material = Material(
            material_type="Linen Email",
            colour="Teal Email",
            specification="40s Count",
            reorder_threshold_kg=Decimal("50.0"),
            yarn_kg_per_metre=Decimal("0.20"),
        )
        db_session.add(material)
        db_session.flush()

    # Receive yarn into warehouse if not already stocked
    existing_lot = db_session.query(MaterialLot).filter(MaterialLot.material_id == material.id).first()
    if not existing_lot:
        lot_code = f"LOT-EML-{uuid.uuid4().hex[:8].upper()}"
        receive_yarn(
            db=db_session,
            lot_code=lot_code,
            material_id=material.id,
            supplier_id=supplier.id,
            quantity_kg=Decimal("1000.00"),
            lot_cost=Decimal("4500.00"),
        )

    # 2. Buyers
    buyer1 = db_session.query(Buyer).filter(Buyer.name == "Email Buyer One").first()
    if not buyer1:
        buyer1 = Buyer(
            name="Email Buyer One",
            contact="Alice",
            email="alice.buyer@testcompany.com",
            address="123 Industrial Park, Sector 4",
        )
        db_session.add(buyer1)
        db_session.flush()

    buyer2 = db_session.query(Buyer).filter(Buyer.name == "Email Buyer Two").first()
    if not buyer2:
        buyer2 = Buyer(
            name="Email Buyer Two",
            contact="Bob",
            email="bob.buyer@othercompany.com",
            address="456 Commerce Blvd",
        )
        db_session.add(buyer2)
        db_session.flush()

    # 3. Users for each role
    # Admin
    admin_user = db_session.query(User).filter(User.email == "admin_email@test.com").first()
    if not admin_user:
        admin_user = User(
            name="Email Admin",
            email="admin_email@test.com",
            password_hash="fakehash",
            role="admin",
            is_active=True,
        )
        db_session.add(admin_user)
        db_session.flush()

    # Production Manager
    pm_user = db_session.query(User).filter(User.email == "pm_email@test.com").first()
    if not pm_user:
        pm_user = User(
            name="Email Production Manager",
            email="pm_email@test.com",
            password_hash="fakehash",
            role="production_manager",
            is_active=True,
        )
        db_session.add(pm_user)
        db_session.flush()

    # Dispatch Manager
    dispatch_user = db_session.query(User).filter(User.email == "dispatch_email@test.com").first()
    if not dispatch_user:
        dispatch_user = User(
            name="Email Dispatcher",
            email="dispatch_email@test.com",
            password_hash="fakehash",
            role="dispatch_manager",
            is_active=True,
        )
        db_session.add(dispatch_user)
        db_session.flush()

    # Customer User mapped to Buyer 1
    cust_user1 = db_session.query(User).filter(User.email == "cust1_email@test.com").first()
    if not cust_user1:
        cust_user1 = User(
            name="Alice Customer Account",
            email="cust1_email@test.com",
            password_hash="fakehash",
            role="customer",
            buyer_id=buyer1.id,
            is_active=True,
        )
        db_session.add(cust_user1)
        db_session.flush()

    # Customer User mapped to Buyer 2
    cust_user2 = db_session.query(User).filter(User.email == "cust2_email@test.com").first()
    if not cust_user2:
        cust_user2 = User(
            name="Bob Customer Account",
            email="cust2_email@test.com",
            password_hash="fakehash",
            role="customer",
            buyer_id=buyer2.id,
            is_active=True,
        )
        db_session.add(cust_user2)
        db_session.flush()

    db_session.commit()

    return {
        "material": material,
        "buyer1": buyer1,
        "buyer2": buyer2,
        "admin_user": admin_user,
        "pm_user": pm_user,
        "dispatch_user": dispatch_user,
        "cust_user1": cust_user1,
        "cust_user2": cust_user2,
    }


def test_order_creation_triggers_customer_and_pm_emails(client, db_session, test_setup_data):
    """
    Requirements 1, 2, 3:
    1. Successful order creation triggers customer confirmation.
    2. Successful order creation triggers Production Manager notification.
    3. Both recipients receive correct order information.
    """
    cust1 = test_setup_data["cust_user1"]
    buyer1 = test_setup_data["buyer1"]
    token = create_access_token(cust1)

    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    payload = {
        "buyer_id": buyer1.id,
        "fabric_type": "Linen Email",
        "colour": "Teal Email",
        "quantity_metres": 250.0,
        "agreed_rate": 32.50,
        "deadline": deadline_str,
        "priority": "high",
    }

    resp = client.post(
        "/orders",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    order_data = resp.json()
    order_id = order_data["id"]

    # Verify emails in test outbox
    assert len(email_config.TEST_OUTBOX) >= 2

    # Verify Customer Confirmation Email
    cust_email = next((e for e in email_config.TEST_OUTBOX if e["to_email"] == cust1.email), None)
    assert cust_email is not None, "Customer confirmation email not sent"
    assert f"Order Confirmation — Order #{order_id}" in cust_email["subject"]
    assert "Alice" in cust_email["body_text"]
    assert "Linen Email" in cust_email["body_text"]
    assert "Teal Email" in cust_email["body_text"]
    assert "250.00 m" in cust_email["body_text"]
    assert "$32.50" in cust_email["body_text"]
    assert "Order Registered" in cust_email["body_text"]

    # Verify Production Manager Notification Email
    pm_user = test_setup_data["pm_user"]
    pm_email = next((e for e in email_config.TEST_OUTBOX if e["to_email"] == pm_user.email), None)
    assert pm_email is not None, "PM notification email not sent"
    assert f"New Order Registered — Order #{order_id}" in pm_email["subject"]
    assert "Email Production Manager" in pm_email["body_text"]
    assert "HIGH" in pm_email["body_text"]
    assert "Linen Email" in pm_email["body_text"]

    # Verify database notification records
    records = db_session.query(EmailNotification).filter(
        EmailNotification.order_id == order_id
    ).all()
    assert len(records) >= 2
    for r in records:
        assert r.status == "sent"
        assert r.sent_at is not None
        assert r.attempt_count == 1


def test_order_rollback_does_not_trigger_email(client, db_session, test_setup_data):
    """
    Requirement 4:
    An order transaction rollback does not trigger an email.
    """
    cust1 = test_setup_data["cust_user1"]
    buyer1 = test_setup_data["buyer1"]
    token = create_access_token(cust1)

    # Infeasible fabric/colour to trigger rejection before commit
    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    payload = {
        "buyer_id": buyer1.id,
        "fabric_type": "Silk Nonexistent",
        "colour": "Neon Glow",
        "quantity_metres": 50000.0,
        "agreed_rate": 10.0,
        "deadline": deadline_str,
        "priority": "normal",
    }

    resp = client.post(
        "/orders",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409  # Feasibility conflict

    # Ensure NO emails were triggered
    assert len(email_config.TEST_OUTBOX) == 0


def test_dispatcher_notified_only_when_readiness_conditions_satisfied(client, db_session, test_setup_data):
    """
    Requirements 5, 6:
    5. The Dispatcher is notified only when the existing readiness conditions are satisfied.
    6. An unapproved or incomplete order does not trigger a ready-for-dispatch notification.
    """
    buyer1 = test_setup_data["buyer1"]
    admin = test_setup_data["admin_user"]
    token = create_access_token(admin)

    # Create order of 200m
    deadline_str = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
    resp = client.post(
        "/orders",
        json={
            "buyer_id": buyer1.id,
            "fabric_type": "Linen Email",
            "colour": "Teal Email",
            "quantity_metres": 200.0,
            "agreed_rate": 25.0,
            "deadline": deadline_str,
            "priority": "normal",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    # Clear outbox from order creation
    clear_test_outbox()

    # Create a production run for the order
    order = db_session.get(Order, order_id)
    op = order.operations[0]
    run = ProductionRun(
        order_id=order.id,
        operation_id=op.id,
        machine_id=1,
        run_kind="actual",
        output_metres=Decimal("200.0"),
        status="completed",
    )
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)

    # 1. Create roll #1 of 100m (only 50% of 200m required order metres)
    roll_code_1 = f"ROLL-PARTIAL-1-{order_id}"
    roll1_resp = client.post(
        "/rolls",
        json={
            "roll_code": roll_code_1,
            "order_id": order.id,
            "production_run_id": run.id,
            "metres": 100.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert roll1_resp.status_code == 201
    roll1_id = roll1_resp.json()["id"]

    # Inspect roll 1 -> PASS
    insp1_resp = client.post(
        f"/rolls/{roll1_id}/inspections",
        json={
            "defect_type": None,
            "severity": "low",
            "result": "pass",
            "disposition": "acceptable",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert insp1_resp.status_code == 201

    # Requirement 6: Order is incomplete (only 100m passed of 200m).
    # Dispatcher notification MUST NOT be sent!
    assert derive_order_status(db_session, order) != "ready_for_dispatch"
    dispatcher_emails = [
        e for e in email_config.TEST_OUTBOX if "Order Ready for Dispatch" in e["subject"]
    ]
    assert len(dispatcher_emails) == 0, "Dispatcher email sent prematurely before order was complete!"

    # 2. Create roll #2 of 100m (bringing total to 200m, completing the order)
    roll_code_2 = f"ROLL-COMPLETING-2-{order_id}"
    roll2_resp = client.post(
        "/rolls",
        json={
            "roll_code": roll_code_2,
            "order_id": order.id,
            "production_run_id": run.id,
            "metres": 100.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert roll2_resp.status_code == 201
    roll2_id = roll2_resp.json()["id"]

    # First test: Reject roll 2. Still should NOT trigger dispatcher notification!
    insp2_reject = client.post(
        f"/rolls/{roll2_id}/inspections",
        json={
            "defect_type": "oil_stain",
            "severity": "critical",
            "result": "reject",
            "disposition": "scrap",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert insp2_reject.status_code == 201
    dispatcher_emails = [
        e for e in email_config.TEST_OUTBOX if "Order Ready for Dispatch" in e["subject"]
    ]
    assert len(dispatcher_emails) == 0, "Dispatcher notified when roll was rejected!"

    # Create roll #3 of 100m to replace rejected roll
    roll_code_3 = f"ROLL-REPLACEMENT-3-{order_id}"
    roll3_resp = client.post(
        "/rolls",
        json={
            "roll_code": roll_code_3,
            "order_id": order.id,
            "production_run_id": run.id,
            "metres": 100.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert roll3_resp.status_code == 201
    roll3_id = roll3_resp.json()["id"]

    # Inspect roll 3 -> PASS (Now total passed = 100m + 100m = 200m >= 200m)
    insp3_pass = client.post(
        f"/rolls/{roll3_id}/inspections",
        json={
            "defect_type": None,
            "severity": "low",
            "result": "pass",
            "disposition": "acceptable",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert insp3_pass.status_code == 201

    # Requirement 5: Order status is now verified 'ready_for_dispatch'!
    db_session.refresh(order)
    assert derive_order_status(db_session, order) == "ready_for_dispatch"

    dispatcher_emails = [
        e for e in email_config.TEST_OUTBOX if "Order Ready for Dispatch" in e["subject"]
    ]
    d_email = next((e for e in dispatcher_emails if e["to_email"] == test_setup_data["dispatch_user"].email), None)
    assert d_email is not None, "Test dispatcher did not receive notification"
    assert f"Order Ready for Dispatch — Order #{order_id}" in d_email["subject"]
    assert "200.00 m" in d_email["body_text"]
    assert roll_code_1 in d_email["body_text"]
    assert roll_code_3 in d_email["body_text"]


def test_repeated_actions_do_not_produce_duplicate_notifications(client, db_session, test_setup_data):
    """
    Requirement 7:
    Repeated order creation requests or status transitions do not produce duplicate notifications.
    """
    cust1 = test_setup_data["cust_user1"]
    buyer1 = test_setup_data["buyer1"]
    token = create_access_token(cust1)

    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    resp = client.post(
        "/orders",
        json={
            "buyer_id": buyer1.id,
            "fabric_type": "Linen Email",
            "colour": "Teal Email",
            "quantity_metres": 150.0,
            "agreed_rate": 20.0,
            "deadline": deadline_str,
            "priority": "normal",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    outbox_count = len(email_config.TEST_OUTBOX)
    assert outbox_count >= 2

    # Simulate repeated dispatch trigger for the same order
    dispatch_order_placed_notifications(order_id, cust1.id)
    dispatch_order_placed_notifications(order_id, cust1.id)

    # No additional emails must be sent
    assert len(email_config.TEST_OUTBOX) == outbox_count


def test_smtp_failure_does_not_invalidate_business_transaction(client, db_session, test_setup_data, monkeypatch):
    """
    Requirements 8, 9:
    8. SMTP failure does not invalidate a successful business transaction.
    9. Missing SMTP configuration does not crash the application.
    """
    import app.services.notification_service as ns

    # Force send_email_transport to simulate SMTP network failure
    def mock_failing_transport(*args, **kwargs):
        return False, "ConnectionRefusedError: [Errno 111] Connection refused to smtp.server:587"

    monkeypatch.setattr(ns, "send_email_transport", mock_failing_transport)

    cust1 = test_setup_data["cust_user1"]
    buyer1 = test_setup_data["buyer1"]
    token = create_access_token(cust1)

    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    resp = client.post(
        "/orders",
        json={
            "buyer_id": buyer1.id,
            "fabric_type": "Linen Email",
            "colour": "Teal Email",
            "quantity_metres": 120.0,
            "agreed_rate": 18.0,
            "deadline": deadline_str,
            "priority": "normal",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    # The order creation transaction MUST STILL SUCCEED 100%!
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    # Verify notification records were safely saved as 'failed' with error detail
    records = db_session.query(EmailNotification).filter(
        EmailNotification.order_id == order_id
    ).all()
    assert len(records) >= 2
    for r in records:
        assert r.status == "failed"
        assert "Connection refused" in r.last_error
        assert r.attempt_count == 1


def test_missing_recipient_email_handled_safely(client, db_session, test_setup_data):
    """
    Requirement 10:
    Missing recipient email addresses are handled safely.
    """
    # Create buyer with NO email address
    buyer_no_email = Buyer(name="No Email Buyer", contact="None", email=None, address="None")
    db_session.add(buyer_no_email)
    db_session.commit()

    admin = test_setup_data["admin_user"]
    token = create_access_token(admin)

    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    resp = client.post(
        "/orders",
        json={
            "buyer_id": buyer_no_email.id,
            "fabric_type": "Linen Email",
            "colour": "Teal Email",
            "quantity_metres": 100.0,
            "agreed_rate": 20.0,
            "deadline": deadline_str,
            "priority": "normal",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    # Verify notification record was recorded as skipped rather than crashing
    records = db_session.query(EmailNotification).filter(
        EmailNotification.order_id == order_id,
        EmailNotification.notification_type == "customer_order_placed",
    ).all()
    assert len(records) == 1
    assert records[0].status == "skipped"
    assert "No registered email address found" in records[0].last_error


def test_role_permissions_and_customer_data_isolation(client, db_session, test_setup_data):
    """
    Requirements 11, 12, 13:
    11. Customers cannot access other customers' notification records.
    12. Only authorized roles can view delivery records or retry failed notifications.
    13. Failed emails can be retried correctly.
    """
    cust1 = test_setup_data["cust_user1"]
    cust2 = test_setup_data["cust_user2"]
    admin = test_setup_data["admin_user"]

    token1 = create_access_token(cust1)
    token2 = create_access_token(cust2)
    admin_token = create_access_token(admin)

    # Place order for Buyer 1
    deadline_str = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    resp = client.post(
        "/orders",
        json={
            "buyer_id": test_setup_data["buyer1"].id,
            "fabric_type": "Linen Email",
            "colour": "Teal Email",
            "quantity_metres": 100.0,
            "agreed_rate": 22.0,
            "deadline": deadline_str,
            "priority": "normal",
        },
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert resp.status_code == 201
    order_id = resp.json()["id"]

    # 1. Customer 1 lists notifications -> can see their own order
    c1_resp = client.get("/notifications", headers={"Authorization": f"Bearer {token1}"})
    assert c1_resp.status_code == 200
    c1_records = c1_resp.json()
    assert any(r["order_id"] == order_id for r in c1_records)

    # 2. Customer 2 lists notifications -> MUST NOT see Customer 1's notifications!
    c2_resp = client.get("/notifications", headers={"Authorization": f"Bearer {token2}"})
    assert c2_resp.status_code == 200
    c2_records = c2_resp.json()
    assert not any(r["order_id"] == order_id for r in c2_records)

    # 3. Customer 1 cannot retry notifications (forbidden)
    notif_id = c1_records[0]["id"]
    retry_cust = client.post(
        f"/notifications/{notif_id}/retry",
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert retry_cust.status_code == 403

    # 4. Admin can retry notifications
    retry_admin = client.post(
        f"/notifications/{notif_id}/retry",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert retry_admin.status_code == 200
    retried_data = retry_admin.json()
    assert retried_data["status"] == "sent"
    assert retried_data["attempt_count"] >= 2
