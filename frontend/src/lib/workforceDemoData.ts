import { WorkerRecord, WorkforceSummary, calculateWageForStatus } from '@/types/workforce'

export const WORKFORCE_STORAGE_KEY = 'everest_textile_workforce_v1'

export const initialWorkers: WorkerRecord[] = [
  {
    id: 'WRK-101',
    name: 'Ramesh Kumar',
    role: 'Ring Frame Master',
    department: 'Spinning',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 850,
    status: 'Present',
    notes: '20+ yrs experience in Ring Spinning Ne 30s-40s',
    lastUpdated: 'Today, 06:15 AM',
  },
  {
    id: 'WRK-102',
    name: 'Sunita Devi',
    role: 'Ring Frame Operator',
    department: 'Spinning',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 650,
    status: 'Present',
    notes: 'Operates SPIN-01 and SPIN-02 spindle arrays',
    lastUpdated: 'Today, 06:00 AM',
  },
  {
    id: 'WRK-103',
    name: 'Mohammad Tariq',
    role: 'Loom Master',
    department: 'Weaving',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 950,
    status: 'Present',
    notes: 'Supervises Rapier shedding and reed adjustments',
    lastUpdated: 'Today, 06:10 AM',
  },
  {
    id: 'WRK-104',
    name: 'Rajesh Patel',
    role: 'Airjet Loom Technician',
    department: 'Weaving',
    shift: 'Shift B (14:00-22:00)',
    dailyWage: 800,
    status: 'Half-day',
    notes: 'Approved medical leave for second half; 4 hrs shift logged',
    lastUpdated: 'Today, 14:05 PM',
  },
  {
    id: 'WRK-105',
    name: 'Ananya Sharma',
    role: 'Fabric Quality Inspector',
    department: 'Quality Control',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 750,
    status: 'Present',
    notes: 'Certified for 4-point fabric defect rating system',
    lastUpdated: 'Today, 06:30 AM',
  },
  {
    id: 'WRK-106',
    name: 'Suresh Yadav',
    role: 'Soft-Flow Dyeing Operator',
    department: 'Dyeing',
    shift: 'Shift B (14:00-22:00)',
    dailyWage: 700,
    status: 'Absent',
    notes: 'Unplanned absence reported; replacement operator allocated',
    lastUpdated: 'Today, 14:20 PM',
  },
  {
    id: 'WRK-107',
    name: 'Kavita Rawat',
    role: 'Cone Winder Specialist',
    department: 'Spinning',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 600,
    status: 'Present',
    notes: 'Managing Murata automatic cone winder assembly',
    lastUpdated: 'Today, 06:05 AM',
  },
  {
    id: 'WRK-108',
    name: 'Vikram Singh',
    role: 'Plant Maintenance Engineer',
    department: 'Maintenance',
    shift: 'General Shift',
    dailyWage: 1100,
    status: 'Present',
    notes: 'Handling WEAVE-03 motor preventive service',
    lastUpdated: 'Today, 08:00 AM',
  },
  {
    id: 'WRK-109',
    name: 'Dinesh Verma',
    role: 'Warping Beam Operator',
    department: 'Weaving',
    shift: 'Shift B (14:00-22:00)',
    dailyWage: 720,
    status: 'Absent',
    notes: 'Advance casual leave sanctioned',
    lastUpdated: 'Yesterday, 17:00 PM',
  },
  {
    id: 'WRK-110',
    name: 'Pooja Roy',
    role: 'Lab Color Chemist',
    department: 'Dyeing',
    shift: 'Shift A (06:00-14:00)',
    dailyWage: 680,
    status: 'Present',
    notes: 'Spectrophotometer recipe approvals for Navy twill',
    lastUpdated: 'Today, 06:25 AM',
  },
]

export function computeWorkforceSummary(workers: WorkerRecord[]): WorkforceSummary {
  const totalWorkers = workers.length
  let presentWorkers = 0
  let halfDayWorkers = 0
  let absentWorkers = 0
  let calculatedWages = 0
  let budgetedWages = 0

  workers.forEach((worker) => {
    budgetedWages += worker.dailyWage
    const wage = calculateWageForStatus(worker.dailyWage, worker.status)
    calculatedWages += wage

    if (worker.status === 'Present') {
      presentWorkers += 1
    } else if (worker.status === 'Half-day') {
      halfDayWorkers += 1
    } else {
      absentWorkers += 1
    }
  })

  const attendanceRate = totalWorkers > 0
    ? Math.round(((presentWorkers + halfDayWorkers * 0.5) / totalWorkers) * 100)
    : 0

  return {
    totalWorkers,
    presentWorkers,
    halfDayWorkers,
    absentWorkers,
    calculatedWages: Math.round(calculatedWages * 100) / 100,
    budgetedWages: Math.round(budgetedWages * 100) / 100,
    attendanceRate,
  }
}

export function getStoredWorkers(): WorkerRecord[] {
  if (typeof window === 'undefined') {
    return initialWorkers
  }
  try {
    const raw = localStorage.getItem(WORKFORCE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.error('Error reading workforce from localStorage:', err)
  }
  return initialWorkers
}

export function saveStoredWorkers(workers: WorkerRecord[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(WORKFORCE_STORAGE_KEY, JSON.stringify(workers))
  } catch (err) {
    console.error('Error writing workforce to localStorage:', err)
  }
}

export function resetStoredWorkers(): WorkerRecord[] {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(WORKFORCE_STORAGE_KEY)
    } catch (err) {
      console.error('Error clearing workforce storage:', err)
    }
  }
  return initialWorkers
}
