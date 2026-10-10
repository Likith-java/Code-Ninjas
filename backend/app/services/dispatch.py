from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Dispatch,
    DispatchItem,
    FabricRoll,
    Order,
    ProductionRun,
)
from app.schemas import (
    DispatchCreate,
    DispatchItemOut,
    DispatchOut,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def derive_order_status(db: Session, order: Order) -> str:
    """
    Derives the lifecycle progress of an order purely from its
    production runs, inspected rolls, and confirmed dispatches.
    Never uses a manually stored status column.
    """
    # 1. Total confirmed dispatched metres
    dispatched_metres = (
        db.scalar(
            select(func.coalesce(func.sum(DispatchItem.metres), 0))
            .join(Dispatch, DispatchItem.dispatch_id == Dispatch.id)
            .where(
                Dispatch.order_id == order.id,
                Dispatch.confirmed.is_(True),
            )
        )
        or Decimal("0")
    )
    dispatched_metres = Decimal(str(dispatched_metres))
    order_qty = Decimal(str(order.quantity_metres))

    if dispatched_metres >= order_qty:
        return "completed"
    if dispatched_metres > 0:
        return "partially_dispatched"

    # 2. Total passed inspection rolls
    passed_metres = (
        db.scalar(
            select(func.coalesce(func.sum(FabricRoll.metres), 0)).where(
                FabricRoll.order_id == order.id,
                FabricRoll.status == "passed",
            )
        )
        or Decimal("0")
    )
    passed_metres = Decimal(str(passed_metres))
    if passed_metres >= order_qty:
        return "ready_for_dispatch"

    # 3. Production runs
    has_running = db.scalar(
        select(ProductionRun.id)
        .where(
            ProductionRun.order_id == order.id,
            ProductionRun.status == "running",
        )
        .limit(1)
    )
    if has_running is not None:
        return "in_production"

    has_runs = db.scalar(
        select(ProductionRun.id)
        .where(ProductionRun.order_id == order.id)
        .limit(1)
    )
    if has_runs is not None:
        return "scheduled"

    return "pending"


def calculate_line_and_invoice_totals(
    agreed_rate: Decimal,
    items: Sequence[DispatchItem],
) -> tuple[Decimal, Decimal, dict[int, Decimal]]:
    """
    Performs server-side Decimal-safe line total and invoice total arithmetic.
    Returns: (total_metres, invoice_total, line_totals_by_item_id)
    """
    rate = Decimal(str(agreed_rate))
    line_totals: dict[int, Decimal] = {}
    total_metres = Decimal("0")
    invoice_total = Decimal("0")

    for it in items:
        m = Decimal(str(it.metres))
        total_metres += m
        lt = (m * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if it.id is not None:
            line_totals[it.id] = lt
        invoice_total += lt

    return total_metres, invoice_total, line_totals


def build_dispatch_out(db: Session, dispatch: Dispatch) -> DispatchOut:
    """
    Constructs a detailed DispatchOut schema with line totals and invoice totals.
    """
    order = dispatch.order or db.get(Order, dispatch.order_id)
    rate = Decimal(str(order.agreed_rate))

    items_out: list[DispatchItemOut] = []
    total_metres = Decimal("0")
    invoice_total = Decimal("0")

    for it in dispatch.items:
        m = Decimal(str(it.metres))
        total_metres += m
        lt = (m * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        invoice_total += lt

        roll_code = it.roll.roll_code if it.roll else None
        if roll_code is None:
            r = db.get(FabricRoll, it.roll_id)
            roll_code = r.roll_code if r else None

        items_out.append(
            DispatchItemOut(
                id=it.id,
                dispatch_id=it.dispatch_id,
                roll_id=it.roll_id,
                roll_code=roll_code,
                metres=m,
                agreed_rate=rate,
                line_total=lt,
            )
        )

    return DispatchOut(
        id=dispatch.id,
        order_id=dispatch.order_id,
        dispatch_date=dispatch.dispatch_date,
        vehicle=dispatch.vehicle,
        invoice_number=dispatch.invoice_number,
        confirmed=dispatch.confirmed,
        confirmed_at=dispatch.confirmed_at,
        total_metres=total_metres,
        agreed_rate=rate,
        invoice_total=invoice_total,
        items=items_out,
        order_fabric_type=order.fabric_type if order else None,
        order_colour=order.colour if order else None,
    )
