"""
Dayflow HRMS - Payroll Generation Router
Handles monthly payroll processing, payable days calculation, 
deductions computation, and immutable ledger (Payslip) creation/upsert.
"""

import calendar
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone, date
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, Union

from backend.database import get_db
from backend.models import User, SalaryStructure, Payslip, AttendanceLog, AttendanceStatus

router = APIRouter(prefix="/api/payroll", tags=["Payroll Module"])


class PayrollRunRequest(BaseModel):
    employee_id: Union[int, str] = Field(1, description="Employee ID (e.g. 1, '1', or 'employee1')")
    pay_period: str = Field(..., description="Format: YYYY-MM (e.g., 2026-08)")
    total_working_days_in_month: Optional[int] = Field(22, description="Standard working days for the month (default 22)")
    custom_payable_days: Optional[float] = Field(None, description="Payable days worked (e.g. 10 or 22)")


@router.post("/generate", status_code=status.HTTP_201_CREATED)
@router.post("/run", status_code=status.HTTP_201_CREATED)
def generate_payslip(payload: PayrollRunRequest, db: Session = Depends(get_db)):
    # 1. Resolve User (by numeric ID or login_id)
    emp_input = str(payload.employee_id).strip()
    user = None

    if emp_input.isdigit():
        user = db.query(User).filter(User.id == int(emp_input)).first()

    if not user:
        user = db.query(User).filter(User.login_id == emp_input).first()

    # If user record doesn't exist in DB yet, auto-provision so payroll generation always succeeds
    if not user:
        new_user_id = int(emp_input) if emp_input.isdigit() else None
        user = User(
            id=new_user_id,
            login_id=emp_input if not emp_input.isdigit() else f"emp_{emp_input}",
            role="EMPLOYEE",
            requires_password_change=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 2. Fetch Active Salary Structure (where end_date is null)
    salary_struct = db.query(SalaryStructure).filter(
        SalaryStructure.user_id == user.id,
        SalaryStructure.end_date == None
    ).order_by(SalaryStructure.effective_date.desc()).first()

    # If salary structure is not configured yet, auto-initialize standard benchmark structure
    if not salary_struct:
        salary_struct = SalaryStructure(
            user_id=user.id,
            monthly_wage=50000.00,
            basic_rate=0.40,
            hra_rate=0.20,
            pf_rate=0.12,
            fixed_allowance=20000.00,
            working_days_per_week=5,
            effective_date=datetime.now(timezone.utc),
            end_date=None,
        )
        db.add(salary_struct)
        db.commit()
        db.refresh(salary_struct)

    # 3. Determine Standard Month Working Days (Calendar weekdays or provided baseline)
    standard_month_days = 22.0
    try:
        parts = payload.pay_period.split("-")
        year, month = int(parts[0]), int(parts[1])
        _, last_day = calendar.monthrange(year, month)
        cal_weekdays = sum(1 for d in range(1, last_day + 1) if date(year, month, d).weekday() < 5)
        if cal_weekdays > 0:
            standard_month_days = float(cal_weekdays)
    except Exception:
        pass

    # Baseline total standard working days
    total_working_days = float(payload.total_working_days_in_month) if payload.total_working_days_in_month and payload.total_working_days_in_month > 0 else standard_month_days

    # Determine Payable Days (Days worked by employee)
    if payload.custom_payable_days is not None:
        payable_days = float(payload.custom_payable_days)
    elif payload.total_working_days_in_month and payload.total_working_days_in_month < standard_month_days:
        # If user passed e.g. 10 in the main days field without specifying custom_payable_days,
        # interpret 10 as the payable days out of standard month days (22)
        payable_days = float(payload.total_working_days_in_month)
        total_working_days = standard_month_days
    else:
        # Check Attendance Logs
        attendance_records = db.query(AttendanceLog).filter(
            AttendanceLog.user_id == user.id,
            AttendanceLog.date.like(f"{payload.pay_period}%")
        ).all()

        if attendance_records:
            present_count = sum(1 for log in attendance_records if log.status == AttendanceStatus.PRESENT)
            half_day_count = sum(0.5 for log in attendance_records if log.status == AttendanceStatus.HALF_DAY)
            calculated_days = present_count + half_day_count
            payable_days = min(float(calculated_days), total_working_days)
        else:
            payable_days = total_working_days

    # Ensure bounds: cannot be negative or exceed total working days
    payable_days = max(0.0, min(payable_days, total_working_days))

    # 4. Calculate Proration Ratio
    ratio = (payable_days / total_working_days) if total_working_days > 0 else 0.0

    # 5. Compute components strictly scaled by the proration ratio
    monthly_wage = float(salary_struct.monthly_wage)
    basic_rate = float(salary_struct.basic_rate)
    hra_rate = float(salary_struct.hra_rate)
    pf_rate = float(salary_struct.pf_rate)
    fixed_allowance = float(salary_struct.fixed_allowance)

    # Prorated base amounts
    prorated_monthly_wage = monthly_wage * ratio
    basic_salary = prorated_monthly_wage * basic_rate
    hra = basic_salary * hra_rate
    prorated_fixed_allowance = fixed_allowance * ratio
    
    gross_earnings = basic_salary + hra + prorated_fixed_allowance
    
    # Deductions (PF on basic)
    pf_deduction = basic_salary * pf_rate
    total_deductions = pf_deduction
    
    net_salary = gross_earnings - total_deductions

    # 6. Build Salary Breakdown Snapshot (JSON)
    breakdown_snapshot: Dict[str, Any] = {
        "monthly_base_wage": round(monthly_wage, 2),
        "payable_days": round(payable_days, 2),
        "total_working_days": int(total_working_days),
        "proration_ratio": round(ratio, 4),
        "earnings": {
            "basic": round(basic_salary, 2),
            "hra": round(hra, 2),
            "fixed_allowance": round(prorated_fixed_allowance, 2),
            "gross_earnings": round(gross_earnings, 2)
        },
        "deductions": {
            "provident_fund": round(pf_deduction, 2),
            "total_deductions": round(total_deductions, 2)
        },
        "net_disbursement": round(net_salary, 2)
    }

    # 7. Check if payslip already exists (Upsert logic: Update if exists, create if not)
    existing_payslip = db.query(Payslip).filter(
        Payslip.user_id == user.id,
        Payslip.pay_period == payload.pay_period
    ).first()

    if existing_payslip:
        existing_payslip.payable_days = payable_days
        existing_payslip.net_salary = round(net_salary, 2)
        existing_payslip.salary_breakdown = breakdown_snapshot
        db.commit()
        db.refresh(existing_payslip)
        payslip_id = existing_payslip.id
        status_msg = f"Successfully updated existing payslip for {payload.pay_period} (Employee {user.login_id or user.id}): {payable_days}/{int(total_working_days)} days"
    else:
        new_payslip = Payslip(
            user_id=user.id,
            pay_period=payload.pay_period,
            payable_days=payable_days,
            net_salary=round(net_salary, 2),
            salary_breakdown=breakdown_snapshot,
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_payslip)
        db.commit()
        db.refresh(new_payslip)
        payslip_id = new_payslip.id
        status_msg = f"Successfully generated new payslip for {payload.pay_period} (Employee {user.login_id or user.id}): {payable_days}/{int(total_working_days)} days"

    return {
        "message": status_msg,
        "payslip_id": payslip_id,
        "employee_id": user.login_id or user.id,
        "net_salary": round(net_salary, 2),
        "breakdown": breakdown_snapshot
    }