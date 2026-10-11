"""
Report generation router for Everest Textile Intelligence platform.
Provides role-secured report type discovery and on-demand PDF / Excel generation.
"""
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services.report_excel import generate_excel_report
from app.services.report_pdf import generate_pdf_report
from app.services.report_permissions import (
    get_authorized_report_types,
    validate_and_resolve_scope,
)
from app.services.report_service import get_report_data

router = APIRouter(tags=["Reports"])


# =========================================================================
# Schemas
# =========================================================================

class ReportTypeItem(BaseModel):
    id: str
    title: str
    description: str
    audience: str
    supported_formats: list[str]
    supported_filters: list[str]


class ReportGenerateRequest(BaseModel):
    report_type: str = Field(min_length=1, description="Identifier of the authorized report type")
    format: Literal["pdf", "xlsx"] = Field(default="pdf", description="Target export format")
    start_date: datetime | None = Field(default=None, description="Optional start datetime for scope filtering")
    end_date: datetime | None = Field(default=None, description="Optional end datetime for scope filtering")
    order_id: int | None = Field(default=None, description="Optional specific order filter (must be authorized)")
    machine_id: int | None = Field(default=None, description="Optional machine filter for operational reports")


# =========================================================================
# Endpoints
# =========================================================================

@router.get(
    "/reports/types",
    response_model=list[ReportTypeItem],
    summary="List available report types for the authenticated role",
)
@router.get(
    "/api/reports/types",
    response_model=list[ReportTypeItem],
    include_in_schema=False,
)
def list_report_types(current_user: User = Depends(get_current_user)):
    """
    Returns the catalog of report types accessible by the caller's server-verified role.
    Customer users receive buyer-scoped reports; Production Managers receive operational logs;
    Admins receive factory-wide and executive reports.
    Dispatch managers are explicitly forbidden from report access.
    """
    if current_user.role == "dispatch_manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Dispatch Manager role is not permitted to access reports or data export.",
        )
    return get_authorized_report_types(current_user)


@router.post(
    "/reports/generate",
    summary="Generate and download role-authorized PDF or XLSX report",
)
@router.post(
    "/api/reports/generate",
    include_in_schema=False,
)
def generate_report(
    payload: ReportGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates a professional downloadable PDF or XLSX report from live database records.
    Validates permissions, date bounds, and data ownership scopes before extracting metrics.
    """
    if current_user.role == "dispatch_manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Dispatch Manager role is not permitted to access reports or data export.",
        )

    # 1. Validate permissions and scope
    scope = validate_and_resolve_scope(
        user=current_user,
        report_type=payload.report_type,
        db=db,
        order_id=payload.order_id,
        machine_id=payload.machine_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )

    # 2. Extract database records and compute metrics
    report_data = get_report_data(scope, db)

    # 3. Format timestamp for safe filename
    timestamp_slug = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    clean_type = payload.report_type.replace("-", "_")

    if payload.format == "pdf":
        file_bytes = generate_pdf_report(report_data)
        media_type = "application/pdf"
        filename = f"report_{clean_type}_{timestamp_slug}.pdf"
    elif payload.format == "xlsx":
        file_bytes = generate_excel_report(report_data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"report_{clean_type}_{timestamp_slug}.xlsx"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format: '{payload.format}'. Use 'pdf' or 'xlsx'.",
        )

    # 4. Return as downloadable file attachment
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(file_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
