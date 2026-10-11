/**
 * Everest Textile Intelligence Platform - Central Frontend API Client
 *
 * Connects to the FastAPI backend at NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL.
 * Provides strongly-typed request and response contracts conforming strictly to API_CONTRACT.md and backend schemas.
 */

import { getToken, clearSession } from "./auth-storage";
import { buildCompareRequest } from './scheduler-view-model.mjs'

// Read base URL from environment, defaulting to standard local FastAPI port 8000
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"

// Generic API Response error structure conforming to FastAPI exception handler
export interface ApiErrorDetail {
  detail: string | { message?: string; [key: string]: unknown } | Array<{ loc: string[]; msg: string; type: string }>
  status: number
}

export class ApiClientError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.detail = detail
  }
}

// -------------------------------------------------------------
// BACKEND CONTRACT TYPES (Mirrored from backend/app/schemas.py)
// -------------------------------------------------------------

export interface SystemHealth {
  status: 'ok' | string
}

export interface SystemReadiness {
  status: 'ready' | 'not_ready' | string
  database?: 'connected' | 'unavailable' | string
}

// Buyers & Orders
export interface BuyerCreate {
  name: string
  contact?: string | null
  email?: string | null
  address?: string | null
}

export interface BackendBuyer {
  id: number
  name: string
  contact?: string | null
  email?: string | null
  address?: string | null
}

