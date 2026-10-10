"""
Tests for Machines, Machine Eligibility, Downtimes (overlap prevention), and Production Run Lifecycles.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.models import Buyer, Order, Operation, Machine


def test_machine_crud_and_validation(client):
    uid = uuid.uuid4().hex[:6]
    # 1. Create Machine
    code = f"WEAV-{uid}"
    m_resp = client.post("/machines", json={
        "machine_code": code,
        "machine_type": "weaving",
        "capacity_rate": 35.0,
        "state": "idle",
    })
    assert m_resp.status_code == 201
    machine = m_resp.json()
    assert machine["machine_code"] == code
    machine_id = machine["id"]

    # 2. Duplicate machine code returns 409
    dup_resp = client.post("/machines", json={
        "machine_code": code,
        "machine_type": "spinning",
        "capacity_rate": 20.0,
    })
    assert dup_resp.status_code == 409

    # 3. Invalid machine type returns 422
    bad_type = client.post("/machines", json={
        "machine_code": f"BAD-{uid}",
        "machine_type": "knitting_invalid",
        "capacity_rate": 20.0,
    })
    assert bad_type.status_code == 422

    # 4. Filter machines
    filt_resp = client.get("/machines?machine_type=weaving")
    assert filt_resp.status_code == 200
    assert any(m["id"] == machine_id for m in filt_resp.json())


def test_downtime_overlap_validation(client):
    uid = uuid.uuid4().hex[:6]
    mach = client.post("/machines", json={
        "machine_code": f"SPIN-DT-{uid}",
        "machine_type": "spinning",
        "capacity_rate": 40.0,
        "state": "idle",
    }).json()
    mach_id = mach["id"]

    now = datetime.now(timezone.utc)
    t1 = now + timedelta(hours=10)
    t2 = now + timedelta(hours=20)

    # 1. Create valid downtime interval [t1, t2]
    dt1 = client.post("/downtimes", json={
        "machine_id": mach_id,
        "start_time": t1.isoformat(),
        "end_time": t2.isoformat(),
        "reason": "Scheduled bearing maintenance",
    })
    assert dt1.status_code == 201

    # 2. Overlapping downtime: starts inside interval [t1 + 2h, t2 + 2h] -> Expect 409
    dt_overlap1 = client.post("/downtimes", json={
        "machine_id": mach_id,
        "start_time": (t1 + timedelta(hours=2)).isoformat(),
        "end_time": (t2 + timedelta(hours=2)).isoformat(),
        "reason": "Overlapping window",
    })
    assert dt_overlap1.status_code == 409

    # 3. Non-overlapping downtime: starts after t2 -> Expect 201
    t3 = t2 + timedelta(hours=5)
    t4 = t3 + timedelta(hours=5)
    dt2 = client.post("/downtimes", json={
        "machine_id": mach_id,
        "start_time": t3.isoformat(),
        "end_time": t4.isoformat(),
        "reason": "Secondary window",
    })
    assert dt2.status_code == 201


def test_production_run_lifecycle_and_eligibility(client, db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # Directly create buyer, order, and operations in DB session
    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="White",
        quantity_metres=Decimal("500.00"),
        agreed_rate=Decimal("100.00"),
        order_date=now,
        deadline=now + timedelta(days=15),
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(
        order_id=order.id,
        stage="weaving",
        sequence=1,
        planned_duration_minutes=180,
    )
    db_session.add(op)
    db_session.flush()

    # Create weaving machine (eligible) and spinning machine (ineligible)
    weav_mach = Machine(
        machine_code=f"WEAV-OK-{uid}",
        machine_type="weaving",
        capacity_rate=Decimal("30.00"),
        state="idle",
    )
    spin_mach = Machine(
        machine_code=f"SPIN-NO-{uid}",
        machine_type="spinning",
        capacity_rate=Decimal("45.00"),
        state="idle",
    )
    db_session.add_all([weav_mach, spin_mach])
    db_session.flush()

    # Map only weav_mach to operation eligibility
    op.eligible_machines.append(weav_mach)
    db_session.commit()

    # 1. Attempt to create run on ineligible spinning machine -> Expect 409
    bad_run = client.post("/production-runs", json={
        "order_id": order.id,
        "operation_id": op.id,
        "machine_id": spin_mach.id,
        "run_kind": "actual",
    })
    assert bad_run.status_code == 409
    assert "eligible" in str(bad_run.json()["detail"]).lower()

    # 2. Create valid planned run on eligible weaving machine
    run_resp = client.post("/production-runs", json={
        "order_id": order.id,
        "operation_id": op.id,
        "machine_id": weav_mach.id,
        "run_kind": "actual",
    })
    assert run_resp.status_code == 201
    run = run_resp.json()
    assert run["status"] == "planned"
    run_id = run["id"]

    # 3. Transition: planned -> running
    start_resp = client.patch(f"/production-runs/{run_id}", json={"status": "running"})
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "running"

    # 4. Transition: running -> completed
    comp_resp = client.patch(f"/production-runs/{run_id}", json={
        "status": "completed",
        "output_metres": 510.0,
    })
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["status"] == "completed"
    assert float(comp_data["output_metres"]) == 510.0

    # 5. Invalid transition: attempting to transition terminal completed run back to running -> Expect 409
    restart_resp = client.patch(f"/production-runs/{run_id}", json={"status": "running"})
    assert restart_resp.status_code == 409
    assert "terminal" in str(restart_resp.json()["detail"]).lower()
