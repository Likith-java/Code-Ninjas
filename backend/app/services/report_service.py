"""
Report data aggregation service for Everest Textile Intelligence.
Queries PostgreSQL tables and calculates validated operational metrics.
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from sqlalchemy import func, select, case
from sqlalchemy.orm import Session

from app.models import (
    Buyer,
    Dispatch,
    DispatchItem,
    Downtime,
    FabricRoll,
    Inspection,
    InventoryMovement,
    Machine,
    Material,
    MaterialLot,
    Operation,
    Order,
    ProductionRun,
)
from app.services.report_permissions import ResolvedReportScope


@dataclass
class ReportKPI:
    label: str
    value: str
    unit: str = ""
    subtext: str = ""


@dataclass
class ReportData:
    report_type: str
    title: str
    audience: str
    generated_by: str
    generated_at: datetime
    date_range_str: str
    kpis: list[ReportKPI]
    headers: list[str]
    rows: list[list[Any]]
    secondary_title: str | None = None
    secondary_headers: list[str] | None = None
    secondary_rows: list[list[Any]] | None = None
    notes: list[str] = field(default_factory=list)


def _safe_percent(numerator: float | Decimal, denominator: float | Decimal) -> float:
    """Calculate percentage with strict division-by-zero guard."""
    den = float(denominator)
    if den <= 0:
        return 0.0
    return round((float(numerator) / den) * 100.0, 1)


def _format_date(dt: datetime | None) -> str:
    """Format datetime safely."""
    if not dt:
        return "N/A"
    return dt.strftime("%Y-%m-%d %H:%M")


def _format_date_short(dt: datetime | None) -> str:
    """Format date only."""
    if not dt:
        return "N/A"
    return dt.strftime("%Y-%m-%d")


def _sanitize_string(val: Any) -> Any:
    """Protect against spreadsheet formula injection."""
    if isinstance(val, str) and val.startswith(("=", "+", "-", "@")):
        return f"'{val}"
    return val


def get_report_data(scope: ResolvedReportScope, db: Session) -> ReportData:
    """Dispatch to specific report data builder."""
    builders = {
        "customer_order_status": _build_customer_order_status,
        "customer_dispatch_history": _build_customer_dispatch_history,
        "production_summary": _build_production_summary,
        "machine_utilization_downtime": _build_machine_utilization_downtime,
        "quality_inspection": _build_quality_inspection,
        "inventory_status": _build_inventory_status,
        "admin_executive_summary": _build_admin_executive_summary,
    }

    builder = builders.get(scope.report_def.id)
    if not builder:
        raise ValueError(f"No builder registered for report type: {scope.report_def.id}")

    return builder(scope, db)


# =========================================================================
# 1. Customer: Order Status & Progress Report
# =========================================================================
def _build_customer_order_status(scope: ResolvedReportScope, db: Session) -> ReportData:
    query = db.query(Order).filter(Order.buyer_id == scope.buyer_id)

    if scope.order_id:
        query = query.filter(Order.id == scope.order_id)
    if scope.start_date:
        query = query.filter(Order.order_date >= scope.start_date)
    if scope.end_date:
        query = query.filter(Order.order_date <= scope.end_date)

    orders = query.order_by(Order.order_date.desc()).all()

    buyer = db.query(Buyer).filter(Buyer.id == scope.buyer_id).first()
    buyer_name = buyer.name if buyer else f"Buyer #{scope.buyer_id}"

    total_orders = len(orders)
    total_ordered_m = sum(float(o.quantity_metres) for o in orders)
    total_passed_m = 0.0
    total_dispatched_m = 0.0

    headers = [
        "Order ID",
        "Fabric & Colour",
        "Ordered (m)",
        "Deadline",
        "Priority",
        "Produced (m)",
        "Dispatched (m)",
        "Progress",
        "Status",
        "Invoices",
    ]
    rows = []

    for o in orders:
        passed_m = sum(float(r.metres) for r in o.rolls if r.status in ("passed", "dispatched"))
        disp_m = sum(float(di.metres) for d in o.dispatches if d.confirmed for di in d.items)
        ord_m = float(o.quantity_metres)

        total_passed_m += passed_m
        total_dispatched_m += disp_m

        completion_pct = _safe_percent(passed_m, ord_m)

        if disp_m >= ord_m and ord_m > 0:
            status_label = "Fully Dispatched"
        elif disp_m > 0:
            status_label = "Partly Dispatched"
        elif passed_m >= ord_m and ord_m > 0:
            status_label = "Production Completed"
        elif len(o.production_runs) > 0 or len(o.rolls) > 0:
            status_label = "In Production"
        else:
            status_label = "Scheduled / Pending"

        invoices = ", ".join(d.invoice_number for d in o.dispatches if d.confirmed) or "None"

        rows.append([
            f"ORD-{o.id:04d}",
            f"{o.fabric_type} ({o.colour})",
            f"{ord_m:,.1f}",
            _format_date_short(o.deadline),
            o.priority.upper(),
            f"{passed_m:,.1f}",
            f"{disp_m:,.1f}",
            f"{completion_pct:.1f}%",
            status_label,
            invoices,
        ])

    avg_completion = _safe_percent(total_passed_m, total_ordered_m) if total_ordered_m > 0 else 0.0

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "All Recorded Orders"
    )

    kpis = [
        ReportKPI("Total Orders", f"{total_orders}", "orders", f"Account: {buyer_name}"),
        ReportKPI("Total Ordered", f"{total_ordered_m:,.0f}", "metres", "Contracted volume"),
        ReportKPI("Approved Production", f"{total_passed_m:,.0f}", "metres", "Quality passed"),
        ReportKPI("Overall Completion", f"{avg_completion:.1f}%", "", "Delivered or ready"),
    ]

    return ReportData(
        report_type="customer_order_status",
        title="Customer Order Status & Progress Report",
        audience=f"Authorized Buyer: {buyer_name}",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        notes=[
            "Data is filtered strictly to orders belonging to this authenticated customer account.",
            "Produced metres reflect rolls that have undergone quality inspection and were graded Passed.",
        ],
    )


# =========================================================================
# 2. Customer: Dispatch & Invoicing History
# =========================================================================
def _build_customer_dispatch_history(scope: ResolvedReportScope, db: Session) -> ReportData:
    query = (
        db.query(Dispatch)
        .join(Order, Dispatch.order_id == Order.id)
        .filter(Order.buyer_id == scope.buyer_id, Dispatch.confirmed == True)
    )

    if scope.order_id:
        query = query.filter(Order.id == scope.order_id)
    if scope.start_date:
        query = query.filter(Dispatch.dispatch_date >= scope.start_date)
    if scope.end_date:
        query = query.filter(Dispatch.dispatch_date <= scope.end_date)

    dispatches = query.order_by(Dispatch.dispatch_date.desc()).all()

    buyer = db.query(Buyer).filter(Buyer.id == scope.buyer_id).first()
    buyer_name = buyer.name if buyer else f"Buyer #{scope.buyer_id}"

    total_shipments = len(dispatches)
    total_dispatched_m = 0.0
    total_rolls_delivered = 0

    headers = [
        "Invoice Number",
        "Order ID",
        "Dispatch Date",
        "Vehicle / Courier",
        "Rolls Delivered",
        "Total Metres (m)",
        "Confirmation Time",
    ]
    rows = []

    for d in dispatches:
        disp_m = sum(float(item.metres) for item in d.items)
        rolls_count = len(d.items)
        total_dispatched_m += disp_m
        total_rolls_delivered += rolls_count

        rows.append([
            d.invoice_number,
            f"ORD-{d.order_id:04d}",
            _format_date_short(d.dispatch_date),
            d.vehicle or "Standard Freight",
            str(rolls_count),
            f"{disp_m:,.2f}",
            _format_date(d.confirmed_at),
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "All Confirmed Dispatches"
    )

    kpis = [
        ReportKPI("Confirmed Shipments", f"{total_shipments}", "deliveries", f"Buyer: {buyer_name}"),
        ReportKPI("Total Metres Delivered", f"{total_dispatched_m:,.1f}", "metres", "Net shipped"),
        ReportKPI("Fabric Rolls Shipped", f"{total_rolls_delivered}", "rolls", "Individual barcode units"),
    ]

    return ReportData(
        report_type="customer_dispatch_history",
        title="Customer Dispatch & Invoicing Report",
        audience=f"Authorized Buyer: {buyer_name}",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        notes=[
            "Only officially confirmed warehouse dispatches with matching invoices are listed.",
            "Metreage corresponds to physical roll inspection quantities loaded into the vehicle.",
        ],
    )


# =========================================================================
# 3. Production Manager: Production Summary Report
# =========================================================================
def _build_production_summary(scope: ResolvedReportScope, db: Session) -> ReportData:
    query = (
        db.query(ProductionRun)
        .join(Order, ProductionRun.order_id == Order.id)
        .join(Operation, ProductionRun.operation_id == Operation.id)
        .join(Machine, ProductionRun.machine_id == Machine.id)
    )

    if scope.order_id:
        query = query.filter(ProductionRun.order_id == scope.order_id)
    if scope.machine_id:
        query = query.filter(ProductionRun.machine_id == scope.machine_id)
    if scope.start_date:
        query = query.filter(ProductionRun.start_time >= scope.start_date)
    if scope.end_date:
        query = query.filter(ProductionRun.start_time <= scope.end_date)

    runs = query.order_by(ProductionRun.id.desc()).all()

    total_runs = len(runs)
    completed_runs = sum(1 for r in runs if r.status == "completed")
    running_runs = sum(1 for r in runs if r.status == "running")
    total_output_m = sum(float(r.output_metres or 0) for r in runs if r.status == "completed")

    headers = [
        "Run ID",
        "Order ID",
        "Stage",
        "Machine Code",
        "Type",
        "Status",
        "Start Time",
        "End Time",
        "Output (m)",
        "Duration (min)",
    ]
    rows = []

    for r in runs:
        duration_min = "N/A"
        if r.start_time and r.end_time:
            diff_sec = (r.end_time - r.start_time).total_seconds()
            duration_min = f"{int(diff_sec / 60)} min"

        output_str = f"{float(r.output_metres):,.1f}" if r.output_metres is not None else "Pending"

        rows.append([
            f"RUN-{r.id:04d}",
            f"ORD-{r.order_id:04d}",
            r.operation.stage.title(),
            r.machine.machine_code,
            r.run_kind.capitalize(),
            r.status.upper(),
            _format_date(r.start_time),
            _format_date(r.end_time),
            output_str,
            duration_min,
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "All Production Runs"
    )

    kpis = [
        ReportKPI("Total Production Runs", f"{total_runs}", "runs", "All recorded operations"),
        ReportKPI("Completed Runs", f"{completed_runs}", "runs", f"Success rate {_safe_percent(completed_runs, total_runs):.1f}%"),
        ReportKPI("In-Progress / Running", f"{running_runs}", "runs", "Active on factory floor"),
        ReportKPI("Total Output Produced", f"{total_output_m:,.0f}", "metres", "Net finished floor yield"),
    ]

    return ReportData(
        report_type="production_summary",
        title="Factory Production Operations Report",
        audience="Production Management & Plant Supervision",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        notes=[
            "Output metres reflect verified completed production batch runs.",
            "Run stages follow standard routing: Spinning -> Weaving -> Dyeing.",
        ],
    )


# =========================================================================
# 4. Production Manager: Machine Utilization & Downtime Log
# =========================================================================
def _build_machine_utilization_downtime(scope: ResolvedReportScope, db: Session) -> ReportData:
    m_query = db.query(Machine)
    if scope.machine_id:
        m_query = m_query.filter(Machine.id == scope.machine_id)
    machines = m_query.order_by(Machine.machine_type, Machine.machine_code).all()

    dt_query = db.query(Downtime).join(Machine, Downtime.machine_id == Machine.id)
    if scope.machine_id:
        dt_query = dt_query.filter(Downtime.machine_id == scope.machine_id)
    if scope.start_date:
        dt_query = dt_query.filter(Downtime.start_time >= scope.start_date)
    if scope.end_date:
        dt_query = dt_query.filter(Downtime.start_time <= scope.end_date)
    downtimes = dt_query.order_by(Downtime.start_time.desc()).all()

    total_machines = len(machines)
    total_downtime_hours = 0.0

    headers = [
        "Machine Code",
        "Machine Type",
        "Capacity (m/hr)",
        "State",
        "Status",
        "Completed Runs",
        "Downtime Events",
        "Total Down (hrs)",
    ]
    rows = []

    for m in machines:
        # Sum downtimes for this machine
        m_dts = [d for d in downtimes if d.machine_id == m.id]
        down_hours = 0.0
        for d in m_dts:
            if d.start_time and d.end_time:
                down_hours += (d.end_time - d.start_time).total_seconds() / 3600.0

        total_downtime_hours += down_hours
        completed_runs_count = sum(1 for r in m.production_runs if r.status == "completed")

        rows.append([
            m.machine_code,
            m.machine_type.title(),
            f"{float(m.capacity_rate):,.1f}",
            m.state.upper(),
            "Active" if m.is_active else "Decommissioned",
            str(completed_runs_count),
            str(len(m_dts)),
            f"{down_hours:.1f} hrs",
        ])

    # Secondary table: Detailed Downtime Log
    sec_headers = ["Event ID", "Machine Code", "Reason", "Start Time", "End Time", "Duration (hrs)"]
    sec_rows = []
    for d in downtimes:
        dur = "Ongoing"
        if d.start_time and d.end_time:
            dur = f"{(d.end_time - d.start_time).total_seconds() / 3600.0:.1f} hrs"
        sec_rows.append([
            f"DT-{d.id:04d}",
            d.machine.machine_code,
            d.reason,
            _format_date(d.start_time),
            _format_date(d.end_time),
            dur,
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "All Recorded Machine Fleet Records"
    )

    kpis = [
        ReportKPI("Total Machine Fleet", f"{total_machines}", "machines", "Floor equipment"),
        ReportKPI("Total Downtime Logged", f"{total_downtime_hours:.1f}", "hours", "Maintenance & breakdowns"),
        ReportKPI("Downtime Incidents", f"{len(downtimes)}", "events", "Logged disruptions"),
    ]

    return ReportData(
        report_type="machine_utilization_downtime",
        title="Machine Utilization & Downtime Log",
        audience="Production Management & Plant Maintenance",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        secondary_title="Detailed Machine Downtime Events",
        secondary_headers=sec_headers,
        secondary_rows=sec_rows,
        notes=[
            "Downtime windows include emergency maintenance and planned machinery overhauls.",
            "Run completion counts reflect scheduled and actual shopfloor batch jobs.",
        ],
    )


# =========================================================================
# 5. Production Manager: Quality Inspection & Grading Report
# =========================================================================
def _build_quality_inspection(scope: ResolvedReportScope, db: Session) -> ReportData:
    query = (
        db.query(Inspection)
        .join(FabricRoll, Inspection.roll_id == FabricRoll.id)
        .join(Order, FabricRoll.order_id == Order.id)
    )

    if scope.order_id:
        query = query.filter(FabricRoll.order_id == scope.order_id)
    if scope.start_date:
        query = query.filter(Inspection.inspected_at >= scope.start_date)
    if scope.end_date:
        query = query.filter(Inspection.inspected_at <= scope.end_date)

    inspections = query.order_by(Inspection.inspected_at.desc()).all()

    total_inspected = len(inspections)
    passed_count = sum(1 for i in inspections if i.result == "pass")
    rework_count = sum(1 for i in inspections if i.result == "rework")
    reject_count = sum(1 for i in inspections if i.result == "reject")

    pass_rate = _safe_percent(passed_count, total_inspected)

    headers = [
        "Inspection ID",
        "Roll Code",
        "Order ID",
        "Roll Metres (m)",
        "Verdict",
        "Severity",
        "Defect Type",
        "Disposition / Corrective Action",
        "Inspected At",
    ]
    rows = []

    for i in inspections:
        rows.append([
            f"QC-{i.id:04d}",
            i.roll.roll_code,
            f"ORD-{i.roll.order_id:04d}",
            f"{float(i.roll.metres):,.1f}",
            i.result.upper(),
            (i.severity or "None").title(),
            i.defect_type or "Clean / No Defect",
            i.disposition or "Standard Approval",
            _format_date(i.inspected_at),
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "All Logged Quality Slips"
    )

    kpis = [
        ReportKPI("Total Rolls Inspected", f"{total_inspected}", "rolls", "Graded by inspectors"),
        ReportKPI("Quality Acceptance Rate", f"{pass_rate:.1f}%", "", f"{passed_count} passed"),
        ReportKPI("Rework Required", f"{rework_count}", "rolls", "Minor salvageable issues"),
        ReportKPI("Rejected Rolls", f"{reject_count}", "rolls", "Defects exceeding tolerance"),
    ]

    return ReportData(
        report_type="quality_inspection",
        title="Quality Inspection & Grading Report",
        audience="Quality Assurance & Technical Compliance",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        notes=[
            "Rolls graded as 'Reject' or 'Rework' are prohibited from outbound customer shipment.",
            "Quality acceptance rate is calculated as: (Passed Rolls / Total Inspected Rolls) * 100.",
        ],
    )


# =========================================================================
# 6. Production Manager: Raw Material Inventory & Shortage Report
# =========================================================================
def _build_inventory_status(scope: ResolvedReportScope, db: Session) -> ReportData:
    materials = db.query(Material).order_by(Material.material_type, Material.colour).all()

    headers = [
        "Material ID",
        "Type",
        "Colour & Specification",
        "Yarn Factor (kg/m)",
        "Reorder Level (kg)",
        "Current Stock (kg)",
        "Stock Status",
        "Shortage Deficit (kg)",
    ]
    rows = []

    total_materials = len(materials)
    shortage_count = 0
    total_stock_kg = 0.0

    for m in materials:
        # Sum inventory movements: receipt + adj - issue
        balance_subq = (
            db.query(
                func.coalesce(
                    func.sum(
                        case(
                            (InventoryMovement.movement_type == "receipt", InventoryMovement.quantity_kg),
                            (InventoryMovement.movement_type == "issue", -InventoryMovement.quantity_kg),
                            (InventoryMovement.movement_type == "adjustment", InventoryMovement.quantity_kg),
                            else_=0,
                        )
                    ),
                    0,
                )
            )
            .join(MaterialLot, InventoryMovement.lot_id == MaterialLot.id)
            .filter(MaterialLot.material_id == m.id)
            .scalar()
        )

        stock_kg = float(balance_subq or 0.0)
        reorder_kg = float(m.reorder_threshold_kg)
        total_stock_kg += stock_kg

        is_shortage = stock_kg <= reorder_kg
        if is_shortage:
            shortage_count += 1
            status_text = "ALERT: REORDER"
            deficit_str = f"{(reorder_kg - stock_kg):,.1f} kg"
        else:
            status_text = "Adequate"
            deficit_str = "0.0 kg"

        rows.append([
            f"MAT-{m.id:03d}",
            m.material_type,
            f"{m.colour} - {m.specification}",
            f"{float(m.yarn_kg_per_metre):.4f}",
            f"{reorder_kg:,.1f}",
            f"{stock_kg:,.1f}",
            status_text,
            deficit_str,
        ])

    # Secondary: Recent movements
    mov_query = db.query(InventoryMovement).join(MaterialLot, InventoryMovement.lot_id == MaterialLot.id)
    if scope.start_date:
        mov_query = mov_query.filter(InventoryMovement.movement_date >= scope.start_date)
    if scope.end_date:
        mov_query = mov_query.filter(InventoryMovement.movement_date <= scope.end_date)
    movements = mov_query.order_by(InventoryMovement.movement_date.desc()).limit(100).all()

    sec_headers = ["Movement ID", "Lot Code", "Type", "Quantity (kg)", "Date", "Note"]
    sec_rows = []
    for mv in movements:
        sec_rows.append([
            f"MOV-{mv.id:04d}",
            mv.lot.lot_code,
            mv.movement_type.upper(),
            f"{float(mv.quantity_kg):,.2f}",
            _format_date_short(mv.movement_date),
            mv.note or "Regular ledger movement",
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "Real-Time Stock Snapshot"
    )

    kpis = [
        ReportKPI("Material Items", f"{total_materials}", "catalogs", "Registered yarns"),
        ReportKPI("Total Stock On Hand", f"{total_stock_kg:,.0f}", "kg", "Net physical warehouse weight"),
        ReportKPI("Shortage Alerts", f"{shortage_count}", "materials", "At or below reorder threshold"),
    ]

    return ReportData(
        report_type="inventory_status",
        title="Raw Material Inventory & Stock Shortage Report",
        audience="Inventory Control & Production Sourcing",
        generated_by=f"{scope.user.name} ({scope.user.role.replace('_', ' ').title()})",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        secondary_title="Recent Inventory Movements Ledger (Latest 100 Entries)",
        secondary_headers=sec_headers,
        secondary_rows=sec_rows,
        notes=[
            "Stock on hand represents the mathematical sum of all receipts, adjustments, and order issues.",
            "Items flagged as ALERT: REORDER should be prioritized for supplier procurement.",
        ],
    )


# =========================================================================
# 7. Admin: Executive Factory Operations Summary
# =========================================================================
def _build_admin_executive_summary(scope: ResolvedReportScope, db: Session) -> ReportData:
    orders = db.query(Order).all()
    buyers = db.query(Buyer).all()
    machines = db.query(Machine).all()
    inspections = db.query(Inspection).all()
    dispatches = db.query(Dispatch).filter(Dispatch.confirmed == True).all()

    total_orders = len(orders)
    total_buyers = len(buyers)
    total_contracted_m = sum(float(o.quantity_metres) for o in orders)

    # Invoiced revenue & delivered metres
    total_invoiced_val = 0.0
    total_dispatched_m = 0.0
    for d in dispatches:
        for item in d.items:
            m = float(item.metres)
            rate = float(d.order.agreed_rate) if d.order else 0.0
            total_dispatched_m += m
            total_invoiced_val += (m * rate)

    # Quality yield
    total_inspected = len(inspections)
    passed_inspections = sum(1 for i in inspections if i.result == "pass")
    quality_yield = _safe_percent(passed_inspections, total_inspected)

    # Fleet health
    active_machines = sum(1 for m in machines if m.state != "breakdown")
    fleet_health_pct = _safe_percent(active_machines, len(machines))

    # Table 1: Order Pipeline by Buyer
    headers = ["Buyer Name", "Open Orders", "Contracted (m)", "Total Value (Est. $)", "Primary Contact"]
    rows = []
    for b in buyers:
        b_orders = [o for o in orders if o.buyer_id == b.id]
        b_m = sum(float(o.quantity_metres) for o in b_orders)
        b_val = sum(float(o.quantity_metres) * float(o.agreed_rate) for o in b_orders)

        rows.append([
            b.name,
            str(len(b_orders)),
            f"{b_m:,.0f}",
            f"${b_val:,.2f}",
            b.contact or b.email or "N/A",
        ])

    # Table 2: Machine Fleet Status
    sec_headers = ["Machine Code", "Type", "Operating State", "Capacity (m/hr)", "Active Status"]
    sec_rows = []
    for m in machines:
        sec_rows.append([
            m.machine_code,
            m.machine_type.title(),
            m.state.upper(),
            f"{float(m.capacity_rate):,.0f}",
            "Operational" if m.is_active else "Offline",
        ])

    date_str = (
        f"{_format_date_short(scope.start_date)} to {_format_date_short(scope.end_date)}"
        if scope.start_date and scope.end_date
        else "Comprehensive Factory Operations YTD"
    )

    kpis = [
        ReportKPI("Total Contracts", f"{total_orders}", "orders", f"{total_buyers} institutional buyers"),
        ReportKPI("Contracted Volume", f"{total_contracted_m:,.0f}", "metres", "Active demand pipeline"),
        ReportKPI("Invoiced Value", f"${total_invoiced_val:,.2f}", "USD", f"{total_dispatched_m:,.0f} metres delivered"),
        ReportKPI("Quality Pass Yield", f"{quality_yield:.1f}%", "", f"{passed_inspections}/{total_inspected} rolls passed"),
    ]

    return ReportData(
        report_type="admin_executive_summary",
        title="Executive Factory Operations & Performance Summary",
        audience="Executive Board & General Management",
        generated_by=f"{scope.user.name} (Administrator)",
        generated_at=datetime.now(timezone.utc),
        date_range_str=date_str,
        kpis=kpis,
        headers=headers,
        rows=rows,
        secondary_title="Factory Production Machine Fleet Status",
        secondary_headers=sec_headers,
        secondary_rows=sec_rows,
        notes=[
            "All financial figures are derived from confirmed invoice items and contractual agreed rates.",
            "Fleet availability excludes equipment currently under emergency breakdown or scheduled maintenance.",
        ],
    )