export interface OrderCreate {
  buyer_id: number
  fabric_type: string
  colour: string
  quantity_metres: number | string
  agreed_rate: number | string
  deadline: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

export interface BackendOrder {
  id: number
  order_code?: string
  buyer_id: number
  buyer_name?: string
  fabric_type: string
  colour: string
  quantity_metres: string | number
  agreed_rate?: string | number
  order_date: string
  deadline: string
  priority: 'low' | 'normal' | 'high' | 'urgent' | string
  priority_weight?: number
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string
  derived_status?: 'not_started' | 'in_production' | 'ready_to_ship' | 'partly_dispatched' | 'dispatched' | string
}

export interface StartProductionRequest {
  operation_id?: number
  machine_id?: number
}

export interface StartProductionOut {
  order_id: number
  production_run_id: number
  operation_id: number
  stage: string
  machine_id: number
  machine_code: string
  status: string
  start_time: string
  message: string
}

export interface EligibleMachineSummary {
  id: number
  machine_code: string
  machine_type: string
  state: string
  is_active: boolean
}

export interface OperationSummary {
  id: number
  stage: string
  sequence: number
  planned_duration_minutes?: number | null
  eligible_machines: EligibleMachineSummary[]
}

export interface OrderReadinessOut {
  order_id: number
  buyer_id: number
  buyer_name?: string | null
  fabric_type: string
  colour: string
  quantity_metres: number | string
  deadline: string
  priority: string
  derived_status: string
  yarn_feasible: boolean
  feasibility_message: string
  target_operation?: OperationSummary | null
  recommended_machine?: EligibleMachineSummary | null
  eligible_machines: EligibleMachineSummary[]
  has_active_run: boolean
  active_run_id?: number | null
  active_machine_code?: string | null
  existing_runs: BackendProductionRun[]
}

export interface FeasibilityRequest {
  fabric_type: string
  colour: string
  quantity_metres: number | string
}

export interface MaterialShortfall {
  material_id: number
  material_type: string
  colour: string
  specification: string
  required_kg: string | number
  available_kg: string | number
  shortfall_kg: string | number
  feasible: boolean
}

export interface FeasibilityOut {
  feasible: boolean
  requested_quantity_metres: string | number
  options: MaterialShortfall[]
  message: string
}

// Suppliers & Materials
export interface SupplierCreate {
  name: string
  contact?: string | null
  email?: string | null
}

export interface BackendSupplier {
  id: number
  name: string
  contact?: string | null
  email?: string | null
}

export interface MaterialCreate {
  material_type: string
  colour: string
  specification: string
  reorder_threshold_kg?: number | string
  yarn_kg_per_metre: number | string
}

export interface BackendMaterial {
  id: number
  material_type: string
  colour: string
  specification: string
  reorder_threshold_kg: string | number
  yarn_kg_per_metre: string | number
}

// Inventory
export interface ReceiptCreate {
  lot_code: string
  material_id: number
  supplier_id: number
  quantity_kg: number | string
  lot_cost: number | string
  intended_order_id?: number | null
  note?: string | null
}

export interface IssueCreate {
  lot_id: number
  order_id: number
  quantity_kg: number | string
  note?: string | null
}

export interface AdjustmentCreate {
  lot_id: number
  quantity_kg: number | string
  reason: string
}

export interface BackendInventoryLot {
  lot_id: number
  lot_code: string
  qr_token?: string | null
  material_id: number
  material_type: string
  colour: string
  specification: string
  supplier_id: number
  available_kg: string | number
  reorder_threshold_kg: string | number
  low_stock: boolean
}

export interface BackendLotDetail {
  lot_id: number
  lot_code: string
  qr_token?: string | null
  qr_code_url: string
  material_id: number
  material_type: string
  colour: string
  specification: string
  yarn_kg_per_metre?: number | string | null
  supplier_id: number
  supplier_name?: string | null
  supplier_contact?: string | null
  initial_received_kg: number | string
  available_kg: number | string
  intended_order_id?: number | null
  intended_order_code?: string | null
  lot_cost: number | string
  unit: string
  received_at: string
  movements: BackendInventoryMovement[]
  quality_status: string
}

export interface BackendInventorySummary {
  total_lots: number
  low_stock_materials: number
  lots: BackendInventoryLot[]
}

export interface BackendInventoryMovement {
  id: number
  lot_id: number
  order_id?: number | null
  movement_type: 'receipt' | 'issue' | 'adjustment' | string
  quantity_kg: string | number
  movement_date: string
  note?: string | null
}

// Machines & Downtime
export interface MachineCreate {
  machine_code: string
  machine_type: 'spinning' | 'weaving' | 'dyeing'
  capacity_rate: number | string
  state?: 'idle' | 'scheduled' | 'running' | 'maintenance' | 'breakdown'
  is_active?: boolean
}

export interface MachineUpdate {
  state?: 'idle' | 'scheduled' | 'running' | 'maintenance' | 'breakdown'
  is_active?: boolean
  capacity_rate?: number | string
}

export interface BackendMachine {
  id: number
  machine_code: string
  machine_type: 'spinning' | 'weaving' | 'dyeing'
  capacity_rate: string | number
  state: 'idle' | 'scheduled' | 'running' | 'maintenance' | 'breakdown'
  is_active: boolean
}

export interface DowntimeCreate {
  machine_id: number
  reason: string
  start_time: string
  end_time?: string | null
}

export interface DowntimeUpdate {
  reason?: string | null
  end_time?: string | null
}

export interface BackendDowntime {
  id: number
  machine_id: number
  start_time: string
  end_time?: string | null
  reason: string
}

// Operations & Production Runs
export interface OperationOut {
  id: number
  order_id: number
  stage: string
  sequence: number
  planned_duration_minutes?: number | null
  eligible_machine_ids: number[]
}

export interface ProductionRunCreate {
  order_id: number
  operation_id: number
  machine_id: number
  run_kind?: 'scheduled' | 'actual'
  status?: 'planned' | 'running' | 'completed' | 'cancelled'
  start_time?: string | null
  end_time?: string | null
  output_metres?: number | string | null
}

export interface ProductionRunUpdate {
  status?: 'planned' | 'running' | 'completed' | 'cancelled'
  start_time?: string | null
  end_time?: string | null
  output_metres?: number | string | null
  machine_id?: number | null
}

export interface BackendProductionRun {
  id: number
  order_id: number
  operation_id: number
  machine_id: number
  run_kind: 'scheduled' | 'actual' | string
  kind?: 'scheduled' | 'actual'
  start_time?: string | null
  end_time?: string | null
  status: 'planned' | 'running' | 'completed' | 'interrupted' | 'cancelled' | string
  output_metres?: string | number | null
}

// Fabric Rolls & Quality
export interface FabricRollCreate {
  roll_code: string
  order_id: number
  production_run_id: number
  metres: number | string
  status?: 'awaiting_inspection'
}

export interface BackendFabricRoll {
  id: number
  roll_code: string
  order_id: number
  production_run_id: number
  metres: string | number
  length_metres?: string | number
  status: 'awaiting_inspection' | 'passed' | 'rework' | 'rejected' | 'dispatched' | string
  created_at: string
  is_dispatch_eligible?: boolean
}

export interface InspectionCreate {
  defect_type?: string | null
  severity?: 'low' | 'medium' | 'high' | 'critical' | null
  result: 'pass' | 'rework' | 'reject'
  disposition?: string | null
}

export interface BackendInspection {
  id: number
  roll_id: number
  defect_type?: string | null
  severity?: string | null
  result: 'pass' | 'rework' | 'reject' | string
  disposition?: string | null
  inspected_at: string
}

export interface TraceabilityOut {
  roll_id: number
  roll_code: string
  order_id: number
  production_run_id: number
  machine_id?: number | null
  metres: string | number
  status: string
  created_at: string
  is_dispatch_eligible: boolean
  fabric_type?: string | null
  colour?: string | null
  machine_code?: string | null
  machine_type?: string | null
  run_kind?: string | null
  run_status?: string | null
  inspections: BackendInspection[]
  latest_inspection?: BackendInspection | null
}

// Dispatches & Invoicing
export interface DispatchItemCreate {
  roll_id: number
  metres: number | string
}

export interface BackendDispatchItem {
  id: number
  dispatch_id: number
  roll_id: number
  roll_code?: string | null
  line_metres?: string | number
  metres?: string | number
  agreed_rate: string | number
  line_total: string | number
}

export interface DispatchCreate {
  order_id: number
  dispatch_date: string
  vehicle?: string | null
  invoice_number: string
  items: DispatchItemCreate[]
  expected_invoice_total?: number | string | null
}

export interface BackendDispatch {
  id: number
  order_id: number
  invoice_number: string
  dispatch_date: string
  vehicle?: string | null
  confirmed: boolean
  confirmed_at?: string | null
  total_metres: string | number
  agreed_rate?: string | number
  invoice_total: string | number
  total_amount?: string | number
  items: BackendDispatchItem[]
  order_fabric_type?: string | null
  order_colour?: string | null
}

export interface DispatchConfirmOut {
  id: number
  order_id: number
  invoice_number: string
  confirmed: boolean
  confirmed_at?: string | null
  total_metres: string | number
  invoice_total: string | number
  message: string
  dispatched_roll_codes: string[]
}

export interface ScheduleImportResult {
  status: string
  runs_created: number
  runs_updated: number
  total_scheduled: number
  runs: BackendProductionRun[]
}

// -------------------------------------------------------------
// CORE FETCH WRAPPER
// -------------------------------------------------------------

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${API_BASE_URL}${cleanEndpoint}`

  const token = getToken()
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options?.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options?.headers,
      },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error'
    throw new ApiClientError(
      `Failed to connect to Everest Textile API at ${API_BASE_URL}: ${errorMsg}`,
      0,
      { url, error: errorMsg }
    )
  }

  if (response.status === 401) {
    clearSession()
    if (typeof window !== 'undefined') window.location.href = '/'
    throw new Error('Session expired. Please sign in again.')
  }

  if (!response.ok) {
    let errorDetail: unknown = null
    try {
      errorDetail = await response.json()
    } catch {
      errorDetail = await response.text()
    }

    const message =
      typeof errorDetail === 'object' && errorDetail !== null && 'detail' in errorDetail
        ? typeof (errorDetail as { detail: unknown }).detail === 'string'
          ? (errorDetail as { detail: string }).detail
          : JSON.stringify((errorDetail as { detail: unknown }).detail)
        : `Request to ${cleanEndpoint} failed with HTTP ${response.status}`

    throw new ApiClientError(message, response.status, errorDetail)
  }

  // Handle empty bodies (204 No Content, etc.)
  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}

// -------------------------------------------------------------
// API CLIENT SERVICE METHODS
// -------------------------------------------------------------

export interface AuthResponse {
  token: string
  user: {
    id: number
    name: string
    email: string
    role: string
  }
}

export const api = {
  // Base configuration
  getBaseUrl: () => API_BASE_URL,

  // Auth
  register: (input: { name: string; email: string; password: string; role?: string }) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // System probes
  checkHealth: () => request<SystemHealth>('/health'),
  checkReadiness: () => request<SystemReadiness>('/ready'),

  // Buyers
  getBuyers: (offset = 0, limit = 50) =>
    request<BackendBuyer[]>(`/buyers?offset=${offset}&limit=${limit}`),
  getBuyer: (id: number) => request<BackendBuyer>(`/buyers/${id}`),
  createBuyer: (buyer: BuyerCreate) =>
    request<BackendBuyer>('/buyers', {
      method: 'POST',
      body: JSON.stringify(buyer),
    }),

  // Orders
  getOrders: (offset = 0, limit = 50) =>
    request<BackendOrder[]>(`/orders?offset=${offset}&limit=${limit}`),
  getOrder: (id: number) => request<BackendOrder>(`/orders/${id}`),
  createOrder: (order: OrderCreate) =>
    request<BackendOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
  checkFeasibility: (req: FeasibilityRequest) =>
    request<FeasibilityOut>('/orders/feasibility', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  getOrderOperations: (orderId: number) =>
    request<OperationOut[]>(`/orders/${orderId}/operations`),
  getOrderReadiness: (orderId: number) =>
    request<OrderReadinessOut>(`/orders/${orderId}/readiness`),
  startProduction: (orderId: number, payload?: StartProductionRequest) =>
    request<StartProductionOut>(`/orders/${orderId}/start-production`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  // Inventory & Materials
  getInventory: (lowStockOnly = false, offset = 0, limit = 100) =>
    request<BackendInventorySummary>(
      `/inventory?low_stock_only=${lowStockOnly}&offset=${offset}&limit=${limit}`
    ),
  createReceipt: (receipt: ReceiptCreate) =>
    request<BackendInventoryMovement>('/inventory/receipts', {
      method: 'POST',
      body: JSON.stringify(receipt),
    }),
  createIssue: (issue: IssueCreate) =>
    request<BackendInventoryMovement>('/inventory/issues', {
      method: 'POST',
      body: JSON.stringify(issue),
    }),
  createAdjustment: (adjustment: AdjustmentCreate) =>
    request<BackendInventoryMovement>('/inventory/adjustments', {
      method: 'POST',
      body: JSON.stringify(adjustment),
    }),
  getLotDetail: (lotId: number) => request<BackendLotDetail>(`/inventory/lots/${lotId}`),
  scanLot: (query: string) =>
    request<BackendLotDetail>('/inventory/lots/scan', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  getLotQrUrl: (lotId: number, download = false) =>
    `${API_BASE_URL}/inventory/lots/${lotId}/qr${download ? '?download=true' : ''}`,
  getInventoryMovements: (params?: {
    material_id?: number
    lot_id?: number
    order_id?: number
    movement_type?: 'receipt' | 'issue' | 'adjustment' | string
    offset?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.material_id) searchParams.set('material_id', String(params.material_id))
    if (params?.lot_id) searchParams.set('lot_id', String(params.lot_id))
    if (params?.order_id) searchParams.set('order_id', String(params.order_id))
    if (params?.movement_type) searchParams.set('movement_type', params.movement_type)
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<BackendInventoryMovement[]>(`/inventory/movements${qs ? `?${qs}` : ''}`)
  },
  getMaterials: (materialType?: string, colour?: string, offset = 0, limit = 50) => {
    const searchParams = new URLSearchParams({ offset: String(offset), limit: String(limit) })
    if (materialType) searchParams.set('material_type', materialType)
    if (colour) searchParams.set('colour', colour)
    return request<BackendMaterial[]>(`/materials?${searchParams.toString()}`)
  },
  getMaterial: (id: number) => request<BackendMaterial>(`/materials/${id}`),
  createMaterial: (material: MaterialCreate) =>
    request<BackendMaterial>('/materials', {
      method: 'POST',
      body: JSON.stringify(material),
    }),

  // Suppliers
  getSuppliers: (offset = 0, limit = 50) =>
    request<BackendSupplier[]>(`/suppliers?offset=${offset}&limit=${limit}`),
  getSupplier: (id: number) => request<BackendSupplier>(`/suppliers/${id}`),
  createSupplier: (supplier: SupplierCreate) =>
    request<BackendSupplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplier),
    }),

  // Machines & Downtimes
  getMachines: (params?: {
    machine_type?: 'spinning' | 'weaving' | 'dyeing'
    state?: 'idle' | 'scheduled' | 'running' | 'maintenance' | 'breakdown'
    is_active?: boolean
    skip?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.machine_type) searchParams.set('machine_type', params.machine_type)
    if (params?.state) searchParams.set('state', params.state)
    if (params?.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
    if (params?.skip !== undefined) searchParams.set('skip', String(params.skip))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<BackendMachine[]>(`/machines${qs ? `?${qs}` : ''}`)
  },
  getMachine: (id: number) => request<BackendMachine>(`/machines/${id}`),
  createMachine: (machine: MachineCreate) =>
    request<BackendMachine>('/machines', {
      method: 'POST',
      body: JSON.stringify(machine),
    }),
  updateMachine: (id: number, patch: MachineUpdate) =>
    request<BackendMachine>(`/machines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  getDowntimes: (machineId?: number, skip = 0, limit = 50) => {
    const searchParams = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (machineId) searchParams.set('machine_id', String(machineId))
    return request<BackendDowntime[]>(`/downtimes?${searchParams.toString()}`)
  },
  createDowntime: (dt: DowntimeCreate) =>
    request<BackendDowntime>('/downtimes', {
      method: 'POST',
      body: JSON.stringify(dt),
    }),
  updateDowntime: (id: number, patch: DowntimeUpdate) =>
    request<BackendDowntime>(`/downtimes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  addEligibleMachine: (operationId: number, machineId: number) =>
    request<OperationOut>(`/operations/${operationId}/eligible-machines/${machineId}`, {
      method: 'POST',
    }),

  // Production Runs
  getProductionRuns: (params?: {
    order_id?: number
    operation_id?: number
    machine_id?: number
    kind?: 'scheduled' | 'actual'
    status?: 'planned' | 'running' | 'completed' | 'interrupted' | 'cancelled'
    skip?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.order_id) searchParams.set('order_id', String(params.order_id))
    if (params?.operation_id) searchParams.set('operation_id', String(params.operation_id))
    if (params?.machine_id) searchParams.set('machine_id', String(params.machine_id))
    if (params?.kind) searchParams.set('kind', params.kind)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.skip !== undefined) searchParams.set('skip', String(params.skip))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<BackendProductionRun[]>(`/production-runs${qs ? `?${qs}` : ''}`)
  },
  getProductionRun: (id: number) => request<BackendProductionRun>(`/production-runs/${id}`),
  createProductionRun: (run: ProductionRunCreate) =>
    request<BackendProductionRun>('/production-runs', {
      method: 'POST',
      body: JSON.stringify(run),
    }),
  updateProductionRun: (id: number, patch: ProductionRunUpdate) =>
    request<BackendProductionRun>(`/production-runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  importSchedule: (scheduleData: unknown) =>
    request<ScheduleImportResult>('/production-runs/import-schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleData),
    }),

