export type AttendanceStatus = 'Present' | 'Absent' | 'Half-day'

export interface WorkerRecord {
  id: string
  name: string
  role: string
  department: 'Spinning' | 'Weaving' | 'Dyeing' | 'Finishing' | 'Maintenance' | 'Quality Control'
  shift: 'Shift A (06:00-14:00)' | 'Shift B (14:00-22:00)' | 'Shift C (22:00-06:00)' | 'General Shift'
  dailyWage: number
  status: AttendanceStatus
  notes?: string
  lastUpdated?: string
}

export interface WorkforceSummary {
  totalWorkers: number
  presentWorkers: number
  halfDayWorkers: number
  absentWorkers: number
  calculatedWages: number
  budgetedWages: number
  attendanceRate: number
}

export function calculateWageForStatus(dailyWage: number, status: AttendanceStatus): number {
  if (status === 'Present') {
    return Number(dailyWage.toFixed(2))
  }
  if (status === 'Half-day') {
    return Number((dailyWage * 0.5).toFixed(2))
  }
  // Absent = zero
  return 0
}
