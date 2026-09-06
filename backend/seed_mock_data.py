"""
Dayflow HRMS - Standalone Mock Data Seeding Script
File: seed_mock_data.py

Seeds deterministic test data for employee 'TEST20260001' covering:
- User identity & role
- Active salary structure (effective 2026-01-01)
- Weekday attendance logs for July 2026 (including 1 missing check-out on July 15)
- Time-off requests (1 Paid Leave day + 2 Unpaid Leave days)
"""

from __future__ import annotations

import sys
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path

# Ensure backend package can be imported if script is run directly from any directory
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR.parent))

from backend.database import SessionLocal, engine
from backend.models import (
    AttendanceLog,
    AttendanceStatus,
    Base,
    LeaveType,
    SalaryStructure,
    TimeOffRequest,
    TimeOffStatus,
    User,
    UserRole,
)


def seed_mock_data() -> None:
    """Seeds test data for July 2026 payroll testing."""
    # Ensure database schema tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    test_login_id = "TEST20260001"

    try:
        print("=" * 70)
        print("  Dayflow HRMS - Payroll Algorithm Mock Data Seeder")
        print("=" * 70)

        # ---------------------------------------------------------------------
        # 1. Idempotent Cleanup: Remove existing mock data for test user
        # ---------------------------------------------------------------------
        existing_user = db.query(User).filter(User.login_id == test_login_id).first()
        if existing_user:
            print(f"[Cleanup] Found existing test user '{test_login_id}' (ID: {existing_user.id}). Purging...")
            # Cascading deletes will remove associated salary, attendance, and leave records
            db.delete(existing_user)
            db.commit()
            print("[Cleanup] Existing test user and related records purged successfully.")

        # ---------------------------------------------------------------------
        # 2. Create Test Employee
        # ---------------------------------------------------------------------
        test_user = User(
            login_id=test_login_id,
            role=UserRole.EMPLOYEE,
            requires_password_change=False,
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        print(f"\n[1/4] Created User: login_id='{test_user.login_id}', id={test_user.id}, role='{test_user.role.value}'")

        # ---------------------------------------------------------------------
        # 3. Create Active Salary Structure
        # ---------------------------------------------------------------------
        salary_structure = SalaryStructure(
            user_id=test_user.id,
            monthly_wage=Decimal("50000.00"),
            basic_rate=Decimal("0.4000"),
            hra_rate=Decimal("0.2000"),
            pf_rate=Decimal("0.1200"),
            fixed_allowance=Decimal("26000.00"),
            working_days_per_week=5,
            effective_date=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            end_date=None,  # Active record
        )
        db.add(salary_structure)
        db.commit()
        db.refresh(salary_structure)
        print(
            f"[2/4] Created Active Salary Structure (ID: {salary_structure.id}):\n"
            f"      - Monthly Wage:     INR {salary_structure.monthly_wage:,.2f}\n"
            f"      - Basic Rate:        {salary_structure.basic_rate * 100:.1f}%\n"
            f"      - HRA Rate:          {salary_structure.hra_rate * 100:.1f}%\n"
            f"      - PF Rate:           {salary_structure.pf_rate * 100:.1f}%\n"
            f"      - Fixed Allowance:  INR {salary_structure.fixed_allowance:,.2f}\n"
            f"      - Working Days/Wk:   {salary_structure.working_days_per_week}\n"
            f"      - Effective Date:    {salary_structure.effective_date.date()} (Active)"
        )

        # ---------------------------------------------------------------------
        # 4. Generate Mock Attendance for July 2026 (2026-07-01 to 2026-07-31)
        # ---------------------------------------------------------------------
        year = 2026
        month = 7
        total_month_days = 31

        missing_checkout_day = 15  # July 15, 2026 (Wednesday)

        weekday_count = 0
        standard_attendance_count = 0
        missing_checkout_count = 0

        attendance_records: list[AttendanceLog] = []

        for day in range(1, total_month_days + 1):
            current_date = date(year, month, day)

            # Weekday check: Monday (0) to Friday (4). Saturday (5) & Sunday (6) are skipped
            if current_date.weekday() >= 5:
                continue

            weekday_count += 1

            # Standard Check-in at 09:00:00 UTC
            check_in = datetime.combine(
                current_date,
                time(9, 0, 0),
                tzinfo=timezone.utc,
            )

            # Special case: July 15 has missing check-out (None)
            if day == missing_checkout_day:
                check_out = None
                missing_checkout_count += 1
            else:
                # Standard Check-out at 17:00:00 UTC (8 hours)
                check_out = datetime.combine(
                    current_date,
                    time(17, 0, 0),
                    tzinfo=timezone.utc,
                )
                standard_attendance_count += 1

            record = AttendanceLog(
                user_id=test_user.id,
                date=current_date,
                check_in_time=check_in,
                check_out_time=check_out,
                status=AttendanceStatus.PRESENT,
            )
            attendance_records.append(record)

        db.add_all(attendance_records)
        db.commit()
        print(
            f"[3/4] Generated July 2026 Attendance Logs ({len(attendance_records)} total weekdays):\n"
            f"      - Standard Complete Days (09:00-17:00 UTC): {standard_attendance_count} days\n"
            f"      - Missing Check-Out Day (2026-07-15):       {missing_checkout_count} day (Check-out = NULL)"
        )

        # ---------------------------------------------------------------------
        # 5. Generate Mock Time-Off Requests for July 2026
        # ---------------------------------------------------------------------
        # Approved Paid Leave: July 10, 2026 (1 day)
        paid_leave = TimeOffRequest(
            user_id=test_user.id,
            leave_type=LeaveType.PAID,
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 10),
            status=TimeOffStatus.APPROVED,
        )

        # Approved Unpaid Leave: July 20 to July 21, 2026 (2 days)
        unpaid_leave = TimeOffRequest(
            user_id=test_user.id,
            leave_type=LeaveType.UNPAID,
            start_date=date(2026, 7, 20),
            end_date=date(2026, 7, 21),
            status=TimeOffStatus.APPROVED,
        )

        db.add_all([paid_leave, unpaid_leave])
        db.commit()
        print(
            f"[4/4] Generated Time-Off Requests:\n"
            f"      - Approved PAID Leave:   2026-07-10 to 2026-07-10 (1 Day)\n"
            f"      - Approved UNPAID Leave: 2026-07-20 to 2026-07-21 (2 Days - LOP)"
        )

        # ---------------------------------------------------------------------
        # Verification & Payroll Deduction Summary for Developer
        # ---------------------------------------------------------------------
        print("\n" + "=" * 70)
        print("  MOCK DATA SEEDING COMPLETE - VERIFICATION BENCHMARK")
        print("=" * 70)
        print("  Employee Login ID:     TEST20260001")
        print("  Target Pay Period:     2026-07 (July 2026)")
        print("  Gross Monthly Wage:    INR 50,000.00")
        print("  Total Working Weekdays: 23 Days")
        print("  -----------------------------------------------------------------")
        print("  EXPECTED PAYROLL INPUTS & DEDUCTIONS FOR TEST RUNNER:")
        print("  1. Missing Check-Outs: 1 Day (2026-07-15)")
        print("     -> Attendance penalty / half-day rule to be verified.")
        print("  2. Unpaid Leave (LOP): 2 Days (2026-07-20 to 2026-07-21)")
        print("     -> Loss of Pay deduction = (Monthly Wage / Working Days) * 2")
        print("  3. Paid Leave:         1 Day (2026-07-10) [No salary deduction]")
        print("=" * 70 + "\n")

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Database seeding failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_mock_data()
