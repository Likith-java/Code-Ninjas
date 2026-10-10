"""
Tests for Finished-Goods Dispatches, Quality Gates, Invoicing, and Dispatch Confirmation Idempotency.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.models import Buyer, Order, Operation, Machine, ProductionRun, FabricRoll


def test_dispatch_quality_gates_and_validation(client, db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # Directly create buyer, order, operation, machine, run in DB
    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="Blue",
        quantity_metres=Decimal("500.00"),
        agreed_rate=Decimal("120.00"),
        order_date=now,
        deadline=now + timedelta(days=20),
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(order_id=order.id, stage="weaving", sequence=1)
    db_session.add(op)
    db_session.flush()

    mach = Machine(machine_code=f"M-DSP-{uid}", machine_type="weaving", capacity_rate=Decimal("20.00"))
    db_session.add(mach)
    db_session.flush()

    op.eligible_machines.append(mach)
    db_session.flush()

    run = ProductionRun(
        order_id=order.id,
        operation_id=op.id,
        machine_id=mach.id,
        run_kind="actual",
        status="running",
    )
    db_session.add(run)
    db_session.commit()

    # Roll 1: Passed (100m)
    r1 = client.post("/rolls", json={"roll_code": f"R1-{uid}", "order_id": order.id, "production_run_id": run.id, "metres": 100.0}).json()
    client.post(f"/rolls/{r1['id']}/inspections", json={"result": "pass"})

    # Roll 2: Awaiting Inspection (80m)
    r2 = client.post("/rolls", json={"roll_code": f"R2-{uid}", "order_id": order.id, "production_run_id": run.id, "metres": 80.0}).json()

    # Roll 3: Rework (60m)
    r3 = client.post("/rolls", json={"roll_code": f"R3-{uid}", "order_id": order.id, "production_run_id": run.id, "metres": 60.0}).json()
    client.post(f"/rolls/{r3['id']}/inspections", json={"result": "rework"})

    # Roll 4: Rejected (50m)
    r4 = client.post("/rolls", json={"roll_code": f"R4-{uid}", "order_id": order.id, "production_run_id": run.id, "metres": 50.0}).json()
    client.post(f"/rolls/{r4['id']}/inspections", json={"result": "reject"})

    # 1. Quality gate rejection: Attempt to dispatch uninspected roll -> Expect 409
    bad_uninspected = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-BAD1-{uid}",
        "items": [{"roll_id": r2["id"], "metres": 80.0}],
    })
    assert bad_uninspected.status_code == 409
    assert "awaiting_inspection" in str(bad_uninspected.json()["detail"]).lower()

    # 2. Quality gate rejection: Attempt to dispatch rework roll -> Expect 409
    bad_rework = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-BAD2-{uid}",
        "items": [{"roll_id": r3["id"], "metres": 60.0}],
    })
    assert bad_rework.status_code == 409
    assert "rework" in str(bad_rework.json()["detail"]).lower()

    # 3. Quality gate rejection: Attempt to dispatch rejected roll -> Expect 409
    bad_reject = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-BAD3-{uid}",
        "items": [{"roll_id": r4["id"], "metres": 50.0}],
    })
    assert bad_reject.status_code == 409
    assert "rejected" in str(bad_reject.json()["detail"]).lower()

    # 4. Quantity rejection: Attempt to dispatch more than roll length -> Expect 409
    bad_len = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-BAD4-{uid}",
        "items": [{"roll_id": r1["id"], "metres": 150.0}],
    })
    assert bad_len.status_code == 409

    # 5. Valid dispatch with passed roll
    ok_disp = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-OK-{uid}",
        "vehicle": "KA-01-AB-1234",
        "items": [{"roll_id": r1["id"], "metres": 100.0}],
    })
    assert ok_disp.status_code == 201
    disp_data = ok_disp.json()
    assert disp_data["invoice_number"] == f"INV-OK-{uid}"
    assert float(disp_data["total_metres"]) == 100.0
    # Invoicing: 100m * 120.0 agreed_rate = 12,000.00
    assert float(disp_data["invoice_total"]) == 12000.0
    assert disp_data["confirmed"] is False


def test_dispatch_confirmation_idempotency(client, db_session):
    """
    Phase 3 Core Acceptance Criteria:
    - First confirmation performs state changes atomically and returns HTTP 200.
    - Repeated confirmation returns HTTP 200 with existing confirmed state instead of 409.
    - No duplicate stock deductions or side effects occur.
    """
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="Navy",
        quantity_metres=Decimal("200.00"),
        agreed_rate=Decimal("150.00"),
        order_date=now,
        deadline=now + timedelta(days=20),
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(order_id=order.id, stage="weaving", sequence=1)
    db_session.add(op)
    db_session.flush()

    mach = Machine(machine_code=f"M-IDEM-{uid}", machine_type="weaving", capacity_rate=Decimal("20.00"))
    db_session.add(mach)
    db_session.flush()

    op.eligible_machines.append(mach)
    db_session.flush()

    run = ProductionRun(
        order_id=order.id,
        operation_id=op.id,
        machine_id=mach.id,
        run_kind="actual",
        status="running",
    )
    db_session.add(run)
    db_session.commit()

    roll = client.post("/rolls", json={"roll_code": f"R-IDEM-{uid}", "order_id": order.id, "production_run_id": run.id, "metres": 200.0}).json()
    client.post(f"/rolls/{roll['id']}/inspections", json={"result": "pass"})

    disp = client.post("/dispatches", json={
        "order_id": order.id,
        "dispatch_date": now.isoformat(),
        "invoice_number": f"INV-IDEM-{uid}",
        "vehicle": "DL-01-9999",
        "items": [{"roll_id": roll["id"], "metres": 200.0}],
    }).json()
    dispatch_id = disp["id"]

    # 1. First confirmation -> Returns 200 OK
    resp1 = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["confirmed"] is True
    assert data1["confirmed_at"] is not None
    assert data1["invoice_number"] == f"INV-IDEM-{uid}"
    confirmed_timestamp = data1["confirmed_at"]

    # Roll status transitioned to 'dispatched'
    trace = client.get(f"/rolls/{roll['id']}/traceability").json()
    assert trace["status"] == "dispatched"

    # 2. Repeated confirmation -> Returns 200 OK with identical confirmed representation (NOT 409!)
    resp2 = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["confirmed"] is True
    assert data2["confirmed_at"] == confirmed_timestamp
    assert data2["invoice_number"] == f"INV-IDEM-{uid}"

    # Verify roll status is unchanged and still 'dispatched'
    trace2 = client.get(f"/rolls/{roll['id']}/traceability").json()
    assert trace2["status"] == "dispatched"

    # 3. Third repeat confirmation -> Still returns 200 OK idempotently
    resp3 = client.post(f"/dispatches/{dispatch_id}/confirm")
    assert resp3.status_code == 200
    assert resp3.json()["confirmed"] is True
