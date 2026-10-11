from decimal import Decimal
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class FabricCatalogueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    fabric_type: str
    colour: str
    specification: str
    base_rate_per_metre: Decimal
    min_order_metres: Decimal = Decimal("100.00")
    tax_rate: Decimal = Decimal("0.05")
    material_id: int | None = None
    currency: str = "USD"


class PriceQuoteRequest(BaseModel):
    fabric_type: str = Field(min_length=1, max_length=100)
    colour: str | None = Field(default=None, max_length=100)
    quantity_metres: Decimal = Field(gt=0)


class PriceQuoteOut(BaseModel):
    fabric_type: str
    colour: str
    quantity_metres: Decimal
    unit_price: Decimal
    subtotal: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    discount_amount: Decimal = Decimal("0.00")
    total_amount: Decimal
    currency: str = "USD"
    min_order_metres: Decimal
    specification: str