  // Fabric Rolls & Quality
  getRolls: (params?: { order_id?: number; status?: string; skip?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.order_id) searchParams.set('order_id', String(params.order_id))
    if (params?.status) searchParams.set('status', params.status)
    if (params?.skip !== undefined) searchParams.set('skip', String(params.skip))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<BackendFabricRoll[]>(`/rolls${qs ? `?${qs}` : ''}`)
  },
  getRoll: (id: number) => request<BackendFabricRoll>(`/rolls/${id}`),
  createRoll: (roll: FabricRollCreate) =>
    request<BackendFabricRoll>('/rolls', {
      method: 'POST',
      body: JSON.stringify(roll),
    }),
  getRollTraceability: (id: number) => request<TraceabilityOut>(`/rolls/${id}/traceability`),
  createRollInspection: (rollId: number, inspection: InspectionCreate) =>
    request<BackendInspection>(`/rolls/${rollId}/inspections`, {
      method: 'POST',
      body: JSON.stringify(inspection),
    }),

  // Dispatches
  getDispatches: (params?: { order_id?: number; confirmed?: boolean; skip?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.order_id) searchParams.set('order_id', String(params.order_id))
    if (params?.confirmed !== undefined) searchParams.set('confirmed', String(params.confirmed))
    if (params?.skip !== undefined) searchParams.set('skip', String(params.skip))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<BackendDispatch[]>(`/dispatches${qs ? `?${qs}` : ''}`)
  },
  getDispatch: (id: number) => request<BackendDispatch>(`/dispatches/${id}`),
  createDispatch: (dispatch: DispatchCreate) =>
    request<BackendDispatch>('/dispatches', {
      method: 'POST',
      body: JSON.stringify(dispatch),
    }),
  confirmDispatch: (id: number) =>
    request<DispatchConfirmOut>(`/dispatches/${id}/confirm`, {
      method: 'POST',
    }),

