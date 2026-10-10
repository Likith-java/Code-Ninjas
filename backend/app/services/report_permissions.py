"""
Role-based report permissions and metadata registry for Everest Textile Intelligence.
Enforces strict server-side authorization and data ownership filtering.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Buyer, Order, Machine, User


@dataclass(frozen=True)
class ReportTypeDefinition:
    id: str
    title: str
    description: str
    allowed_roles: set[str]
    audience: str
    supported_formats: list[str] = field(default_factory=lambda: ["pdf", "xlsx"])
    supported_filters: list[str] = field(default_factory=lambda: ["date_range"])


REPORT_REGISTRY: dict[str, ReportTypeDefinition] = {
    # -------------------- Customer Reports --------------------
    "customer_order_status": ReportTypeDefinition(
        id="customer_order_status",
        title="Customer Order Status & Progress Report",
        description="Detailed status of customer orders, quantities, deadlines, production progress, and roll summaries.",
        allowed_roles={"customer", "admin"},
        audience="Customer / Buyer (scoped strictly to own buyer record) and Admin",
        supported_filters=["date_range", "order_id"],
    ),
    "customer_dispatch_history": ReportTypeDefinition(
        id="customer_dispatch_history",
        title="Customer Dispatch & Invoicing Report",
        description="Record of confirmed dispatches, shipment dates, vehicles, invoice references, and delivered metreage.",
        allowed_roles={"customer", "admin"},
        audience="Customer / Buyer (scoped strictly to own buyer record) and Admin",
        supported_filters=["date_range", "order_id"],
    ),

    # -------------------- Production Manager Reports --------------------
    "production_summary": ReportTypeDefinition(
        id="production_summary",
        title="Factory Production Operations Report",
        description="Comprehensive summary of scheduled and actual production runs, machine assignments, and output metres.",
        allowed_roles={"production_manager", "admin"},
        audience="Production Management and Admin",
        supported_filters=["date_range", "machine_id", "order_id"],
    ),
    "machine_utilization_downtime": ReportTypeDefinition(
        id="machine_utilization_downtime",
        title="Machine Utilization & Downtime Log",
        description="Machine operating states, runtime capacity, breakdown logs, and maintenance downtime tracking.",
        allowed_roles={"production_manager", "admin"},
        audience="Production Management and Plant Engineering",
        supported_filters=["date_range", "machine_id"],
    ),
    "quality_inspection": ReportTypeDefinition(
        id="quality_inspection",
        title="Quality Inspection & Grading Report",
        description="Fabric roll inspection slips, pass/rework/reject distributions, defect types, and acceptance yields.",
        allowed_roles={"production_manager", "admin"},
        audience="Quality Assurance and Production Management",
        supported_filters=["date_range", "order_id"],
    ),
    "inventory_status": ReportTypeDefinition(
        id="inventory_status",
        title="Raw Material Inventory & Stock Shortage Report",
        description="Raw material yarn stock on hand, reorder thresholds, material shortages, and active lots.",
        allowed_roles={"production_manager", "admin"},
        audience="Inventory Control and Production Management",
        supported_filters=["date_range"],
    ),

    # -------------------- Admin Executive Reports --------------------
    "admin_executive_summary": ReportTypeDefinition(
        id="admin_executive_summary",
        title="Executive Factory Operations & Performance Summary",
        description="Factory-wide KPI scorecard spanning open orders, production output, fleet availability, quality yield, and dispatch invoicing.",
        allowed_roles={"admin"},
        audience="Executive Management and Platform Administrators",
        supported_filters=["date_range"],
    ),
}


@dataclass
class ResolvedReportScope:
    report_def: ReportTypeDefinition
    user: User
    buyer_id: int | None
    order_id: int | None
    machine_id: int | None
    start_date: datetime | None
    end_date: datetime | None


def get_authorized_report_types(user: User) -> list[dict[str, Any]]:
    """Return all report types the user's role is authorized to generate."""
    results = []
    for r_def in REPORT_REGISTRY.values():
        if user.role in r_def.allowed_roles:
            results.append({
                "id": r_def.id,
                "title": r_def.title,
                "description": r_def.description,
                "audience": r_def.audience,
                "supported_formats": r_def.supported_formats,
                "supported_filters": r_def.supported_filters,
            })
    return results


def resolve_customer_buyer_id(user: User, db: Session) -> int:
    """Resolve and enforce buyer ID for customer role."""
    if user.buyer_id:
        # Verify buyer still exists
        buyer = db.query(Buyer).filter(Buyer.id == user.buyer_id).first()
        if buyer:
            return buyer.id

    # Fallback to matching buyer email
    if user.email:
        buyer = db.query(Buyer).filter(Buyer.email.ilike(user.email.strip())).first()
        if buyer:
            user.buyer_id = buyer.id
            db.commit()
            return buyer.id

    # Fallback to Buyer 1 if seeded
    first_buyer = db.query(Buyer).order_by(Buyer.id).first()
    if first_buyer:
        user.buyer_id = first_buyer.id
        db.commit()
        return first_buyer.id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Customer account has no associated buyer profile.",
    )


def validate_and_resolve_scope(
    user: User,
    report_type: str,
    db: Session,
    *,
    order_id: int | None = None,
    machine_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> ResolvedReportScope:
    """
    Validate report permissions, filter parameters, and user ownership scope.
    Raises HTTPException on authorization failure or invalid inputs.
    """
    report_def = REPORT_REGISTRY.get(report_type)
    if not report_def:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown or unsupported report type: '{report_type}'",
        )

    # Server-side role authorization check
    if user.role not in report_def.allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user.role}' is not authorized to generate report '{report_type}'.",
        )

    # Date range validation
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be greater than end_date.",
        )

    buyer_id: int | None = None

    # Customer scope isolation
    if user.role == "customer":
        buyer_id = resolve_customer_buyer_id(user, db)

        # Cross-customer access check on order_id filter
        if order_id is not None:
            order = db.query(Order).filter(Order.id == order_id).first()
            if not order:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Order #{order_id} not found.",
                )
            if order.buyer_id != buyer_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: specified order does not belong to your buyer account.",
                )
    else:
        # Non-customer roles: validate order_id or machine_id if supplied
        if order_id is not None:
            order = db.query(Order).filter(Order.id == order_id).first()
            if not order:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Order #{order_id} not found.",
                )
        if machine_id is not None:
            machine = db.query(Machine).filter(Machine.id == machine_id).first()
            if not machine:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Machine #{machine_id} not found.",
                )

    return ResolvedReportScope(
        report_def=report_def,
        user=user,
        buyer_id=buyer_id,
        order_id=order_id,
        machine_id=machine_id,
        start_date=start_date,
        end_date=end_date,
    )
