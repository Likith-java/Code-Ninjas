from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Sequence
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models import Material
from app.schemas_pricing import FabricCatalogueItem, PriceQuoteOut

# Authoritative base rate catalogue per fabric type & colour configured for Everest Textile Mills
# Development reference rates aligned with synthetic seed orders
CONFIGURED_PRICING: dict[tuple[str, str], dict[str, Any]] = {
    ("cotton", "navy blue"): {
        "id": "FAB-CTN-BLU",
        "fabric_type": "Cotton",
        "colour": "Navy Blue",
        "specification": "30s combed ring-spun cotton (warp/weft 68x68)",
        "base_rate": Decimal("170.00"),
        "min_order": Decimal("100.00"),
        "tax_rate": Decimal("0.05"),
    },
    ("cotton", "bleached white"): {
        "id": "FAB-CTN-WHT",
        "fabric_type": "Cotton",
        "colour": "Bleached White",
        "specification": "40s compact combed cotton poplin sheeting",
        "base_rate": Decimal("160.00"),
        "min_order": Decimal("100.00"),
        "tax_rate": Decimal("0.05"),
    },
    ("polyester", "charcoal black"): {
        "id": "FAB-POLY-BLK",
        "fabric_type": "Polyester",
        "colour": "Charcoal Black",
        "specification": "150D/48F textured polyester filament twill",
        "base_rate": Decimal("135.00"),
        "min_order": Decimal("100.00"),
        "tax_rate": Decimal("0.05"),
    },
    ("linen", "natural flax"): {
        "id": "FAB-LIN-NAT",
        "fabric_type": "Linen",
        "colour": "Natural Flax",
        "specification": "60s dry-spun wet-processed flax luxury sheeting",
        "base_rate": Decimal("290.00"),
        "min_order": Decimal("100.00"),
        "tax_rate": Decimal("0.05"),
    },
    ("silk", "crimson red"): {
        "id": "FAB-SLK-RED",
        "fabric_type": "Silk",
        "colour": "Crimson Red",
        "specification": "20/22 denier mulberry raw silk dress crepe",
        "base_rate": Decimal("450.00"),
        "min_order": Decimal("50.00"),
        "tax_rate": Decimal("0.05"),
    },
}

# Fallback generic default rates by fabric type if colour is varied
DEFAULT_TYPE_RATES: dict[str, Decimal] = {
    "cotton": Decimal("165.00"),
    "polyester": Decimal("135.00"),
    "linen": Decimal("295.00"),
    "silk": Decimal("435.00"),
}


def get_supported_fabrics(db: Session | None = None) -> list[FabricCatalogueItem]:
    """
    Returns the supported fabric catalogue from factory definitions and database materials.
    """
    items: list[FabricCatalogueItem] = []

    # Map materials from database if session is provided
    db_materials_map = {}
    if db is not None:
        try:
            mats = db.scalars(select(Material)).all()
            for m in mats:
                key = (m.material_type.strip().lower(), m.colour.strip().lower())
                db_materials_map[key] = m
        except Exception:
            pass

    for (ft_key, col_key), config in CONFIGURED_PRICING.items():
        mat = db_materials_map.get((ft_key, col_key))
        item = FabricCatalogueItem(
            id=config["id"],
            fabric_type=config["fabric_type"],
            colour=config["colour"],
            specification=mat.specification if mat else config["specification"],
            base_rate_per_metre=config["base_rate"],
            min_order_metres=config["min_order"],
            tax_rate=config["tax_rate"],
            material_id=mat.id if mat else None,
            currency="USD",
        )
        items.append(item)

    return items


def resolve_fabric_config(fabric_type: str, colour: str | None = None, db: Session | None = None) -> dict[str, Any]:
    """
    Resolves the pricing definition for a fabric type and colour.
    Raises HTTPException if the fabric is unsupported.
    """
    ft_norm = fabric_type.strip().lower()
    col_norm = colour.strip().lower() if colour else None

    if col_norm:
        key = (ft_norm, col_norm)
        if key in CONFIGURED_PRICING:
            return CONFIGURED_PRICING[key]

    # Try finding exact matching fabric type
    for (f_type, _), config in CONFIGURED_PRICING.items():
        if f_type == ft_norm:
            if not col_norm or col_norm in config["colour"].lower():
                return config

    # Check prefix or category match (e.g., 'Cotton_abc' -> cotton)
    for cat_name, rate in DEFAULT_TYPE_RATES.items():
        if ft_norm.startswith(cat_name) or cat_name in ft_norm:
            return {
                "id": f"FAB-{cat_name.upper()}",
                "fabric_type": fabric_type.strip(),
                "colour": colour.strip().title() if colour else "Standard",
                "specification": f"Standard mill specification for {fabric_type.strip()}",
                "base_rate": rate,
                "min_order": Decimal("1.00"),
                "tax_rate": Decimal("0.05"),
            }

    # If db is available, check if Material table has this material
    if db is not None:
        mat = db.scalar(
            select(Material).where(func.lower(Material.material_type) == ft_norm).limit(1)
        )
        if mat is not None:
            return {
                "id": f"FAB-MAT-{mat.id}",
                "fabric_type": mat.material_type,
                "colour": mat.colour if not colour else colour.strip().title(),
                "specification": mat.specification,
                "base_rate": Decimal("165.00"),
                "min_order": Decimal("1.00"),
                "tax_rate": Decimal("0.05"),
            }

    supported_list = ", ".join(sorted({c["fabric_type"] for c in CONFIGURED_PRICING.values()}))
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported fabric type '{fabric_type}'. Supported fabrics are: {supported_list}.",
    )


def calculate_authoritative_price(
    fabric_type: str,
    colour: str | None,
    quantity_metres: Decimal | float | int | str,
    db: Session | None = None,
) -> PriceQuoteOut:
    """
    Authoritatively computes line pricing, taxes, and total using Decimal arithmetic.
    """
    qty = Decimal(str(quantity_metres))
    if qty <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Order quantity must be greater than zero.",
        )

    config = resolve_fabric_config(fabric_type, colour, db=db)
    min_order = config.get("min_order", Decimal("1.00"))

    if qty < min_order:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Minimum order quantity for {config['fabric_type']} is {min_order} metres (requested: {qty}m).",
        )

    unit_price = config["base_rate"].quantize(Decimal("0.01"))
    subtotal = (qty * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    tax_rate = config["tax_rate"]
    tax_amount = (subtotal * tax_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    discount_amount = Decimal("0.00")
    total_amount = subtotal + tax_amount - discount_amount

    return PriceQuoteOut(
        fabric_type=config["fabric_type"],
        colour=config["colour"] if not colour else colour.strip().title(),
        quantity_metres=qty.quantize(Decimal("0.01")),
        unit_price=unit_price,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        total_amount=total_amount,
        currency="USD",
        min_order_metres=min_order,
        specification=config["specification"],
    )
