import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Users,
  Wallet,
  TrendingUp,
  ShieldAlert,
  Calendar,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Receipt
} from 'lucide-react';

/**
 * Payroll Reports & Analytics Dashboard Component
 * 
 * Features:
 * - Pay Period Filter & Live Fetching
 * - Key Metrics Summary: Employees Paid, Net Disbursement, Gross Earnings, PF Deductions
 * - Detailed Payslip Audit Table with granular breakdown
 * - Loading Skeletons & Graceful 404 Empty State Handling
 * - Styled with modern Tailwind CSS and Lucide React icons
 */
export default function PayrollReports() {
  const [payPeriod, setPayPeriod] = useState('2026-08');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isNotFound, setIsNotFound] = useState(false);

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const fetchPayrollReport = async (periodToFetch) => {
    const targetPeriod = (periodToFetch || payPeriod).trim();
    if (!targetPeriod) return;

    setLoading(true);
    setErrorMessage('');
    setIsNotFound(false);

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/reports/payroll-summary/${targetPeriod}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await response.json();

      if (response.status === 404) {
        setIsNotFound(true);
        setReportData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(data.detail || `Server returned code ${response.status}: Failed to fetch report.`);
      }

      setReportData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to connect to backend reports service.');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch initial report on component mount
  useEffect(() => {
    fetchPayrollReport('2026-08');
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchPayrollReport(payPeriod);
  };

  return (
    <div className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)] md:p-8">
      {/* Header & Filter Controls */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-outline-variant/15 pb-6 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h3 className="font-headline-md text-xl font-bold text-primary">Payroll Reports & Analytics</h3>
          </div>
          <p className="font-body-md mt-1 text-sm text-on-surface-variant">
            Executive payroll disbursement overview, statutory tax totals, and detailed payslip audit trail.
          </p>
        </div>

        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant h-4 w-4" />
            <input
              type="text"
              required
              pattern="^\d{4}-(0[1-9]|1[0-2])$"
              value={payPeriod}
              onChange={(e) => setPayPeriod(e.target.value)}
              placeholder="YYYY-MM (2026-08)"
              className="w-40 rounded-xl border border-outline-variant/40 bg-surface-container-lowest pl-9 pr-3 py-2 text-sm font-medium text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-primary/60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Fetching...' : 'Fetch Report'}</span>
          </button>
        </form>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-surface-container-high/60"></div>
            ))}
          </div>
          <div className="h-64 rounded-xl bg-surface-container-high/40"></div>
        </div>
      )}

      {/* Error Banner */}
      {!loading && errorMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm animate-fadeIn">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-bold">Error Fetching Payroll Summary</p>
            <p className="mt-1 text-xs text-red-800">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* 404 Graceful Empty State Card */}
      {!loading && isNotFound && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low/40 px-6 py-12 text-center animate-fadeIn">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-primary mb-3">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-on-surface">No Payroll Records Found</h4>
          <p className="mt-1 max-w-md text-xs text-on-surface-variant">
            No finalized payslips were generated for pay period <span className="font-mono font-semibold text-primary">{payPeriod}</span>.
            Run the Payroll Generator above to calculate and record disbursements for this month.
          </p>
        </div>
      )}

      {/* Content Display: Metrics Cards & Audit Table */}
      {!loading && reportData && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Row: 4 Summary Metrics Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Total Employees Paid */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-sm transition-all hover:border-outline-variant/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Employees Paid</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <p className="font-display-lg text-2xl font-extrabold text-primary">
                {reportData.total_employees_paid}
              </p>
              <p className="mt-1 text-[11px] text-on-surface-variant flex items-center gap-1">
                <Clock className="h-3 w-3" /> Period {reportData.pay_period}
              </p>
            </div>

            {/* Card 2: Total Net Disbursement */}
            <div className="rounded-xl border border-outline-variant/15 bg-primary p-5 text-on-primary shadow-payroll transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-fixed-dim">Total Net Disbursement</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
                  <Wallet className="h-4 w-4" />
                </div>
              </div>
              <p className="font-display-lg text-2xl font-extrabold text-white">
                {formatCurrency(reportData.total_net_disbursement)}
              </p>
              <p className="mt-1 text-[11px] text-primary-fixed flex items-center gap-1">
                Direct credited wages
              </p>
            </div>

            {/* Card 3: Total Gross Earnings */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-sm transition-all hover:border-outline-variant/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Total Gross Earnings</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="font-display-lg text-2xl font-extrabold text-emerald-800">
                {formatCurrency(reportData.total_gross_earnings)}
              </p>
              <p className="mt-1 text-[11px] text-on-surface-variant flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-emerald-600" /> Pre-deduction total
              </p>
            </div>

            {/* Card 4: Total PF Deductions */}
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-sm transition-all hover:border-outline-variant/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Total PF Deductions</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
              <p className="font-display-lg text-2xl font-extrabold text-amber-800">
                {formatCurrency(reportData.total_pf_deductions)}
              </p>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                Statutory fund contributions
              </p>
            </div>
          </div>

          {/* Bottom Section: Detailed Audit Table */}
          <div className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low shadow-sm">
            <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-lowest px-6 py-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-primary">Payslips Audit List ({reportData.payslips_audit_list?.length || 0} Records)</h4>
              </div>
              <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-semibold text-primary">
                Period: {reportData.pay_period}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-outline-variant/15 bg-surface-container-lowest/60 text-on-surface-variant uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Payslip ID</th>
                    <th className="px-6 py-3.5">Employee ID</th>
                    <th className="px-6 py-3.5">Payable Days</th>
                    <th className="px-6 py-3.5">Gross Earnings</th>
                    <th className="px-6 py-3.5">PF Deduction</th>
                    <th className="px-6 py-3.5 text-right">Net Salary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 bg-surface-container-lowest font-medium text-on-surface">
                  {reportData.payslips_audit_list?.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-surface-container-high/40"
                    >
                      <td className="px-6 py-4 font-mono font-bold text-primary">
                        #{item.id}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary-container text-[10px] font-bold text-primary">
                            {item.employee_id.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="font-mono font-semibold">{item.employee_id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-md bg-surface-container-high px-2.5 py-1 font-mono font-semibold text-on-surface">
                          {item.payable_days} Days
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-on-surface">
                        {formatCurrency(item.gross_earnings)}
                      </td>
                      <td className="px-6 py-4 font-mono text-amber-800">
                        − {formatCurrency(item.pf_deduction)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono text-sm font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                          {formatCurrency(item.net_salary)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
