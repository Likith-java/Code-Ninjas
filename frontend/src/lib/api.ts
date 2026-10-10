/**
 * Everest Textile Intelligence Platform - Central Frontend API Client
 *
 * Connects to the FastAPI backend at NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL.
 * Provides strongly-typed request and response contracts conforming strictly to API_CONTRACT.md and backend schemas.
 */

import { getToken, clearSession } from "./auth-storage";

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
