export interface Order {
  id: string
  buyer: string
  fabric: string
  colour: string
  metres: number
  due: number
  priorityWeight: number
  yarnReady: number
  eligible: {
    spinning: string[]
    weaving: string[]
    dyeing: string[]
  }
  status: OrderStatus
  currentStage?: ProductionStage
  progress?: number
  assignedMachine?: string
}

export type OrderStatus = 
  | 'not_started' 
  | 'spinning' 
  | 'weaving' 
  | 'dyeing' 
  | 'inspection' 
  | 'ready_to_ship' 
  | 'partly_dispatched' 
  | 'dispatched'

export type ProductionStage = 'spinning' | 'weaving' | 'dyeing' | 'inspection'

export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface Machine {
  id: string
  stage: ProductionStage
  rateMPerHour: number
  downtime: DowntimeWindow[]
  status: MachineStatus
  currentOrder?: string
  progress?: number
}

export type MachineStatus = 'idle' | 'running' | 'down' | 'maintenance'

export interface DowntimeWindow {
  from: number
  to: number
  reason?: string
}

export interface Scenario {
  name: string
  synthetic: boolean
  now: number
  horizon: number
  route: ProductionStage[]
  machines: Machine[]
  orders: Order[]
  frozen: FrozenOperation[]
}

export interface FrozenOperation {
  order: string
  stage: ProductionStage
  machine: string
  start: number
  end: number
}

export interface ScheduleOperation {
  order: string
  stage: ProductionStage
  machine: string
  start: number
  end: number
}

export interface Schedule {
  scenario: string
  scheduler: 'edf' | 'cpsat'
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE'
  computeSeconds: number
  validation: {
    violations: ValidationViolation[]
  }
  metrics: ScheduleMetrics
  operations: ScheduleOperation[]
}

export interface ScheduleMetrics {
  weightedTardiness: number
  onTimeRate: number
  utilisation: number
  makespan: number
}

export interface ValidationViolation {
  rule: number
  message: string
  order?: string
  machine?: string
  stage?: ProductionStage
}

export interface Disruption {
  type: 'machine_down' | 'yarn_delay'
  machine?: string
  order?: string
  from?: number
  to?: number
  hours?: number
  now: number
}

export type ScenarioName = 'feasible' | 'breakdown' | 'late_yarn' | 'infeasible'

export interface Toast {
  id: string
  message: string
  icon: string
  type: 'success' | 'warning' | 'error' | 'info'
}

export type RightTab = 'replan' | 'order'

export interface SelectedOrderDetail {
  id: string
  title: string
  buyer: string
  priority: Priority
  yarnFeasibility: YarnFeasibility
  routeEligibility: RouteEligibility[]
}

export interface YarnFeasibility {
  required: string
  available: string
  status: 'FEASIBLE' | 'SHORTFALL' | 'CRITICAL'
  earliestStart: string
}

export interface RouteEligibility {
  stage: ProductionStage
  machines: string[]
}

// Worker types
export type WorkerSkillLevel = 'trainee' | 'operator' | 'senior' | 'technician' | 'supervisor' | 'quality_inspector'
export type WorkerShift = 'A' | 'B' | 'C' | 'day' | 'night' | 'flex'
export type WorkerStatus = 'active' | 'on_leave' | 'inactive'
export type WorkerRoleInRun = 'operator' | 'assistant' | 'supervisor' | 'quality_check'

export interface Worker {
  id: number
  employeeCode: string
  name: string
  skillLevel: WorkerSkillLevel
  shift: WorkerShift
  status: WorkerStatus
  hourlyRate: number
  skills: string[]
  createdAt: string
}

export interface WorkerAssignment {
  id: number
  workerId: number
  operationId: number
  productionRunId: number
  roleInRun: WorkerRoleInRun
  assignedAt: string
  releasedAt: string | null
  worker?: Worker
  operation?: {
    id: number
    stage: string
    sequence: number
  }
  productionRun?: {
    id: number
    status: string
  }
}

// Simulation types
export type SimulationStatus = 'stopped' | 'running' | 'paused'

export interface SimulationState {
  status: SimulationStatus
  speed: number
  simulatedTime: number
  lastTickAt: string | null
  activeRuns: number
  blockedOperations: number
}

export interface SimulationControlRequest {
  speed?: number
}