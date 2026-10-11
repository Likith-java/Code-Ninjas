"""
Comprehensive, deterministic synthetic seed data for Textile Manufacturing Intelligence Platform.

Generates realistic factory demonstration data:
- 10 Buyers
- 5 Suppliers
- 12 Yarn Materials (compatible and incompatible options)
- 30+ Yarn Lots (sufficient and insufficient stock scenarios)
- 600 Orders (various fabrics, colours, quantities, priorities, deadlines)
- Operations & Machine Eligibility Mappings
- 20 Machines (5 Spinning, 8 Weaving, 4 Dyeing, 3 Finishing)
- Downtimes (maintenance & breakdown windows)
- Production Runs (planned, in_progress, completed)
- Fabric Rolls (awaiting_inspection, passed, rework, rejected, dispatched)
- Quality Inspection history with defect classifications
- Finished-Goods Dispatches (draft and confirmed with invoice reconciliation)
- 50 Workers with varied skills and shifts

Idempotent: Re-running does not create duplicates.
Safe: Does not wipe existing data by default unless --reset is explicitly passed.
"""

import argparse
import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import random

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
    Worker,
    WorkerAssignment,
    operation_eligible_machines,
)


# Fixed seed for reproducible results
random.seed(42)

# Fabric types with their typical material mappings
FABRIC_MATERIALS = {
    "Cotton": [
        ("Navy Blue", "30s combed ring-spun cotton", Decimal("0.220")),
        ("Bleached White", "40s compact combed cotton", Decimal("0.180")),
        ("Black", "30s carded cotton", Decimal("0.230")),
        ("Grey Melange", "24s melange cotton", Decimal("0.210")),
        ("Olive Green", "30s organic cotton", Decimal("0.225")),
    ],
    "Polyester": [
        ("Charcoal Black", "150D/48F textured polyester filament", Decimal("0.160")),
        ("Royal Blue", "75D/72F semi-dull polyester", Decimal("0.140")),
        ("Bright Red", "100D/36F bright polyester", Decimal("0.150")),
        ("White", "50D/24F microfibre polyester", Decimal("0.130")),
    ],
    "Linen": [
        ("Natural Flax", "60s dry-spun wet-processed flax", Decimal("0.250")),
        ("Bleached White", "80s fine linen", Decimal("0.200")),
        ("Stone Washed", "40s stone-washed linen", Decimal("0.230")),
    ],
    "Silk": [
        ("Crimson Red", "20/22 denier mulberry raw silk", Decimal("0.120")),
        ("Ivory", "22/24 denier organza silk", Decimal("0.110")),
        ("Champagne Gold", "18/20 denier dupioni silk", Decimal("0.115")),
    ],
    "Cotton-Polyester": [
        ("Heather Grey", "65/35 cotton-poly blend 30s", Decimal("0.190")),
        ("Navy Blue", "60/40 cotton-poly 24s", Decimal("0.200")),
        ("Black", "50/50 cotton-poly 20s", Decimal("0.210")),
    ],
    "Viscose": [
        ("Emerald Green", "1.5 denier viscose staple", Decimal("0.170")),
        ("Deep Purple", "1.2 denier modal", Decimal("0.160")),
    ],
}

# Buyer names
BUYER_NAMES = [
    ("Nordic Apparels AB", "Elin Larsson", "procurement@nordicapparels.se", "Hamngatan 14, Gothenburg, Sweden"),
    ("Milan Couture SpA", "Matteo Rossi", "m.rossi@milancouture.it", "Via Montenapoleone 8, Milan, Italy"),
    ("Beacon Garments Ltd", "Sarah Jenkins", "orders@beacongarments.co.uk", "45 Regent Street, Leeds, United Kingdom"),
    ("Zenith Fashion Corp", "David Zhao", "d.zhao@zenithfashion.com", "782 Fashion District, New York, NY, USA"),
    ("Kyoto Weave Co", "Kenji Sato", "sato@kyotoweave.jp", "12-4 Karasuma-dori, Kyoto, Japan"),
    ("Sao Paulo Textiles SA", "Carlos Mendes", "compras@saopaulotextiles.br", "Rua das Flores 123, Sao Paulo, Brazil"),
    ("Istanbul Denim Mills", "Ayşe Demir", "ayse.demir@istanbuldenim.tr", "Moda Caddesi 5, Istanbul, Turkey"),
    ("Shanghai Silk Group", "Wei Chen", "chen@shanghaisilk.cn", "Nanjing Road 88, Shanghai, China"),
    ("Toronto Knitwear Inc", "Jennifer Park", "j.park@torontoknit.ca", "200 King St W, Toronto, Canada"),
    ("Melbourne Wool Co", "James O'Connor", "joconnor@melbournewool.au", "Collins Street 10, Melbourne, Australia"),
]

