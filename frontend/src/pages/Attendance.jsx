import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';

// EXACT ATTENDANCE STATUS ENUMS
export const ATTENDANCE_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  HALF_DAY: 'HALF_DAY',
  ON_LEAVE: 'ON_LEAVE',
};

const STATUS_CONFIG = {
  PRESENT: {
    label: 'Present',
    chipClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: 'check_circle',
  },
  ABSENT: {
    label: 'Absent',
    chipClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: 'cancel',
  },
  HALF_DAY: {
    label: 'Half Day',
    chipClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: 'hourglass_bottom',
  },
  ON_LEAVE: {
    label: 'On Leave',
    chipClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: 'event_busy',
  },
};

// Helper: Format UTC ISO string to localized time (HH:MM AM/PM)
function formatTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Helper: Calculate work duration between check_in and check_out
function calculateWorkHours(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return { workHours: '—', extraHours: '—', totalMinutes: 0 };
  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return { workHours: '—', extraHours: '—', totalMinutes: 0 };

  const diffMinutes = Math.floor((end - start) / (1000 * 60));
  const hrs = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  const workHours = `${hrs}h ${String(mins).padStart(2, '0')}m`;

  // Standard work day = 8 hours (480 minutes)
  const extraMinutes = diffMinutes - 480;
  let extraHours = '0h 00m';
  if (extraMinutes > 0) {
    const eHrs = Math.floor(extraMinutes / 60);
    const eMins = extraMinutes % 60;
    extraHours = `+${eHrs}h ${String(eMins).padStart(2, '0')}m`;
  } else if (extraMinutes < 0) {
    const absMins = Math.abs(extraMinutes);
    const eHrs = Math.floor(absMins / 60);
    const eMins = absMins % 60;
    extraHours = `-${eHrs}h ${String(eMins).padStart(2, '0')}m`;
  }

  return { workHours, extraHours, totalMinutes: diffMinutes };
}

// Generate default realistic monthly records for mock view
function getInitialMockData(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const records = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    const dayName = daysOfWeek[dayOfWeek];
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (isWeekend) {
      continue; // Weekends skipped in active records
    }

    // Specific preset scenarios for realistic mock
    if (day === 4) {
      // Approved Paid Leave
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.ON_LEAVE,
        leave_type: 'PAID',
        check_in_time: null,
        check_out_time: null,
        notes: 'Paid Casual Leave (Approved)',
      });
    } else if (day === 12) {
      // Approved Unpaid Leave
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.ON_LEAVE,
        leave_type: 'UNPAID',
        check_in_time: null,
        check_out_time: null,
        notes: 'Unpaid Leave (Approved)',
      });
    } else if (day === 17) {
      // Missing check-out record (check_out_time: null)
      const checkInUtc = new Date(Date.UTC(year, month, day, 3, 35, 0)).toISOString();
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.PRESENT,
        check_in_time: checkInUtc,
        check_out_time: null, // MISSING CHECKOUT
        notes: 'Forgot departure punch',
      });
    } else if (day === 19) {
      // Half Day
      const checkInUtc = new Date(Date.UTC(year, month, day, 3, 30, 0)).toISOString();
      const checkOutUtc = new Date(Date.UTC(year, month, day, 7, 45, 0)).toISOString();
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.HALF_DAY,
        check_in_time: checkInUtc,
        check_out_time: checkOutUtc,
        notes: 'Doctor appointment (Approved half day)',
      });
    } else if (day === 22) {
      // Absent
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.ABSENT,
        check_in_time: null,
        check_out_time: null,
        notes: 'Unplanned absence',
      });
    } else {
      // Normal Present day
      const inMinute = (day * 3) % 15;
      const outMinute = (day * 7) % 35;
      const checkInUtc = new Date(Date.UTC(year, month, day, 3, 30 + inMinute, 0)).toISOString();
      const checkOutUtc = new Date(Date.UTC(year, month, day, 12, 30 + outMinute, 0)).toISOString();
      records.push({
        id: `att-${dateStr}`,
        date: dateStr,
        day: dayName,
        status: ATTENDANCE_STATUS.PRESENT,
        check_in_time: checkInUtc,
        check_out_time: checkOutUtc,
        notes: 'Standard shift',
      });
    }
  }

  return records;
}