  // Reports Generation & Downloads
  getReportTypes: () => request<ReportTypeItem[]>('/reports/types'),
  downloadReport: async (payload: ReportGeneratePayload): Promise<{ blob: Blob; filename: string }> => {
    const url = `${API_BASE_URL}/reports/generate`
    const token = getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      clearSession()
      if (typeof window !== 'undefined') window.location.href = '/'
      throw new Error('Session expired. Please sign in again.')
    }

    if (!response.ok) {
      let errorDetail: any = null
      try {
        errorDetail = await response.json()
      } catch {
        errorDetail = await response.text()
      }
      const msg = errorDetail?.detail || `Failed to generate report (HTTP ${response.status})`
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }

    let filename = `report_${payload.report_type}.${payload.format}`
    const disposition = response.headers.get('Content-Disposition')
    if (disposition) {
      const match = disposition.match(/filename=["']?([^"';]+)["']?/)
      if (match && match[1]) {
        filename = match[1]
      }
  }

  const blob = await response.blob()
  return { blob, filename }
  },

  // Scheduler
  listScenarios: (options?: { signal?: AbortSignal }) => request<ScenarioListItem[]>('/scheduler/scenarios', options),
  getScenario: (scenarioId: string, options?: { signal?: AbortSignal }) =>
    request<ScenarioDetail>(`/scheduler/scenarios/${scenarioId}`, options),
  runScheduler: (req: RunSchedulerRequest, options?: { signal?: AbortSignal }) => request<RunSchedulerResponse>('/scheduler/run', {
    method: 'POST',
    body: JSON.stringify(req),
    signal: options?.signal,
  }),
  validateSchedule: (req: ValidationRequest, options?: { signal?: AbortSignal }) => request<ValidationResponse>('/scheduler/validate', {
    method: 'POST',
    body: JSON.stringify(req),
    signal: options?.signal,
  }),
  simulateDisruption: (req: DisruptionRequest, options?: { signal?: AbortSignal }) => request<DisruptionResponse>('/scheduler/disruption', {
    method: 'POST',
    body: JSON.stringify(req),
    signal: options?.signal,
  }),
  getGanttData: (scenarioId: string, params?: { solver?: 'edf' | 'cpsat'; time_limit_seconds?: number; seed?: number; workers?: number; warm_start?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.solver) searchParams.set('solver', params.solver)
    if (params?.time_limit_seconds) searchParams.set('time_limit_seconds', String(params.time_limit_seconds))
    if (params?.seed) searchParams.set('seed', String(params.seed))
    if (params?.workers) searchParams.set('workers', String(params.workers))
    if (params?.warm_start !== undefined) searchParams.set('warm_start', String(params.warm_start))
    const qs = searchParams.toString()
    return request<GanttResponse>(`/scheduler/gantt/${scenarioId}${qs ? `?${qs}` : ''}`)
  },
  compareSchedulers: (req: CompareSchedulersRequest, options?: { signal?: AbortSignal }) => {
    const mapped = buildCompareRequest(req)
    return request<CompareSchedulersResponse>(mapped.url, {
      method: 'POST',
      body: JSON.stringify(mapped.body),
      signal: options?.signal,
    })
  },

  async getNotifications(orderId?: number, status?: string): Promise<BackendEmailNotification[]> {
    const params = new URLSearchParams()
    if (orderId !== undefined) params.append('order_id', String(orderId))
    if (status) params.append('status', status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return request<BackendEmailNotification[]>(`/notifications${qs}`)
  },

  async retryNotification(notificationId: number): Promise<BackendEmailNotification> {
    return request<BackendEmailNotification>(`/notifications/${notificationId}/retry`, {
      method: 'POST',
    })
  },

  // Simulation
  getSimulationStatus: () => request<SimulationStatus>('/simulation/status'),
  startSimulation: () => request('/simulation/start', { method: 'POST' }),
  stopSimulation: () => request('/simulation/stop', { method: 'POST' }),
  pauseSimulation: () => request('/simulation/pause', { method: 'POST' }),
  resumeSimulation: () => request('/simulation/resume', { method: 'POST' }),
  setSimulationSpeed: (speed: number) => request('/simulation/speed', { method: 'POST', body: JSON.stringify({ speed }) }),
  resetSimulation: () => request('/simulation/reset', { method: 'POST' }),

  // Workers
  getWorkers: (params?: WorkerListParams) => {
    const searchParams = new URLSearchParams()
    if (params?.shift) searchParams.set('shift', params.shift)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.skill_level) searchParams.set('skill_level', params.skill_level)
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset))
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
    const qs = searchParams.toString()
    return request<Worker[]>(`/workers${qs ? `?${qs}` : ''}`)
  },
  getWorker: (id: number) => request<Worker>(`/workers/${id}`),
  createWorker: (worker: WorkerCreate) => request<Worker>('/workers', {
    method: 'POST',
    body: JSON.stringify(worker),
  }),
  getWorkerAssignments: (workerId: number) => request<WorkerAssignment[]>(`/workers/${workerId}/assignments`),
}

