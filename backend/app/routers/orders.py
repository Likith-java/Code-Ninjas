from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_current_user_optional
from app.database import get_db
from app.services.dispatch import derive_order_status
from app.services.notification_service import dispatch_order_placed_notifications
from app.services.production import (
    ensure_utc,
    sync_machine_state_after_run_change,
    utc_now,
    validate_actual_run_overlap,
    validate_machine_eligibility,
    validate_run_downtime_conflict,
)
from app.models import (
    Buyer,
    Dispatch,
    DispatchItem,
    Downtime,
    FabricRoll,
    InventoryMovement,
    Machine,
    Material,
    MaterialLot,
    Operation,
    Order,
    ProductionRun,
    User,
)
from app.schemas import (
    BuyerCreate,
    BuyerOut,
    EligibleMachineSummary,
    FeasibilityOut,
    FeasibilityRequest,
    MaterialShortfall,
    OperationSummary,
    OrderCreate,
    OrderOut,
    OrderReadinessOut,
    ProductionRunOut,
    StartProductionOut,
    StartProductionRequest,
)
from app.schemas_pricing import FabricCatalogueItem, PriceQuoteOut, PriceQuoteRequest
from app.services.pricing import calculate_authoritative_price, get_supported_fabrics

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


@router.get("/fabrics", response_model=list[FabricCatalogueItem], summary="List supported fabric catalogue with base rates")
@router.get("/orders/pricing/fabrics", response_model=list[FabricCatalogueItem], include_in_schema=False)
@router.get("/api/pricing/fabrics", response_model=list[FabricCatalogueItem], include_in_schema=False)
def list_supported_fabrics(
    db: Session = Depends(get_db),
):
    return get_supported_fabrics(db)


@router.post("/orders/quote", response_model=PriceQuoteOut, summary="Calculate authoritative price quote")
@router.post("/api/pricing/quote", response_model=PriceQuoteOut, include_in_schema=False)
def get_price_quote(
    payload: PriceQuoteRequest,
    db: Session = Depends(get_db),
):
    return calculate_authoritative_price(
        fabric_type=payload.fabric_type,
        colour=payload.colour,
        quantity_metres=payload.quantity_metres,
        db=db,
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


def populate_order_metrics(db: Session, order: Order, out: OrderOut) -> OrderOut:
    out.derived_status = derive_order_status(db, order)
    if order.buyer:
        out.buyer_name = order.buyer.name
    
    qty = Decimal(str(order.quantity_metres))
    rate = Decimal(str(order.agreed_rate))
    out.total_amount = (qty * rate).quantize(Decimal("0.01"))

    # Determine current stage from actual runs
    runs = db.scalars(
        select(ProductionRun)
        .options(selectinload(ProductionRun.operation))
        .where(ProductionRun.order_id == order.id)
    ).all()

    running_run = next((r for r in runs if r.run_kind == "actual" and r.status == "running"), None)
    if running_run and running_run.operation:
        out.current_stage = running_run.operation.stage
    elif runs:
        completed_run = next((r for r in runs if r.status == "completed"), None)
        if completed_run and completed_run.operation:
            out.current_stage = completed_run.operation.stage
        else:
            first_run = runs[0]
            out.current_stage = first_run.operation.stage if first_run.operation else "spinning"
    else:
        out.current_stage = "spinning"

    # Total produced metres from passed rolls or actual run output
    passed_metres = db.scalar(
        select(func.coalesce(func.sum(FabricRoll.metres), 0)).where(
            FabricRoll.order_id == order.id,
            FabricRoll.status == "passed",
        )
    ) or Decimal("0")

    if Decimal(str(passed_metres)) > 0:
        out.produced_metres = Decimal(str(passed_metres))
    else:
        run_output = db.scalar(
            select(func.coalesce(func.sum(ProductionRun.output_metres), 0)).where(
                ProductionRun.order_id == order.id,
                ProductionRun.run_kind == "actual",
            )
        ) or Decimal("0")
        out.produced_metres = Decimal(str(run_output))

    return out


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
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

    # Authoritative server pricing & fabric validation
    quote = calculate_authoritative_price(
        fabric_type=payload.fabric_type,
        colour=payload.colour,
        quantity_metres=payload.quantity_metres,
        db=db,
    )

    feasibility = calculate_feasibility(
        db,
        quote.fabric_type,
        quote.colour,
        quote.quantity_metres,
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
        order_dict["fabric_type"] = quote.fabric_type
        order_dict["colour"] = quote.colour
        # Authoritative pricing: For standard catalogue fabrics, enforce server calculation and ignore tampering
        # For custom/test contract orders, use negotiated agreed_rate if provided
        ft_key = (quote.fabric_type.strip().lower(), quote.colour.strip().lower() if quote.colour else "")
        from app.services.pricing import CONFIGURED_PRICING
        if ft_key in CONFIGURED_PRICING:
            order_dict["agreed_rate"] = quote.unit_price  # Enforce authoritative unit price! Ignore client tampering!
        elif payload.agreed_rate is not None and Decimal(str(payload.agreed_rate)) > 0:
            order_dict["agreed_rate"] = Decimal(str(payload.agreed_rate))
        else:
            order_dict["agreed_rate"] = quote.unit_price

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
        background_tasks.add_task(
            dispatch_order_placed_notifications,
            order.id,
            current_user.id if current_user else None,
        )
        out = OrderOut.model_validate(order)
        return populate_order_metrics(db, order, out)
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
    query = (
        select(Order)
        .options(selectinload(Order.buyer))
        .order_by(Order.id.desc())
    )

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id:
            return []
        query = query.where(Order.buyer_id == current_user.buyer_id)

    orders = db.scalars(query.offset(offset).limit(limit)).all()
    results: list[OrderOut] = []
    for o in orders:
        out = OrderOut.model_validate(o)
        results.append(populate_order_metrics(db, o, out))
    return results


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.buyer))
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id or order.buyer_id != current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to view this order.",
            )

    out = OrderOut.model_validate(order)
    return populate_order_metrics(db, order, out)