# Supplier names
SUPPLIER_NAMES = [
    ("Apex Fibers & Spinning Mills", "+91-9842100001", "sales@apexfibers.in"),
    ("Prime Combed Yarns Ltd", "+91-9842100002", "supply@primecombed.in"),
    ("Global Synthetic & Silk Corp", "+91-9842100003", "orders@globalsynthetic.com"),
    ("European Flax & Linen Co", "+32-2-555-0100", "sales@euflax.be"),
    ("Australian Merino Wool", "+61-3-9999-1000", "export@merinowool.au"),
    ("Turkish Cotton Exporters", "+90-212-555-0200", "export@turkishcotton.tr"),
]

# Worker skill levels
SKILL_LEVELS = ["trainee", "operator", "senior", "technician", "supervisor", "quality_inspector"]
SHIFTS = ["A", "B", "C", "day", "night", "flex"]

# Skills by production stage
STAGE_SKILLS = {
    "spinning": ["spinning_operator", "spinning_senior", "spinning_technician"],
    "weaving": ["weaving_operator", "weaving_senior", "weaving_technician"],
    "dyeing": ["dyeing_operator", "dyeing_senior", "dyeing_technician"],
    "inspection": ["quality_inspector", "quality_senior"],
    "packing": ["packing_operator", "warehouse_operator"],
    "dispatch": ["dispatch_operator", "logistics_coordinator"],
}