export interface BackendEmailNotification {
  id: number
  order_id: number
  notification_type: string
  recipient_email: string
  recipient_name: string | null
  recipient_role: string | null
  subject: string
  status: 'sent' | 'failed' | 'skipped' | 'pending'
  attempt_count: number
  last_error: string | null
  created_at: string
  sent_at: string | null
}

export interface ReportTypeItem {
  id: string
  title: string
  description: string
  audience: string
  supported_formats: string[]
  supported_filters: string[]
}

export interface ReportGeneratePayload {
  report_type: string
  format: 'pdf' | 'xlsx'
  start_date?: string | null
  end_date?: string | null
  order_id?: number | null
  machine_id?: number | null
}

// -------------------------------------------------------------
// SCHEDULER TYPES (Mirrored from textile-scheduler contract v1)
// -------------------------------------------------------------

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN' | 'MODEL_INVALID'
export type ValidationStatus = 'valid' | 'invalid'
export type Severity = 'error' | 'warning'
export type Stage = 'spinning' | 'weaving' | 'dyeing'
export type SchedulerType = 'edf' | 'cpsat'
export type DisruptionType = 'machine_down' | 'yarn_delay'

export interface ScheduledOperation {
  order: string
  stage: Stage
  machine: string
  start: number
  end: number
  duration?: number | null
  quantity_metres?: number | null
}