export default function Attendance() {
  const { user, isAdmin } = useAuth();

  // Date and Navigation state
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed

  // Filter and search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Employees for Admin/HR switcher
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(user?.id || 'current');

  // Attendance Records State
  const [attendanceRecords, setAttendanceRecords] = useState(() =>
    getInitialMockData(today.getFullYear(), today.getMonth())
  );

  // Today's Live Attendance Punch State
  const [todayPunch, setTodayPunch] = useState({
    checkedIn: true,
    checkInTime: new Date(Date.now() - 4 * 3600 * 1000 - 25 * 60 * 1000).toISOString(),
    checkOutTime: null,
  });

  // Live Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch employees list if admin/HR
  useEffect(() => {
    if (isAdmin) {
      api('/api/employees?limit=100')
        .then((res) => setEmployees(res.data || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  // When year or month changes, update records
  const handleMonthChange = (direction) => {
    if (direction === 'prev') {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear((y) => y - 1);
        setAttendanceRecords(getInitialMockData(currentYear - 1, 11));
      } else {
        setCurrentMonth((m) => m - 1);
        setAttendanceRecords(getInitialMockData(currentYear, currentMonth - 1));
      }
    } else if (direction === 'next') {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear((y) => y + 1);
        setAttendanceRecords(getInitialMockData(currentYear + 1, 0));
      } else {
        setCurrentMonth((m) => m + 1);
        setAttendanceRecords(getInitialMockData(currentYear, currentMonth + 1));
      }
    } else if (direction === 'today') {
      const now = new Date();
      setCurrentYear(now.getFullYear());
      setCurrentMonth(now.getMonth());
      setAttendanceRecords(getInitialMockData(now.getFullYear(), now.getMonth()));
    }
  };

  // Check In / Check Out Actions
  const handlePunchToggle = () => {
    const nowIso = new Date().toISOString();
    if (todayPunch.checkedIn) {
      // Check out
      setTodayPunch((prev) => ({
        ...prev,
        checkedIn: false,
        checkOutTime: nowIso,
      }));
    } else {
      // Check in
      setTodayPunch({
        checkedIn: true,
        checkInTime: nowIso,
        checkOutTime: null,
      });
    }
  };

  // Elapsed Work Timer Calculation
  const elapsedString = useMemo(() => {
    if (!todayPunch.checkInTime) return '00h 00m 00s';
    const start = new Date(todayPunch.checkInTime).getTime();
    const end = todayPunch.checkOutTime ? new Date(todayPunch.checkOutTime).getTime() : currentTime.getTime();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }, [todayPunch, currentTime]);

  // Compute Metrics matching Payroll summary consumption requirements
  const summaryMetrics = useMemo(() => {
    let daysPresent = 0;
    let approvedPaidLeaves = 0;
    let approvedUnpaidLeaves = 0;
    let missingCheckOuts = 0;

    attendanceRecords.forEach((record) => {
      if (record.status === ATTENDANCE_STATUS.PRESENT || record.status === ATTENDANCE_STATUS.HALF_DAY) {
        daysPresent += record.status === ATTENDANCE_STATUS.HALF_DAY ? 0.5 : 1;
      }
      if (record.status === ATTENDANCE_STATUS.ON_LEAVE) {
        if (record.leave_type === 'PAID') approvedPaidLeaves += 1;
        else approvedUnpaidLeaves += 1;
      }
      // Missing checkout definition: check_out_time is null for a present/worked record
      if (
        (record.status === ATTENDANCE_STATUS.PRESENT || record.status === ATTENDANCE_STATUS.HALF_DAY) &&
        record.check_out_time === null
      ) {
        missingCheckOuts += 1;
      }
    });

    return {
      daysPresent,
      approvedPaidLeaves,
      approvedUnpaidLeaves,
      missingCheckOuts,
    };
  }, [attendanceRecords]);

  // Filtered rows
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((record) => {
      // Status filter
      if (statusFilter === 'MISSING') {
        if (record.check_out_time !== null || record.status === ATTENDANCE_STATUS.ON_LEAVE || record.status === ATTENDANCE_STATUS.ABSENT) {
          return false;
        }
      } else if (statusFilter !== 'ALL' && record.status !== statusFilter) {
        return false;
      }

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDate = record.date.toLowerCase().includes(q);
        const matchesDay = record.day.toLowerCase().includes(q);
        const matchesNote = (record.notes || '').toLowerCase().includes(q);
        const matchesStatus = record.status.toLowerCase().includes(q);
        if (!matchesDate && !matchesDay && !matchesNote && !matchesStatus) return false;
      }

      return true;
    });
  }, [attendanceRecords, statusFilter, searchQuery]);

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline-lg text-primary">Attendance &amp; Work Hours</h2>
            <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-xs font-semibold text-primary">
              Live Tracker
            </span>
          </div>
          <p className="font-body-lg mt-1 text-on-surface-variant">
            Track daily check-ins, work duration, and monthly attendance records.
          </p>
        </div>

        {/* Admin/HR Employee Switcher */}
        {isAdmin && employees.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-label-md text-xs text-on-surface-variant">Viewing Employee:</span>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="font-body-md h-10 rounded-lg border border-outline-variant/30 bg-surface px-3 py-1.5 text-xs font-semibold text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="current">{user?.email || 'My Attendance'}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.department})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Missing Check-out Global Banner */}
      {summaryMetrics.missingCheckOuts > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {summaryMetrics.missingCheckOuts} Missing Check-Out Record Detected
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                An attendance check-in has no recorded departure time (<code className="font-mono text-amber-950">check_out_time: null</code>). Please review highlighted entries below.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('MISSING')}
            className="font-label-md shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            View Missing Entries
          </button>
        </div>
      )}

      {/* Bento Grid Layout: Punch Station & Summary Cards */}
      <div className="grid grid-cols-12 gap-gutter">
        {/* Attendance Check In / Out Control Card */}
        <div className="relative col-span-12 flex flex-col justify-between overflow-hidden rounded-xl bg-primary p-card-padding text-on-primary shadow-payroll lg:col-span-5">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5 blur-2xl"></div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="font-label-md flex items-center gap-2 uppercase tracking-wider text-primary-fixed-dim">
                <span className="material-symbols-outlined text-[18px]">fingerprint</span>
                <span>Punch Control</span>
              </div>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  todayPunch.checkedIn
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'bg-white/10 text-white/80 border border-white/20'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    todayPunch.checkedIn ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'
                  }`}
                ></span>
                {todayPunch.checkedIn ? 'Checked In' : 'Shift Completed'}
              </span>
            </div>

            {/* Live Clock & Date */}
            <div className="my-2">
              <div className="font-mono text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </div>
              <p className="mt-1 text-xs text-primary-fixed">
                {currentTime.toLocaleDateString([], {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Timings Snapshot */}
            <div className="my-5 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
              <div className="text-center">
                <span className="block text-[10px] uppercase tracking-wider text-primary-fixed">Check In</span>
                <span className="text-sm font-bold text-white">
                  {formatTime(todayPunch.checkInTime) || '—'}
                </span>
              </div>
              <div className="border-x border-white/10 text-center">
                <span className="block text-[10px] uppercase tracking-wider text-primary-fixed">Check Out</span>
                <span className="text-sm font-bold text-white">
                  {formatTime(todayPunch.checkOutTime) || '--:--'}
                </span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] uppercase tracking-wider text-primary-fixed">Elapsed</span>
                <span className="font-mono text-sm font-bold text-emerald-300">{elapsedString}</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handlePunchToggle}
              className={`font-label-md flex w-full items-center justify-center gap-2 rounded-lg py-3 text-label-md font-bold shadow-sm transition-all ${
                todayPunch.checkedIn
                  ? 'bg-white text-primary hover:bg-slate-100'
                  : 'bg-primary-container text-white hover:bg-primary-container/80 border border-white/20'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {todayPunch.checkedIn ? 'logout' : 'login'}
              </span>
              {todayPunch.checkedIn ? 'Check Out for the Day' : 'Check In Again'}
            </button>
          </div>
        </div>

        {/* Summary Metric Cards (4 cards) */}
        <div className="col-span-12 grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:col-span-7">
          {/* Days Present */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <span className="material-symbols-outlined text-[20px]">event_available</span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Days Present</p>
            <p className="font-display-lg mt-1 text-[32px] leading-tight text-primary">
              {summaryMetrics.daysPresent}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">Active work days recorded</p>
          </div>

          {/* Approved Paid Leaves */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <span className="material-symbols-outlined text-[20px]">event_busy</span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Approved Paid Leaves</p>
            <p className="font-display-lg mt-1 text-[32px] leading-tight text-primary">
              {summaryMetrics.approvedPaidLeaves}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">Paid time off taken this month</p>
          </div>

          {/* Approved Unpaid Leaves */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <span className="material-symbols-outlined text-[20px]">event_repeat</span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Approved Unpaid Leaves</p>
            <p className="font-display-lg mt-1 text-[32px] leading-tight text-primary">
              {summaryMetrics.approvedUnpaidLeaves}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">Loss of pay / unpaid time off</p>
          </div>

          {/* Missing Check-outs */}
          <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card flex flex-col justify-between">
            <div
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${
                summaryMetrics.missingCheckOuts > 0
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-secondary-container text-primary-container'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {summaryMetrics.missingCheckOuts > 0 ? 'warning' : 'check'}
              </span>
            </div>
            <p className="font-label-md uppercase tracking-wider text-on-surface-variant">Missing Check-outs</p>
            <p
              className={`font-display-lg mt-1 text-[32px] leading-tight ${
                summaryMetrics.missingCheckOuts > 0 ? 'text-error' : 'text-primary'
              }`}
            >
              {summaryMetrics.missingCheckOuts}
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">
              {summaryMetrics.missingCheckOuts > 0
                ? 'Flagged for attention'
                : 'All check-outs recorded'}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Attendance Records Table Card */}
      <div className="flex flex-col rounded-xl border border-outline-variant/10 bg-surface-container-lowest shadow-card">
        {/* Table Toolbar: Month Selector & Filters */}
        <div className="flex flex-col gap-4 border-b border-outline-variant/20 p-5 md:flex-row md:items-center md:justify-between">
          {/* Month Navigator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-outline-variant/40 bg-surface-container-low p-1 shadow-xs">
              <button
                onClick={() => handleMonthChange('prev')}
                className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                title="Previous Month"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <span className="min-w-[130px] px-3 text-center text-xs font-bold text-primary">
                {monthLabel}
              </span>
              <button
                onClick={() => handleMonthChange('next')}
                className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                title="Next Month"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>

            <button
              onClick={() => handleMonthChange('today')}
              className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-on-surface-variant hover:border-primary transition-colors"
            >
              Current Month
            </button>
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
              placeholder="Search date or notes…"
              className="font-body-md h-9 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low pl-9 pr-3 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Filter Chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-outline-variant/10 px-5 py-3">
          {[
            { key: 'ALL', label: 'All Records' },
            { key: ATTENDANCE_STATUS.PRESENT, label: 'Present' },
            { key: ATTENDANCE_STATUS.HALF_DAY, label: 'Half Day' },
            { key: ATTENDANCE_STATUS.ON_LEAVE, label: 'On Leave' },
            { key: ATTENDANCE_STATUS.ABSENT, label: 'Absent' },
            { key: 'MISSING', label: `Missing Check-Out (${summaryMetrics.missingCheckOuts})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                statusFilter === tab.key
                  ? tab.key === 'MISSING'
                    ? 'bg-amber-600 text-white'
                    : 'bg-primary text-on-primary'
                  : tab.key === 'MISSING'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low/50 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <th className="py-3 px-5">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Check In</th>
                <th className="py-3 px-4">Check Out</th>
                <th className="py-3 px-4">Work Hours</th>
                <th className="py-3 px-4">Extra Hours</th>
                <th className="py-3 px-5 text-right">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15 text-on-surface">
              {filteredRecords.map((record) => {
                const { workHours, extraHours } = calculateWorkHours(
                  record.check_in_time,
                  record.check_out_time
                );
                const hasMissingCheckout =
                  (record.status === ATTENDANCE_STATUS.PRESENT ||
                    record.status === ATTENDANCE_STATUS.HALF_DAY) &&
                  record.check_out_time === null;

                const config = STATUS_CONFIG[record.status] || STATUS_CONFIG.PRESENT;

                return (
                  <tr
                    key={record.id}
                    className={`transition-colors hover:bg-surface-container-low/50 ${
                      hasMissingCheckout ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-3.5 px-5 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-on-surface">{record.date}</span>
                        <span className="text-on-surface-variant">({record.day})</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${config.chipClass}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">{config.icon}</span>
                        {config.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium">
                      {formatTime(record.check_in_time) || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium">
                      {hasMissingCheckout ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                          <span className="material-symbols-outlined text-[14px] text-amber-700">
                            warning
                          </span>
                          Missing Check-out
                        </span>
                      ) : (
                        formatTime(record.check_out_time) || '—'
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-on-surface">
                      {workHours}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {extraHours.startsWith('+') && extraHours !== '+0h 00m' ? (
                        <span className="font-bold text-emerald-700">{extraHours}</span>
                      ) : extraHours.startsWith('-') ? (
                        <span className="font-bold text-error">{extraHours}</span>
                      ) : (
                        <span className="text-on-surface-variant">{extraHours}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right text-on-surface-variant">
                      {record.notes || '—'}
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-3xl text-outline-variant mb-1">
                      event_busy
                    </span>
                    <p className="font-semibold text-sm">No attendance records found</p>
                    <p className="text-xs text-on-surface-variant/60">
                      Try adjusting the filter tab or search query.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/20 p-4 text-xs text-on-surface-variant">
          <span>Showing {filteredRecords.length} records</span>
          <span className="text-[11px] text-on-surface-variant/70">
            Timestamps formatted in local time (UTC storage)
          </span>
        </div>
      </div>
    </div>
  );
}
