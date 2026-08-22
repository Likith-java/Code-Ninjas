import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';

// EXACT TIME OFF TYPES
export const TIME_OFF_TYPES = {
  PAID: 'PAID',
  SICK: 'SICK',
  UNPAID: 'UNPAID',
};

// EXACT TIME OFF STATUSES
export const TIME_OFF_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

const TYPE_CONFIG = {
  PAID: {
    label: 'Paid Time Off',
    shortLabel: 'Paid Leave',
    chipClass: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: 'paid',
    desc: 'Standard vacation / PTO (No payroll deduction)',
  },
  SICK: {
    label: 'Sick Leave',
    shortLabel: 'Sick Leave',
    chipClass: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: 'medical_services',
    desc: 'Medical / health recovery (No payroll deduction)',
  },
  UNPAID: {
    label: 'Unpaid Leave',
    shortLabel: 'Unpaid Leave',
    chipClass: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: 'money_off',
    desc: 'Leave without pay (Deducted in Payroll calculation)',
  },
};

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    chipClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: 'hourglass_top',
  },
  APPROVED: {
    label: 'Approved',
    chipClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: 'check_circle',
  },
  REJECTED: {
    label: 'Rejected',
    chipClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: 'cancel',
  },
};

// Helper: Calculate day count between two date strings (inclusive)
function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  // Simple day count calculation
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

// Initial mock dataset
function getInitialMockRequests(userEmail) {
  const currentYear = new Date().getFullYear();
  return [
    {
      id: 'req-001',
      employee_id: 'emp-001',
      employee_name: 'Jenifer Smith',
      employee_email: userEmail || 'jenifer.smith@dayflow.com',
      employee_department: 'Human Resources',
      type: TIME_OFF_TYPES.PAID,
      start_date: `${currentYear}-11-10`,
      end_date: `${currentYear}-11-12`,
      days: 3,
      reason: 'Family vacation and personal travel',
      status: TIME_OFF_STATUS.APPROVED,
      applied_at: `${currentYear}-10-15`,
      reviewed_by: 'Admin Office',
      reviewed_at: `${currentYear}-10-16`,
    },
    {
      id: 'req-002',
      employee_id: 'emp-001',
      employee_name: 'Jenifer Smith',
      employee_email: userEmail || 'jenifer.smith@dayflow.com',
      employee_department: 'Human Resources',
      type: TIME_OFF_TYPES.SICK,
      start_date: `${currentYear}-10-23`,
      end_date: `${currentYear}-10-23`,
      days: 1,
      reason: 'Doctor appointment and fever rest',
      status: TIME_OFF_STATUS.APPROVED,
      applied_at: `${currentYear}-10-22`,
      reviewed_by: 'Admin Office',
      reviewed_at: `${currentYear}-10-22`,
    },
    {
      id: 'req-003',
      employee_id: 'emp-001',
      employee_name: 'Jenifer Smith',
      employee_email: userEmail || 'jenifer.smith@dayflow.com',
      employee_department: 'Human Resources',
      type: TIME_OFF_TYPES.UNPAID,
      start_date: `${currentYear}-12-01`,
      end_date: `${currentYear}-12-02`,
      days: 2,
      reason: 'Extended personal leave beyond annual quota',
      status: TIME_OFF_STATUS.PENDING,
      applied_at: `${currentYear}-10-20`,
      reviewed_by: null,
      reviewed_at: null,
    },
    {
      id: 'req-004',
      employee_id: 'emp-002',
      employee_name: 'Marcus Thorne',
      employee_email: 'marcus.thorne@dayflow.com',
      employee_department: 'Engineering',
      type: TIME_OFF_TYPES.PAID,
      start_date: `${currentYear}-11-04`,
      end_date: `${currentYear}-11-08`,
      days: 5,
      reason: 'Attending annual tech conference',
      status: TIME_OFF_STATUS.PENDING,
      applied_at: `${currentYear}-10-18`,
      reviewed_by: null,
      reviewed_at: null,
    },
    {
      id: 'req-005',
      employee_id: 'emp-003',
      employee_name: 'Sarah Jenkins',
      employee_email: 'sarah.jenkins@dayflow.com',
      employee_department: 'Marketing',
      type: TIME_OFF_TYPES.UNPAID,
      start_date: `${currentYear}-10-28`,
      end_date: `${currentYear}-10-29`,
      days: 2,
      reason: 'Urgent family relocation assistance',
      status: TIME_OFF_STATUS.APPROVED,
      applied_at: `${currentYear}-10-14`,
      reviewed_by: 'HR Manager',
      reviewed_at: `${currentYear}-10-15`,
    },
    {
      id: 'req-006',
      employee_id: 'emp-004',
      employee_name: 'David Chen',
      employee_email: 'david.chen@dayflow.com',
      employee_department: 'Product Design',
      type: TIME_OFF_TYPES.SICK,
      start_date: `${currentYear}-09-18`,
      end_date: `${currentYear}-09-20`,
      days: 3,
      reason: 'Viral flu recovery',
      status: TIME_OFF_STATUS.REJECTED,
      applied_at: `${currentYear}-09-17`,
      reviewed_by: 'HR Manager',
      reviewed_at: `${currentYear}-09-18`,
      rejection_reason: 'Submitted retroactively without medical certificate',
    },
  ];
}