def seed(reset: bool = False, order_count: int = 600, worker_count: int = 50):
    print("=" * 60)
    print("SEEDING TEXTILE MANUFACTURING INTELLIGENCE PLATFORM")
    print(f"Target Orders: {order_count}, Target Workers: {worker_count}")
    print("=" * 60)

    now = datetime.now(timezone.utc)

    with SessionLocal() as db:
        if reset:
            print("WARNING: --reset specified. Clearing Member 2 data tables...")
            db.execute(delete(WorkerAssignment))
            db.execute(delete(Worker))
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
        # 1. BUYERS (10 Buyers)
        # -------------------------------------------------------------
        print("\n1. Seeding Buyers...")
        buyers = {}
        for b_data in BUYER_NAMES:
            b = db.scalar(select(Buyer).where(Buyer.name == b_data[0]))
            if not b:
                b = Buyer(name=b_data[0], contact=b_data[1], email=b_data[2], address=b_data[3])
                db.add(b)
                db.flush()
            buyers[b_data[0]] = b
        print(f"   Seeded/verified {len(buyers)} buyers.")

        # -------------------------------------------------------------
        # 2. SUPPLIERS (6 Suppliers)
        # -------------------------------------------------------------
        print("\n2. Seeding Suppliers...")
        suppliers = {}
        for s_data in SUPPLIER_NAMES:
            s = db.scalar(select(Supplier).where(Supplier.name == s_data[0]))
            if not s:
                s = Supplier(name=s_data[0], contact=s_data[1], email=s_data[2])
                db.add(s)
                db.flush()
            suppliers[s_data[0]] = s
        print(f"   Seeded/verified {len(suppliers)} suppliers.")

        # -------------------------------------------------------------
        # 3. MATERIALS (30+ Materials)
        # -------------------------------------------------------------
        print("\n3. Seeding Materials...")
        materials = {}
        material_list = []
        for fabric_type, variants in FABRIC_MATERIALS.items():
            for colour, specification, yarn_factor in variants:
                material_list.append({
                    "material_type": fabric_type,
                    "colour": colour,
                    "specification": specification,
                    "reorder_threshold_kg": Decimal(str(random.randint(30, 150))),
                    "yarn_kg_per_metre": yarn_factor,
                })

        for m_data in material_list:
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
        # 4. YARN LOTS (30+ Lots with varying stock levels)
        # -------------------------------------------------------------
        print("\n4. Seeding Yarn Lots & Inventory Movements...")
        lots = {}
        lot_counter = 0
        for fabric_type, variants in FABRIC_MATERIALS.items():
            for colour, specification, yarn_factor in variants:
                key = f"{fabric_type}_{colour}"
                material = materials[key]
                # Create 2-3 lots per material
                for i in range(random.randint(2, 3)):
                    lot_counter += 1
                    lot_code = f"LOT-{fabric_type[:3].upper()}-{colour[:3].upper()}-{lot_counter:03d}"
                    # Vary stock: some sufficient, some low
                    if random.random() < 0.3:  # 30% chance of low stock
                        initial_kg = Decimal(str(random.randint(10, 60)))
                    else:
                        initial_kg = Decimal(str(random.randint(200, 1000)))

                    lot = db.scalar(select(MaterialLot).where(MaterialLot.lot_code == lot_code))
                    if not lot:
                        supplier = random.choice(list(suppliers.values()))
                        lot = MaterialLot(
                            lot_code=lot_code,
                            material_id=material.id,
                            supplier_id=supplier.id,
                            initial_received_kg=initial_kg,
                            lot_cost=Decimal(str(random.randint(500, 5000))),
                            received_at=now - timedelta(days=random.randint(1, 60)),
                        )
                        db.add(lot)
                        db.flush()

                        # Add receipt movement
                        m_rec = InventoryMovement(
                            lot_id=lot.id,
                            movement_type="receipt",
                            quantity_kg=initial_kg,
                            movement_date=now - timedelta(days=random.randint(1, 60)),
                            note=f"Initial delivery for {material.material_type} {material.colour}",
                        )
                        db.add(m_rec)
                        db.flush()
                    lots[lot_code] = lot
        print(f"   Seeded/verified {len(lots)} yarn lots with movements.")

        # -------------------------------------------------------------
        # 5. MACHINES (20 Machines: 5 Spinning, 8 Weaving, 4 Dyeing, 3 Finishing)
        # -------------------------------------------------------------
        print("\n5. Seeding Machines...")
        machines_data = [
            # 5 Spinning Machines
            {"machine_code": "SPIN-01", "machine_type": "spinning", "capacity_rate": Decimal("45.00"), "state": "idle"},
            {"machine_code": "SPIN-02", "machine_type": "spinning", "capacity_rate": Decimal("50.00"), "state": "running"},
            {"machine_code": "SPIN-03", "machine_type": "spinning", "capacity_rate": Decimal("40.00"), "state": "maintenance"},
            {"machine_code": "SPIN-04", "machine_type": "spinning", "capacity_rate": Decimal("55.00"), "state": "idle"},
            {"machine_code": "SPIN-05", "machine_type": "spinning", "capacity_rate": Decimal("48.00"), "state": "running"},
            # 8 Weaving Machines
            {"machine_code": "WEAV-01", "machine_type": "weaving", "capacity_rate": Decimal("25.00"), "state": "running"},
            {"machine_code": "WEAV-02", "machine_type": "weaving", "capacity_rate": Decimal("25.00"), "state": "idle"},
            {"machine_code": "WEAV-03", "machine_type": "weaving", "capacity_rate": Decimal("30.00"), "state": "running"},
            {"machine_code": "WEAV-04", "machine_type": "weaving", "capacity_rate": Decimal("28.00"), "state": "breakdown"},
            {"machine_code": "WEAV-05", "machine_type": "weaving", "capacity_rate": Decimal("32.00"), "state": "idle"},
            {"machine_code": "WEAV-06", "machine_type": "weaving", "capacity_rate": Decimal("27.00"), "state": "running"},
            {"machine_code": "WEAV-07", "machine_type": "weaving", "capacity_rate": Decimal("30.00"), "state": "idle"},
            {"machine_code": "WEAV-08", "machine_type": "weaving", "capacity_rate": Decimal("26.00"), "state": "maintenance"},
            # 4 Dyeing Machines
            {"machine_code": "DYE-01", "machine_type": "dyeing", "capacity_rate": Decimal("60.00"), "state": "idle"},
            {"machine_code": "DYE-02", "machine_type": "dyeing", "capacity_rate": Decimal("75.00"), "state": "running"},
            {"machine_code": "DYE-03", "machine_type": "dyeing", "capacity_rate": Decimal("70.00"), "state": "idle"},
            {"machine_code": "DYE-04", "machine_type": "dyeing", "capacity_rate": Decimal("80.00"), "state": "running"},
            # 3 Finishing Machines (for inspection/packing stages)
            {"machine_code": "FIN-01", "machine_type": "inspection", "capacity_rate": Decimal("100.00"), "state": "idle"},
            {"machine_code": "FIN-02", "machine_type": "packing", "capacity_rate": Decimal("120.00"), "state": "idle"},
            {"machine_code": "FIN-03", "machine_type": "inspection", "capacity_rate": Decimal("90.00"), "state": "running"},
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
        # 6. DOWNTIMES
        # -------------------------------------------------------------
        print("\n6. Seeding Downtimes...")
        downtimes_data = [
            {"machine": machines["SPIN-03"], "start": now - timedelta(hours=4), "end": now + timedelta(hours=20), "reason": "Quarterly spindle lubrication and alignment calibration"},
            {"machine": machines["WEAV-04"], "start": now - timedelta(hours=12), "end": now + timedelta(hours=12), "reason": "Rapier guide ribbon failure; replacement part in transit"},
            {"machine": machines["WEAV-01"], "start": now - timedelta(days=2), "end": now - timedelta(days=1, hours=20), "reason": "Preventive maintenance warp beam reset"},
            {"machine": machines["WEAV-08"], "start": now - timedelta(hours=6), "end": now + timedelta(hours=18), "reason": "Scheduled gearbox oil change and inspection"},
            {"machine": machines["DYE-03"], "start": now - timedelta(hours=2), "end": now + timedelta(hours=10), "reason": "Heat exchanger cleaning"},
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
        print(f"   Seeded/verified {downtimes_count} downtime intervals.")

        # -------------------------------------------------------------
        # 7. WORKERS (50 Workers with diverse skills)
        # -------------------------------------------------------------
        print("\n7. Seeding Workers...")
        workers = {}
        first_names = ["James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "William", "Elizabeth",
                       "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
                       "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra",
                       "Donald", "Ashley", "Steven", "Dorothy", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna",
                       "Kenneth", "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward", "Deborah"]
        last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
                      "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
                      "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"]

        for i in range(worker_count):
            emp_code = f"EMP-{i+1:04d}"
            existing = db.scalar(select(Worker).where(Worker.employee_code == emp_code))
            if existing:
                workers[emp_code] = existing
                continue

            first = random.choice(first_names)
            last = random.choice(last_names)
            name = f"{first} {last}"
            skill_level = random.choices(SKILL_LEVELS, weights=[10, 30, 25, 15, 10, 10])[0]
            shift = random.choice(SHIFTS)
            hourly_rate = Decimal(str(round(random.uniform(15.0, 45.0), 2)))

            # Assign skills based on skill level and random selection
            all_skills = []
            for stage_skills in STAGE_SKILLS.values():
                all_skills.extend(stage_skills)
            num_skills = random.randint(1, 3 if skill_level in ["trainee", "operator"] else 5)
            worker_skills = random.sample(all_skills, min(num_skills, len(all_skills)))

            worker = Worker(
                employee_code=emp_code,
                name=name,
                skill_level=skill_level,
                shift=shift,
                status="active",
                hourly_rate=hourly_rate,
                skills=worker_skills,
            )
            db.add(worker)
            db.flush()
            workers[emp_code] = worker

        print(f"   Seeded/verified {len(workers)} workers.")

        # -------------------------------------------------------------
        # 8. ORDERS (600 Orders with diverse fabrics, colors, deadlines, priorities)
        # -------------------------------------------------------------
        print(f"\n8. Seeding {order_count} Orders...")
        priority_weights = {"urgent": 15, "high": 25, "normal": 40, "low": 20}
        priorities = list(priority_weights.keys())
        weights = list(priority_weights.values())

        buyer_list = list(buyers.values())
        orders = []

        for i in range(order_count):
            buyer = random.choice(buyer_list)
            fabric_type = random.choice(list(FABRIC_MATERIALS.keys()))
            variant = random.choice(FABRIC_MATERIALS[fabric_type])
            colour = variant[0]
            specification = variant[1]
            yarn_factor = variant[2]

            # Generate realistic quantity based on fabric type
            if fabric_type in ["Silk", "Linen"]:
                qty = Decimal(str(random.randint(50, 500)))
            elif fabric_type in ["Polyester", "Cotton-Polyester", "Viscose"]:
                qty = Decimal(str(random.randint(200, 3000)))
            else:  # Cotton
                qty = Decimal(str(random.randint(100, 2500)))

            priority = random.choices(priorities, weights=weights)[0]

            # Deadline based on priority
            if priority == "urgent":
                days_ahead = random.randint(3, 14)
            elif priority == "high":
                days_ahead = random.randint(10, 30)
            elif priority == "normal":
                days_ahead = random.randint(20, 60)
            else:  # low
                days_ahead = random.randint(40, 120)

            order_date = now - timedelta(days=random.randint(0, 30))
            deadline = now + timedelta(days=days_ahead)

            agreed_rate = Decimal(str(round(random.uniform(100.0, 500.0), 2)))

            # Create unique-ish order
            ord_obj = db.scalar(
                select(Order).where(
                    Order.buyer_id == buyer.id,
                    Order.fabric_type == fabric_type,
                    Order.colour == colour,
                    Order.quantity_metres == qty,
                    Order.priority == priority,
                )
            )
            if not ord_obj:
                ord_obj = Order(
                    buyer_id=buyer.id,
                    fabric_type=fabric_type,
                    colour=colour,
                    quantity_metres=qty,
                    agreed_rate=agreed_rate,
                    order_date=order_date,
                    deadline=deadline,
                    priority=priority,
                )
                db.add(ord_obj)
                db.flush()
            orders.append(ord_obj)

            if (i + 1) % 100 == 0:
                print(f"   Seeded {i + 1}/{order_count} orders...")

        print(f"   Seeded/verified {len(orders)} orders.")

        # -------------------------------------------------------------
        # 9. OPERATIONS & ELIGIBILITY MAPPINGS
        # -------------------------------------------------------------
        print("\n9. Seeding Operations & Machine Eligibility Mappings...")
        stages_sequence = ["spinning", "weaving", "dyeing", "inspection", "packing", "dispatch"]
        stage_durations = {
            "spinning": 180,
            "weaving": 360,
            "dyeing": 120,
            "inspection": 60,
            "packing": 45,
            "dispatch": 30,
        }

        for ord_obj in orders:
            for sequence, stage in enumerate(stages_sequence, start=1):
                op = db.scalar(select(Operation).where(Operation.order_id == ord_obj.id, Operation.sequence == sequence))
                if not op:
                    op = Operation(
                        order_id=ord_obj.id,
                        stage=stage,
                        sequence=sequence,
                        planned_duration_minutes=stage_durations[stage],
                    )
                    db.add(op)
                    db.flush()

                    # Assign eligible machines
                    eligible = [m for m in machines.values() if m.machine_type == stage and m.is_active]
                    if eligible:
                        op.eligible_machines.extend(eligible)

        db.flush()
        print(f"   Seeded multi-stage operations for {len(orders)} orders.")

        # -------------------------------------------------------------
        # 10. WORKER SKILL ASSIGNMENTS (initial eligibility)
        # -------------------------------------------------------------
        print("\n10. Seeding initial worker-operation eligibility (via skills)...")
        # Skills are already stored in Worker.skills JSONB
        # Eligibility is checked dynamically via WorkerAssignment during run start
        print("   Worker skills configured for dynamic assignment.")

        # -------------------------------------------------------------
        # 11. PRODUCTION RUNS (various states)
        # -------------------------------------------------------------
        print("\n11. Seeding Production Runs...")
        run_states = ["planned", "running", "completed"]
        run_weights = [0.2, 0.3, 0.5]

        runs_created = 0
        for ord_obj in orders[:min(200, len(orders))]:  # Create runs for first 200 orders
            operations = db.scalars(
                select(Operation).where(Operation.order_id == ord_obj.id).order_by(Operation.sequence)
            ).all()

            for op in operations:
                # Only create runs for some operations
                if random.random() < 0.7:
                    run_kind = "actual"
                    status = random.choices(run_states, weights=run_weights)[0]

                    # Find eligible machine
                    eligible = [m for m in machines.values() if m.machine_type == op.stage and m.is_active]
                    if not eligible:
                        continue
                    machine = random.choice(eligible)

                    start_time = None
                    end_time = None
                    output_metres = None

                    if status == "running":
                        start_time = now - timedelta(hours=random.randint(1, 48))
                    elif status == "completed":
                        start_time = now - timedelta(days=random.randint(1, 30))
                        end_time = start_time + timedelta(hours=random.randint(2, 24))
                        output_metres = ord_obj.quantity_metres
                    else:  # planned
                        start_time = now + timedelta(hours=random.randint(1, 72))
                        end_time = start_time + timedelta(hours=random.randint(3, 48))

                    existing_run = db.scalar(
                        select(ProductionRun).where(
                            ProductionRun.order_id == ord_obj.id,
                            ProductionRun.operation_id == op.id,
                            ProductionRun.run_kind == "actual",
                        )
                    )
                    if not existing_run:
                        run = ProductionRun(
                            order_id=ord_obj.id,
                            operation_id=op.id,
                            machine_id=machine.id,
                            run_kind=run_kind,
                            status=status,
                            start_time=start_time,
                            end_time=end_time,
                            output_metres=output_metres,
                        )
                        db.add(run)
                        runs_created += 1

        db.flush()
        print(f"   Seeded {runs_created} production runs.")

        # -------------------------------------------------------------
        # 12. FABRIC ROLLS & INSPECTIONS
        # -------------------------------------------------------------
        print("\n12. Seeding Fabric Rolls & Inspections...")
        roll_statuses = ["awaiting_inspection", "passed", "rework", "rejected", "dispatched"]
        roll_weights = [0.15, 0.55, 0.10, 0.05, 0.15]

        rolls_created = 0
        for ord_obj in orders[:min(150, len(orders))]:
            # Only create rolls for orders with completed dyeing runs
            dyeing_run = db.scalar(
                select(ProductionRun)
                .join(Operation)
                .where(
                    ProductionRun.order_id == ord_obj.id,
                    Operation.stage == "dyeing",
                    ProductionRun.run_kind == "actual",
                    ProductionRun.status == "completed",
                )
            )
            if not dyeing_run:
                continue

            num_rolls = random.randint(1, 4)
            for r in range(num_rolls):
                roll_code = f"ROLL-{ord_obj.id:04d}-{r+1:02d}"
                status = random.choices(roll_statuses, weights=roll_weights)[0]

                existing = db.scalar(select(FabricRoll).where(FabricRoll.roll_code == roll_code))
                if existing:
                    continue

                metres = ord_obj.quantity_metres / Decimal(str(num_rolls))
                roll = FabricRoll(
                    roll_code=roll_code,
                    order_id=ord_obj.id,
                    production_run_id=dyeing_run.id,
                    metres=metres.quantize(Decimal("0.01")),
                    status=status,
                    created_at=now - timedelta(days=random.randint(1, 20)),
                )
                db.add(roll)
                db.flush()

                # Add inspections for non-awaiting rolls
                if status != "awaiting_inspection":
                    insp_count = random.randint(1, 3)
                    for ic in range(insp_count):
                        if status == "passed":
                            result = "pass"
                            defect = None
                            severity = None
                        elif status == "rework":
                            result = random.choice(["pass", "rework"])
                            defect = random.choice(["Slub yarn", "Warp streak", "Weft variation", "Tension irregularity"]) if result == "rework" else None
                            severity = random.choice(["low", "medium", "high"]) if result == "rework" else None
                        else:  # rejected
                            result = "reject"
                            defect = random.choice(["Irreparable reed marks", "Hole in fabric", "Severe shade variation", "Chemical damage"])
                            severity = random.choice(["high", "critical"])

                        note = f"Inspection {ic+1}: {defect or 'No defects found'}"
                        insp_rec = Inspection(
                            roll_id=roll.id,
                            result=result,
                            defect_type=defect,
                            severity=severity,
                            disposition=note,
                            inspected_at=now - timedelta(days=random.randint(1, 15)),
                        )
                        db.add(insp_rec)
                        db.flush()

                rolls_created += 1

        db.flush()
        print(f"   Seeded {rolls_created} fabric rolls with inspections.")

        # -------------------------------------------------------------
        # 13. DISPATCHES
        # -------------------------------------------------------------
        print("\n13. Seeding Finished Goods Dispatches...")
        passed_rolls = db.scalars(
            select(FabricRoll).where(FabricRoll.status == "passed")
        ).all()

        # Group by order
        rolls_by_order = {}
        for roll in passed_rolls:
            if roll.order_id not in rolls_by_order:
                rolls_by_order[roll.order_id] = []
            rolls_by_order[roll.order_id].append(roll)

        dispatches_created = 0
        for order_id, rolls in rolls_by_order.items():
            if random.random() < 0.7:  # 70% chance of dispatch
                invoice_num = f"INV-{now.year}-{order_id:04d}-{random.randint(100,999)}"
                confirmed = random.random() < 0.6

                disp = db.scalar(select(Dispatch).where(Dispatch.invoice_number == invoice_num))
                if not disp:
                    disp = Dispatch(
                        order_id=order_id,
                        dispatch_date=now - timedelta(days=random.randint(1, 30)),
                        vehicle=f"TRK-{random.randint(1000,9999)}",
                        invoice_number=invoice_num,
                        confirmed=confirmed,
                        confirmed_at=now - timedelta(days=random.randint(1, 30)) if confirmed else None,
                    )
                    db.add(disp)
                    db.flush()

                    # Add 1-3 rolls to dispatch
                    selected_rolls = random.sample(rolls, min(len(rolls), random.randint(1, 3)))
                    for roll in selected_rolls:
                        item = DispatchItem(
                            dispatch_id=disp.id,
                            roll_id=roll.id,
                            metres=roll.metres,
                        )
                        db.add(item)
                        db.flush()

                        if confirmed:
                            roll.status = "dispatched"

                    dispatches_created += 1

        db.flush()
        print(f"   Seeded {dispatches_created} dispatches.")

        # -------------------------------------------------------------
        # 14. SIMULATION STATE (initialize)
        # -------------------------------------------------------------
        print("\n14. Initializing Simulation State...")
        state = db.get(SimulationState, 1)
        if not state:
            state = SimulationState(
                id=1,
                status="stopped",
                speed=Decimal("1.0"),
                simulated_time=0,
            )
            db.add(state)
        db.commit()

        print("\n" + "=" * 60)
        print("SEEDING COMPLETED SUCCESSFULLY!")
        print(f"Orders: {len(orders)}, Workers: {len(workers)}, Machines: {len(machines)}")
        print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database with synthetic textile factory data.")
    parser.add_argument("--reset", action="store_true", help="Clear Member 2 data before seeding.")
    parser.add_argument("--orders", type=int, default=600, help="Number of orders to generate (default: 600)")
    parser.add_argument("--workers", type=int, default=50, help="Number of workers to generate (default: 50)")
    args = parser.parse_args()
    seed(reset=args.reset, order_count=args.orders, worker_count=args.workers)