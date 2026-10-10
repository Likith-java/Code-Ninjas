'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, Button, Badge, MaterialIcon, Modal } from '@/components/ui'
import { WorkerRecord, AttendanceStatus, calculateWageForStatus } from '@/types/workforce'
import {
  initialWorkers,
  computeWorkforceSummary,
  getStoredWorkers,
  saveStoredWorkers,
  resetStoredWorkers,
} from '@/lib/workforceDemoData'
import { WorkerModal } from './WorkerModal'

export function WorkforceAttendance() {
  const [workers, setWorkers] = useState<WorkerRecord[]>(initialWorkers)
  const [isLoaded, setIsLoaded] = useState(false)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | AttendanceStatus>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'id' | 'name' | 'wage' | 'status'>('id')

  // Modals
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<WorkerRecord | null>(null)
  const [deletingWorker, setDeletingWorker] = useState<WorkerRecord | null>(null)
  const [showResetNotice, setShowResetNotice] = useState(false)

  // Load from local storage on mount
  useEffect(() => {
    const loaded = getStoredWorkers()
    if (loaded && loaded.length > 0) {
      setWorkers(loaded)
    }
    setIsLoaded(true)
  }, [])

  // Save to local storage whenever workers change (after initial mount)
  useEffect(() => {
    if (isLoaded) {
      saveStoredWorkers(workers)
    }
  }, [workers, isLoaded])

  // Summary calculations
  const summary = useMemo(() => computeWorkforceSummary(workers), [workers])

  // Filtered & Sorted workers
  const filteredWorkers = useMemo(() => {
    return workers
      .filter((w) => {
        const matchesSearch =
          w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
          w.department.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesAttendance =
          attendanceFilter === 'all' || w.status === attendanceFilter

        const matchesDepartment =
          departmentFilter === 'all' || w.department === departmentFilter

        return matchesSearch && matchesAttendance && matchesDepartment
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        if (sortBy === 'wage') return b.dailyWage - a.dailyWage
        if (sortBy === 'status') return a.status.localeCompare(b.status)
        return a.id.localeCompare(b.id)
      })
  }, [workers, searchQuery, attendanceFilter, departmentFilter, sortBy])

  // Handlers for Add, Edit, Delete, Quick Status Change
  const handleSaveWorker = (worker: WorkerRecord) => {
    setWorkers((prev) => {
      const index = prev.findIndex((w) => w.id === worker.id)
      if (index >= 0) {
        // Edit
        const updated = [...prev]
        updated[index] = worker
        return updated
      } else {
        // Add
        return [worker, ...prev]
      }
    })
    setEditingWorker(null)
  }

  const handleDeleteWorker = () => {
    if (!deletingWorker) return
    setWorkers((prev) => prev.filter((w) => w.id !== deletingWorker.id))
    setDeletingWorker(null)
  }

  const handleQuickStatusChange = (workerId: string, newStatus: AttendanceStatus) => {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.id === workerId) {
          return {
            ...w,
            status: newStatus,
            lastUpdated: 'Just now (Quick Toggle)',
          }
        }
        return w
      })
    )
  }

  const handleResetToDemo = () => {
    const defaultData = resetStoredWorkers()
    setWorkers(defaultData)
    setShowResetNotice(true)
    setTimeout(() => setShowResetNotice(false), 3500)
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 lg:p-6 space-y-6">
      {/* Top Banner / In-Memory Demo Disclaimer */}
      <div className="rounded-2xl border-2 border-[#181816] bg-[#FEF3C7] p-4 pop-shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white border-2 border-[#181816] pop-shadow-xs flex items-center justify-center shrink-0">
            <MaterialIcon name="storage" size="md" color="#FFFFFF" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black tracking-wider uppercase bg-amber-300 text-amber-950 border border-[#181816] px-2 py-0.5 rounded-full">
                DEMO DATA · BROWSER MEMORY (LOCALSTORAGE)
              </span>
              <span className="font-mono text-[11px] text-amber-900 font-bold hidden sm:inline">
                Backend API /api/v1/workforce Not Yet Connected
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-950 font-medium">
              Employee database and biometric RFID attendance integration are not provisioned in the backend. Worker records, attendance logs, and calculated wages are maintained locally in your browser session.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDemo}
            icon={<MaterialIcon name="restart_alt" size="xs" color="#78350F" />}
            className="text-[11px] font-mono border-amber-900 text-amber-900 hover:bg-amber-100"
          >
            Reset Demo Data
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingWorker(null)
              setIsAddEditModalOpen(true)
            }}
            icon={<MaterialIcon name="person_add" size="sm" />}
            className="text-[11px] font-mono"
          >
            + Add Worker
          </Button>
        </div>
      </div>

      {showResetNotice && (
        <div className="p-3 bg-emerald-100 border-2 border-emerald-700 text-emerald-950 rounded-xl font-mono text-xs font-bold flex items-center gap-2 animate-slide-up">
          <MaterialIcon name="check_circle" size="sm" color="#047857" />
          Reset completed: Restored standard Everest Textile Mills 10-person operator roster.
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-[11px] text-stone-600">
        <span className="font-bold text-[#181816]">Everest Textile Mills</span>
        <span className="text-stone-400">/</span>
        <span className="text-stone-600">Plant Operations</span>
        <span className="text-stone-400">/</span>
        <span className="text-[#0E4B3E] font-bold">Workforce & Attendance</span>
      </nav>

      {/* Title & Plant Shift Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#181816]/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-[#0E4B3E] uppercase">
              Plant Operations · Labor & Payroll Management
            </span>
            <Badge variant="success" size="xs" dotColor="#15803D">
              Attendance Log: Today
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#181816] tracking-tight">
            Workforce & Attendance Module
          </h1>
          <p className="text-xs text-stone-600 font-medium">
            Daily operator rosters, attendance status tracking, and automated wage computations.
          </p>
        </div>

        {/* Wage Logic Explanation Pill */}
        <div className="bg-white border-2 border-[#181816] p-2 rounded-2xl pop-shadow-xs font-mono text-[11px] text-stone-700 space-y-0.5">
          <div className="font-bold text-[#0E4B3E] flex items-center gap-1">
            <MaterialIcon name="calculate" size="xs" color="#0E4B3E" />
            Wage Calculation Rule:
          </div>
          <div className="flex items-center gap-2 text-[10.5px]">
            <span className="text-emerald-800">● Present = 100%</span>
            <span className="text-amber-700">● Half-day = 50%</span>
            <span className="text-red-700">● Absent = ₹0</span>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS (Total Workers, Present, Absent, Half-Day, Calculated Wages) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Workers */}
        <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full min-h-[128px] bg-white space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-bold">
                Total Workers
              </span>
              <span className="w-7 h-7 rounded-lg bg-stone-100 border border-[#181816] flex items-center justify-center text-[#181816] shrink-0">
                <MaterialIcon name="groups" size="xs" />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-2xl font-black font-mono text-[#181816]">
                {summary.totalWorkers}
              </span>
              <span className="text-[11px] font-bold text-stone-500 font-mono">Registered</span>
            </div>
          </div>
          <p className="text-[10px] font-mono text-stone-500 pt-1.5 border-t border-stone-200">
            Across 6 Plant Depts
          </p>
        </Card>

        {/* Card 2: Present Workers */}
        <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full min-h-[128px] bg-white space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-bold">
                Present Workers
              </span>
              <span className="w-7 h-7 rounded-lg bg-emerald-100 border border-[#181816] flex items-center justify-center text-emerald-800 shrink-0">
                <MaterialIcon name="how_to_reg" size="xs" color="#047857" />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-2xl font-black font-mono text-[#15803D]">
                {summary.presentWorkers}
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-800">
                ({summary.totalWorkers > 0 ? Math.round((summary.presentWorkers / summary.totalWorkers) * 100) : 0}%) Full Day
              </span>
            </div>
          </div>
          <p className="text-[10px] font-mono text-stone-500 pt-1.5 border-t border-stone-200">
            Full Shift · 100% Wage
          </p>
        </Card>

        {/* Card 3: Half-day Workers (Fixed ambiguous label to 'Worker(s) · 4h shift') */}
        <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full min-h-[128px] bg-white space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-bold">
                Half-day Workers
              </span>
              <span className="w-7 h-7 rounded-lg bg-amber-100 border border-[#181816] flex items-center justify-center text-amber-800 shrink-0">
                <MaterialIcon name="schedule" size="xs" color="#B45309" />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-2xl font-black font-mono text-amber-600">
                {summary.halfDayWorkers}
              </span>
              <span className="text-[11px] font-mono font-bold text-amber-800">
                {summary.halfDayWorkers === 1 ? 'Worker' : 'Workers'} · 4h shift
              </span>
            </div>
          </div>
          <p className="text-[10px] font-mono text-stone-500 pt-1.5 border-t border-stone-200">
            Partial Shift · 50% Wage
          </p>
        </Card>

        {/* Card 4: Absent Workers */}
        <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full min-h-[128px] bg-white space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-bold">
                Absent Workers
              </span>
              <span className="w-7 h-7 rounded-lg bg-red-100 border border-[#181816] flex items-center justify-center text-red-800 shrink-0">
                <MaterialIcon name="person_off" size="xs" color="#DC2626" />
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="text-2xl font-black font-mono text-[#E05326]">
                {summary.absentWorkers}
              </span>
              <span className="text-[11px] font-bold text-red-800 font-mono">Unattended</span>
            </div>
          </div>
          <p className="text-[10px] font-mono text-stone-500 pt-1.5 border-t border-stone-200">
            Zero Wage (₹0)
          </p>
        </Card>

        {/* Card 5: Calculated Wages */}
        <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full min-h-[128px] bg-[#FAF7F0] border-2 border-[#0E4B3E] space-y-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#0E4B3E] font-bold">
                Calculated Wages
              </span>
              <span className="w-7 h-7 rounded-lg bg-[#D7F4E5] border border-[#181816] flex items-center justify-center text-[#0E4B3E] shrink-0">
                <MaterialIcon name="payments" size="xs" color="#0E4B3E" />
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-2xl font-black font-mono text-[#0E4B3E]">
                ₹{summary.calculatedWages.toLocaleString()}
              </span>
              <span className="text-[10.5px] font-mono text-stone-500">Today</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-stone-500 pt-1.5 border-t border-stone-300">
            <span>Budget: ₹{summary.budgetedWages.toLocaleString()}</span>
            <span className="text-emerald-700 font-bold">
              Save: ₹{(summary.budgetedWages - summary.calculatedWages).toLocaleString()}
            </span>
          </div>
        </Card>
      </div>

      {/* CONTROLS (Search, Filters, Sort) */}
      <Card variant="elevated" padding="md" className="bg-white space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by worker name, ID, role, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-xs font-mono bg-[#FAF7F0] border-2 border-[#181816] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            />
            <span className="absolute left-2.5 top-2 text-stone-400">
              <MaterialIcon name="search" size="xs" />
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-700 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Attendance Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-stone-500 font-bold">Status:</span>
            <div className="inline-flex border-2 border-[#181816] rounded-xl overflow-hidden font-mono text-[11px] bg-white">
              {(['all', 'Present', 'Half-day', 'Absent'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setAttendanceFilter(status)}
                  className={`px-2.5 py-1 font-bold border-r last:border-r-0 border-[#181816]/20 transition-all ${
                    attendanceFilter === status
                      ? 'bg-[#0E4B3E] text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-stone-500 font-bold">Dept:</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-2.5 py-1 text-xs font-mono border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
              >
                <option value="all">All Departments</option>
                <option value="Spinning">Spinning</option>
                <option value="Weaving">Weaving</option>
                <option value="Dyeing">Dyeing</option>
                <option value="Finishing">Finishing</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Quality Control">Quality Control</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-stone-500 font-bold">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2 py-1 text-xs font-mono border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
              >
                <option value="id">Worker ID</option>
                <option value="name">Name</option>
                <option value="wage">Wage Rate</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* WORKER RECORDS TABLE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-stone-600">
          <span>
            Showing <strong>{filteredWorkers.length}</strong> of <strong>{workers.length}</strong> workers
          </span>
          <span className="text-[11px] text-stone-500 italic">
            Tip: Click status buttons directly in the table to toggle attendance & auto-recalculate wage.
          </span>
        </div>

        {filteredWorkers.length === 0 ? (
          <Card variant="elevated" padding="lg" className="bg-white text-center py-12 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 border-2 border-[#181816] flex items-center justify-center text-stone-400">
              <MaterialIcon name="person_search" size="lg" />
            </div>
            <h3 className="font-bold text-stone-700">No worker records match your search</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              No workers match the selected status or department filter. Try resetting filters or adding a new worker.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setAttendanceFilter('all')
                  setDepartmentFilter('all')
                }}
              >
                Clear Filters
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingWorker(null)
                  setIsAddEditModalOpen(true)
                }}
              >
                + Add Worker
              </Button>
            </div>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border-2 border-[#181816] bg-white pop-shadow-md">
            <table className="w-full min-w-[880px] text-left font-mono text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#FAF7F0] border-b-2 border-[#181816] text-stone-700">
                  <th className="py-2.5 px-3.5 font-black w-28">Worker ID</th>
                  <th className="py-2.5 px-3.5 font-black w-52">Name & Department</th>
                  <th className="py-2.5 px-3.5 font-black w-44">Role & Shift</th>
                  <th className="py-2.5 px-3.5 font-black w-32">Daily Wage Rate</th>
                  <th className="py-2.5 px-3.5 font-black w-64">Attendance Status (Quick Toggle)</th>
                  <th className="py-2.5 px-3.5 font-black w-32">Today&apos;s Wage</th>
                  <th className="py-2.5 px-3.5 font-black w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredWorkers.map((worker) => {
                  const todayWage = calculateWageForStatus(worker.dailyWage, worker.status)

                  return (
                    <tr key={worker.id} className="hover:bg-[#FAF7F0] transition-colors">
                      {/* Worker ID */}
                      <td className="py-3 px-3 font-bold text-[#0E4B3E]">
                        {worker.id}
                      </td>

                      {/* Name & Department */}
                      <td className="py-3 px-3">
                        <div className="font-sans font-bold text-[#181816]">{worker.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 border border-stone-300 font-bold text-stone-600">
                            {worker.department}
                          </span>
                          {worker.notes && (
                            <span
                              className="text-[10px] text-stone-400 truncate max-w-[150px]"
                              title={worker.notes}
                            >
                              {worker.notes}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Role & Shift */}
                      <td className="py-3 px-3">
                        <div className="font-sans font-medium text-stone-800">{worker.role}</div>
                        <span className="text-[10.5px] text-stone-500 block mt-0.5">
                          {worker.shift}
                        </span>
                      </td>

                      {/* Base Daily Wage Rate */}
                      <td className="py-3 px-3 font-bold text-[#181816]">
                        ₹{worker.dailyWage.toLocaleString()}
                        <span className="text-[10px] text-stone-400 font-normal block">
                          base / day
                        </span>
                      </td>

                      {/* Attendance Status Quick-Toggle Buttons */}
                      <td className="py-3 px-3">
                        <div className="inline-flex items-center gap-1 bg-[#FAF7F0] p-1 rounded-xl border border-stone-300">
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(worker.id, 'Present')}
                            title="Full daily wage (100%)"
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                              worker.status === 'Present'
                                ? 'bg-[#0E4B3E] text-white border border-[#181816] pop-shadow-xs'
                                : 'text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            Present (1.0x)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(worker.id, 'Half-day')}
                            title="Half daily wage (50%)"
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                              worker.status === 'Half-day'
                                ? 'bg-amber-500 text-white border border-[#181816] pop-shadow-xs'
                                : 'text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            Half-day (0.5x)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(worker.id, 'Absent')}
                            title="Unpaid (₹0)"
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                              worker.status === 'Absent'
                                ? 'bg-[#E05326] text-white border border-[#181816] pop-shadow-xs'
                                : 'text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            Absent (0x)
                          </button>
                        </div>
                      </td>

                      {/* Calculated Today's Wage */}
                      <td className="py-3 px-3">
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`text-sm font-black ${
                              worker.status === 'Present'
                                ? 'text-[#0E4B3E]'
                                : worker.status === 'Half-day'
                                ? 'text-amber-700'
                                : 'text-stone-400'
                            }`}
                          >
                            ₹{todayWage.toLocaleString()}
                          </span>
                        </div>
                        <span className="text-[9.5px] text-stone-400 block">
                          {worker.status === 'Present'
                            ? 'Full Wage'
                            : worker.status === 'Half-day'
                            ? '50% Prorated'
                            : 'Unpaid (Absent)'}
                        </span>
                      </td>

                      {/* Actions (Edit / Delete) */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWorker(worker)
                              setIsAddEditModalOpen(true)
                            }}
                            className="w-7 h-7 rounded-lg border-2 border-[#181816] bg-white hover:bg-stone-100 flex items-center justify-center pop-shadow-xs transition-all text-[#181816]"
                            title="Edit Worker Record"
                          >
                            <MaterialIcon name="edit" size="xs" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingWorker(worker)}
                            className="w-7 h-7 rounded-lg border-2 border-[#181816] bg-white hover:bg-red-50 text-red-600 flex items-center justify-center pop-shadow-xs transition-all"
                            title="Delete Worker Record"
                          >
                            <MaterialIcon name="delete" size="xs" color="#DC2626" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT WORKER */}
      <WorkerModal
        isOpen={isAddEditModalOpen}
        onClose={() => {
          setIsAddEditModalOpen(false)
          setEditingWorker(null)
        }}
        onSave={handleSaveWorker}
        initialWorker={editingWorker}
        existingWorkerIds={workers.map((w) => w.id)}
      />

      {/* MODAL: DELETE CONFIRMATION */}
      {deletingWorker && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingWorker(null)}
          title="Confirm Worker Deletion"
          icon={<MaterialIcon name="warning" size="md" color="#E05326" />}
          actionButtons={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingWorker(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteWorker}
                icon={<MaterialIcon name="delete" size="xs" />}
              >
                Delete Record
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-stone-700">
            <p>
              Are you sure you want to remove worker{' '}
              <strong className="text-[#181816]">{deletingWorker.name} ({deletingWorker.id})</strong>?
            </p>
            <p className="text-xs text-stone-500">
              Department: {deletingWorker.department} · Role: {deletingWorker.role}
            </p>
            <p className="text-xs text-stone-500">
              This action will recalculate daily attendance and wage totals.
            </p>
          </div>
        </Modal>
      )}

      {/* Footer */}
      <footer className="pt-4 border-t border-stone-300 text-center font-mono text-[10.5px] text-stone-500 space-y-1">
        <p>Everest Textile Mills · Workforce Attendance & Payroll Division</p>
        <p className="text-stone-400">
          Browser Storage Active · Real-time biometric punching endpoints (<code className="font-mono">/api/v1/attendance</code>) will replace browser state once deployed.
        </p>
      </footer>
    </div>
  )
}
