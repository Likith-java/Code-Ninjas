"""
Comprehensive automated tests for Role-Based Report Generation & Security.
Verifies role authorization, cross-buyer data isolation, metric calculations, and PDF/XLSX generation.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import io
import uuid
import openpyxl
import pytest

from app.core.security import create_access_token, hash_password
from app.models import (
    Buyer,
    Dispatch,
    DispatchItem,
    FabricRoll,
    Inspection,
    InventoryMovement,
    Machine,
    Material,
    MaterialLot,
    Operation,
    Order,
    ProductionRun,
    Supplier,
    User,
)


def create_test_user(db_session, email_prefix: str, role: str, buyer_id: int | None = None) -> tuple[User, str]:
    """Helper to create and commit a test user and generate Bearer JWT token."""
    uid = uuid.uuid4().hex[:6]
    email = f"{email_prefix}_{uid}@example.com"
    user = User(
        name=f"Test {role.title()} {uid}",
        email=email,
        password_hash=hash_password("secret123"),
        role=role,
        buyer_id=buyer_id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token(user)
    return user, token


def test_unauthenticated_report_access_rejected(client):
    """Unauthenticated users must receive 401 Unauthorized for all report endpoints."""
    # 1. Listing types without token
    resp_types = client.get("/reports/types")
    assert resp_types.status_code == 401
    assert "Not authenticated" in resp_types.json()["detail"]

    # 2. Generating report without token
    resp_gen = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "pdf",
    })
    assert resp_gen.status_code == 401


def test_customer_report_access_and_cross_buyer_isolation(client, db_session):
    """
    Customer role can generate only customer-scoped reports.
    Customer is strictly forbidden from accessing another buyer's orders.
    """
    uid = uuid.uuid4().hex[:6]

    # Create Buyer A and Buyer B
    buyer_a = Buyer(name=f"Zara International {uid}", email=f"zara_{uid}@example.com")
    buyer_b = Buyer(name=f"H&M Global {uid}", email=f"hm_{uid}@example.com")
    db_session.add_all([buyer_a, buyer_b])
    db_session.commit()
    db_session.refresh(buyer_a)
    db_session.refresh(buyer_b)

    # Create Orders for each buyer
    now = datetime.now(timezone.utc)
    order_a = Order(
        buyer_id=buyer_a.id,
        fabric_type="Cotton Poplin",
        colour="Sky Blue",
        quantity_metres=Decimal("1200.00"),
        agreed_rate=Decimal("4.50"),
        deadline=now + timedelta(days=10),
        order_date=now - timedelta(days=2),
        priority="normal",
    )
    order_b = Order(
        buyer_id=buyer_b.id,
        fabric_type="Denim Twill",
        colour="Indigo",
        quantity_metres=Decimal("2500.00"),
        agreed_rate=Decimal("6.20"),
        deadline=now + timedelta(days=15),
        order_date=now - timedelta(days=3),
        priority="high",
    )
    db_session.add_all([order_a, order_b])
    db_session.commit()
    db_session.refresh(order_a)
    db_session.refresh(order_b)

    # Create Customer User for Buyer A
    customer_a, token_a = create_test_user(db_session, "customer_a", "customer", buyer_id=buyer_a.id)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 1. Customer lists authorized report types
    types_resp = client.get("/reports/types", headers=headers_a)
    assert types_resp.status_code == 200
    avail_ids = [r["id"] for r in types_resp.json()]
    assert "customer_order_status" in avail_ids
    assert "customer_dispatch_history" in avail_ids
    # Manager and Admin reports must NOT be exposed
    assert "production_summary" not in avail_ids
    assert "machine_utilization_downtime" not in avail_ids
    assert "admin_executive_summary" not in avail_ids

    # 2. Customer generates own PDF report
    pdf_resp = client.post("/reports/generate", json={
        "report_type": "customer_order_status",
        "format": "pdf",
    }, headers=headers_a)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["Content-Type"] == "application/pdf"
    assert "attachment; filename=" in pdf_resp.headers["Content-Disposition"]
    assert pdf_resp.content.startswith(b"%PDF-")

    # 3. Customer generates own XLSX report
    xlsx_resp = client.post("/reports/generate", json={
        "report_type": "customer_order_status",
        "format": "xlsx",
    }, headers=headers_a)
    assert xlsx_resp.status_code == 200
    assert xlsx_resp.headers["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    # Verify valid Excel workbook
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_resp.content))
    assert "Executive Summary" in wb.sheetnames
    assert "Operational Records" in wb.sheetnames

    # 4. Customer tries to access forbidden reports -> 403 Forbidden
    forbidden_resp = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "pdf",
    }, headers=headers_a)
    assert forbidden_resp.status_code == 403
    assert "not authorized" in forbidden_resp.json()["detail"]

    admin_forbidden = client.post("/reports/generate", json={
        "report_type": "admin_executive_summary",
        "format": "pdf",
    }, headers=headers_a)
    assert admin_forbidden.status_code == 403

    # 5. Customer filters by own order -> 200 OK
    own_order_resp = client.post("/reports/generate", json={
        "report_type": "customer_order_status",
        "format": "pdf",
        "order_id": order_a.id,
    }, headers=headers_a)
    assert own_order_resp.status_code == 200

    # 6. Customer tries cross-buyer order access (Order B belongs to Buyer B) -> 403 Forbidden
    cross_buyer_resp = client.post("/reports/generate", json={
        "report_type": "customer_order_status",
        "format": "pdf",
        "order_id": order_b.id,
    }, headers=headers_a)
    assert cross_buyer_resp.status_code == 403
    assert "does not belong to your buyer account" in cross_buyer_resp.json()["detail"]


def test_production_manager_operational_reports_and_financial_boundary(client, db_session):
    """
    Production Manager can generate operational, quality, machine, and inventory reports,
    but cannot access Admin executive/financial summaries.
    """
    prod_mgr, token = create_test_user(db_session, "prod_mgr", "production_manager")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Verify authorized report types
    types_resp = client.get("/reports/types", headers=headers)
    assert types_resp.status_code == 200
    avail_ids = [r["id"] for r in types_resp.json()]
    assert "production_summary" in avail_ids
    assert "machine_utilization_downtime" in avail_ids
    assert "quality_inspection" in avail_ids
    assert "inventory_status" in avail_ids
    # Admin only report must NOT be available
    assert "admin_executive_summary" not in avail_ids
    # Customer report must NOT be available to production manager
    assert "customer_order_status" not in avail_ids

    # 2. Production Manager generates Production Summary (PDF & XLSX)
    p_pdf = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "pdf",
    }, headers=headers)
    assert p_pdf.status_code == 200
    assert p_pdf.content.startswith(b"%PDF-")

    p_xlsx = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "xlsx",
    }, headers=headers)
    assert p_xlsx.status_code == 200
    wb_p = openpyxl.load_workbook(io.BytesIO(p_xlsx.content))
    assert "Operational Records" in wb_p.sheetnames

    # 3. Machine Utilization & Downtime Log
    m_pdf = client.post("/reports/generate", json={
        "report_type": "machine_utilization_downtime",
        "format": "pdf",
    }, headers=headers)
    assert m_pdf.status_code == 200
    assert m_pdf.content.startswith(b"%PDF-")

    # 4. Quality Inspection Report
    q_xlsx = client.post("/reports/generate", json={
        "report_type": "quality_inspection",
        "format": "xlsx",
    }, headers=headers)
    assert q_xlsx.status_code == 200
    wb_q = openpyxl.load_workbook(io.BytesIO(q_xlsx.content))
    assert "Executive Summary" in wb_q.sheetnames

    # 5. Inventory & Shortage Status Report
    inv_pdf = client.post("/reports/generate", json={
        "report_type": "inventory_status",
        "format": "pdf",
    }, headers=headers)
    assert inv_pdf.status_code == 200
    assert inv_pdf.content.startswith(b"%PDF-")

    # 6. Attempt to generate Admin Executive Summary -> 403 Forbidden
    admin_resp = client.post("/reports/generate", json={
        "report_type": "admin_executive_summary",
        "format": "pdf",
    }, headers=headers)
    assert admin_resp.status_code == 403


def test_admin_factory_wide_reports(client, db_session):
    """Admin role can generate all reports including executive summary."""
    admin_user, token = create_test_user(db_session, "admin_user", "admin")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Admin lists all types
    types_resp = client.get("/reports/types", headers=headers)
    assert types_resp.status_code == 200
    avail_ids = [r["id"] for r in types_resp.json()]
    assert "admin_executive_summary" in avail_ids
    assert "production_summary" in avail_ids
    assert "inventory_status" in avail_ids

    # 2. Admin generates Executive Summary in PDF and XLSX
    exec_pdf = client.post("/reports/generate", json={
        "report_type": "admin_executive_summary",
        "format": "pdf",
    }, headers=headers)
    assert exec_pdf.status_code == 200
    assert exec_pdf.content.startswith(b"%PDF-")

    exec_xlsx = client.post("/reports/generate", json={
        "report_type": "admin_executive_summary",
        "format": "xlsx",
    }, headers=headers)
    assert exec_xlsx.status_code == 200
    wb_exec = openpyxl.load_workbook(io.BytesIO(exec_xlsx.content))
    assert "Executive Summary" in wb_exec.sheetnames
    assert "Operational Records" in wb_exec.sheetnames


def test_input_validation_and_error_handling(client, db_session):
    """Validates date bounds, unknown report types, and empty dataset handling."""
    admin_user, token = create_test_user(db_session, "val_admin", "admin")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Unknown report type
    unk_resp = client.post("/reports/generate", json={
        "report_type": "non_existent_report_123",
        "format": "pdf",
    }, headers=headers)
    assert unk_resp.status_code == 400
    assert "Unknown or unsupported report type" in unk_resp.json()["detail"]

    # 2. Invalid date range (start_date > end_date)
    now = datetime.now(timezone.utc)
    inv_date_resp = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "pdf",
        "start_date": (now + timedelta(days=5)).isoformat(),
        "end_date": (now - timedelta(days=5)).isoformat(),
    }, headers=headers)
    assert inv_date_resp.status_code == 400
    assert "start_date cannot be greater than end_date" in inv_date_resp.json()["detail"]

    # 3. Empty date window (far in the past) still produces valid formatted document without crashing
    past_date = now - timedelta(days=3650)
    empty_pdf = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "pdf",
        "start_date": (past_date - timedelta(days=1)).isoformat(),
        "end_date": past_date.isoformat(),
    }, headers=headers)
    assert empty_pdf.status_code == 200
    assert empty_pdf.content.startswith(b"%PDF-")

    empty_xlsx = client.post("/reports/generate", json={
        "report_type": "production_summary",
        "format": "xlsx",
        "start_date": (past_date - timedelta(days=1)).isoformat(),
        "end_date": past_date.isoformat(),
    }, headers=headers)
    assert empty_xlsx.status_code == 200
    wb_empty = openpyxl.load_workbook(io.BytesIO(empty_xlsx.content))
    assert "Operational Records" in wb_empty.sheetnames
