export type ApiStateMode = 'live' | 'demo' | 'loading' | 'empty' | 'error'

export interface DashboardOrder {
  id: string
  buyer: string
  fabric: string
  articleCode: string
  targetMeters: number
  producedMeters: number
  stage: 'Spinning' | 'Weaving' | 'Dyeing' | 'Inspection' | 'Finished'
  status: 'In Production' | 'Completed' | 'Scheduled' | 'Delayed'
  dueHours: number
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  unitPrice?: number
  totalAmount?: number
  orderDate?: string
  deadlineDate?: string
  derivedStatus?: string
  qualityStatus?: string
  dispatchStatus?: string
}

export interface MachineGroupStatus {
  name: 'Spinning' | 'Weaving' | 'Dyeing'
  code: string
  totalCount: number
  runningCount: number
  idleCount: number
  maintenanceCount: number
  status: 'Normal' | 'Degraded' | 'Attention'
  primaryProcess: string
  telemetrySummary: string
  utilizationRate: number
  machines: {
    id: string
    status: 'Running' | 'Idle' | 'Maintenance' | 'Breakdown'
    currentOrder?: string
    speedMetric?: string
    notes?: string
  }[]
}

export interface ProductionSummaryShift {
  shiftName: string
  shiftCode: 'A' | 'B' | 'C'
  timing: string
  targetMeters: number
  actualMeters: number
  operatorCount: number
  scrapPercentage: number
  supervisor: string
  status: 'Active' | 'Completed' | 'Upcoming'
  notes: string
}