const EMPTY_REQUEST_FORM = {
  type: TIME_OFF_TYPES.PAID,
  start_date: '',
  end_date: '',
  reason: '',
};

export default function TimeOff() {
  const { user, isAdmin } = useAuth();

  // Active View Tab: 'MY_TIME_OFF' vs 'TEAM_APPROVALS' (if admin)
  const [activeTab, setActiveTab] = useState('MY_TIME_OFF');

  // Requests state
  const [requests, setRequests] = useState(() => getInitialMockRequests(user?.email));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_REQUEST_FORM);
  const [formError, setFormError] = useState('');
  const [toastMessage, setToastMessage] = useState(null);

  // Leave balances for current user
  const initialBalances = {
    paidTotal: 18,
    paidUsed: 3,
    sickTotal: 10,
    sickUsed: 1,
    unpaidUsed: 2,
  };

  const calculatedDays = useMemo(() => {
    return calculateDays(form.start_date, form.end_date);
  }, [form.start_date, form.end_date]);

  // Show Toast helper
  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Submit Leave Request
  const handleApplySubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.start_date || !form.end_date) {
      setFormError('Please select both start and end dates.');
      return;
    }

    if (new Date(form.end_date) < new Date(form.start_date)) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }

    if (!form.reason.trim()) {
      setFormError('Please provide a brief reason for your leave request.');
      return;
    }

    const daysCount = calculateDays(form.start_date, form.end_date);
    const newRequest = {
      id: `req-${Date.now()}`,
      employee_id: user?.id || 'emp-current',
      employee_name: user?.email?.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Current Employee',
      employee_email: user?.email || 'user@dayflow.com',
      employee_department: 'Human Resources',
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date,
      days: daysCount,
      reason: form.reason.trim(),
      status: TIME_OFF_STATUS.PENDING,
      applied_at: new Date().toISOString().split('T')[0],
      reviewed_by: null,
      reviewed_at: null,
    };

    setRequests((prev) => [newRequest, ...prev]);
    setModalOpen(false);
    setForm(EMPTY_REQUEST_FORM);
    showToast(`Leave request for ${daysCount} day(s) submitted successfully!`);
  };

  // Admin Approve Action
  const handleApprove = (requestId) => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === requestId
          ? {
              ...req,
              status: TIME_OFF_STATUS.APPROVED,
              reviewed_by: user?.email || 'Administrator',
              reviewed_at: new Date().toISOString().split('T')[0],
            }
          : req
      )
    );
    showToast('Leave request approved successfully.');
  };

  // Admin Reject Action
  const handleReject = (requestId) => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === requestId
          ? {
              ...req,
              status: TIME_OFF_STATUS.REJECTED,
              reviewed_by: user?.email || 'Administrator',
              reviewed_at: new Date().toISOString().split('T')[0],
            }
          : req
      )
    );
    showToast('Leave request rejected.', 'warning');
  };

  // Filter requests based on Active Tab, Status Filter, and Search Query
  const displayedRequests = useMemo(() => {
    return requests.filter((req) => {
      // Tab filter
      if (activeTab === 'MY_TIME_OFF') {
        const isMyReq =
          req.employee_email === user?.email || req.employee_name === 'Jenifer Smith';
        if (!isMyReq && user?.email) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && req.status !== statusFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (req.employee_name || '').toLowerCase().includes(q);
        const matchesReason = (req.reason || '').toLowerCase().includes(q);
        const matchesType = (req.type || '').toLowerCase().includes(q);
        const matchesDate = `${req.start_date} ${req.end_date}`.includes(q);
        if (!matchesName && !matchesReason && !matchesType && !matchesDate) return false;
      }

      return true;
    });
  }, [requests, activeTab, statusFilter, searchQuery, user]);

  // Counts for tabs & badges
  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === TIME_OFF_STATUS.PENDING).length,
    [requests]
  );
  const approvedUnpaidCount = useMemo(
    () =>
      requests.filter(
        (r) => r.type === TIME_OFF_TYPES.UNPAID && r.status === TIME_OFF_STATUS.APPROVED
      ).length,
    [requests]
  );

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-semibold text-white shadow-xl">
          <span className="material-symbols-outlined text-[18px]">
            {toastMessage.type === 'warning' ? 'warning' : 'check_circle'}
          </span>
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-primary">Time Off &amp; Leave Requests</h2>
            <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-xs font-semibold text-primary">
              Policy 2026
            </span>
          </div>
          <p className="font-body-lg mt-1 text-on-surface-variant">
            Apply for leaves, track annual quotas, and manage team time-off approvals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Apply Button */}
          <button
            onClick={() => {
              setForm(EMPTY_REQUEST_FORM);
              setFormError('');
              setModalOpen(true);
            }}
            className="font-label-md flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Apply for Leave
          </button>
        </div>
      </div>

      {/* View Switcher Tabs (For Admin / HR users) */}
      {isAdmin && (
        <div className="flex border-b border-outline-variant/30">
          <button
            onClick={() => setActiveTab('MY_TIME_OFF')}
            className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-bold transition-all ${
              activeTab === 'MY_TIME_OFF'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
            My Time Off
          </button>
          <button
            onClick={() => setActiveTab('TEAM_APPROVALS')}
            className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-bold transition-all ${
              activeTab === 'TEAM_APPROVALS'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">group</span>
            Team Leave Approvals
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Leave Balance Summary Cards (Employee View) */}
      {activeTab === 'MY_TIME_OFF' && (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
          {/* Paid Leave Balance */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <span className="material-symbols-outlined text-[20px]">paid</span>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                Annual PTO
              </span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Paid Leave Balance</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display-lg text-[32px] leading-tight text-primary">
                {initialBalances.paidTotal - initialBalances.paidUsed}
              </span>
              <span className="text-xs text-on-surface-variant">/ {initialBalances.paidTotal} Days</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${((initialBalances.paidTotal - initialBalances.paidUsed) / initialBalances.paidTotal) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Sick Leave Balance */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
                <span className="material-symbols-outlined text-[20px]">medical_services</span>
              </div>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                Medical
              </span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Sick Leave Balance</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display-lg text-[32px] leading-tight text-primary">
                {initialBalances.sickTotal - initialBalances.sickUsed}
              </span>
              <span className="text-xs text-on-surface-variant">/ {initialBalances.sickTotal} Days</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-purple-600"
                style={{
                  width: `${((initialBalances.sickTotal - initialBalances.sickUsed) / initialBalances.sickTotal) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Unpaid Leave Info */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                <span className="material-symbols-outlined text-[20px]">money_off</span>
              </div>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                Loss of Pay
              </span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Unpaid Leave Taken</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display-lg text-[32px] leading-tight text-orange-800">
                {initialBalances.unpaidUsed}
              </span>
              <span className="text-xs text-on-surface-variant">Days this year</span>
            </div>
            <p className="mt-2 text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>
              <span>Deducted in Payroll calculation</span>
            </p>
          </div>

          {/* Pending Requests */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <span className="material-symbols-outlined text-[20px]">pending_actions</span>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                In Review
              </span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Pending Requests</p>
            <p className="font-display-lg mt-1 text-[32px] leading-tight text-primary">
              {requests.filter((r) => r.status === TIME_OFF_STATUS.PENDING).length}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">Awaiting HR manager approval</p>
          </div>
        </div>
      )}

      {/* Admin Summary Overview Cards (When on Team Approvals Tab) */}
      {activeTab === 'TEAM_APPROVALS' && (
        <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <span className="material-symbols-outlined">hourglass_top</span>
              <span className="font-label-md text-xs uppercase tracking-wider">Awaiting Decision</span>
            </div>
            <p className="font-display-lg text-[32px] font-bold text-primary">{pendingCount}</p>
            <p className="text-xs text-on-surface-variant mt-1">Pending employee requests</p>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
            <div className="mb-2 flex items-center gap-2 text-emerald-700">
              <span className="material-symbols-outlined">check_circle</span>
              <span className="font-label-md text-xs uppercase tracking-wider">Approved Requests</span>
            </div>
            <p className="font-display-lg text-[32px] font-bold text-emerald-700">
              {requests.filter((r) => r.status === TIME_OFF_STATUS.APPROVED).length}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">Total approved leaves this year</p>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
            <div className="mb-2 flex items-center gap-2 text-orange-700">
              <span className="material-symbols-outlined">payments</span>
              <span className="font-label-md text-xs uppercase tracking-wider">Payroll Deductible</span>
            </div>
            <p className="font-display-lg text-[32px] font-bold text-orange-800">{approvedUnpaidCount}</p>
            <p className="text-xs text-on-surface-variant mt-1">Approved Unpaid leave records</p>
          </div>
        </div>
      )}

      {/* Requests List & Table Card */}
      <div className="flex flex-col rounded-xl border border-outline-variant/10 bg-surface-container-lowest shadow-card">
        {/* Table Toolbar */}
        <div className="flex flex-col gap-4 border-b border-outline-variant/20 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-headline-md text-base font-bold text-primary">
              {activeTab === 'MY_TIME_OFF' ? 'My Leave History' : 'Team Leave Requests'}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {activeTab === 'MY_TIME_OFF'
                ? 'Review your submitted requests, status updates, and payroll impacts.'
                : 'Review, approve, or reject employee leave applications.'}
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by reason, type..."
              className="font-body-md h-9 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low pl-9 pr-3 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-outline-variant/10 px-5 py-3">
          {[
            { key: 'ALL', label: `All Requests (${displayedRequests.length})` },
            { key: TIME_OFF_STATUS.PENDING, label: 'Pending' },
            { key: TIME_OFF_STATUS.APPROVED, label: 'Approved' },
            { key: TIME_OFF_STATUS.REJECTED, label: 'Rejected' },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => setStatusFilter(chip.key)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                statusFilter === chip.key
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low/50 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                {activeTab === 'TEAM_APPROVALS' && <th className="py-3 px-5">Employee</th>}
                <th className="py-3 px-5">Leave Type</th>
                <th className="py-3 px-4">Dates</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Payroll Impact</th>
                <th className="py-3 px-4">Status</th>
                {activeTab === 'TEAM_APPROVALS' && <th className="py-3 px-5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15 text-on-surface">
              {displayedRequests.map((req) => {
                const typeCfg = TYPE_CONFIG[req.type] || TYPE_CONFIG.PAID;
                const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;

                return (
                  <tr key={req.id} className="transition-colors hover:bg-surface-container-low/50">
                    {/* Employee info (Admin view) */}
                    {activeTab === 'TEAM_APPROVALS' && (
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={req.employee_name} size="sm" />
                          <div>
                            <p className="font-bold text-on-surface">{req.employee_name}</p>
                            <p className="text-[11px] text-on-surface-variant">{req.employee_department}</p>
                          </div>
                        </div>
                      </td>
                    )}

                    {/* Leave Type */}
                    <td className="py-3.5 px-5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${typeCfg.chipClass}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">{typeCfg.icon}</span>
                        {typeCfg.shortLabel}
                      </span>
                    </td>

                    {/* Date Range */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="font-mono text-xs text-on-surface">
                        {req.start_date} &rarr; {req.end_date}
                      </div>
                      <span className="text-[10px] text-on-surface-variant block mt-0.5">
                        Applied: {req.applied_at}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-4 font-bold text-primary">
                      {req.days} {req.days === 1 ? 'Day' : 'Days'}
                    </td>

                    {/* Reason */}
                    <td className="py-3.5 px-4 max-w-xs truncate text-on-surface-variant" title={req.reason}>
                      {req.reason}
                    </td>

                    {/* Payroll Compatibility Indicator */}
                    <td className="py-3.5 px-4">
                      {req.type === TIME_OFF_TYPES.UNPAID ? (
                        req.status === TIME_OFF_STATUS.APPROVED ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                            <span className="material-symbols-outlined text-[13px]">payments</span>
                            Deductible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-orange-50/50 px-2 py-0.5 text-[11px] text-orange-700">
                            Unpaid (Pending)
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-100">
                          <span className="material-symbols-outlined text-[13px]">paid</span>
                          Paid (No Deduct)
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusCfg.chipClass}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">{statusCfg.icon}</span>
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Action buttons (Admin view) */}
                    {activeTab === 'TEAM_APPROVALS' && (
                      <td className="py-3.5 px-5 text-right">
                        {req.status === TIME_OFF_STATUS.PENDING ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleApprove(req.id)}
                              title="Approve Request"
                              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700"
                            >
                              <span className="material-symbols-outlined text-[14px]">check</span>
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              title="Reject Request"
                              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/60 font-medium">
                            Reviewed ({req.reviewed_at || 'Done'})
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {displayedRequests.length === 0 && (
                <tr>
                  <td
                    colSpan={activeTab === 'TEAM_APPROVALS' ? 8 : 7}
                    className="py-10 text-center text-on-surface-variant"
                  >
                    <span className="material-symbols-outlined text-3xl text-outline-variant mb-1">
                      event_available
                    </span>
                    <p className="font-semibold text-sm">No time-off requests found</p>
                    <p className="text-xs text-on-surface-variant/60">
                      Try selecting a different status filter or clear search.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/20 p-4 text-xs text-on-surface-variant">
          <span>Showing {displayedRequests.length} records</span>
          <span className="text-[11px] text-on-surface-variant/70">
            Payroll Note: Only approved Unpaid leaves affect salary deductions
          </span>
        </div>
      </div>

      {/* Apply for Leave Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <form
            onSubmit={handleApplySubmit}
            className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-surface-container-lowest p-6 shadow-2xl border border-outline-variant/20"
          >
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold">
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                </div>
                <h3 className="font-headline-md text-base font-bold text-primary">Apply for Time Off</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-on-surface-variant hover:text-primary"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Leave Type Selector */}
            <div>
              <label className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
                Leave Type <span className="text-error">*</span>
              </label>
              <select
                required
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="input"
              >
                <option value={TIME_OFF_TYPES.PAID}>Paid Time Off (PTO / Vacation)</option>
                <option value={TIME_OFF_TYPES.SICK}>Sick Leave (Medical Recovery)</option>
                <option value={TIME_OFF_TYPES.UNPAID}>Unpaid Leave (Loss of Pay)</option>
              </select>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {TYPE_CONFIG[form.type]?.desc}
              </p>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
                  Start Date <span className="text-error">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
                  End Date <span className="text-error">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            {/* Calculated Days Preview */}
            {calculatedDays > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3 text-xs">
                <span className="font-medium text-on-surface-variant">Total Duration:</span>
                <span className="font-bold text-primary">
                  {calculatedDays} {calculatedDays === 1 ? 'Day' : 'Days'}
                </span>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
                Reason / Explanation <span className="text-error">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Explain the purpose of your time off request..."
                className="input"
              ></textarea>
            </div>

            {/* Form Error */}
            {formError && <p className="font-body-md text-xs text-error font-medium">{formError}</p>}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-outline-variant/20 pt-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="font-label-md rounded-lg border border-outline-variant px-4 py-2.5 text-xs text-on-surface-variant hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="font-label-md flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-xs font-bold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
