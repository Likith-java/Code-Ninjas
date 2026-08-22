import React, { useMemo, useState } from 'react';

/**
 * Admin Salary Calculator UI Component
 * 
 * Features:
 * - Clean parameter inputs with browser up/down marks removed
 * - Real-time Local Math Engine for salary component breakdown
 * - Gatekeeper validation ensuring Fixed Allowance >= 0
 * - Resilient API Integration (Express :4000 / FastAPI :8000)
 * - Real-time feedback states: Loading indicators, Success banner (Code 200), Error banner
 */
export default function SalaryCalculator() {
  const [employeeId, setEmployeeId] = useState('1');
  const [monthlyWage, setMonthlyWage] = useState('50000');
  const [basicRate, setBasicRate] = useState('0.40');
  const [hraRate, setHraRate] = useState('0.20');
  const [pfRate, setPfRate] = useState('0.12');
  const [workingDays, setWorkingDays] = useState('5');

  const [loading, setLoading] = useState(false);
  const [successResponse, setSuccessResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ---------------------------------------------------------------------------
  // Real-time Local Math Engine
  // ---------------------------------------------------------------------------
  const calculations = useMemo(() => {
    const wage = parseFloat(monthlyWage) || 0;
    const bRate = parseFloat(basicRate) || 0;
    const hRate = parseFloat(hraRate) || 0;
    const pRate = parseFloat(pfRate) || 0;

    const basicSalary = wage * bRate;
    const hra = basicSalary * hRate;
    const fixedAllowance = wage - (basicSalary + hra);
    const pfDeduction = basicSalary * pRate;
    const netSalary = wage - pfDeduction;

    const isInvalid = fixedAllowance < 0 || wage <= 0;

    return {
      wage,
      basicSalary,
      hra,
      fixedAllowance,
      pfDeduction,
      netSalary,
      isInvalid,
      isNegativeAllowance: fixedAllowance < 0,
    };
  }, [monthlyWage, basicRate, hraRate, pfRate]);

  // ---------------------------------------------------------------------------
  // API Integration (PUT /api/salary/{employee_id})
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (calculations.isInvalid) return;

    setLoading(true);
    setSuccessResponse(null);
    setErrorMessage('');

    const targetEmployeeId = employeeId.trim() || '1';
    const payload = {
      monthly_wage: parseFloat(monthlyWage),
      basic_rate: parseFloat(basicRate),
      hra_rate: parseFloat(hraRate),
      pf_rate: parseFloat(pfRate),
      working_days_per_week: parseInt(workingDays, 10) || 5,
    };

    try {
      let response;
      try {
        response = await fetch(`/api/salary/${encodeURIComponent(targetEmployeeId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch {
        response = await fetch(`http://127.0.0.1:8000/api/salary/${encodeURIComponent(targetEmployeeId)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        let formattedError = 'Failed to update salary structure.';
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

      setSuccessResponse(data);
    } catch (err) {
      setErrorMessage(err.message || 'Network error: Failed to update salary structure.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <div className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-2 border-b border-outline-variant/15 pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-[24px]">calculate</span>
            <h3 className="font-headline-md text-xl font-bold text-primary">Admin Salary Calculator</h3>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant">
            Configure employee compensation parameters with real-time balancing allocation.
          </p>
        </div>
        <span className="self-start rounded-full bg-secondary-container px-3 py-1 text-xs font-semibold text-primary">
          FastAPI Engine (:8000)
        </span>
      </div>

      {/* Success Banner */}
      {successResponse && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 text-emerald-900 shadow-sm animate-fadeIn">
          <span className="material-symbols-outlined mt-0.5 text-emerald-600">check_circle</span>
          <div className="flex-1 text-sm">
            <p className="font-bold">Salary Structure Saved Successfully! (Code 200)</p>
            <p className="mt-1 text-xs text-emerald-800">
              Employee <span className="font-mono font-semibold">{successResponse.employee_id}</span> updated.
              Balancing Fixed Allowance allocated: <span className="font-semibold">{formatCurrency(successResponse.fixed_allowance)}</span>.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-700">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono">ID: {successResponse.id}</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono">
                Effective: {new Date(successResponse.effective_date).toLocaleDateString()}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSuccessResponse(null)}
            className="text-emerald-500 hover:text-emerald-700"
            title="Dismiss"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50/90 p-4 text-red-900 shadow-sm animate-fadeIn">
          <span className="material-symbols-outlined mt-0.5 text-red-600">error</span>
          <div className="flex-1 text-sm">
            <p className="font-bold">Error Updating Salary Structure</p>
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

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Form Inputs */}
        <div className="space-y-4 lg:col-span-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            1. Compensation Parameters
          </h4>

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
                placeholder="e.g. 1 or EMP-1001"
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-4 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Monthly Gross Wage */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface">
              Monthly Gross Wage (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-sm">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={monthlyWage}
                onChange={(e) => setMonthlyWage(e.target.value)}
                placeholder="50000"
                className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-10 pr-4 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Rates Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Basic Rate */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface">
                Basic Rate
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  required
                  value={basicRate}
                  onChange={(e) => setBasicRate(e.target.value)}
                  className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-3 pr-10 py-2 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">
                  {(parseFloat(basicRate || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* HRA Rate */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface">
                HRA Rate
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  required
                  value={hraRate}
                  onChange={(e) => setHraRate(e.target.value)}
                  className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-3 pr-10 py-2 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">
                  {(parseFloat(hraRate || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* PF Rate */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface">
                PF Rate
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  required
                  value={pfRate}
                  onChange={(e) => setPfRate(e.target.value)}
                  className="no-spinners [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-3 pr-10 py-2 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">
                  {(parseFloat(pfRate || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Working Days per Week */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface">
              Working Days per Week
            </label>
            <select
              value={workingDays}
              onChange={(e) => setWorkingDays(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="5">5 Days (Monday - Friday)</option>
              <option value="6">6 Days (Monday - Saturday)</option>
              <option value="7">7 Days (Full Week)</option>
            </select>
          </div>
        </div>

        {/* Right Column: Real-time Math Engine Breakdown */}
        <div className="flex flex-col justify-between rounded-xl border border-outline-variant/20 bg-surface-container-low p-5 lg:col-span-6">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                2. Live Calculated Breakdown
              </h4>
              <span className="rounded bg-primary-container/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                Auto-computed
              </span>
            </div>

            <div className="space-y-3 divide-y divide-outline-variant/10 text-sm">
              {/* Basic Salary */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="font-semibold text-on-surface">Basic Salary</span>
                  <p className="text-[11px] text-on-surface-variant">Monthly Wage × Basic Rate</p>
                </div>
                <span className="font-mono font-bold text-primary">
                  {formatCurrency(calculations.basicSalary)}
                </span>
              </div>

              {/* HRA */}
              <div className="flex items-center justify-between pt-2.5">
                <div>
                  <span className="font-semibold text-on-surface">HRA (House Rent Allowance)</span>
                  <p className="text-[11px] text-on-surface-variant">Basic Salary × HRA Rate</p>
                </div>
                <span className="font-mono font-bold text-primary">
                  {formatCurrency(calculations.hra)}
                </span>
              </div>

              {/* Fixed Allowance (Balancing Figure) */}
              <div className="flex items-center justify-between pt-2.5">
                <div>
                  <span className="font-semibold text-on-surface">Fixed Allowance</span>
                  <p className="text-[11px] text-on-surface-variant">Monthly Wage − (Basic + HRA)</p>
                </div>
                <span
                  className={`font-mono font-bold ${
                    calculations.isNegativeAllowance ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(calculations.fixedAllowance)}
                </span>
              </div>

              {/* PF Deduction */}
              <div className="flex items-center justify-between pt-2.5">
                <div>
                  <span className="font-semibold text-on-surface">PF Deduction</span>
                  <p className="text-[11px] text-on-surface-variant">Basic Salary × PF Rate</p>
                </div>
                <span className="font-mono font-semibold text-amber-700">
                  − {formatCurrency(calculations.pfDeduction)}
                </span>
              </div>

              {/* Estimated Net Salary */}
              <div className="flex items-center justify-between pt-3">
                <div>
                  <span className="font-bold text-on-surface">Estimated Monthly Take-Home</span>
                  <p className="text-[11px] text-on-surface-variant">Gross − Statutory Deductions</p>
                </div>
                <span className="font-mono text-base font-extrabold text-primary">
                  {formatCurrency(calculations.netSalary)}
                </span>
              </div>
            </div>
          </div>

          {/* Frontend Gatekeeper Warning */}
          <div className="mt-6">
            {calculations.isNegativeAllowance && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-700 animate-pulse">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>Error: Component total exceeds Monthly Wage.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={calculations.isInvalid || loading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold shadow-sm transition-all ${
                calculations.isInvalid || loading
                  ? 'cursor-not-allowed bg-outline-variant/40 text-on-surface-variant/70'
                  : 'bg-primary text-on-primary hover:bg-primary/90 active:scale-[0.99]'
              }`}
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Updating Salary Structure...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>Save Salary Structure</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
