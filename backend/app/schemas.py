from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# -------------------- Buyers and orders --------------------

class BuyerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    contact: str | None = None
    email: str | None = None
    address: str | None = None


class BuyerOut(BuyerCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class OrderCreate(BaseModel):
    buyer_id: int
    fabric_type: str = Field(min_length=1, max_length=100)
    colour: str = Field(min_length=1, max_length=100)
    quantity_metres: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    agreed_rate: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    deadline: datetime
    priority: Literal["low", "normal", "high", "urgent"] = "normal"


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


# -------------------- Inventory --------------------

class ReceiptCreate(BaseModel):
    lot_code: str = Field(min_length=1, max_length=100)
    material_id: int
    supplier_id: int
    quantity_kg: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    lot_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    intended_order_id: int | None = None
    note: str | None = None


class IssueCreate(BaseModel):
    lot_id: int
    order_id: int
    quantity_kg: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    note: str | None = None


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