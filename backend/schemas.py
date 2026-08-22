"""
Dayflow HRMS - Pydantic v2 Schemas for Salary and Payroll Modules
Architecture: Strict data validation using Pydantic v2 BaseModel, Field, and ConfigDict.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# 1. Salary Update Request (Incoming JSON from Admin UI)
# ============================================================================

class SalaryUpdateRequest(BaseModel):
    """
    Incoming payload for PUT /api/salary/{employee_id}.
    NOTE: 'fixed_allowance' is intentionally excluded here as it is computed
    on the backend as a balancing figure to prevent client tampering.
    """
    monthly_wage: Decimal = Field(
        ...,
        gt=Decimal("0.00"),
        decimal_places=2,
        description="Gross monthly compensation wage. Must be strictly greater than 0.",
        examples=[Decimal("75000.00")],
    )
    basic_rate: Decimal = Field(
        ...,
        ge=Decimal("0.0000"),
        le=Decimal("1.0000"),
        description="Basic pay rate fraction of monthly wage (0.0 to 1.0, e.g., 0.40 for 40%).",
        examples=[Decimal("0.4000")],
    )
    hra_rate: Decimal = Field(
        ...,
        ge=Decimal("0.0000"),
        le=Decimal("1.0000"),
        description="House Rent Allowance rate fraction (0.0 to 1.0, e.g., 0.20 for 20%).",
        examples=[Decimal("0.2000")],
    )
    pf_rate: Decimal = Field(
        ...,
        ge=Decimal("0.0000"),
        le=Decimal("1.0000"),
        description="Provident Fund deduction rate fraction (0.0 to 1.0, e.g., 0.12 for 12%).",
        examples=[Decimal("0.1200")],
    )
    working_days_per_week: int = Field(
        default=5,
        ge=1,
        le=7,
        description="Designated working days per week (between 1 and 7).",
        examples=[5],
    )


# ============================================================================
# 2. Salary Response (Outgoing JSON)
# ============================================================================

class SalaryResponse(SalaryUpdateRequest):
    """
    Outgoing response payload for salary configuration records.
    Inherits all rate and wage fields from SalaryUpdateRequest and includes
    backend-computed fixed allowance and metadata.
    """
    id: int = Field(
        ...,
        description="Unique identifier of the salary structure record.",
    )
    employee_id: str = Field(
        ...,
        description="Employee identifier associated with this salary structure.",
    )
    fixed_allowance: Decimal = Field(
        ...,
        decimal_places=2,
        description="Dynamically calculated balancing allowance figure.",
        examples=[Decimal("30000.00")],
    )
    effective_date: datetime = Field(
        ...,
        description="UTC timestamp when this salary structure became active.",
    )
    end_date: Optional[datetime] = Field(
        default=None,
        description="UTC timestamp when this structure was superseded (null if active).",
    )

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# 3. Payroll Run Request (Incoming JSON for Payroll Calculation)
# ============================================================================

class PayrollRunRequest(BaseModel):
    """
    Incoming request payload for POST /api/payroll/generate and POST /api/payroll/run.
    Triggers deterministic salary calculation and payslip generation for an employee in a pay period.
    """
    employee_id: str | int = Field(
        ...,
        description="Employee unique identifier or login ID (int or string).",
        examples=[1, "TEST20260001"],
    )
    pay_period: str = Field(
        ...,
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
        description="Target payroll period in YYYY-MM format.",
        examples=["2026-08"],
    )
    total_working_days_in_month: Optional[int] = Field(
        default=None,
        ge=1,
        le=31,
        description="Optional override for total standard working days in the month.",
        examples=[22],
    )


# ============================================================================
# 4. Salary Breakdown (Sub-model for Payslip JSONB snapshot)
# ============================================================================

class SalaryBreakdown(BaseModel):
    """
    Detailed granular breakdown stored as an immutable JSONB snapshot inside Payslip.
    """
    basic: Decimal = Field(
        ...,
        decimal_places=2,
        description="Computed Basic component for the period.",
        examples=[Decimal("30000.00")],
    )
    hra: Decimal = Field(
        ...,
        decimal_places=2,
        description="Computed House Rent Allowance for the period.",
        examples=[Decimal("15000.00")],
    )
    standard_allowance: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        description="Standard or statutory allowance component.",
        examples=[Decimal("0.00")],
    )
    pf_deduction: Decimal = Field(
        ...,
        decimal_places=2,
        description="Provident Fund deduction for the period.",
        examples=[Decimal("3600.00")],
    )
    professional_tax: Decimal = Field(
        default=Decimal("0.00"),
        decimal_places=2,
        description="Professional tax deduction for the period.",
        examples=[Decimal("0.00")],
    )
    fixed_allowance: Decimal = Field(
        ...,
        decimal_places=2,
        description="Balancing fixed allowance credited for the period.",
        examples=[Decimal("25833.33")],
    )

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# 5. Payslip Response (Outgoing JSON)
# ============================================================================

class PayslipResponse(BaseModel):
    """
    Outgoing response payload representing an immutable payslip ledger record.
    """
    id: int = Field(
        ...,
        description="Unique identifier of the generated payslip.",
    )
    employee_id: str = Field(
        ...,
        description="Employee identifier for whom the payslip was generated.",
    )
    pay_period: str = Field(
        ...,
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$",
        description="Payroll disbursement period in YYYY-MM format.",
        examples=["2026-07"],
    )
    payable_days: Decimal = Field(
        ...,
        ge=Decimal("0.00"),
        decimal_places=2,
        description="Total payable working days credited for this period.",
        examples=[Decimal("20.00")],
    )
    net_salary: Decimal = Field(
        ...,
        decimal_places=2,
        description="Final net salary disbursed to the employee.",
        examples=[Decimal("41217.39")],
    )
    salary_breakdown: SalaryBreakdown = Field(
        ...,
        description="Nested immutable JSON snapshot of all salary calculation components.",
    )
    created_at: datetime = Field(
        ...,
        description="UTC timestamp when the payslip was generated and finalized.",
    )

    model_config = ConfigDict(from_attributes=True)
