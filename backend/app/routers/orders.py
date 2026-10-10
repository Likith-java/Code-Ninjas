from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user_optional
from app.database import get_db
from app.models import (
    Buyer,
    DispatchItem,
    InventoryMovement,
    Material,
    MaterialLot,
    Operation,
    Order,
    User,
)
from app.schemas import (
    BuyerCreate,
    BuyerOut,
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
    qty_decimal = Decimal(str(quantity_metres))

    for material in materials:
        factor = Decimal(str(material.yarn_kg_per_metre))
        required = (qty_decimal * factor).quantize(Decimal("0.001"))
        available = available_for_material(db, material.id).quantize(Decimal("0.001"))
        shortfall = max(Decimal("0.000"), required - available).quantize(Decimal("0.001"))

        options.append(
            MaterialShortfall(
                material_id=material.id,
                material_type=material.material_type,
                colour=material.colour,
                specification=material.specification,
                required_kg=required,
                available_kg=available,
                shortfall_kg=shortfall,
                feasible=shortfall == Decimal("0.000"),
            )
        )

    feasible = any(option.feasible for option in options)
    if feasible:
        message = (
            "Currently feasible based on warehouse ledger stock. "
            "Note: Yarn is NOT reserved until an issue movement is recorded."
        )
    elif options:
        message = "Insufficient yarn in stock. Review shortfall options."
    else:
        message = f"No matching material found for fabric type '{fabric_type}' and colour '{colour}'."

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
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    target_buyer_id = payload.buyer_id

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Customer account is not associated with a buyer profile.",
            )
        if payload.buyer_id != current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot create orders for another buyer.",
            )
        target_buyer_id = current_user.buyer_id

    buyer = db.get(Buyer, target_buyer_id)
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
        order_dict = payload.model_dump()
        order_dict["buyer_id"] = target_buyer_id
        order = Order(**order_dict)
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
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Database integrity constraint violation during order creation",
        )
    except Exception:
        db.rollback()
        raise


@router.get("/orders", response_model=list[OrderOut])
def list_orders(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    from app.services.dispatch import derive_order_status

    query = select(Order).order_by(Order.id.desc())

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id:
            return []
        query = query.where(Order.buyer_id == current_user.buyer_id)

    orders = db.scalars(query.offset(offset).limit(limit)).all()
    results: list[OrderOut] = []
    for o in orders:
        out = OrderOut.model_validate(o)
        out.derived_status = derive_order_status(db, o)
        results.append(out)
    return results


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    from app.services.dispatch import derive_order_status

    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id or order.buyer_id != current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to view this order.",
            )

    out = OrderOut.model_validate(order)
    out.derived_status = derive_order_status(db, order)
    return out


@router.post("/buyers", response_model=BuyerOut, status_code=201)
def create_buyer(payload: BuyerCreate, db: Session = Depends(get_db)):
    try:
        buyer = Buyer(**payload.model_dump())
        db.add(buyer)
        db.commit()
        db.refresh(buyer)
        return buyer
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Database integrity constraint violation during buyer creation",
        )
    except Exception:
        db.rollback()
        raise


@router.get("/buyers", response_model=list[BuyerOut])
def list_buyers(
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Pagination limit"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    query = select(Buyer).order_by(Buyer.id)
    if current_user and current_user.role == "customer":
        if not current_user.buyer_id:
            return []
        query = query.where(Buyer.id == current_user.buyer_id)

    return db.scalars(query.offset(offset).limit(limit)).all()


@router.get("/buyers/{buyer_id}", response_model=BuyerOut)
def get_buyer(
    buyer_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user and current_user.role == "customer":
        if not current_user.buyer_id or buyer_id != current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to view this buyer.",
            )

    buyer = db.get(Buyer, buyer_id)
    if buyer is None:
        raise HTTPException(status_code=404, detail="Buyer not found")
    return buyer
