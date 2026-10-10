"""
Tests for Member 1 CP-SAT Scheduler Output Integration Adapter.
"""

from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest

from app.models import Buyer, Order, Operation, Machine, ProductionRun, operation_eligible_machines
from app.services.scheduler_adapter import import_scheduler_output


def test_scheduler_adapter_success_and_idempotency(db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # 1. Setup DB records: Buyer, Order, Operation, Machine, Eligibility
    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Cotton",
        colour="Navy",
        quantity_metres=Decimal("600.00"),
        agreed_rate=Decimal("150.00"),
        order_date=now,
        deadline=now + timedelta(days=20),
        priority="normal",
    )
    db_session.add(order)
    db_session.flush()

    op = Operation(
        order_id=order.id,
        stage="weaving",
        sequence=1,
        planned_duration_minutes=240,
    )
    db_session.add(op)
    db_session.flush()

    mach_code = f"WEAV-SCHED-{uid}"
    mach = Machine(
        machine_code=mach_code,
        machine_type="weaving",
        capacity_rate=Decimal("25.00"),
        state="idle",
    )
    db_session.add(mach)
    db_session.flush()

    # Map eligibility
    op.eligible_machines.append(mach)
    db_session.commit()

    # 2. Member 1 standard scheduler output JSON payload
    schedule_data = {
        "status": "OPTIMAL",
        "validation_status": "valid",
        "solve_time_seconds": 0.42,
        "objective_value": 120.0,
        "schedule": [
            {
                "order_id": order.id,
                "operation_id": op.id,
                "machine_code": mach_code,
                "stage": "weaving",
                "start_minute": 60,
                "end_minute": 300,
            }
        ]
    }

    # 3. Import schedule into backend
    base_time = now
    result = import_scheduler_output(db_session, schedule_data, base_time=base_time)
    assert result["runs_created"] == 1
    assert result["runs_updated"] == 0
    assert result["total_scheduled"] == 1

    # Verify created production run
    run = db_session.query(ProductionRun).filter_by(order_id=order.id, operation_id=op.id).first()
    assert run is not None
    assert run.run_kind == "scheduled"
    assert run.status == "planned"
    assert run.machine_id == mach.id
    assert run.output_metres is None or run.output_metres == 0
    run_start = run.start_time if run.start_time.tzinfo else run.start_time.replace(tzinfo=timezone.utc)
    run_end = run.end_time if run.end_time.tzinfo else run.end_time.replace(tzinfo=timezone.utc)
    assert run_start == base_time + timedelta(minutes=60)
    assert run_end == base_time + timedelta(minutes=300)

    # 4. Re-importing identical schedule must be idempotent (update/preserve, 0 duplicates)
    result_repeat = import_scheduler_output(db_session, schedule_data, base_time=base_time)
    assert result_repeat["runs_created"] == 0
    assert result_repeat["runs_updated"] == 1

    total_runs = db_session.query(ProductionRun).filter_by(order_id=order.id, operation_id=op.id).count()
    assert total_runs == 1


def test_scheduler_adapter_infeasible_and_ineligible_rejections(db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    # 1. Infeasible solver status must be rejected
    infeasible_schedule = {
        "status": "INFEASIBLE",
        "validation_status": "invalid",
        "schedule": []
    }
    with pytest.raises(ValueError, match="solver status"):
        import_scheduler_output(db_session, infeasible_schedule)

    # 2. Setup buyer, order, operation, machine without eligibility
    buyer = Buyer(name=f"Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Silk",
        colour="Red",
        quantity_metres=Decimal("300.00"),
        agreed_rate=Decimal("200.00"),
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

    mach_code = f"SPIN-INEL-{uid}"
    mach = Machine(
        machine_code=mach_code,
        machine_type="spinning",
        capacity_rate=Decimal("40.00"),
        state="idle",
    )
    db_session.add(mach)
    db_session.commit()

    # Schedule assigning weaving operation to an ineligible machine
    bad_assignment = {
        "status": "FEASIBLE",
        "validation_status": "valid",
        "schedule": [
            {
                "order_id": order.id,
                "operation_id": op.id,
                "machine_code": mach_code,
                "stage": "weaving",
                "start_minute": 0,
                "end_minute": 120,
            }
        ]
    }
    with pytest.raises(ValueError, match="not eligible"):
        import_scheduler_output(db_session, bad_assignment)


def test_scheduler_import_api_endpoint(client, db_session):
    uid = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)

    buyer = Buyer(name=f"API Buyer {uid}")
    db_session.add(buyer)
    db_session.flush()

    order = Order(
        buyer_id=buyer.id,
        fabric_type="Linen",
        colour="White",
        quantity_metres=Decimal("500.00"),
        agreed_rate=Decimal("120.00"),
        order_date=now,
        deadline=now + timedelta(days=15),
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
        machine_code=f"WEAV-API-{uid}",
        machine_type="weaving",
        capacity_rate=Decimal("30.00"),
        state="idle",
    )
    db_session.add(mach)
    db_session.flush()

    op.eligible_machines.append(mach)
    db_session.commit()

    valid_payload = {
        "status": "OPTIMAL",
        "validation_status": "valid",
        "schedule": [
            {
                "order_id": order.id,
                "operation_id": op.id,
                "machine_code": mach.machine_code,
                "stage": "weaving",
                "start_minute": 0,
                "end_minute": 180,
            }
        ]
    }

    res = client.post("/production-runs/import-schedule", json=valid_payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    assert data["runs_created"] == 1
    assert data["total_scheduled"] == 1

    # Infeasible payload should return 422
    bad_payload = {"status": "INFEASIBLE", "schedule": []}
    res_bad = client.post("/production-runs/import-schedule", json=bad_payload)
    assert res_bad.status_code == 422

