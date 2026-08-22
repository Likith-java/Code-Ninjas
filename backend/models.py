"""
Dayflow HRMS - Core SQLAlchemy Database Models (SQLite Compatible)
Architecture: Declarative Base with strict type safety, standard JSON,
and bi-directional relationship mapping.
"""

from __future__ import annotations
from backend.database import Base
import enum
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    JSON,  # <-- ADDED STANDARD JSON HERE
)
# REMOVED POSTGRESQL JSONB IMPORT
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)


# ============================================================================
# Enums
# ============================================================================

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    EMPLOYEE = "EMPLOYEE"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    HALF_DAY = "HALF_DAY"
    ON_LEAVE = "ON_LEAVE"


class LeaveType(str, enum.Enum):
    PAID = "PAID"
    SICK = "SICK"
    UNPAID = "UNPAID"


class TimeOffStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ============================================================================
# Models
# ============================================================================

class User(Base):
    """
    1. Users (Shared Foundation)
    Core identity table supporting role-based access and organizational hierarchy.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum", native_enum=True),
        nullable=False,
        default=UserRole.EMPLOYEE,
    )
    manager_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    requires_password_change: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # -------------------------------------------------------------------------
    # Relationships
    # -------------------------------------------------------------------------
    # Self-referencing relationship for managerial hierarchy
    manager: Mapped[Optional[User]] = relationship(
        "User",
        remote_side=[id],
        back_populates="direct_reports",
    )
    direct_reports: Mapped[List[User]] = relationship(
        "User",
        back_populates="manager",
    )

    # Shared Foundation: 1-to-1 Employee Profile
    profile: Mapped[Optional[EmployeeProfile]] = relationship(
        "EmployeeProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # Person 2 Dependencies
    attendance_logs: Mapped[List[AttendanceLog]] = relationship(
        "AttendanceLog",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(AttendanceLog.date)",
    )
    time_off_requests: Mapped[List[TimeOffRequest]] = relationship(
        "TimeOffRequest",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(TimeOffRequest.start_date)",
    )

    # Payroll Domain (Versioned Salary & Immutable Payslips)
    salary_structures: Mapped[List[SalaryStructure]] = relationship(
        "SalaryStructure",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(SalaryStructure.effective_date)",
    )
    payslips: Mapped[List[Payslip]] = relationship(
        "Payslip",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(Payslip.created_at)",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, login_id='{self.login_id}', role='{self.role.value}')>"


class EmployeeProfile(Base):
    """
    2. EmployeeProfiles (Shared Foundation)
    1-to-1 extension of the User model for employee-specific metadata.
    """
    __tablename__ = "employee_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    date_of_joining: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Relationship back to User
    user: Mapped[User] = relationship("User", back_populates="profile")

    def __repr__(self) -> str:
        return f"<EmployeeProfile(id={self.id}, user_id={self.user_id}, department='{self.department}')>"


class AttendanceLog(Base):
    """
    3. AttendanceLogs (Person 2 Dependency)
    Daily check-in and check-out logs supporting timezone-aware UTC timestamps.
    """
    __tablename__ = "attendance_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_attendance_date"),
        Index("idx_attendance_user_date", "user_id", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_in_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    check_out_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status_enum", native_enum=True),
        nullable=False,
    )

    # Relationship back to User
    user: Mapped[User] = relationship("User", back_populates="attendance_logs")

    def __repr__(self) -> str:
        return f"<AttendanceLog(id={self.id}, user_id={self.user_id}, date={self.date}, status='{self.status.value}')>"


class TimeOffRequest(Base):
    """
    4. TimeOffRequests (Person 2 Dependency)
    Leave application management with start/end date ranges and approval status.
    """
    __tablename__ = "time_off_requests"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="check_valid_leave_date_range"),
        Index("idx_time_off_user_dates", "user_id", "start_date", "end_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leave_type: Mapped[LeaveType] = mapped_column(
        Enum(LeaveType, name="leave_type_enum", native_enum=True),
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[TimeOffStatus] = mapped_column(
        Enum(TimeOffStatus, name="time_off_status_enum", native_enum=True),
        nullable=False,
        default=TimeOffStatus.PENDING,
    )

    # Relationship back to User
    user: Mapped[User] = relationship("User", back_populates="time_off_requests")

    def __repr__(self) -> str:
        return (
            f"<TimeOffRequest(id={self.id}, user_id={self.user_id}, "
            f"type='{self.leave_type.value}', status='{self.status.value}')>"
        )


class SalaryStructure(Base):
    """
    5. SalaryStructures (Domain - Versioned Compensation)
    Maintains historical compensation versions.
    An active version has end_date = NULL. A new version sets end_date on the old record.
    """
    __tablename__ = "salary_structures"
    __table_args__ = (
        Index("idx_salary_user_effective", "user_id", "effective_date", "end_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Using Numeric(12, 2) to eliminate float precision and rounding errors
    monthly_wage: Mapped[float] = mapped_column(
        Numeric(precision=12, scale=2),
        nullable=False,
    )
    basic_rate: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=False,
        comment="Percentage or multiplier for basic pay computation",
    )
    hra_rate: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=False,
        comment="Percentage or multiplier for HRA computation",
    )
    pf_rate: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=False,
        comment="Percentage or multiplier for Provident Fund deduction",
    )
    fixed_allowance: Mapped[float] = mapped_column(
        Numeric(precision=12, scale=2),
        nullable=False,
    )
    working_days_per_week: Mapped[int] = mapped_column(
        Integer,
        default=5,
        nullable=False,
    )
    effective_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    end_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Null indicates currently active salary structure version",
    )

    # Relationship back to User
    user: Mapped[User] = relationship("User", back_populates="salary_structures")

    def __repr__(self) -> str:
        return (
            f"<SalaryStructure(id={self.id}, user_id={self.user_id}, "
            f"monthly_wage={self.monthly_wage}, effective_date={self.effective_date})>"
        )


class Payslip(Base):
    """
    6. Payslips (Domain - Immutable Ledger)
    Immutable record of generated payroll for a given pay period.
    Stores exact salary breakdown in SQLite JSON for auditing and compliance.
    """
    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("user_id", "pay_period", name="uq_user_pay_period"),
        Index("idx_payslip_period", "pay_period"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pay_period: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        comment="Format: YYYY-MM (e.g. 2026-10)",
    )
    payable_days: Mapped[float] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
        comment="Total payable working days, supporting fractional days",
    )
    net_salary: Mapped[float] = mapped_column(
        Numeric(precision=12, scale=2),
        nullable=False,
        comment="Final calculated net disbursement amount",
    )
    salary_breakdown: Mapped[Dict[str, Any]] = mapped_column(
        JSON,  # <-- CHANGED FROM JSONB TO JSON HERE
        nullable=False,
        comment="Immutable snapshot of allowances, deductions, gross pay, etc.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship back to User
    user: Mapped[User] = relationship("User", back_populates="payslips")

    def __repr__(self) -> str:
        return (
            f"<Payslip(id={self.id}, user_id={self.user_id}, "
            f"pay_period='{self.pay_period}', net_salary={self.net_salary})>"
        )