
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Column,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


# ============================================================
# ASSOCIATION TABLE: Operations eligible to run on machines
# ============================================================

operation_eligible_machines = Table(
    "operation_eligible_machines",
    Base.metadata,
    Column(
        "operation_id",
        ForeignKey("operations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "machine_id",
        ForeignKey("machines.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


# ============================================================
# 1. BUYERS AND ORDERS
# ============================================================

class Buyer(Base):
    __tablename__ = "buyers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)

    orders: Mapped[list["Order"]] = relationship(back_populates="buyer")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("quantity_metres > 0", name="ck_order_quantity_positive"),
        CheckConstraint("agreed_rate >= 0", name="ck_order_rate_nonnegative"),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name="ck_order_priority",
        ),
        CheckConstraint(
            "deadline > order_date",
            name="ck_order_deadline_after_order_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(
        ForeignKey("buyers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    fabric_type: Mapped[str] = mapped_column(String(100), nullable=False)
    colour: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity_metres: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    agreed_rate: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    order_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    deadline: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    priority: Mapped[str] = mapped_column(
        String(20), default="normal", nullable=False
    )

    # Order status is intentionally not stored here.
    # Derive it from production, inspection and dispatch records.

    buyer: Mapped["Buyer"] = relationship(back_populates="orders")
    operations: Mapped[list["Operation"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    production_runs: Mapped[list["ProductionRun"]] = relationship(
        back_populates="order"
    )
    rolls: Mapped[list["FabricRoll"]] = relationship(back_populates="order")
    material_movements: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="order"
    )
    intended_material_lots: Mapped[list["MaterialLot"]] = relationship(
        back_populates="intended_order"
    )
    dispatches: Mapped[list["Dispatch"]] = relationship(back_populates="order")


# ============================================================
# 2. MACHINES AND PRODUCTION OPERATIONS
# ============================================================

class Machine(Base):
    __tablename__ = "machines"
    __table_args__ = (
        UniqueConstraint("machine_code", name="uq_machine_code"),
        CheckConstraint("capacity_rate > 0", name="ck_machine_capacity_positive"),
        CheckConstraint(
            "machine_type IN ('spinning', 'weaving', 'dyeing')",
            name="ck_machine_type",
        ),
        CheckConstraint(
            "state IN ('idle', 'scheduled', 'running', 'maintenance', 'breakdown')",
            name="ck_machine_state",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False)
    machine_type: Mapped[str] = mapped_column(String(30), nullable=False)
    capacity_rate: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    state: Mapped[str] = mapped_column(String(30), default="idle", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    eligible_operations: Mapped[list["Operation"]] = relationship(
        secondary=operation_eligible_machines,
        back_populates="eligible_machines",
    )
    production_runs: Mapped[list["ProductionRun"]] = relationship(
        back_populates="machine"
    )
    downtimes: Mapped[list["Downtime"]] = relationship(back_populates="machine")


class Operation(Base):
    __tablename__ = "operations"
    __table_args__ = (
        UniqueConstraint("order_id", "sequence", name="uq_order_operation_sequence"),
        CheckConstraint("sequence > 0", name="ck_operation_sequence_positive"),
        CheckConstraint(
            "stage IN ('spinning', 'weaving', 'dyeing', 'inspection', 'packing', 'dispatch')",
            name="ck_operation_stage",
        ),
        CheckConstraint(
            "planned_duration_minutes IS NULL OR planned_duration_minutes > 0",
            name="ck_operation_duration_positive",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(30), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_duration_minutes: Mapped[int | None] = mapped_column(Integer)

    order: Mapped["Order"] = relationship(back_populates="operations")
    eligible_machines: Mapped[list["Machine"]] = relationship(
        secondary=operation_eligible_machines,
        back_populates="eligible_operations",
    )
    production_runs: Mapped[list["ProductionRun"]] = relationship(
        back_populates="operation"
    )


class Downtime(Base):
    __tablename__ = "downtimes"
    __table_args__ = (
        CheckConstraint(
            "end_time IS NULL OR end_time >= start_time",
            name="ck_downtime_time_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    machine: Mapped["Machine"] = relationship(back_populates="downtimes")


class ProductionRun(Base):
    __tablename__ = "production_runs"
    __table_args__ = (
        CheckConstraint(
            "run_kind IN ('scheduled', 'actual')", name="ck_production_run_kind"
        ),
        CheckConstraint(
            "status IN ('planned', 'running', 'completed', 'cancelled')",
            name="ck_production_run_status",
        ),
        CheckConstraint(
            "output_metres IS NULL OR output_metres >= 0",
            name="ck_production_output_nonnegative",
        ),
        CheckConstraint(
            "end_time IS NULL OR start_time IS NULL OR end_time >= start_time",
            name="ck_production_time_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("operations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    run_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    output_metres: Mapped[float | None] = mapped_column(Numeric(12, 2))

    order: Mapped["Order"] = relationship(back_populates="production_runs")
    operation: Mapped["Operation"] = relationship(back_populates="production_runs")
    machine: Mapped["Machine"] = relationship(back_populates="production_runs")
    rolls: Mapped[list["FabricRoll"]] = relationship(back_populates="production_run")


# ============================================================
# 3. SUPPLIERS AND YARN INVENTORY
# ============================================================

class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(255))

    material_lots: Mapped[list["MaterialLot"]] = relationship(
        back_populates="supplier"
    )


class Material(Base):
    __tablename__ = "materials"
    __table_args__ = (
        UniqueConstraint(
            "material_type", "colour", "specification",
            name="uq_material_type_colour_specification",
        ),
        CheckConstraint(
            "reorder_threshold_kg >= 0", name="ck_material_reorder_nonnegative"
        ),
        CheckConstraint(
            "yarn_kg_per_metre > 0", name="ck_material_yarn_factor_positive"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    material_type: Mapped[str] = mapped_column(String(100), nullable=False)
    colour: Mapped[str] = mapped_column(String(100), nullable=False)
    specification: Mapped[str] = mapped_column(String(150), nullable=False)
    reorder_threshold_kg: Mapped[float] = mapped_column(
        Numeric(12, 3), default=0, nullable=False
    )
    yarn_kg_per_metre: Mapped[float] = mapped_column(
        Numeric(12, 6), nullable=False
    )

    lots: Mapped[list["MaterialLot"]] = relationship(back_populates="material")


class MaterialLot(Base):
    __tablename__ = "material_lots"
    __table_args__ = (
        UniqueConstraint("lot_code", name="uq_material_lot_code"),
        CheckConstraint(
            "initial_received_kg > 0", name="ck_lot_received_positive"
        ),
        CheckConstraint("lot_cost >= 0", name="ck_lot_cost_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_code: Mapped[str] = mapped_column(String(100), nullable=False)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("materials.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    intended_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True
    )
    initial_received_kg: Mapped[float] = mapped_column(
        Numeric(12, 3), nullable=False
    )
    lot_cost: Mapped[float] = mapped_column(
        Numeric(14, 2), default=0, nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    material: Mapped["Material"] = relationship(back_populates="lots")
    supplier: Mapped["Supplier"] = relationship(back_populates="material_lots")
    intended_order: Mapped["Order | None"] = relationship(
        back_populates="intended_material_lots"
    )
    movements: Mapped[list["InventoryMovement"]] = relationship(
        back_populates="lot"
    )


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('receipt', 'issue', 'adjustment')",
            name="ck_inventory_movement_type",
        ),
        CheckConstraint(
            "(movement_type IN ('receipt', 'issue') AND quantity_kg > 0) OR (movement_type = 'adjustment' AND quantity_kg <> 0)",
            name="ck_inventory_movement_quantity_valid",
        ),
        CheckConstraint(
            "movement_type <> 'issue' OR order_id IS NOT NULL",
            name="ck_inventory_issue_requires_order",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(
        ForeignKey("material_lots.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity_kg: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False)
    movement_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)

    # Convention: receipts are positive, issues are positive and subtracted
    # by inventory service logic, adjustments are signed (+/-).
    lot: Mapped["MaterialLot"] = relationship(back_populates="movements")
    order: Mapped["Order | None"] = relationship(back_populates="material_movements")


# ============================================================
# 4. FABRIC ROLLS, QUALITY AND TRACEABILITY
# ============================================================

class FabricRoll(Base):
    __tablename__ = "fabric_rolls"
    __table_args__ = (
        UniqueConstraint("roll_code", name="uq_fabric_roll_code"),
        CheckConstraint("metres > 0", name="ck_roll_metres_positive"),
        CheckConstraint(
            "status IN ('awaiting_inspection', 'passed', 'rework', 'rejected', 'dispatched')",
            name="ck_roll_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    roll_code: Mapped[str] = mapped_column(String(100), nullable=False)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    production_run_id: Mapped[int] = mapped_column(
        ForeignKey("production_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    metres: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="awaiting_inspection", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    order: Mapped["Order"] = relationship(back_populates="rolls")
    production_run: Mapped["ProductionRun"] = relationship(back_populates="rolls")
    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="roll",
        order_by="Inspection.inspected_at",
    )
    dispatch_items: Mapped[list["DispatchItem"]] = relationship(
        back_populates="roll"
    )


class Inspection(Base):
    __tablename__ = "inspections"
    __table_args__ = (
        CheckConstraint(
            "result IN ('pass', 'rework', 'reject')", name="ck_inspection_result"
        ),
        CheckConstraint(
            "severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical')",
            name="ck_inspection_severity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    roll_id: Mapped[int] = mapped_column(
        ForeignKey("fabric_rolls.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    defect_type: Mapped[str | None] = mapped_column(String(150))
    severity: Mapped[str | None] = mapped_column(String(20))
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    disposition: Mapped[str | None] = mapped_column(Text)
    inspected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    roll: Mapped["FabricRoll"] = relationship(back_populates="inspections")


# ============================================================
# 5. DISPATCHES AND DISPATCH ITEMS
# ============================================================

class Dispatch(Base):
    __tablename__ = "dispatches"
    __table_args__ = (
        UniqueConstraint("invoice_number", name="uq_dispatch_invoice_number"),
        CheckConstraint(
            "(confirmed = FALSE) OR (confirmed = TRUE AND confirmed_at IS NOT NULL)",
            name="ck_dispatch_confirmed_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    dispatch_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    vehicle: Mapped[str | None] = mapped_column(String(100))
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship(back_populates="dispatches")
    items: Mapped[list["DispatchItem"]] = relationship(
        back_populates="dispatch", cascade="all, delete-orphan"
    )


class DispatchItem(Base):
    __tablename__ = "dispatch_items"
    __table_args__ = (
        UniqueConstraint("dispatch_id", "roll_id", name="uq_dispatch_roll"),
        CheckConstraint("metres > 0", name="ck_dispatch_item_metres_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(
        ForeignKey("dispatches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    roll_id: Mapped[int] = mapped_column(
        ForeignKey("fabric_rolls.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    metres: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    dispatch: Mapped["Dispatch"] = relationship(back_populates="items")
    roll: Mapped["FabricRoll"] = relationship(back_populates="dispatch_items")


# ============================================================
# 6. USERS AND AUTHENTICATION
# ============================================================

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('owner','planner','storekeeper','supervisor','inspector','accounts','buyer')",
            name="users_role_check",
        ),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="supervisor")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