export interface ValidationViolation {
  code: string
  rule: number
  severity: Severity
  message: string
  order?: string | null
  machine?: string | null
  stage?: Stage | null
}

export interface ValidationResult {
  status: ValidationStatus
  violations: ValidationViolation[]
}

export interface ScheduleMetrics {
  weighted_tardiness?: number | null
  on_time_rate?: number | null
  utilisation?: number | null
  makespan?: number | null
}

export interface Schedule {
  id: string
  scenario_id: string
  solver: SchedulerType
  status: SolverStatus
  compute_seconds?: number | null
  validation: ValidationResult
  metrics: ScheduleMetrics
  operations: ScheduledOperation[]
  warnings: string[]
  diagnostics: Record<string, string | number | boolean | null>
}

export interface ScenarioListItem {
  id: string
  name: string
  description: string
  orders: number
  machines: number
  machines_by_stage: Record<string, number>
  horizon: number
  now: number
  total_metres: number
  downtime_windows: number
  frozen_operations: number
}

export interface ScenarioDetail {
  scenario_id: string
  description: string
  synthetic_data: boolean
  start?: string | null
  now: number | null
  horizon: number | null
  route: Stage[]
  machines: ScenarioMachine[]
  orders: ScenarioOrder[]
  frozen: FrozenOperation[]
  stats: Record<string, unknown>
  consistency_warnings: string[]
}

