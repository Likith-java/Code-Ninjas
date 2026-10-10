from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    agreed_rate: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
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
    material_id: int
    material_type: str
    colour: str
    specification: str
    supplier_id: int
    available_kg: Decimal
    reorder_threshold_kg: Decimal
    low_stock: bool


class InventorySummaryOut(BaseModel):
    total_lots: int
    low_stock_materials: int
    lots: list[InventoryLotOut]


# -------------------- Rolls and quality inspections --------------------

class InspectionCreate(BaseModel):
    defect_type: str | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    result: Literal["pass", "rework", "reject"]
    disposition: str | None = None


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
    roll_id: int
    roll_code: str
    order_id: int
    production_run_id: int
    machine_id: int
    metres: Decimal
    status: str
    created_at: datetime
    inspections: list[InspectionOut]