"""
Dayflow HRMS - Reports & Analytics Router
Endpoints:
- GET /api/reports/payroll-summary/{pay_period}: Aggregated metrics and audit trail
"""

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from backend.database import get_db
from backend.models import Payslip, User

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])


@router.get("/payroll-summary/{pay_period}", status_code=status.HTTP_200_OK)
def get_payroll_summary(
    pay_period: str = Path(..., description="Pay period in YYYY-MM format (e.g., '2026-08')"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns high-level summary metrics and a detailed audit list for a specific pay period.
    """
    # Query all payslips for the given pay period
    payslips = db.query(Payslip).filter(Payslip.pay_period == pay_period).all()

    if not payslips:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No payroll records found for pay period '{pay_period}'. Please run payroll generation first."
        )

    total_employees_paid = len(payslips)
    total_net_disbursement = 0.0
    total_gross_earnings = 0.0
    total_pf_deductions = 0.0

    payslips_audit_list: List[Dict[str, Any]] = []

    for ps in payslips:
        # Resolve employee login ID
        user = db.query(User).filter(User.id == ps.user_id).first()
        emp_identifier = user.login_id if user and user.login_id else str(ps.user_id)

        net_sal = float(ps.net_salary)
        total_net_disbursement += net_sal

        # Extract breakdown items
        breakdown = ps.salary_breakdown or {}
        
        # Support nested structure (earnings/deductions) and flat structure
        earnings = breakdown.get("earnings", {})
        deductions = breakdown.get("deductions", {})

        gross = float(earnings.get("gross_earnings", 0.0)) if earnings else 0.0
        if gross == 0.0:
            basic = float(breakdown.get("basic", 0.0))
            hra = float(breakdown.get("hra", 0.0))
            fixed = float(breakdown.get("fixed_allowance", 0.0))
            gross = basic + hra + fixed

        pf = float(deductions.get("provident_fund", 0.0)) if deductions else 0.0
        if pf == 0.0:
            pf = float(breakdown.get("pf_deduction", 0.0))

        total_gross_earnings += gross
        total_pf_deductions += pf

        payslips_audit_list.append({
            "id": ps.id,
            "payslip_id": ps.id,
            "employee_id": emp_identifier,
            "user_id": ps.user_id,
            "payable_days": float(ps.payable_days),
            "net_salary": round(net_sal, 2),
            "gross_earnings": round(gross, 2),
            "pf_deduction": round(pf, 2),
            "created_at": ps.created_at.isoformat() if ps.created_at else None,
            "salary_breakdown": breakdown,
        })

    return {
        "pay_period": pay_period,
        "total_employees_paid": total_employees_paid,
        "total_net_disbursement": round(total_net_disbursement, 2),
        "total_gross_earnings": round(total_gross_earnings, 2),
        "total_pf_deductions": round(total_pf_deductions, 2),
        "payslips_audit_list": payslips_audit_list,
    }
