from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# -------------------- Buyers and orders --------------------

class BuyerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    contact: str | None = None
    email: str | None = None
    address: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Buyer name cannot be empty or only whitespace")
        return s


class BuyerOut(BuyerCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class OrderCreate(BaseModel):
    buyer_id: int = Field(gt=0)
    fabric_type: str = Field(min_length=1, max_length=100)
    colour: str = Field(min_length=1, max_length=100)
    quantity_metres: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    agreed_rate: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    deadline: datetime
    priority: Literal["low", "normal", "high", "urgent"] = "normal"

    @field_validator("fabric_type", "colour")
    @classmethod
    def validate_non_empty_strings(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or only whitespace")
        return s

    @field_validator("deadline")
    @classmethod
    def validate_deadline(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v <= datetime.now(timezone.utc):
            raise ValueError("Deadline must be after current time and order creation date")
        return v


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    buyer_id: int
    fabric_type: str
    colour: str
    quantity_metres: Decimal
    agreed_rate: Decimal
    order_date: datetime
    deadline: datetime
    priority: str
    derived_status: str | None = None
    buyer_name: str | None = None
    total_amount: Decimal | None = None
    current_stage: str | None = None
    produced_metres: Decimal | None = None


class FeasibilityRequest(BaseModel):
    fabric_type: str = Field(min_length=1, max_length=100)
    colour: str = Field(min_length=1, max_length=100)
    quantity_metres: Decimal = Field(gt=0)


class MaterialShortfall(BaseModel):
    material_id: int
    material_type: str
    colour: str
    specification: str
    required_kg: Decimal
    available_kg: Decimal
    shortfall_kg: Decimal
    feasible: bool


class FeasibilityOut(BaseModel):
    feasible: bool
    requested_quantity_metres: Decimal
    options: list[MaterialShortfall]
    message: str


# -------------------- Suppliers and Materials --------------------

class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    contact: str | None = Field(default=None, max_length=150)
    email: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Supplier name cannot be empty or only whitespace")
        return s


class SupplierOut(SupplierCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class MaterialCreate(BaseModel):
    material_type: str = Field(min_length=1, max_length=100)
    colour: str = Field(min_length=1, max_length=100)
    specification: str = Field(min_length=1, max_length=150)
    reorder_threshold_kg: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=3)
    yarn_kg_per_metre: Decimal = Field(gt=0, max_digits=12, decimal_places=6)

    @field_validator("material_type", "colour", "specification")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or only whitespace")
        return s


class MaterialOut(MaterialCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


# -------------------- Inventory --------------------

class ReceiptCreate(BaseModel):
    lot_code: str = Field(min_length=1, max_length=100)
    material_id: int = Field(gt=0)
    supplier_id: int = Field(gt=0)
    quantity_kg: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    lot_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    intended_order_id: int | None = Field(default=None, gt=0)
    note: str | None = None

    @field_validator("lot_code")
    @classmethod
    def validate_lot_code(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Lot code cannot be empty or only whitespace")
        return s


class IssueCreate(BaseModel):
    lot_id: int = Field(gt=0)
    order_id: int = Field(gt=0)
    quantity_kg: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    note: str | None = None


class AdjustmentCreate(BaseModel):
    lot_id: int = Field(gt=0)
    quantity_kg: Decimal = Field(max_digits=12, decimal_places=3)
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("quantity_kg")
    @classmethod
    def validate_nonzero_quantity(cls, v: Decimal) -> Decimal:
        if v == 0:
            raise ValueError("Adjustment quantity cannot be zero; use positive for surplus or negative for shrinkage")
        return v

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Adjustment reason cannot be empty or only whitespace")
        return s


class InventoryMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lot_id: int
    order_id: int | None
    movement_type: str
    quantity_kg: Decimal
    movement_date: datetime
    note: str | None


class InventoryLotOut(BaseModel):
    lot_id: int
    lot_code: str
    qr_token: str | None = None
    material_id: int
    material_type: str
    colour: str
    specification: str
    supplier_id: int
    available_kg: Decimal
    reorder_threshold_kg: Decimal
    low_stock: bool


class MaterialLotDetailOut(BaseModel):
    lot_id: int
    lot_code: str
    qr_token: str | None = None
    qr_code_url: str
    material_id: int
    material_type: str
    colour: str
    specification: str
    yarn_kg_per_metre: Decimal | None = None
    supplier_id: int
    supplier_name: str | None = None
    supplier_contact: str | None = None
    initial_received_kg: Decimal
    available_kg: Decimal
    intended_order_id: int | None = None
    intended_order_code: str | None = None
    lot_cost: Decimal
    unit: str = "kg"
    received_at: datetime
    movements: list[InventoryMovementOut] = []
    quality_status: str = "Released"


class InventorySummaryOut(BaseModel):
    total_lots: int
    low_stock_materials: int
    lots: list[InventoryLotOut]


# -------------------- Rolls and quality inspections --------------------

class InspectionCreate(BaseModel):
    defect_type: str | None = Field(default=None, max_length=150)
    severity: Literal["low", "medium", "high", "critical"] | None = None
    result: Literal["pass", "rework", "reject"]
    disposition: str | None = Field(default=None, max_length=1000)

    @field_validator("defect_type", "disposition")
    @classmethod
    def validate_strings(cls, v: str | None) -> str | None:
        if v is not None:
            s = v.strip()
            return s if s else None
        return None


class InspectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    roll_id: int
    defect_type: str | None
    severity: str | None
    result: str
    disposition: str | None
    inspected_at: datetime


class TraceabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    roll_id: int
    roll_code: str
    order_id: int
    production_run_id: int
    machine_id: int | None = None
    metres: Decimal
    status: str
    created_at: datetime
    is_dispatch_eligible: bool = False
    fabric_type: str | None = None
    colour: str | None = None
    machine_code: str | None = None
    machine_type: str | None = None
    run_kind: str | None = None
    run_status: str | None = None
    inspections: list[InspectionOut] = []
    latest_inspection: InspectionOut | None = None


class FabricRollCreate(BaseModel):
    roll_code: str = Field(min_length=1, max_length=50)
    order_id: int = Field(gt=0)
    production_run_id: int = Field(gt=0)
    metres: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    status: Literal["awaiting_inspection"] | None = None

    @field_validator("roll_code")
    @classmethod
    def validate_roll_code(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("roll_code cannot be empty or only whitespace")
        return s


class FabricRollOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    roll_code: str
    order_id: int
    production_run_id: int
    metres: Decimal
    status: str
    created_at: datetime
    is_dispatch_eligible: bool = False


# -------------------- Machines and Downtimes --------------------

class MachineCreate(BaseModel):
    machine_code: str = Field(min_length=1, max_length=50)
    machine_type: Literal["spinning", "weaving", "dyeing"]
    capacity_rate: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    state: Literal["idle", "scheduled", "running", "maintenance", "breakdown"] = "idle"
    is_active: bool = True

    @field_validator("machine_code")
    @classmethod
    def validate_machine_code(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("machine_code cannot be empty or only whitespace")
        return s


class MachineUpdate(BaseModel):
    state: Literal["idle", "scheduled", "running", "maintenance", "breakdown"] | None = None
    is_active: bool | None = None
    capacity_rate: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class MachineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    machine_code: str
    machine_type: str
    capacity_rate: Decimal
    state: str
    is_active: bool


class DowntimeCreate(BaseModel):
    machine_id: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=255)
    start_time: datetime
    end_time: datetime | None = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("reason cannot be empty or only whitespace")
        return s

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_end_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_order(cls, v: datetime | None, info) -> datetime | None:
        start = info.data.get("start_time")
        if v is not None and start is not None and v < start:
            raise ValueError("end_time cannot be earlier than start_time")
        return v


class DowntimeUpdate(BaseModel):
    reason: str | None = Field(default=None, min_length=1, max_length=255)
    end_time: datetime | None = None

    @field_validator("end_time")
    @classmethod
    def validate_end_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class DowntimeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    machine_id: int
    reason: str
    start_time: datetime
    end_time: datetime | None


# -------------------- Operations and Production Runs --------------------

class OperationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    stage: str
    sequence: int
    planned_duration_minutes: int | None
    eligible_machine_ids: list[int] = []


class ProductionRunCreate(BaseModel):
    order_id: int = Field(gt=0)
    operation_id: int = Field(gt=0)
    machine_id: int = Field(gt=0)
    run_kind: Literal["scheduled", "actual"] = "actual"
    status: Literal["planned", "running", "completed", "cancelled"] = "planned"
    start_time: datetime | None = None
    end_time: datetime | None = None
    output_metres: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_end_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_order(cls, v: datetime | None, info) -> datetime | None:
        start = info.data.get("start_time")
        if v is not None and start is not None and v < start:
            raise ValueError("end_time cannot be earlier than start_time")
        return v


class ProductionRunUpdate(BaseModel):
    status: Literal["planned", "running", "completed", "cancelled"] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    output_metres: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    machine_id: int | None = Field(default=None, gt=0)

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_end_time(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    @field_validator("end_time")
    @classmethod
    def validate_time_order(cls, v: datetime | None, info) -> datetime | None:
        start = info.data.get("start_time")
        if v is not None and start is not None and v < start:
            raise ValueError("end_time cannot be earlier than start_time")
        return v


class ProductionRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    operation_id: int
    machine_id: int
    run_kind: str
    status: str
    start_time: datetime | None
    end_time: datetime | None
    output_metres: Decimal | None
    stage: str | None = None
    machine_code: str | None = None
    machine_type: str | None = None
    fabric_type: str | None = None
    colour: str | None = None
    target_metres: Decimal | None = None
    buyer_name: str | None = None


class StartProductionRequest(BaseModel):
    operation_id: int | None = Field(default=None, description="Optional target operation ID")
    machine_id: int | None = Field(default=None, description="Optional target machine ID")


class StartProductionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: int
    production_run_id: int
    operation_id: int
    stage: str
    machine_id: int
    machine_code: str
    status: str
    start_time: datetime
    message: str


class EligibleMachineSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    machine_code: str
    machine_type: str
    state: str
    is_active: bool


class OperationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stage: str
    sequence: int
    planned_duration_minutes: int | None = None
    eligible_machines: list[EligibleMachineSummary] = []


class OrderReadinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: int
    buyer_id: int
    buyer_name: str | None = None
    fabric_type: str
    colour: str
    quantity_metres: Decimal
    deadline: datetime
    priority: str
    derived_status: str
    yarn_feasible: bool
    feasibility_message: str
    target_operation: OperationSummary | None = None
    recommended_machine: EligibleMachineSummary | None = None
    eligible_machines: list[EligibleMachineSummary] = []
    has_active_run: bool = False
    active_run_id: int | None = None
    active_machine_code: str | None = None
    existing_runs: list[ProductionRunOut] = []


# -------------------- Dispatches and Invoices --------------------

class DispatchItemCreate(BaseModel):
    roll_id: int = Field(gt=0)
    metres: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class DispatchItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dispatch_id: int
    roll_id: int
    roll_code: str | None = None
    metres: Decimal
    agreed_rate: Decimal
    line_total: Decimal


class DispatchCreate(BaseModel):
    order_id: int = Field(gt=0)
    dispatch_date: datetime
    vehicle: str | None = Field(default=None, max_length=100)
    invoice_number: str = Field(min_length=1, max_length=100)
    items: list[DispatchItemCreate] = Field(min_length=1)
    expected_invoice_total: Decimal | None = None

    @field_validator("invoice_number")
    @classmethod
    def validate_invoice_number(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("invoice_number cannot be empty or only whitespace")
        return s

    @field_validator("vehicle")
    @classmethod
    def validate_vehicle(cls, v: str | None) -> str | None:
        if v is not None:
            s = v.strip()
            return s if s else None
        return None

    @field_validator("dispatch_date")
    @classmethod
    def validate_dispatch_date(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class DispatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    dispatch_date: datetime
    vehicle: str | None
    invoice_number: str
    confirmed: bool
    confirmed_at: datetime | None
    total_metres: Decimal
    agreed_rate: Decimal
    invoice_total: Decimal
    items: list[DispatchItemOut]
    order_fabric_type: str | None = None
    order_colour: str | None = None


class DispatchConfirmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    invoice_number: str
    confirmed: bool
    confirmed_at: datetime | None
    total_metres: Decimal
    invoice_total: Decimal
    message: str
    dispatched_roll_codes: list[str]


# -------------------- Users and Authentication --------------------

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank.")
        return v.strip()


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    buyer_id: int | None = None


class AuthResponse(BaseModel):
    token: str
    user: UserOut


# -------------------- Email Notifications --------------------

class EmailNotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    notification_type: str
    recipient_email: str
    recipient_name: str | None = None
    recipient_role: str | None = None
    subject: str
    status: str
    attempt_count: int
    last_error: str | None = None
    created_at: datetime
    sent_at: datetime | None = None