export interface ScenarioDowntime {
  start: number
  end: number
  reason: string | null
}

export interface ScenarioMachine {
  id: string
  stage: Stage
  rate_m_per_hour: number
  downtime?: ScenarioDowntime[] | null
  available_until: number | null
  status: string
  current_order: string | null
  progress_pct: number
}

export interface ScenarioOrder {
  id: string
  buyer: string | null
  fabric: string | null
  colour: string | null
  metres: number
  ordered_at: number
  due: number
  priority_weight: number
  yarn_ready?: number | null
  eligible: Record<Stage, string[]>
}

export interface FrozenOperation {
  order: string
  stage: Stage
  machine: string
  start: number
  end: number
  quantity_metres: number | null
}

export interface RunSchedulerRequest {
  scenario_id: string
  solver: 'edf' | 'cpsat'
  time_limit_seconds: number
  seed: number
  workers: number
  warm_start: boolean
}

export interface RunSchedulerResponse {
  schedule: Schedule
  warning: string | null
}

export interface ValidationRequest {
  scenario_id: string
  schedule: Schedule
}

export interface ValidationResponse {
  status: ValidationStatus
  violations: ValidationViolation[]
  violation_count: number
}

export interface DisruptionRequest {
  scenario_id: string
  current_schedule: Schedule
  disruption_type: DisruptionType
  machine?: string | null
  from_minute?: number | null
  to_minute?: number | null
  reason?: string | null
  order?: string | null
  hours?: number | null
  delay_minutes?: number | null
  now: number
  solver: 'edf' | 'cpsat'
  time_limit_seconds: number
  seed: number
}

