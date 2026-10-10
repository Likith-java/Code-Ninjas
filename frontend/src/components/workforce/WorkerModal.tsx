'use client'

import { useState, useEffect } from 'react'
import { Modal, Button, MaterialIcon } from '@/components/ui'
import { WorkerRecord, AttendanceStatus, calculateWageForStatus } from '@/types/workforce'

interface WorkerModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (worker: WorkerRecord) => void
  initialWorker?: WorkerRecord | null
  existingWorkerIds: string[]
}

const DEPARTMENTS: WorkerRecord['department'][] = [
  'Spinning',
  'Weaving',
  'Dyeing',
  'Finishing',
  'Maintenance',
  'Quality Control',
]

const SHIFTS: WorkerRecord['shift'][] = [
  'Shift A (06:00-14:00)',
  'Shift B (14:00-22:00)',
  'Shift C (22:00-06:00)',
  'General Shift',
]

export function WorkerModal({
  isOpen,
  onClose,
  onSave,
  initialWorker,
  existingWorkerIds,
}: WorkerModalProps) {
  const isEditing = !!initialWorker

  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState<WorkerRecord['department']>('Spinning')
  const [shift, setShift] = useState<WorkerRecord['shift']>('Shift A (06:00-14:00)')
  const [dailyWage, setDailyWage] = useState<number>(750)
  const [status, setStatus] = useState<AttendanceStatus>('Present')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialWorker) {
      setId(initialWorker.id)
      setName(initialWorker.name)
      setRole(initialWorker.role)
      setDepartment(initialWorker.department)
      setShift(initialWorker.shift)
      setDailyWage(initialWorker.dailyWage)
      setStatus(initialWorker.status)
      setNotes(initialWorker.notes || '')
      setError(null)
    } else {
      // Generate next worker ID
      let nextNum = existingWorkerIds.length + 101
      while (existingWorkerIds.includes(`WRK-${nextNum}`)) {
        nextNum++
      }
      setId(`WRK-${nextNum}`)
      setName('')
      setRole('Machine Operator')
      setDepartment('Spinning')
      setShift('Shift A (06:00-14:00)')
      setDailyWage(750)
      setStatus('Present')
      setNotes('')
      setError(null)
    }
  }, [initialWorker, isOpen, existingWorkerIds])

  const calculatedWage = calculateWageForStatus(dailyWage, status)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Worker name is required.')
      return
    }
    if (!role.trim()) {
      setError('Worker role is required.')
      return
    }
    if (dailyWage <= 0 || isNaN(dailyWage)) {
      setError('Daily wage rate must be a positive amount.')
      return
    }
    if (!isEditing && existingWorkerIds.includes(id.trim())) {
      setError(`Worker ID "${id.trim()}" is already assigned to another record.`)
      return
    }

    onSave({
      id: id.trim(),
      name: name.trim(),
      role: role.trim(),
      department,
      shift,
      dailyWage: Number(dailyWage),
      status,
      notes: notes.trim(),
      lastUpdated: 'Just now',
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Worker: ${initialWorker?.id}` : 'Add New Factory Worker'}
      icon={<MaterialIcon name={isEditing ? 'edit' : 'person_add'} size="md" color="#0E4B3E" />}
      actionButtons={
        <>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={handleSubmit}
            icon={<MaterialIcon name="save" size="sm" />}
          >
            {isEditing ? 'Update Worker' : 'Save Record'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 text-[12px] font-sans">
        {error && (
          <div className="p-2 rounded-xl border border-red-400 bg-red-50 text-red-800 text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Worker ID
            </label>
            <input
              type="text"
              value={id}
              disabled={isEditing}
              onChange={(e) => setId(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 font-mono text-xs border-2 border-[#181816] rounded-xl bg-stone-100 disabled:opacity-75 focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            />
          </div>

          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Full Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Ramesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Role / Designation *
            </label>
            <input
              type="text"
              placeholder="e.g. Ring Frame Master"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as WorkerRecord['department'])}
              className="mt-1 w-full px-2.5 py-1.5 text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Assigned Shift
            </label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as WorkerRecord['shift'])}
              className="mt-1 w-full px-2.5 py-1.5 text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            >
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
              Daily Wage Rate (₹) *
            </label>
            <input
              type="number"
              min="100"
              step="10"
              value={dailyWage}
              onChange={(e) => setDailyWage(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full px-3 py-1.5 font-mono text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
              required
            />
          </div>
        </div>

        {/* Attendance Status Selector */}
        <div>
          <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase mb-1">
            Attendance Status (Today)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['Present', 'Half-day', 'Absent'] as AttendanceStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`py-2 px-3 rounded-xl border-2 border-[#181816] font-mono text-xs font-bold transition-all ${
                  status === s
                    ? s === 'Present'
                      ? 'bg-[#0E4B3E] text-white pop-shadow-xs'
                      : s === 'Half-day'
                      ? 'bg-amber-500 text-white pop-shadow-xs'
                      : 'bg-[#E05326] text-white pop-shadow-xs'
                    : 'bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Live Automatic Wage Calculation Breakdown */}
        <div className="p-3 rounded-2xl border-2 border-[#181816] bg-[#FAF7F0] space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-stone-600">
            <span>Base Wage Rate:</span>
            <span className="font-bold">₹{dailyWage.toLocaleString()} / day</span>
          </div>
          <div className="flex items-center justify-between text-stone-600">
            <span>Attendance Multiplier:</span>
            <span className="font-bold">
              {status === 'Present' ? '1.0x (100% full wage)' : status === 'Half-day' ? '0.5x (50% half wage)' : '0.0x (₹0 unpaid)'}
            </span>
          </div>
          <div className="pt-1 border-t border-stone-300 flex items-center justify-between text-sm">
            <span className="font-bold text-[#181816]">Calculated Wage Today:</span>
            <span className="font-black text-base text-[#0E4B3E]">
              ₹{calculatedWage.toLocaleString()}
            </span>
          </div>
        </div>

        <div>
          <label className="block font-mono text-[11px] font-bold text-stone-700 uppercase">
            Notes / Machine Qualification (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Ring frame specialist; Murata winder certified"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full px-3 py-1.5 text-xs border-2 border-[#181816] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
          />
        </div>
      </form>
    </Modal>
  )
}
