import React, { useState } from 'react';

/**
 * Payroll Generator Dashboard Component
 * 
 * Features:
 * - Dynamic Proration: Generates exact pro-rated pay based on days worked (e.g. 10 days vs 22 days)
 * - Inputs: Employee ID, Pay Period (YYYY-MM), Standard Month Days, Actual Payable Days
 * - API Integration: POST http://127.0.0.1:8000/api/payroll/generate
 * - Live Proration Preview: Shows the exact % ratio (e.g., 10 / 22 = 45.45%)
 * - Results Display: Official payslip summary card with earnings and deductions
 */
export default function PayrollGenerator() {
  const [employeeId, setEmployeeId] = useState('1');
  const [payPeriod, setPayPeriod] = useState('2026-08');
  const [totalMonthDays, setTotalMonthDays] = useState('22');
  const [payableDaysInput, setPayableDaysInput] = useState('22');

  const [loading, setLoading] = useState(false);
  const [payslipData, setPayslipData] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Live calculation preview
  const stdDays = parseFloat(totalMonthDays) || 22;
  const workedDays = parseFloat(payableDaysInput) || 0;
  const liveRatio = stdDays > 0 ? ((workedDays / stdDays) * 100).toFixed(1) : 0;

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');
    setPayslipData(null);

    const empInput = employeeId.trim() || '1';
    const stdDaysNum = parseInt(totalMonthDays, 10) || 22;
    const payableDaysNum = parseFloat(payableDaysInput) || stdDaysNum;

    const payload = {
      employee_id: !isNaN(Number(empInput)) ? Number(empInput) : empInput,
      pay_period: payPeriod.trim(),
      total_working_days_in_month: stdDaysNum,
      custom_payable_days: payableDaysNum,
    };

    try {
      const response = await fetch('http://127.0.0.1:8000/api/payroll/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        let formattedError = 'Failed to process payroll.';
        if (typeof data.detail === 'string') {
          formattedError = data.detail;
        } else if (Array.isArray(data.detail)) {
          formattedError = data.detail
            .map((item) => {
              const field = item.loc ? item.loc[item.loc.length - 1] : 'field';
              return `${field}: ${item.msg}`;
            })
            .join(' | ');
        } else if (data.detail && typeof data.detail === 'object') {
          formattedError = JSON.stringify(data.detail);
        } else if (data.message) {
          formattedError = data.message;
        }
        throw new Error(formattedError);
      }

      setPayslipData(data);

      const statusMsg =
        data.message ||
        `Official payslip successfully processed for Employee ${payload.employee_id} (${payload.pay_period})`;
      setSuccessMessage(statusMsg);
    } catch (err) {
      setErrorMessage(
        err.message || 'Failed to connect to FastAPI backend at http://127.0.0.1:8000/api/payroll/generate'
      );
    } finally {
      setLoading(false);
    }
  };

  // Helper extraction supporting various backend response formats
  const breakdown = payslipData?.breakdown || {};
  const earnings = breakdown.earnings || {};
  const deductions = breakdown.deductions || {};

  const basic = earnings.basic ?? parseFloat(payslipData?.salary_breakdown?.basic || 0);
  const hra = earnings.hra ?? parseFloat(payslipData?.salary_breakdown?.hra || 0);
  const fixedAllowance = earnings.fixed_allowance ?? parseFloat(payslipData?.salary_breakdown?.fixed_allowance || 0);
  const grossEarnings = earnings.gross_earnings ?? (basic + hra + fixedAllowance);

  const pfDeduction = deductions.provident_fund ?? parseFloat(payslipData?.salary_breakdown?.pf_deduction || 0);
  const totalDeductions = deductions.total_deductions ?? pfDeduction;

  const netSalary = payslipData?.net_salary ?? (grossEarnings - totalDeductions);
  const payableDays = breakdown.payable_days ?? payslipData?.payable_days ?? (payableDaysInput || 22);
  const totalDays = breakdown.total_working_days ?? payslipData?.total_working_days_in_month ?? (totalMonthDays || 22);
  const payslipId = payslipData?.payslip_id ?? payslipData?.id ?? 'N/A';
  const displayEmpId = payslipData?.employee_id ?? employeeId;

  return (
    <div className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-2 border-b border-outline-variant/15 pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
            <h3 className="font-headline-md text-xl font-bold text-primary">Payroll Generator</h3>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant">
            Run automated payroll calculations with dynamic day-based pro-rating (e.g. 10 vs 22 days).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Pro-rate: {workedDays}/{stdDays} Days ({liveRatio}%)
          </span>
          <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-semibold text-white">
            POST /api/payroll/generate
          </span>
        </div>
      </div>

      {/* Feedback: Green Success Banner */}
      {successMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm animate-fadeIn">
          <span className="material-symbols-outlined mt-0.5 text-emerald-600">check_circle</span>
          <div className="flex-1 text-sm">
            <p className="font-bold">Payslip Processed Successfully!</p>
            <p className="mt-1 text-xs text-emerald-800">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-emerald-500 hover:text-emerald-700"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Feedback: Red Error Banner */}
      {errorMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50/90 p-4 text-red-900 shadow-sm animate-fadeIn">
          <span className="material-symbols-outlined mt-0.5 text-red-600">error</span>
          <div className="flex-1 text-sm">
            <p className="font-bold">Error Processing Payroll</p>
            <p className="mt-1 text-xs text-red-800">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-red-500 hover:text-red-700"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Generator Form */}
      <form onSubmit={handleGenerate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Employee ID */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface">
            Employee ID <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              badge
            </span>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="1"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-3 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Pay Period */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface">
            Pay Period (YYYY-MM) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              calendar_month
            </span>
            <input
              type="text"
              required
              pattern="^\d{4}-(0[1-9]|1[0-2])$"
              value={payPeriod}
              onChange={(e) => setPayPeriod(e.target.value)}
              placeholder="2026-08"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-3 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Total Standard Days in Month */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface">
            Standard Working Days in Month <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              event_available
            </span>
            <input
              type="number"
              min="1"
              max="31"
              required
              value={totalMonthDays}
              onChange={(e) => setTotalMonthDays(e.target.value)}
              placeholder="22"
              className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-3 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Actual Payable Days Worked */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-on-surface">
              Payable Days (Days Worked) <span className="text-red-500">*</span>
            </label>
            <span className="text-[10px] text-primary font-bold">{liveRatio}%</span>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              punch_clock
            </span>
            <input
              type="number"
              step="0.5"
              min="0"
              max={stdDays}
              required
              value={payableDaysInput}
              onChange={(e) => setPayableDaysInput(e.target.value)}
              placeholder="e.g. 10 or 22"
              className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-3 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="sm:col-span-2 lg:col-span-4 mt-2">
          <button
            type="submit"
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold shadow-sm transition-all ${
              loading
                ? 'cursor-not-allowed bg-primary/70 text-white'
                : 'bg-primary text-on-primary hover:bg-primary/90 active:scale-[0.99]'
            }`}
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Calculating Pro-rated Payroll ({workedDays}/{stdDays} Days)...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">play_circle</span>
                <span>Calculate & Generate Payroll for {workedDays} Days</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results Display: Official Payslip Card */}
      {payslipData && (
        <div className="mt-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-sm animate-fadeIn">
          {/* Card Header */}
          <div className="flex flex-col justify-between gap-4 border-b border-outline-variant/20 pb-5 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary-container px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
                  Official Payslip
                </span>
                <span className="font-mono text-xs text-on-surface-variant font-semibold">Ledger #{payslipId}</span>
              </div>
              <h4 className="font-headline-md mt-1.5 text-lg font-bold text-primary">
                Disbursement for Period: {payPeriod}
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="rounded-lg bg-surface-container-lowest px-3 py-2 border border-outline-variant/15">
                <span className="text-on-surface-variant block">Employee ID</span>
                <span className="font-bold text-on-surface font-mono">{displayEmpId}</span>
              </div>
              <div className="rounded-lg bg-surface-container-lowest px-3 py-2 border border-outline-variant/15">
                <span className="text-on-surface-variant block">Payable / Total Days</span>
                <span className="font-bold text-primary font-mono">
                  {payableDays} / {totalDays} Days ({((payableDays / totalDays) * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="rounded-lg bg-surface-container-lowest px-3 py-2 border border-outline-variant/15">
                <span className="text-on-surface-variant block">Status</span>
                <span className="font-bold text-emerald-700 font-mono">Finalized</span>
              </div>
            </div>
          </div>

          {/* Net Salary Highlight Box */}
          <div className="my-6 flex flex-col items-center justify-between rounded-xl bg-primary p-5 text-on-primary shadow-payroll sm:flex-row">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-fixed-dim">
                Final Net Disbursed Amount ({payableDays} of {totalDays} Days)
              </p>
              <p className="text-xs text-primary-fixed">Calculated Net Pay strictly pro-rated to actual days worked</p>
            </div>
            <div className="mt-3 text-right sm:mt-0">
              <h3 className="font-display-lg text-3xl font-extrabold tracking-tight">
                {formatCurrency(netSalary)}
              </h3>
            </div>
          </div>

          {/* Breakdown Grid: Earnings vs Deductions */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Earnings Column */}
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5">
              <div className="mb-3 flex items-center justify-between border-b border-outline-variant/15 pb-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Earnings & Allowances ({((payableDays / totalDays) * 100).toFixed(1)}% of Gross)
                </h5>
                <span className="text-xs font-semibold text-emerald-700">Amount (INR)</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface">Basic Salary</span>
                  <span className="font-mono font-semibold text-on-surface">{formatCurrency(basic)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface">House Rent Allowance (HRA)</span>
                  <span className="font-mono font-semibold text-on-surface">{formatCurrency(hra)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface">Fixed Balancing Allowance</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatCurrency(fixedAllowance)}</span>
                </div>
                <div className="border-t border-outline-variant/15 pt-2 flex justify-between font-bold text-sm text-primary">
                  <span>Gross Earnings</span>
                  <span className="font-mono">{formatCurrency(grossEarnings)}</span>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5">
              <div className="mb-3 flex items-center justify-between border-b border-outline-variant/15 pb-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                  Statutory Deductions
                </h5>
                <span className="text-xs font-semibold text-amber-700">Amount (INR)</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface">Provident Fund (PF)</span>
                  <span className="font-mono font-semibold text-amber-800">− {formatCurrency(pfDeduction)}</span>
                </div>
                <div className="border-t border-outline-variant/15 pt-2 flex justify-between font-bold text-sm text-amber-900">
                  <span>Total Deductions</span>
                  <span className="font-mono">− {formatCurrency(totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