export interface DisruptionResponse {
  ok: boolean
  schedule: Schedule | null
  error: string | null
  diff: {
    frozen_count: number
    split_count: number
    interrupted: any[]
    moved_orders: string[]
    now_late: string[]
    now_at_risk: string[]
    recovered: string[]
    unchanged: string[]
  } | null
  previous_metrics: ScheduleMetrics | null
  new_metrics: ScheduleMetrics | null
}

export interface GanttResponse {
  scenario_id: string
  schedule_id: string
  solver: string
  status: string
  validation: ValidationResult
  time: {
    scenario_start: string | null
    unit: string
    origin_minute: number
    now: number
    horizon: number
  }
  metrics: ScheduleMetrics
  rows: Array<{
    machine_id: string
    stage: Stage | null
    rate_m_per_hour: number | null
    bars: Array<{
      kind: 'operation' | 'downtime'
      order_id?: string
      stage?: Stage
      machine_id?: string
      start: number
      end: number
      duration: number
      quantity_metres?: number | null
      late?: boolean
      frozen?: boolean
      reason?: string | null
    }>
  }>
}

export interface CompareSchedulersRequest {
  scenario_id: string
  time_limit_seconds: number
  seed: number
  workers: number
}

export interface CompareSchedulersResponse {
  scenario_id: string
  results: {
    edf: Schedule | { error: string }
    cpsat: Schedule | { error: string }
  }
  comparison: Partial<Record<
    'weighted_tardiness' | 'on_time_rate' | 'makespan' | 'utilisation',
    { edf: number | null; cpsat: number | null; absolute_change: number | null; percent_improvement: number | null }
  >> & {
    compute_seconds?: { edf: number | null; cpsat: number | null }
    validation?: { edf: { status: string; violations: number }; cpsat: { status: string; violations: number } }
    solver_status?: { edf: string; cpsat: string }
  }
}

// Simulation Types
export interface SimulationStatus {
  status: 'stopped' | 'running' | 'paused'
  speed: number
  simulated_time: number
  last_tick_at: string | null
  active_runs: number
  blocked_operations: number
}

export interface SimulationControlRequest {
  speed?: number
}

export interface Worker {
  id: number
  employee_code: string
  name: string
  skill_level: 'trainee' | 'operator' | 'senior' | 'technician' | 'supervisor' | 'quality_inspector'
  shift: 'A' | 'B' | 'C' | 'day' | 'night' | 'flex'
  status: 'active' | 'on_leave' | 'inactive'
  hourly_rate: number
  skills: string[]
  created_at: string
}

export interface WorkerAssignment {
  id: number
  worker_id: number
  operation_id: number
  production_run_id: number
  role_in_run: 'operator' | 'assistant' | 'supervisor' | 'quality_check'
  assigned_at: string
  released_at: string | null
  worker?: Worker
  operation?: {
    id: number
    stage: string
    sequence: number
  }
  production_run?: {
    id: number
    status: string
  }
}

export interface WorkerListParams {
  shift?: string
  status?: string
  skill_level?: string
  offset?: number
  limit?: number
}

export interface WorkerCreate {
  employee_code: string
  name: string
  skill_level: 'trainee' | 'operator' | 'senior' | 'technician' | 'supervisor' | 'quality_inspector'
  shift: 'A' | 'B' | 'C' | 'day' | 'night' | 'flex'
  status?: 'active' | 'on_leave' | 'inactive'
  hourly_rate: number
  skills: string[]
}
