/**
 * Everest Textile Intelligence Platform - Central Frontend API Client
 *
 * Connects to the FastAPI backend at NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL.
 * Provides strongly-typed request and response contracts conforming strictly to API_CONTRACT.md.
 */

// Read base URL from environment, defaulting to standard local FastAPI port 8000
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:8000'

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
    this.name = 'ApiClientError'
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

export interface BackendBuyer {
  id: number
  name: string
  contact?: string | null
  email?: string | null
}

export interface BackendOrder {
  id: number
  order_code: string
  buyer_id: number
  fabric_type: string
  colour: string
  quantity_metres: string | number
  order_date: string
  deadline: string
  priority_weight: number
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string
  derived_status?: 'not_started' | 'in_production' | 'ready_to_ship' | 'partly_dispatched' | 'dispatched' | string
}

export interface BackendMaterial {
  id: number
  material_type: string
  colour: string
  specification: string
  reorder_threshold_kg: string | number
  yarn_kg_per_metre: string | number
}

export interface BackendSupplier {
  id: number
  name: string
  contact?: string | null
  email?: string | null
}

export interface BackendInventoryLot {
  lot_id: number
  lot_code: string
  material_id: number
  material_type: string
  colour: string
  specification: string
  supplier_id: number
  available_kg: string | number
  reorder_threshold_kg: string | number
  low_stock: boolean
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
  movement_type: 'receipt' | 'issue' | 'adjustment'
  quantity_kg: string | number
  movement_date: string
  note?: string | null
}

export interface BackendMachine {
  id: number
  machine_code: string
  machine_type: 'spinning' | 'weaving' | 'dyeing'
  capacity_rate: string | number
  state: 'idle' | 'scheduled' | 'running' | 'maintenance' | 'breakdown'
  is_active: boolean
}

export interface BackendDowntime {
  id: number
  machine_id: number
  start_time: string
  end_time?: string | null
  reason: string
}

export interface BackendProductionRun {
  id: number
  order_id: number
  operation_id: number
  machine_id: number
  kind: 'scheduled' | 'actual'
  start_time: string
  end_time: string
  status: 'planned' | 'running' | 'completed' | 'interrupted'
  output_metres?: string | number | null
}

export interface BackendFabricRoll {
  id: number
  roll_code: string
  order_id: number
  production_run_id: number
  length_metres: string | number
  grade?: 'A' | 'B' | 'C' | 'defect' | null
  status: 'awaiting_inspection' | 'passed' | 'rework' | 'rejected' | 'dispatched'
  created_at: string
  is_dispatch_eligible?: boolean
}

export interface BackendDispatchItem {
  id: number
  dispatch_id: number
  roll_id: number
  line_metres: string | number
  agreed_rate: string | number
  line_total: string | number
}

export interface BackendDispatch {
  id: number
  order_id: number
  invoice_number: string
  dispatch_date: string
  confirmed_at?: string | null
  total_metres: string | number
  total_amount: string | number
  items: BackendDispatchItem[]
}

// -------------------------------------------------------------
// CORE FETCH WRAPPER
// -------------------------------------------------------------

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${API_BASE_URL}${cleanEndpoint}`

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options?.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
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

export const api = {
  // Base configuration
  getBaseUrl: () => API_BASE_URL,

  // System probes
  checkHealth: () => request<SystemHealth>('/health'),
  checkReadiness: () => request<SystemReadiness>('/ready'),

  // Orders
  getOrders: (offset = 0, limit = 50) =>
    request<BackendOrder[]>(`/orders?offset=${offset}&limit=${limit}`),
  getOrder: (id: number) => request<BackendOrder>(`/orders/${id}`),
  getBuyers: (offset = 0, limit = 50) =>
    request<BackendBuyer[]>(`/buyers?offset=${offset}&limit=${limit}`),

  // Inventory & Materials
  getInventory: (lowStockOnly = false, offset = 0, limit = 100) =>
    request<BackendInventorySummary>(
      `/inventory?low_stock_only=${lowStockOnly}&offset=${offset}&limit=${limit}`
    ),
  getInventoryMovements: (params?: {
    material_id?: number
    lot_id?: number
    order_id?: number
    movement_type?: 'receipt' | 'issue' | 'adjustment'
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

  // Suppliers
  getSuppliers: (offset = 0, limit = 50) =>
    request<BackendSupplier[]>(`/suppliers?offset=${offset}&limit=${limit}`),
  getSupplier: (id: number) => request<BackendSupplier>(`/suppliers/${id}`),

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
  getDowntimes: (machineId?: number, skip = 0, limit = 50) => {
    const searchParams = new URLSearchParams({ skip: String(skip), limit: String(limit) })
    if (machineId) searchParams.set('machine_id', String(machineId))
    return request<BackendDowntime[]>(`/downtimes?${searchParams.toString()}`)
  },

  // Production Runs
  getProductionRuns: (params?: {
    order_id?: number
    operation_id?: number
    machine_id?: number
    kind?: 'scheduled' | 'actual'
    status?: 'planned' | 'running' | 'completed' | 'interrupted'
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
  getRollTraceability: (id: number) => request<unknown>(`/rolls/${id}/traceability`),

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
}
