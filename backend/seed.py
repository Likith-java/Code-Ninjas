"""
Comprehensive, deterministic synthetic seed data for Textile Manufacturing Intelligence Platform.

Generates realistic factory demonstration data:
- 5 Buyers
- 3 Suppliers
- 5 Yarn Materials (compatible and incompatible options)
- 8 Yarn Lots (sufficient and insufficient stock scenarios)
- 12 Orders (various fabrics, colours, quantities, priorities, deadlines)
- Operations & Machine Eligibility Mappings
- 10 Machines (3 Spinning, 5 Weaving, 2 Dyeing)
- Downtimes (maintenance & breakdown windows)
- Production Runs (planned, in_progress, completed)
- Fabric Rolls (awaiting_inspection, passed, rework, rejected, dispatched)
- Quality Inspection history with defect classifications
- Finished-Goods Dispatches (draft and confirmed with invoice reconciliation)

Idempotent: Re-running does not create duplicates.
Safe: Does not wipe existing data by default unless --reset is explicitly passed.
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import select, delete
from app.database import SessionLocal, engine, Base
from app.models import (
    Buyer,
    Order,
    Supplier,
    Material,
    MaterialLot,
    InventoryMovement,
    Machine,
    Operation,
    ProductionRun,
    Downtime,
    FabricRoll,
    Inspection,
    Dispatch,
    DispatchItem,
    operation_eligible_machines,
)


def seed(reset: bool = False):
    print("=" * 60)
    print("SEEDING TEXTILE MANUFACTURING INTELLIGENCE PLATFORM")
    print("=" * 60)

    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        if reset:
            print("WARNING: --reset specified. Clearing Member 2 data tables...")
            db.execute(delete(DispatchItem))
            db.execute(delete(Dispatch))
            db.execute(delete(Inspection))
            db.execute(delete(FabricRoll))
            db.execute(delete(ProductionRun))
            db.execute(delete(Downtime))
            db.execute(delete(operation_eligible_machines))
            db.execute(delete(Operation))
            db.execute(delete(Machine))
            db.execute(delete(InventoryMovement))
            db.execute(delete(MaterialLot))
            db.execute(delete(Material))
            db.execute(delete(Supplier))
            db.execute(delete(Order))
            db.execute(delete(Buyer))
            db.commit()
            print("Reset complete.")

        # -------------------------------------------------------------
        # 1. BUYERS (5 Buyers)
        # -------------------------------------------------------------
        print("\n1. Seeding Buyers...")
        buyers_data = [
            {
                "name": "Nordic Apparels AB",
                "contact": "Elin Larsson",
                "email": "procurement@nordicapparels.se",
                "address": "Hamngatan 14, Gothenburg, Sweden",
            },
            {
                "name": "Milan Couture SpA",
                "contact": "Matteo Rossi",
                "email": "m.rossi@milancouture.it",
                "address": "Via Montenapoleone 8, Milan, Italy",
            },
            {
                "name": "Beacon Garments Ltd",
                "contact": "Sarah Jenkins",
                "email": "orders@beacongarments.co.uk",
                "address": "45 Regent Street, Leeds, United Kingdom",
            },
            {
                "name": "Zenith Fashion Corp",
                "contact": "David Zhao",
                "email": "d.zhao@zenithfashion.com",
                "address": "782 Fashion District, New York, NY, USA",
            },
            {
                "name": "Kyoto Weave Co",
                "contact": "Kenji Sato",
                "email": "sato@kyotoweave.jp",
                "address": "12-4 Karasuma-dori, Kyoto, Japan",
            },
        ]

        buyers = {}
        for b_data in buyers_data:
            b = db.scalar(select(Buyer).where(Buyer.name == b_data["name"]))
            if not b:
                b = Buyer(**b_data)
                db.add(b)
                db.flush()
            buyers[b_data["name"]] = b
        print(f"   Seeded/verified {len(buyers)} buyers.")

        # -------------------------------------------------------------
        # 2. SUPPLIERS (3 Suppliers)
        # -------------------------------------------------------------
        print("\n2. Seeding Suppliers...")
        suppliers_data = [
            {
                "name": "Apex Fibers & Spinning Mills",
                "contact": "+91-9842100001",
                "email": "sales@apexfibers.in",
            },
            {
                "name": "Prime Combed Yarns Ltd",
                "contact": "+91-9842100002",
                "email": "supply@primecombed.in",
            },
            {
                "name": "Global Synthetic & Silk Corp",
                "contact": "+91-9842100003",
                "email": "orders@globalsynthetic.com",
            },
        ]

        suppliers = {}
        for s_data in suppliers_data:
            s = db.scalar(select(Supplier).where(Supplier.name == s_data["name"]))
            if not s:
                s = Supplier(**s_data)
                db.add(s)
                db.flush()
            suppliers[s_data["name"]] = s
        print(f"   Seeded/verified {len(suppliers)} suppliers.")

        # -------------------------------------------------------------
        # 3. MATERIALS (5 Materials: compatible & incompatible)
        # -------------------------------------------------------------
        print("\n3. Seeding Materials...")
        materials_data = [
            {
                "material_type": "Cotton",
                "colour": "Navy Blue",
                "specification": "30s combed ring-spun cotton",
                "reorder_threshold_kg": Decimal("100.00"),
                "yarn_kg_per_metre": Decimal("0.220"),
            },
            {
                "material_type": "Cotton",
                "colour": "Bleached White",
                "specification": "40s compact combed cotton",
                "reorder_threshold_kg": Decimal("80.00"),
                "yarn_kg_per_metre": Decimal("0.180"),
            },
            {
                "material_type": "Polyester",
                "colour": "Charcoal Black",
                "specification": "150D/48F textured polyester filament",
                "reorder_threshold_kg": Decimal("60.00"),
                "yarn_kg_per_metre": Decimal("0.160"),
            },
            {
                "material_type": "Linen",
                "colour": "Natural Flax",
                "specification": "60s dry-spun wet-processed flax",
                "reorder_threshold_kg": Decimal("50.00"),
                "yarn_kg_per_metre": Decimal("0.250"),
            },
            {
                "material_type": "Silk",
                "colour": "Crimson Red",
                "specification": "20/22 denier mulberry raw silk",
                "reorder_threshold_kg": Decimal("30.00"),
                "yarn_kg_per_metre": Decimal("0.120"),
            },
        ]

        materials = {}
        for m_data in materials_data:
            m = db.scalar(
                select(Material).where(
                    Material.material_type == m_data["material_type"],
                    Material.colour == m_data["colour"],
                    Material.specification == m_data["specification"],
                )
            )
            if not m:
                m = Material(**m_data)
                db.add(m)
                db.flush()
            key = f"{m_data['material_type']}_{m_data['colour']}"
            materials[key] = m
        print(f"   Seeded/verified {len(materials)} yarn materials.")

        # -------------------------------------------------------------
        # 4. YARN LOTS & MOVEMENTS (8 Lots: sufficient & insufficient scenarios)
        # -------------------------------------------------------------
        print("\n4. Seeding Yarn Lots & Inventory Movements...")
        lots_data = [
            # Sufficient stock for Cotton Navy Blue
            {
                "lot_code": "LOT-CTN-BLU-001",
                "material": materials["Cotton_Navy Blue"],
                "supplier": suppliers["Apex Fibers & Spinning Mills"],
                "initial_kg": Decimal("800.000"),
                "cost": Decimal("4800.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("800.000"), "note": "Initial delivery Batch A"},
                ],
            },
            {
                "lot_code": "LOT-CTN-BLU-002",
                "material": materials["Cotton_Navy Blue"],
                "supplier": suppliers["Prime Combed Yarns Ltd"],
                "initial_kg": Decimal("450.000"),
                "cost": Decimal("2790.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("450.000"), "note": "Batch B supplementary stock"},
                ],
            },
            # Sufficient stock for Cotton Bleached White
            {
                "lot_code": "LOT-CTN-WHT-001",
                "material": materials["Cotton_Bleached White"],
                "supplier": suppliers["Prime Combed Yarns Ltd"],
                "initial_kg": Decimal("600.000"),
                "cost": Decimal("3900.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("600.000"), "note": "Primary white cotton lot"},
                ],
            },
            # Polyester stock
            {
                "lot_code": "LOT-POLY-BLK-001",
                "material": materials["Polyester_Charcoal Black"],
                "supplier": suppliers["Global Synthetic & Silk Corp"],
                "initial_kg": Decimal("500.000"),
                "cost": Decimal("2250.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("500.000"), "note": "Synthetic polyester stock"},
                ],
            },
            # Insufficient stock scenario for Linen (only 40kg received, threshold 50kg)
            {
                "lot_code": "LOT-LIN-NAT-001",
                "material": materials["Linen_Natural Flax"],
                "supplier": suppliers["Apex Fibers & Spinning Mills"],
                "initial_kg": Decimal("40.000"),
                "cost": Decimal("800.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("40.000"), "note": "Low quantity trial lot"},
                ],
            },
            # Low stock for Silk (reorder threshold 30kg, only 25kg)
            {
                "lot_code": "LOT-SLK-RED-001",
                "material": materials["Silk_Crimson Red"],
                "supplier": suppliers["Global Synthetic & Silk Corp"],
                "initial_kg": Decimal("25.000"),
                "cost": Decimal("1500.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("25.000"), "note": "Specialty silk lot (low stock)"},
                ],
            },
            # Secondary polyester lot
            {
                "lot_code": "LOT-POLY-BLK-002",
                "material": materials["Polyester_Charcoal Black"],
                "supplier": suppliers["Global Synthetic & Silk Corp"],
                "initial_kg": Decimal("300.000"),
                "cost": Decimal("1350.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("300.000"), "note": "Buffer stock polyester"},
                ],
            },
            # General reserve cotton
            {
                "lot_code": "LOT-CTN-BLU-003",
                "material": materials["Cotton_Navy Blue"],
                "supplier": suppliers["Apex Fibers & Spinning Mills"],
                "initial_kg": Decimal("250.000"),
                "cost": Decimal("1500.00"),
                "movements": [
                    {"type": "receipt", "qty": Decimal("250.000"), "note": "Reserve lot"},
                ],
            },
        ]

        lots = {}
        for l_data in lots_data:
            lot = db.scalar(select(MaterialLot).where(MaterialLot.lot_code == l_data["lot_code"]))
            if not lot:
                lot = MaterialLot(
                    lot_code=l_data["lot_code"],
                    material_id=l_data["material"].id,
                    supplier_id=l_data["supplier"].id,
                    initial_received_kg=l_data["initial_kg"],
                    lot_cost=l_data["cost"],
                    received_at=now - timedelta(days=30),
                )
                db.add(lot)
                db.flush()

                for mov in l_data["movements"]:
                    m_rec = InventoryMovement(
                        lot_id=lot.id,
                        movement_type=mov["type"],
                        quantity_kg=mov["qty"],
                        movement_date=now - timedelta(days=30),
                        note=mov["note"],
                    )
                    db.add(m_rec)
                db.flush()
            lots[l_data["lot_code"]] = lot
        print(f"   Seeded/verified {len(lots)} yarn lots with movements.")

        # -------------------------------------------------------------
        # 5. MACHINES (10 Machines: 3 Spinning, 5 Weaving, 2 Dyeing)
        # -------------------------------------------------------------
        print("\n5. Seeding Machines (3 Spinning, 5 Weaving, 2 Dyeing)...")
        machines_data = [
            # 3 Spinning Machines
            {"machine_code": "SPIN-01", "machine_type": "spinning", "capacity_rate": Decimal("45.00"), "state": "idle"},
            {"machine_code": "SPIN-02", "machine_type": "spinning", "capacity_rate": Decimal("50.00"), "state": "running"},
            {"machine_code": "SPIN-03", "machine_type": "spinning", "capacity_rate": Decimal("40.00"), "state": "maintenance"},
            # 5 Weaving Machines
            {"machine_code": "WEAV-01", "machine_type": "weaving", "capacity_rate": Decimal("25.00"), "state": "running"},
            {"machine_code": "WEAV-02", "machine_type": "weaving", "capacity_rate": Decimal("25.00"), "state": "idle"},
            {"machine_code": "WEAV-03", "machine_type": "weaving", "capacity_rate": Decimal("30.00"), "state": "running"},
            {"machine_code": "WEAV-04", "machine_type": "weaving", "capacity_rate": Decimal("28.00"), "state": "breakdown"},
            {"machine_code": "WEAV-05", "machine_type": "weaving", "capacity_rate": Decimal("32.00"), "state": "idle"},
            # 2 Dyeing Machines
            {"machine_code": "DYE-01", "machine_type": "dyeing", "capacity_rate": Decimal("60.00"), "state": "idle"},
            {"machine_code": "DYE-02", "machine_type": "dyeing", "capacity_rate": Decimal("75.00"), "state": "running"},
        ]

        machines = {}
        for m_conf in machines_data:
            mach = db.scalar(select(Machine).where(Machine.machine_code == m_conf["machine_code"]))
            if not mach:
                mach = Machine(
                    machine_code=m_conf["machine_code"],
                    machine_type=m_conf["machine_type"],
                    capacity_rate=m_conf["capacity_rate"],
                    state=m_conf["state"],
                    is_active=True,
                )
                db.add(mach)
                db.flush()
            machines[m_conf["machine_code"]] = mach
        print(f"   Seeded/verified {len(machines)} machines.")

        # -------------------------------------------------------------
        # 6. DOWNTIMES (Maintenance & Breakdown windows)
        # -------------------------------------------------------------
        print("\n6. Seeding Downtimes...")
        downtimes_data = [
            {
                "machine": machines["SPIN-03"],
                "start": now - timedelta(hours=4),
                "end": now + timedelta(hours=20),
                "reason": "Quarterly spindle lubrication and alignment calibration",
            },
            {
                "machine": machines["WEAV-04"],
                "start": now - timedelta(hours=12),
                "end": now + timedelta(hours=12),
                "reason": "Rapier guide ribbon failure; replacement part in transit",
            },
            {
                "machine": machines["WEAV-01"],
                "start": now - timedelta(days=2),
                "end": now - timedelta(days=1, hours=20),
                "reason": "Preventive maintenance warp beam reset",
            },
        ]

        downtimes_count = 0
        for dt_conf in downtimes_data:
            existing_dt = db.scalar(
                select(Downtime).where(
                    Downtime.machine_id == dt_conf["machine"].id,
                    Downtime.start_time == dt_conf["start"],
                )
            )
            if not existing_dt:
                dt_obj = Downtime(
                    machine_id=dt_conf["machine"].id,
                    start_time=dt_conf["start"],
                    end_time=dt_conf["end"],
                    reason=dt_conf["reason"],
                )
                db.add(dt_obj)
                downtimes_count += 1
        db.flush()
        print(f"   Seeded/verified {len(downtimes_data)} downtime intervals.")

        # -------------------------------------------------------------
        # 7. ORDERS (12 Orders with diverse fabrics, colors, deadlines, priorities)
        # -------------------------------------------------------------
        print("\n7. Seeding Orders (12 Orders)...")
        orders_configs = [
            # 1. Urgent cotton order (fully dispatched)
            {
                "buyer": buyers["Nordic Apparels AB"],
                "fabric_type": "Cotton",
                "colour": "Navy Blue",
                "quantity_metres": Decimal("500.00"),
                "agreed_rate": Decimal("180.00"),
                "order_date": now - timedelta(days=25),
                "deadline": now + timedelta(days=5),
                "priority": "urgent",
            },
            # 2. High priority cotton order (in progress, partially inspected)
            {
                "buyer": buyers["Milan Couture SpA"],
                "fabric_type": "Cotton",
                "colour": "Bleached White",
                "quantity_metres": Decimal("1200.00"),
                "agreed_rate": Decimal("165.00"),
                "order_date": now - timedelta(days=20),
                "deadline": now + timedelta(days=15),
                "priority": "high",
            },
            # 3. Polyester order (running production)
            {
                "buyer": buyers["Beacon Garments Ltd"],
                "fabric_type": "Polyester",
                "colour": "Charcoal Black",
                "quantity_metres": Decimal("800.00"),
                "agreed_rate": Decimal("140.00"),
                "order_date": now - timedelta(days=15),
                "deadline": now + timedelta(days=20),
                "priority": "normal",
            },
            # 4. Normal cotton order (planned)
            {
                "buyer": buyers["Zenith Fashion Corp"],
                "fabric_type": "Cotton",
                "colour": "Navy Blue",
                "quantity_metres": Decimal("650.00"),
                "agreed_rate": Decimal("175.00"),
                "order_date": now - timedelta(days=10),
                "deadline": now + timedelta(days=25),
                "priority": "normal",
            },
            # 5. Low priority silk order (shortage scenario)
            {
                "buyer": buyers["Kyoto Weave Co"],
                "fabric_type": "Silk",
                "colour": "Crimson Red",
                "quantity_metres": Decimal("400.00"),
                "agreed_rate": Decimal("420.00"),
                "order_date": now - timedelta(days=8),
                "deadline": now + timedelta(days=40),
                "priority": "low",
            },
            # 6. Urgent linen order (shortage scenario)
            {
                "buyer": buyers["Nordic Apparels AB"],
                "fabric_type": "Linen",
                "colour": "Natural Flax",
                "quantity_metres": Decimal("350.00"),
                "agreed_rate": Decimal("290.00"),
                "order_date": now - timedelta(days=6),
                "deadline": now + timedelta(days=12),
                "priority": "urgent",
            },
            # 7. High priority white cotton order
            {
                "buyer": buyers["Milan Couture SpA"],
                "fabric_type": "Cotton",
                "colour": "Bleached White",
                "quantity_metres": Decimal("900.00"),
                "agreed_rate": Decimal("160.00"),
                "order_date": now - timedelta(days=5),
                "deadline": now + timedelta(days=30),
                "priority": "high",
            },
            # 8. Normal polyester order
            {
                "buyer": buyers["Beacon Garments Ltd"],
                "fabric_type": "Polyester",
                "colour": "Charcoal Black",
                "quantity_metres": Decimal("1500.00"),
                "agreed_rate": Decimal("135.00"),
                "order_date": now - timedelta(days=4),
                "deadline": now + timedelta(days=35),
                "priority": "normal",
            },
            # 9. Low priority navy cotton order
            {
                "buyer": buyers["Zenith Fashion Corp"],
                "fabric_type": "Cotton",
                "colour": "Navy Blue",
                "quantity_metres": Decimal("300.00"),
                "agreed_rate": Decimal("170.00"),
                "order_date": now - timedelta(days=3),
                "deadline": now + timedelta(days=45),
                "priority": "low",
            },
            # 10. Urgent fashion silk dress material
            {
                "buyer": buyers["Milan Couture SpA"],
                "fabric_type": "Silk",
                "colour": "Crimson Red",
                "quantity_metres": Decimal("150.00"),
                "agreed_rate": Decimal("450.00"),
                "order_date": now - timedelta(days=2),
                "deadline": now + timedelta(days=8),
                "priority": "urgent",
            },
            # 11. Normal linen luxury sheeting
            {
                "buyer": buyers["Nordic Apparels AB"],
                "fabric_type": "Linen",
                "colour": "Natural Flax",
                "quantity_metres": Decimal("200.00"),
                "agreed_rate": Decimal("310.00"),
                "order_date": now - timedelta(days=2),
                "deadline": now + timedelta(days=50),
                "priority": "normal",
            },
            # 12. High priority bulk uniform cotton
            {
                "buyer": buyers["Beacon Garments Ltd"],
                "fabric_type": "Cotton",
                "colour": "Navy Blue",
                "quantity_metres": Decimal("2000.00"),
                "agreed_rate": Decimal("155.00"),
                "order_date": now - timedelta(days=1),
                "deadline": now + timedelta(days=60),
                "priority": "high",
            },
        ]

        orders = []
        for idx, o_conf in enumerate(orders_configs, start=1):
            ord_obj = db.scalar(
                select(Order).where(
                    Order.buyer_id == o_conf["buyer"].id,
                    Order.fabric_type == o_conf["fabric_type"],
                    Order.colour == o_conf["colour"],
                    Order.quantity_metres == o_conf["quantity_metres"],
                    Order.priority == o_conf["priority"],
                )
            )
            if not ord_obj:
                ord_obj = Order(
                    buyer_id=o_conf["buyer"].id,
                    fabric_type=o_conf["fabric_type"],
                    colour=o_conf["colour"],
                    quantity_metres=o_conf["quantity_metres"],
                    agreed_rate=o_conf["agreed_rate"],
                    order_date=o_conf["order_date"],
                    deadline=o_conf["deadline"],
                    priority=o_conf["priority"],
                )
                db.add(ord_obj)
                db.flush()
            orders.append(ord_obj)
        print(f"   Seeded/verified {len(orders)} orders.")

        # -------------------------------------------------------------
        # 8. OPERATIONS & ELIGIBILITY MAPPINGS
        # -------------------------------------------------------------
        print("\n8. Seeding Operations & Machine Eligibility Mappings...")
        for ord_obj in orders:
            # Operation 1: Spinning (spinning machines eligible)
            op1 = db.scalar(select(Operation).where(Operation.order_id == ord_obj.id, Operation.sequence == 1))
            if not op1:
                op1 = Operation(
                    order_id=ord_obj.id,
                    stage="spinning",
                    sequence=1,
                    planned_duration_minutes=180,
                )
                db.add(op1)
                db.flush()
                op1.eligible_machines.extend([machines["SPIN-01"], machines["SPIN-02"], machines["SPIN-03"]])

            # Operation 2: Weaving (weaving machines eligible)
            op2 = db.scalar(select(Operation).where(Operation.order_id == ord_obj.id, Operation.sequence == 2))
            if not op2:
                op2 = Operation(
                    order_id=ord_obj.id,
                    stage="weaving",
                    sequence=2,
                    planned_duration_minutes=360,
                )
                db.add(op2)
                db.flush()
                op2.eligible_machines.extend([
                    machines["WEAV-01"], machines["WEAV-02"], machines["WEAV-03"],
                    machines["WEAV-04"], machines["WEAV-05"],
                ])

            # Operation 3: Dyeing (dyeing machines eligible)
            op3 = db.scalar(select(Operation).where(Operation.order_id == ord_obj.id, Operation.sequence == 3))
            if not op3:
                op3 = Operation(
                    order_id=ord_obj.id,
                    stage="dyeing",
                    sequence=3,
                    planned_duration_minutes=120,
                )
                db.add(op3)
                db.flush()
                op3.eligible_machines.extend([machines["DYE-01"], machines["DYE-02"]])
        db.flush()
        print("   Seeded multi-stage operations (spinning -> weaving -> dyeing) with machine eligibility.")

        # -------------------------------------------------------------
        # 9. PRODUCTION RUNS (completed, in_progress, planned)
        # -------------------------------------------------------------
        print("\n9. Seeding Production Runs...")
        # Order 1: Completed weaving run on WEAV-01
        ord1_weaving_op = db.scalar(select(Operation).where(Operation.order_id == orders[0].id, Operation.stage == "weaving"))
        run_ord1 = db.scalar(select(ProductionRun).where(ProductionRun.order_id == orders[0].id, ProductionRun.operation_id == ord1_weaving_op.id))
        if not run_ord1:
            run_ord1 = ProductionRun(
                order_id=orders[0].id,
                operation_id=ord1_weaving_op.id,
                machine_id=machines["WEAV-01"].id,
                run_kind="actual",
                status="completed",
                start_time=now - timedelta(days=20),
                end_time=now - timedelta(days=19),
                output_metres=Decimal("500.00"),
            )
            db.add(run_ord1)
            db.flush()

        # Order 2: In-progress run on WEAV-03
        ord2_weaving_op = db.scalar(select(Operation).where(Operation.order_id == orders[1].id, Operation.stage == "weaving"))
        run_ord2 = db.scalar(select(ProductionRun).where(ProductionRun.order_id == orders[1].id, ProductionRun.operation_id == ord2_weaving_op.id))
        if not run_ord2:
            run_ord2 = ProductionRun(
                order_id=orders[1].id,
                operation_id=ord2_weaving_op.id,
                machine_id=machines["WEAV-03"].id,
                run_kind="actual",
                status="running",
                start_time=now - timedelta(hours=8),
                end_time=None,
                output_metres=Decimal("0.00"),
            )
            db.add(run_ord2)
            db.flush()

        # Order 3: Planned scheduled run on WEAV-05
        ord3_weaving_op = db.scalar(select(Operation).where(Operation.order_id == orders[2].id, Operation.stage == "weaving"))
        run_ord3 = db.scalar(select(ProductionRun).where(ProductionRun.order_id == orders[2].id, ProductionRun.operation_id == ord3_weaving_op.id))
        if not run_ord3:
            run_ord3 = ProductionRun(
                order_id=orders[2].id,
                operation_id=ord3_weaving_op.id,
                machine_id=machines["WEAV-05"].id,
                run_kind="scheduled",
                status="planned",
                start_time=now + timedelta(hours=10),
                end_time=now + timedelta(hours=34),
                output_metres=Decimal("0.00"),
            )
            db.add(run_ord3)
            db.flush()
        print("   Seeded production runs across multiple lifecycle states.")

        # -------------------------------------------------------------
        # 10. FABRIC ROLLS & INSPECTION HISTORY
        # -------------------------------------------------------------
        print("\n10. Seeding Fabric Rolls & Inspections...")
        # Order 1: 3 rolls from run_ord1
        # - Roll 1: Passed & Dispatched (200m)
        # - Roll 2: Passed & Dispatched (300m)
        # - Roll 3: Rejected defect roll (100m)
        # Order 2: 2 rolls
        # - Roll 4: Passed (400m)
        # - Roll 5: Rework (300m)
        # - Roll 6: Awaiting inspection (250m)
        rolls_config = [
            {
                "code": "ROLL-ORD01-001",
                "order": orders[0],
                "run": run_ord1,
                "metres": Decimal("200.00"),
                "status": "dispatched",
                "inspections": [
                    {"result": "pass", "defect": None, "severity": None, "note": "Uniform weave, pristine finish"},
                ],
            },
            {
                "code": "ROLL-ORD01-002",
                "order": orders[0],
                "run": run_ord1,
                "metres": Decimal("300.00"),
                "status": "dispatched",
                "inspections": [
                    {"result": "pass", "defect": None, "severity": None, "note": "Passed all dimensional and tension checks"},
                ],
            },
            {
                "code": "ROLL-ORD01-REJ",
                "order": orders[0],
                "run": run_ord1,
                "metres": Decimal("100.00"),
                "status": "rejected",
                "inspections": [
                    {"result": "rework", "defect": "Warp streak", "severity": "medium", "note": "Attempted steam leveling"},
                    {"result": "reject", "defect": "Irreparable reed marks", "severity": "critical", "note": "Terminal rejection, scrap lot"},
                ],
            },
            {
                "code": "ROLL-ORD02-001",
                "order": orders[1],
                "run": run_ord2,
                "metres": Decimal("400.00"),
                "status": "passed",
                "inspections": [
                    {"result": "pass", "defect": None, "severity": None, "note": "Ready for dispatch"},
                ],
            },
            {
                "code": "ROLL-ORD02-002",
                "order": orders[1],
                "run": run_ord2,
                "metres": Decimal("300.00"),
                "status": "rework",
                "inspections": [
                    {"result": "rework", "defect": "Slub yarn imperfection", "severity": "medium", "note": "Sent back to re-mending station"},
                ],
            },
            {
                "code": "ROLL-ORD02-003",
                "order": orders[1],
                "run": run_ord2,
                "metres": Decimal("250.00"),
                "status": "awaiting_inspection",
                "inspections": [],
            },
        ]

        seeded_rolls = {}
        for r_conf in rolls_config:
            roll = db.scalar(select(FabricRoll).where(FabricRoll.roll_code == r_conf["code"]))
            if not roll:
                roll = FabricRoll(
                    roll_code=r_conf["code"],
                    order_id=r_conf["order"].id,
                    production_run_id=r_conf["run"].id,
                    metres=r_conf["metres"],
                    status=r_conf["status"],
                    created_at=now - timedelta(days=15),
                )
                db.add(roll)
                db.flush()

                for insp in r_conf["inspections"]:
                    insp_rec = Inspection(
                        roll_id=roll.id,
                        result=insp["result"],
                        defect_type=insp["defect"],
                        severity=insp["severity"],
                        disposition=insp["note"],
                        inspected_at=now - timedelta(days=14),
                    )
                    db.add(insp_rec)
                db.flush()
            seeded_rolls[r_conf["code"]] = roll
        print(f"   Seeded/verified {len(seeded_rolls)} fabric rolls with full inspection chains.")

        # -------------------------------------------------------------
        # 11. FINISHED GOODS DISPATCHES (Draft and Confirmed)
        # -------------------------------------------------------------
        print("\n11. Seeding Finished Goods Dispatches...")
        # Confirmed Dispatch for Order 1: 500 metres (Roll 1: 200m + Roll 2: 300m)
        disp1 = db.scalar(select(Dispatch).where(Dispatch.invoice_number == "INV-2026-NORDIC-001"))
        if not disp1:
            disp1 = Dispatch(
                order_id=orders[0].id,
                dispatch_date=now - timedelta(days=5),
                vehicle="KA-04-TR-9988",
                invoice_number="INV-2026-NORDIC-001",
                confirmed=True,
                confirmed_at=now - timedelta(days=5),
            )
            db.add(disp1)
            db.flush()

            item1 = DispatchItem(
                dispatch_id=disp1.id,
                roll_id=seeded_rolls["ROLL-ORD01-001"].id,
                metres=Decimal("200.00"),
            )
            item2 = DispatchItem(
                dispatch_id=disp1.id,
                roll_id=seeded_rolls["ROLL-ORD01-002"].id,
                metres=Decimal("300.00"),
            )
            db.add_all([item1, item2])
            db.flush()

        # Draft Dispatch for Order 2: Roll 4 (400m)
        disp2 = db.scalar(select(Dispatch).where(Dispatch.invoice_number == "INV-2026-MILAN-DRAFT"))
        if not disp2:
            disp2 = Dispatch(
                order_id=orders[1].id,
                dispatch_date=now + timedelta(days=2),
                vehicle="MH-12-FG-4411",
                invoice_number="INV-2026-MILAN-DRAFT",
                confirmed=False,
                confirmed_at=None,
            )
            db.add(disp2)
            db.flush()

            item3 = DispatchItem(
                dispatch_id=disp2.id,
                roll_id=seeded_rolls["ROLL-ORD02-001"].id,
                metres=Decimal("400.00"),
            )
            db.add(item3)
            db.flush()

        db.commit()
        print("   Seeded dispatches: 1 Confirmed (INV-2026-NORDIC-001) & 1 Draft (INV-2026-MILAN-DRAFT).")

    print("\n" + "=" * 60)
    print("SEEDING COMPLETED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database with synthetic textile factory data.")
    parser.add_argument("--reset", action="store_true", help="Clear Member 2 data before seeding.")
    args = parser.parse_args()
    seed(reset=args.reset)
