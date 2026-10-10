"""
Tests for Fabric Rolls, Quality Inspection Outcomes, Terminal Rejection, and Traceability Chains.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.models import Buyer, Order, Operation, Machine, ProductionRun


def test_fabric_roll_creation_and_traceability(client, db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # Directly create buyer, order, operation, machine, and run
    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="Grey",
        quantity_metres=Decimal("300.00"),
        agreed_rate=Decimal("90.00"),
        order_date=now,
        deadline=now + timedelta(days=10),
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(
        order_id=order.id,
        stage="weaving",
        sequence=1,
    )
    db_session.add(op)
    db_session.flush()

    mach = Machine(
        machine_code=f"WEAV-R-{uid}",
        machine_type="weaving",
        capacity_rate=Decimal("25.00"),
    )
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
        start_time=now,
    )
    db_session.add(run)
    db_session.commit()

    # 1. Create Fabric Roll
    roll_code = f"ROLL-{uid}-001"
    r_resp = client.post("/rolls", json={
        "roll_code": roll_code,
        "order_id": order.id,
        "production_run_id": run.id,
        "metres": 150.0,
    })
    assert r_resp.status_code == 201
    roll = r_resp.json()
    assert roll["status"] == "awaiting_inspection"
    assert roll["roll_code"] == roll_code
    roll_id = roll["id"]

    # 2. Duplicate roll code -> Expect 409
    dup_r = client.post("/rolls", json={
        "roll_code": roll_code,
        "order_id": order.id,
        "production_run_id": run.id,
        "metres": 100.0,
    })
    assert dup_r.status_code == 409

    # 3. Check initial traceability
    t_resp = client.get(f"/rolls/{roll_id}/traceability")
    assert t_resp.status_code == 200
    trace = t_resp.json()
    assert trace["roll_id"] == roll_id
    assert trace["status"] == "awaiting_inspection"
    assert trace["is_dispatch_eligible"] is False
    assert len(trace["inspections"]) == 0

    # 4. Rework inspection
    insp1 = client.post(f"/rolls/{roll_id}/inspections", json={
        "result": "rework",
        "defect_type": "Tension variation",
        "severity": "medium",
        "disposition": "Re-tension warp and inspect again",
    })
    assert insp1.status_code == 201

    # Status updated to rework
    t_resp2 = client.get(f"/rolls/{roll_id}/traceability")
    assert t_resp2.json()["status"] == "rework"
    assert t_resp2.json()["is_dispatch_eligible"] is False

    # 5. Passing inspection after rework
    insp2 = client.post(f"/rolls/{roll_id}/inspections", json={
        "result": "pass",
        "disposition": "Passed after tension correction",
    })
    assert insp2.status_code == 201

    # Status updated to passed and eligible for dispatch
    t_resp3 = client.get(f"/rolls/{roll_id}/traceability")
    assert t_resp3.json()["status"] == "passed"
    assert t_resp3.json()["is_dispatch_eligible"] is True
    assert len(t_resp3.json()["inspections"]) == 2


def test_terminal_rejection_lock(client, db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="Red",
        quantity_metres=Decimal("200.00"),
        agreed_rate=Decimal("80.00"),
        order_date=now,
        deadline=now + timedelta(days=10),
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(order_id=order.id, stage="weaving", sequence=1)
    db_session.add(op)
    db_session.flush()

    mach = Machine(machine_code=f"M-{uid}", machine_type="weaving", capacity_rate=Decimal("20.00"))
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

    roll = client.post("/rolls", json={
        "roll_code": f"REJ-ROLL-{uid}",
        "order_id": order.id,
        "production_run_id": run.id,
        "metres": 80.0,
    }).json()
    roll_id = roll["id"]

    # 1. Reject roll
    rej_resp = client.post(f"/rolls/{roll_id}/inspections", json={
        "result": "reject",
        "defect_type": "Oil contamination",
        "severity": "critical",
        "disposition": "Permanent stain, unrecoverable",
    })
    assert rej_resp.status_code == 201

    # 2. Attempting subsequent inspection on rejected roll must return 409
    sub_resp = client.post(f"/rolls/{roll_id}/inspections", json={
        "result": "pass",
        "disposition": "Attempting unauthorized override",
    })
    assert sub_resp.status_code == 409
    assert "rejected" in str(sub_resp.json()["detail"]).lower()
