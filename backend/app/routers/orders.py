from app.schemas import BuyerCreate, BuyerOut
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Buyer,
    DispatchItem,
    InventoryMovement,
    Material,
    MaterialLot,
    Operation,
    Order,
)
from app.schemas import (
    FeasibilityOut,
    FeasibilityRequest,
    MaterialShortfall,
    OrderCreate,
    OrderOut,
)

router = APIRouter(tags=["Orders"])


def available_for_material(db: Session, material_id: int) -> Decimal:
    balance = func.coalesce(
        func.sum(
            case(
                (InventoryMovement.movement_type == "receipt",
                 InventoryMovement.quantity_kg),
                (InventoryMovement.movement_type == "issue",
                 -InventoryMovement.quantity_kg),
                (InventoryMovement.movement_type == "adjustment",
                 InventoryMovement.quantity_kg),
                else_=0,
            )
        ),
        0,
    )

    query = (
        select(balance)
        .join(MaterialLot, InventoryMovement.lot_id == MaterialLot.id)
        .where(MaterialLot.material_id == material_id)
    )
    return Decimal(str(db.scalar(query) or 0))


def calculate_feasibility(
    db: Session,
    fabric_type: str,
    colour: str,
    quantity_metres: Decimal,
) -> FeasibilityOut:
    materials = db.scalars(
        select(Material).where(
            func.lower(Material.material_type) == fabric_type.strip().lower(),
            func.lower(Material.colour) == colour.strip().lower(),
        )
    ).all()

    options = []
    for material in materials:
        required = quantity_metres * Decimal(str(material.yarn_kg_per_metre))
        available = available_for_material(db, material.id)
        shortfall = max(Decimal("0"), required - available)

        options.append(
            MaterialShortfall(
                material_id=material.id,
                material_type=material.material_type,
                colour=material.colour,
                specification=material.specification,
                required_kg=required,
                available_kg=available,
                shortfall_kg=shortfall,
                feasible=shortfall == 0,
            )
        )

    feasible = any(option.feasible for option in options)
    if feasible:
        message = "Sufficient compatible yarn is available."
    elif options:
        message = "Insufficient yarn. Review the shortfall or replenish stock."
    else:
        message = "No matching material was found for this fabric type and colour."

    return FeasibilityOut(
        feasible=feasible,
        requested_quantity_metres=quantity_metres,
        options=options,
        message=message,
    )


@router.post("/orders/feasibility", response_model=FeasibilityOut)
def check_feasibility(
    payload: FeasibilityRequest,
    db: Session = Depends(get_db),
):
    return calculate_feasibility(
        db,
        payload.fabric_type,
        payload.colour,
        payload.quantity_metres,
    )


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    buyer = db.get(Buyer, payload.buyer_id)
    if buyer is None:
        raise HTTPException(status_code=404, detail="Buyer not found")

    feasibility = calculate_feasibility(
        db,
        payload.fabric_type,
        payload.colour,
        payload.quantity_metres,
    )
    if not feasibility.feasible:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Order cannot be accepted because yarn feasibility failed.",
                "feasibility": feasibility.model_dump(mode="json"),
            },
        )

    try:
        order = Order(**payload.model_dump())
        db.add(order)
        db.flush()

        stages = [
            "spinning",
            "weaving",
            "dyeing",
            "inspection",
            "packing",
            "dispatch",
        ]
        for sequence, stage in enumerate(stages, start=1):
            db.add(
                Operation(
                    order_id=order.id,
                    stage=stage,
                    sequence=sequence,
                )
            )

        db.commit()
        db.refresh(order)
        return order
    except Exception:
        db.rollback()
        raise


@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Order)
        .order_by(Order.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.post("/buyers", response_model=BuyerOut, status_code=201)
def create_buyer(payload: BuyerCreate, db: Session = Depends(get_db)):
    buyer = Buyer(**payload.model_dump())
    db.add(buyer)
    db.commit()
    db.refresh(buyer)
    return buyer


@router.get("/buyers", response_model=list[BuyerOut])
def list_buyers(db: Session = Depends(get_db)):
    return db.scalars(select(Buyer).order_by(Buyer.id)).all()