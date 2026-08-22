"""
Dayflow HRMS - Salary and Compensation Router
Endpoints:
- GET /api/salary/{employee_id}: Fetch current active salary structure
- GET /api/salary/{employee_id}/history: Fetch historical salary versions
- GET /api/salary: List all active salary structures
- PUT /api/salary/{employee_id}: Update and version employee salary structure
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import SalaryStructure, User
from backend.schemas import SalaryResponse, SalaryUpdateRequest

router = APIRouter(
    prefix="/api/salary",
    tags=["Salary & Compensation"],
)


def _resolve_user(emp_str: str, db: Session, auto_provision: bool = False) -> Optional[User]:
    """Resolves user by integer ID or alphanumeric login_id."""
    emp_str = emp_str.strip()
    user = None
    if emp_str.isdigit():
        user = db.query(User).filter(User.id == int(emp_str)).first()
    if not user:
        user = db.query(User).filter(User.login_id == emp_str).first()
    if not user and auto_provision:
        new_user_id = int(emp_str) if emp_str.isdigit() else None
        user = User(
            id=new_user_id,
            login_id=emp_str if not emp_str.isdigit() else f"emp_{emp_str}",
            role="EMPLOYEE",
            requires_password_change=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get(
    "/{employee_id}",
    response_model=SalaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Employee Active Salary Structure",
    description="Retrieves the current active salary structure for the specified employee.",
)
def get_salary_structure(
    employee_id: str = Path(..., description="Employee login ID or numeric identifier"),
    db: Session = Depends(get_db),
) -> SalaryStructure:
    user = _resolve_user(employee_id, db, auto_provision=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{employee_id}' not found.",
        )

    structure = (
        db.query(SalaryStructure)
        .filter(SalaryStructure.user_id == user.id, SalaryStructure.end_date.is_(None))
        .order_by(SalaryStructure.effective_date.desc())
        .first()
    )

    if not structure:
        # Auto-provision standard initial benchmark structure if none exists
        structure = SalaryStructure(
            user_id=user.id,
            monthly_wage=Decimal("50000.00"),
            basic_rate=Decimal("0.4000"),
            hra_rate=Decimal("0.2000"),
            pf_rate=Decimal("0.1200"),
            fixed_allowance=Decimal("20000.00"),
            working_days_per_week=5,
            effective_date=datetime.now(timezone.utc),
            end_date=None,
        )
        db.add(structure)
        db.commit()
        db.refresh(structure)

    setattr(structure, "employee_id", user.login_id or str(user.id))
    return structure


@router.get(
    "/{employee_id}/history",
    response_model=List[SalaryResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Employee Salary Version History",
    description="Returns all versioned salary structure records for the employee ordered by effective_date descending.",
)
def get_salary_history(
    employee_id: str = Path(..., description="Employee login ID or numeric identifier"),
    db: Session = Depends(get_db),
) -> List[SalaryStructure]:
    user = _resolve_user(employee_id, db, auto_provision=False)
    if not user:
        return []

    records = (
        db.query(SalaryStructure)
        .filter(SalaryStructure.user_id == user.id)
        .order_by(SalaryStructure.effective_date.desc())
        .all()
    )

    for rec in records:
        setattr(rec, "employee_id", user.login_id or str(user.id))

    return records


@router.get(
    "",
    response_model=List[SalaryResponse],
    status_code=status.HTTP_200_OK,
    summary="List All Active Salary Structures",
)
def list_active_salary_structures(db: Session = Depends(get_db)) -> List[SalaryStructure]:
    structures = (
        db.query(SalaryStructure)
        .filter(SalaryStructure.end_date.is_(None))
        .order_by(SalaryStructure.effective_date.desc())
        .all()
    )

    results = []
    for st in structures:
        user = db.query(User).filter(User.id == st.user_id).first()
        emp_id = user.login_id if user and user.login_id else str(st.user_id)
        setattr(st, "employee_id", emp_id)
        results.append(st)

    return results


@router.put(
    "/{employee_id}",
    response_model=SalaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Employee Salary Structure",
    description=(
        "Calculates component breakdown, validates that balancing fixed allowance "
        "is non-negative, closes any active salary record with UTC end_date, "
        "and inserts a new versioned SalaryStructure record."
    ),
)
def update_salary_structure(
    employee_id: str = Path(
        ...,
        description="Unique employee login ID or identifier (e.g., '1', 'EMP-1001', 'employee1').",
        examples=["1", "EMP-1001"],
    ),
    payload: SalaryUpdateRequest = ...,
    db: Session = Depends(get_db),
) -> SalaryStructure:
    """
    PUT /api/salary/{employee_id}
    
    Step-by-Step Business Logic:
    1. Resolve User (auto-provision if not found so it works for any employee).
    2. Perform Component Math (Basic Salary & HRA).
    3. Calculate Balancing Figure (Fixed Allowance).
    4. Gatekeeper Validation (Fixed Allowance >= 0).
    5. Row Versioning (Expire existing active record with UTC timestamp).
    6. Insert New Versioned Record.
    7. Return serialized SalaryResponse.
    """
    emp_str = str(employee_id).strip()
    user = _resolve_user(emp_str, db, auto_provision=True)
    user_id_val = user.id

    # Component Math
    monthly_wage = Decimal(str(payload.monthly_wage))
    basic_rate = Decimal(str(payload.basic_rate))
    hra_rate = Decimal(str(payload.hra_rate))
    pf_rate = Decimal(str(payload.pf_rate))

    basic_salary: Decimal = (monthly_wage * basic_rate).quantize(Decimal("0.01"))
    hra: Decimal = (basic_salary * hra_rate).quantize(Decimal("0.01"))

    # Balancing figure
    fixed_allowance: Decimal = (monthly_wage - (basic_salary + hra)).quantize(Decimal("0.01"))

    # Gatekeeper Validation
    if fixed_allowance < Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Component total exceeds Monthly Wage. Fixed Allowance cannot be negative.",
        )

    # Current UTC timestamp
    now_utc = datetime.now(timezone.utc)

    # Expire previous active structure
    current_active_structure = (
        db.query(SalaryStructure)
        .filter(
            SalaryStructure.user_id == user_id_val,
            SalaryStructure.end_date.is_(None),
        )
        .order_by(SalaryStructure.effective_date.desc())
        .first()
    )

    if current_active_structure:
        current_active_structure.end_date = now_utc

    # Insert new record
    new_salary_structure = SalaryStructure(
        user_id=user_id_val,
        monthly_wage=monthly_wage,
        basic_rate=basic_rate,
        hra_rate=hra_rate,
        pf_rate=pf_rate,
        fixed_allowance=fixed_allowance,
        working_days_per_week=payload.working_days_per_week,
        effective_date=now_utc,
        end_date=None,
    )

    db.add(new_salary_structure)
    db.commit()
    db.refresh(new_salary_structure)

    # Attach dynamic employee_id attribute for Pydantic serialization
    setattr(new_salary_structure, "employee_id", user.login_id or emp_str)

    return new_salary_structure