@router.get("/orders/{order_id}/tracking", summary="Get detailed customer order tracking lifecycle timeline")
def get_order_tracking(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    order = db.scalar(
        select(Order)
        .options(
            selectinload(Order.buyer),
            selectinload(Order.production_runs).selectinload(ProductionRun.machine),
            selectinload(Order.rolls),
            selectinload(Order.dispatches).selectinload(Dispatch.items),
        )
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user and current_user.role == "customer":
        if not current_user.buyer_id or order.buyer_id != current_user.buyer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: you do not have permission to view this order.",
            )

    derived_status = derive_order_status(db, order)
    qty = Decimal(str(order.quantity_metres))
    rate = Decimal(str(order.agreed_rate))
    total_amount = (qty * rate).quantize(Decimal("0.01"))

    # Active running run
    running_run = next(
        (r for r in order.production_runs if r.run_kind == "actual" and r.status == "running"),
        None,
    )
    has_scheduled = any(r.run_kind == "scheduled" and r.status != "cancelled" for r in order.production_runs)
    has_actual_runs = any(r.run_kind == "actual" for r in order.production_runs)

    passed_rolls = [r for r in order.rolls if r.status == "passed"]
    passed_metres = sum((Decimal(str(r.metres)) for r in passed_rolls), Decimal("0"))

    dispatches = [d for d in order.dispatches if d.confirmed]
    dispatched_metres = Decimal("0")
    for d in dispatches:
        for it in d.items:
            dispatched_metres += Decimal(str(it.metres))

    is_order_placed = True
    is_feasibility_checked = True
    is_scheduled = has_scheduled or has_actual_runs or derived_status not in ("pending", "not_started")
    is_in_production = has_actual_runs or derived_status in ("in_production", "ready_for_dispatch", "partially_dispatched", "completed")
    is_quality_inspection = passed_metres > 0 or len(order.rolls) > 0 or derived_status in ("ready_for_dispatch", "partially_dispatched", "completed")
    is_ready_for_dispatch = derived_status in ("ready_for_dispatch", "partially_dispatched", "completed")
    is_dispatched = derived_status in ("partially_dispatched", "completed") or dispatched_metres > 0
    is_delivered = derived_status == "completed"

    timeline_stages = [
        {"key": "order_placed", "name": "Order Placed", "completed": is_order_placed, "active": derived_status == "pending"},
        {"key": "feasibility_checked", "name": "Feasibility Checked", "completed": is_feasibility_checked, "active": False},
        {"key": "scheduled", "name": "Scheduled", "completed": is_scheduled, "active": derived_status == "scheduled"},
        {"key": "in_production", "name": "In Production", "completed": is_in_production, "active": derived_status == "in_production"},
        {"key": "quality_inspection", "name": "Quality Inspection", "completed": is_quality_inspection, "active": is_quality_inspection and not is_ready_for_dispatch},
        {"key": "ready_for_dispatch", "name": "Ready for Dispatch", "completed": is_ready_for_dispatch, "active": derived_status == "ready_for_dispatch"},
        {"key": "dispatched", "name": "Dispatched", "completed": is_dispatched, "active": derived_status == "partially_dispatched"},
        {"key": "delivered", "name": "Delivered", "completed": is_delivered, "active": is_delivered},
    ]

    return {
        "order_id": order.id,
        "buyer_id": order.buyer_id,
        "buyer_name": order.buyer.name if order.buyer else None,
        "fabric_type": order.fabric_type,
        "colour": order.colour,
        "quantity_metres": float(qty),
        "agreed_rate": float(rate),
        "total_amount": float(total_amount),
        "order_date": order.order_date.isoformat(),
        "deadline": order.deadline.isoformat(),
        "priority": order.priority,
        "derived_status": derived_status,
        "current_stage": running_run.machine.machine_type if running_run and running_run.machine else ("weaving" if is_in_production else "spinning"),
        "active_machine": running_run.machine.machine_code if running_run and running_run.machine else None,
        "passed_rolls_count": len(passed_rolls),
        "passed_metres": float(passed_metres),
        "dispatches_count": len(dispatches),
        "dispatched_metres": float(dispatched_metres),
        "timeline": timeline_stages,
    }


@router.get(
    "/orders/{order_id}/readiness",
    response_model=OrderReadinessOut,
    summary="Inspect order feasibility, operation sequence, and machine availability for production start",
)
@router.get(
    "/api/orders/{order_id}/readiness",
    response_model=OrderReadinessOut,
    include_in_schema=False,
)
def get_order_production_readiness(
    order_id: int,
    operation_id: int | None = Query(None, description="Optional target operation ID to inspect"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns full readiness analysis for starting production on an order.
    Restricted strictly to Admin and Production Manager roles.
    """
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only Admin and Production Manager can inspect production readiness.",
        )

    order = db.scalar(
        select(Order)
        .options(
            selectinload(Order.buyer),
            selectinload(Order.operations).selectinload(Operation.eligible_machines),
            selectinload(Order.production_runs),
        )
        .where(Order.id == order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    derived_status = derive_order_status(db, order)

    # 1. Yarn feasibility
    feasibility = calculate_feasibility(
        db,
        order.fabric_type,
        order.colour,
        Decimal(str(order.quantity_metres)),
    )

    # 2. Operations
    operations = list(order.operations)
    operations.sort(key=lambda op: op.sequence)
    if not operations:
        stages = ["spinning", "weaving", "dyeing", "inspection", "packing", "dispatch"]
        for seq, stg in enumerate(stages, start=1):
            op = Operation(order_id=order.id, stage=stg, sequence=seq)
            db.add(op)
        db.commit()
        db.refresh(order)
        operations = list(order.operations)
        operations.sort(key=lambda op: op.sequence)

    # Determine target operation (either explicitly requested or first incomplete in sequence)
    completed_op_ids = set(
        r.operation_id
        for r in order.production_runs
        if r.run_kind == "actual" and r.status == "completed"
    )
    if operation_id:
        target_op = next((op for op in operations if op.id == operation_id), None)
        if not target_op:
            target_op = next((op for op in operations if op.id not in completed_op_ids), operations[0])
    else:
        target_op = next((op for op in operations if op.id not in completed_op_ids), operations[0])

    # 3. Active run check
    active_run = next(
        (r for r in order.production_runs if r.run_kind == "actual" and r.status == "running"),
        None,
    )

    # 4. Eligible machines for target operation - only ready and available choices!
    raw_candidates: list[Machine] = []
    if target_op.eligible_machines:
        raw_candidates = [m for m in target_op.eligible_machines if m.is_active]
    else:
        raw_candidates = db.scalars(
            select(Machine).where(
                Machine.machine_type == target_op.stage,
                Machine.is_active.is_(True),
            )
        ).all()

    now = utc_now()
    eligible_machines_list: list[Machine] = []
    for m in raw_candidates:
        if m.state in ("breakdown", "maintenance", "running"):
            continue
        has_dt = db.scalar(
            select(Downtime.id).where(
                Downtime.machine_id == m.id,
                Downtime.start_time <= now,
                or_(Downtime.end_time.is_(None), Downtime.end_time > now),
            ).limit(1)
        )
        if has_dt is not None:
            continue
        has_run = db.scalar(
            select(ProductionRun.id).where(
                ProductionRun.machine_id == m.id,
                ProductionRun.run_kind == "actual",
                ProductionRun.status == "running",
            ).limit(1)
        )
        if has_run is not None:
            continue
        eligible_machines_list.append(m)

    # Prefer machine from scheduled run if present and ready
    scheduled_run = next(
        (r for r in order.production_runs if r.operation_id == target_op.id and r.run_kind == "scheduled" and r.status != "cancelled"),
        None,
    )
    recommended_machine = None
    if scheduled_run:
        cand = next((m for m in eligible_machines_list if m.id == scheduled_run.machine_id), None)
        if cand:
            recommended_machine = cand

    if not recommended_machine and eligible_machines_list:
        idle_eligible = [m for m in eligible_machines_list if m.state == "idle"]
        recommended_machine = idle_eligible[0] if idle_eligible else eligible_machines_list[0]

    active_machine = db.get(Machine, active_run.machine_id) if active_run else None

    target_op_summary = OperationSummary(
        id=target_op.id,
        stage=target_op.stage,
        sequence=target_op.sequence,
        planned_duration_minutes=target_op.planned_duration_minutes,
        eligible_machines=[
            EligibleMachineSummary(
                id=m.id,
                machine_code=m.machine_code,
                machine_type=m.machine_type,
                state=m.state,
                is_active=m.is_active,
            )
            for m in eligible_machines_list
        ],
    )

    rec_mach_summary = (
        EligibleMachineSummary(
            id=recommended_machine.id,
            machine_code=recommended_machine.machine_code,
            machine_type=recommended_machine.machine_type,
            state=recommended_machine.state,
            is_active=recommended_machine.is_active,
        )
        if recommended_machine
        else None
    )

    existing_runs_out = [
        ProductionRunOut.model_validate(r) for r in order.production_runs
    ]

    all_operations_out = [
        OperationSummary(
            id=op.id,
            stage=op.stage,
            sequence=op.sequence,
            planned_duration_minutes=op.planned_duration_minutes,
            eligible_machines=[],
        )
        for op in operations
    ]

    return OrderReadinessOut(
        order_id=order.id,
        buyer_id=order.buyer_id,
        buyer_name=order.buyer.name if order.buyer else None,
        fabric_type=order.fabric_type,
        colour=order.colour,
        quantity_metres=order.quantity_metres,
        deadline=order.deadline,
        priority=order.priority,
        derived_status=derived_status,
        yarn_feasible=feasibility.feasible,
        feasibility_message=feasibility.message,
        target_operation=target_op_summary,
        recommended_machine=rec_mach_summary,
        eligible_machines=[
            EligibleMachineSummary(
                id=m.id,
                machine_code=m.machine_code,
                machine_type=m.machine_type,
                state=m.state,
                is_active=m.is_active,
            )
            for m in eligible_machines_list
        ],
        has_active_run=active_run is not None,
        active_run_id=active_run.id if active_run else None,
        active_machine_code=active_machine.machine_code if active_machine else None,
        existing_runs=existing_runs_out,
        all_operations=all_operations_out,
    )


@router.post(
    "/orders/{order_id}/start-production",
    response_model=StartProductionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Start actual production for an eligible order (Admin & Production Manager only)",
)
@router.post(
    "/api/orders/{order_id}/start-production",
    response_model=StartProductionOut,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def start_production(
    order_id: int,
    payload: StartProductionRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executes a transactional Start Production workflow for an order:
    1. Enforces Admin or Production Manager role authorization.
    2. Validates order status (not completed, dispatch-ready, or already running).
    3. Verifies raw yarn feasibility against inventory ledger.
    4. Resolves operation stage and eligible machine.
    5. Validates machine eligibility, active status, breakdown/maintenance state, downtime, and run overlap.
    6. Persists an actual running ProductionRun record and synchronizes machine state to 'running'.
    """
    # 1. Role Authorization
    if current_user.role not in ("admin", "production_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only Admin and Production Manager can start production.",
        )

    # 2. Lock Order Record
    order = db.scalar(
        select(Order)
        .options(
            selectinload(Order.buyer),
            selectinload(Order.operations).selectinload(Operation.eligible_machines),
        )
        .where(Order.id == order_id)
        .with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail=f"Order #{order_id} not found")

    # 3. Check Order Lifecycle Status
    current_status = derive_order_status(db, order)
    if current_status in ("completed", "ready_for_dispatch", "partially_dispatched"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order #{order_id} cannot start production because it is already in '{current_status}' state.",
        )

    # Check for duplicate active running run on this order
    active_run = db.scalar(
        select(ProductionRun).where(
            ProductionRun.order_id == order.id,
            ProductionRun.run_kind == "actual",
            ProductionRun.status == "running",
        ).limit(1)
    )
    if active_run is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order #{order_id} already has an active production run (#{active_run.id}) in progress.",
        )

    # 4. Check Raw Material / Yarn Feasibility
    feasibility = calculate_feasibility(
        db,
        order.fabric_type,
        order.colour,
        Decimal(str(order.quantity_metres)),
    )
    if not feasibility.feasible:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Insufficient yarn stock to start production for order #{order_id}: {feasibility.message}",
        )

    # 5. Resolve Target Operation
    operations = list(order.operations)
    operations.sort(key=lambda op: op.sequence)
    if not operations:
        stages = ["spinning", "weaving", "dyeing", "inspection", "packing", "dispatch"]
        for seq, stg in enumerate(stages, start=1):
            op = Operation(order_id=order.id, stage=stg, sequence=seq)
            db.add(op)
        db.flush()
        operations = db.scalars(
            select(Operation)
            .options(selectinload(Operation.eligible_machines))
            .where(Operation.order_id == order.id)
            .order_by(Operation.sequence.asc())
        ).all()

    target_operation: Operation | None = None
    if payload and payload.operation_id is not None:
        target_operation = next(
            (op for op in operations if op.id == payload.operation_id), None
        )
        if target_operation is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Operation #{payload.operation_id} does not belong to Order #{order_id}",
            )
    else:
        completed_op_ids = set(
            db.scalars(
                select(ProductionRun.operation_id).where(
                    ProductionRun.order_id == order.id,
                    ProductionRun.run_kind == "actual",
                    ProductionRun.status == "completed",
                )
            ).all()
        )
        target_operation = next(
            (op for op in operations if op.id not in completed_op_ids), operations[0]
        )

    # 6. Resolve and Lock Target Machine
    machine: Machine | None = None
    if payload and payload.machine_id is not None:
        machine = db.scalar(
            select(Machine).where(Machine.id == payload.machine_id).with_for_update()
        )
        if machine is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Machine #{payload.machine_id} not found",
            )
    else:
        # Check if scheduled run exists for this order & operation
        scheduled_run = db.scalar(
            select(ProductionRun)
            .where(
                ProductionRun.order_id == order.id,
                ProductionRun.operation_id == target_operation.id,
                ProductionRun.run_kind == "scheduled",
                ProductionRun.status != "cancelled",
            )
            .order_by(ProductionRun.id.desc())
            .limit(1)
        )
        candidate_machine = None
        if scheduled_run is not None:
            candidate_machine = db.scalar(
                select(Machine)
                .where(Machine.id == scheduled_run.machine_id)
                .with_for_update()
            )

        if (
            candidate_machine is not None
            and candidate_machine.is_active
            and candidate_machine.state not in ("breakdown", "maintenance")
        ):
            machine = candidate_machine
        else:
            # Find eligible active machine
            eligible_candidates = [
                m
                for m in target_operation.eligible_machines
                if m.is_active and m.state not in ("breakdown", "maintenance")
            ]
            if not eligible_candidates:
                eligible_candidates = db.scalars(
                    select(Machine).where(
                        Machine.machine_type == target_operation.stage,
                        Machine.is_active.is_(True),
                        Machine.state.notin_(["breakdown", "maintenance"]),
                    )
                ).all()

            if not eligible_candidates:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"No eligible machine available for operation '{target_operation.stage}' (Order #{order_id})",
                )

            # Find first idle candidate without overlap or downtime
            now = utc_now()
            selected = None
            for cand in eligible_candidates:
                has_running = db.scalar(
                    select(ProductionRun.id).where(
                        ProductionRun.machine_id == cand.id,
                        ProductionRun.run_kind == "actual",
                        ProductionRun.status == "running",
                    ).limit(1)
                )
                if has_running:
                    continue
                has_dt = db.scalar(
                    select(Downtime.id).where(
                        Downtime.machine_id == cand.id,
                        Downtime.start_time <= now,
                        or_(Downtime.end_time.is_(None), Downtime.end_time > now),
                    ).limit(1)
                )
                if has_dt:
                    continue
                selected = cand
                break

            if not selected:
                selected = eligible_candidates[0]

            machine = db.scalar(
                select(Machine).where(Machine.id == selected.id).with_for_update()
            )

    # 7. Validate Machine Eligibility & Operational Constraints
    validate_machine_eligibility(target_operation, machine)

    if machine.state in ("breakdown", "maintenance"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Machine {machine.machine_code} is currently under '{machine.state}' and cannot start production.",
        )

    now = utc_now()
    validate_run_downtime_conflict(db, machine.id, now, None)
    validate_actual_run_overlap(db, machine.id, now, None)

    # 8. Create Transactional Actual Production Run
    try:
        actual_run = ProductionRun(
            order_id=order.id,
            operation_id=target_operation.id,
            machine_id=machine.id,
            run_kind="actual",
            status="running",
            start_time=now,
            output_metres=Decimal("0.00"),
        )
        db.add(actual_run)
        machine.state = "running"
        db.commit()
        db.refresh(actual_run)
        db.refresh(machine)

        return StartProductionOut(
            order_id=order.id,
            production_run_id=actual_run.id,
            operation_id=target_operation.id,
            stage=target_operation.stage,
            machine_id=machine.id,
            machine_code=machine.machine_code,
            status=actual_run.status,
            start_time=actual_run.start_time,
            message=f"Production started successfully for Order #{order.id} on machine {machine.machine_code} ({target_operation.stage}).",
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity conflict during production run start.",
        )
    except Exception:
        db.rollback()
        raise


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
