'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon, Progress } from '@/components/ui'
import { dashboardDemoData } from '@/lib/dashboardDemoData'
import { ApiStateMode, DashboardOrder } from '@/types/operations'
import {
  api,
  API_BASE_URL,
  BackendOrder,
  BackendMachine,
  BackendInventorySummary,
} from '@/lib/api'
import { formatCanonicalOrderId, formatLegacyOrderId, matchesOrderQuery } from '@/lib/orderUtils'
import { UserRole, getRolePermissions, ROLE_PROFILES } from '@/lib/permissions'
import { OrderDetailsPopover, OrderDetailsData } from '@/components/board/OrderDetailsPopover'
import { OrderCreationModal } from '@/components/modules/OrderCreationModal'

interface OperationsDashboardProps {
  currentRole?: UserRole
}

export function OperationsDashboard({ currentRole = 'admin' }: OperationsDashboardProps) {
  const [apiStateMode, setApiStateMode] = useState<ApiStateMode>('live')
  const [orderSearch, setOrderSearch] = useState('')
  const [orderFilter, setOrderFilter] = useState<'all' | 'In Production' | 'Completed' | 'Scheduled' | 'Disrupted'>('all')
  const [machineSearch, setMachineSearch] = useState('')
  const [machineTypeFilter, setMachineTypeFilter] = useState<'all' | 'spinning' | 'weaving' | 'dyeing'>('all')
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false)

  // Anchored Floating Order Details Popover
  const [popoverOrder, setPopoverOrder] = useState<OrderDetailsData | null>(null)
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null)

  // Individual Order Resolution Modal State
  const [resolveModalOrder, setResolveModalOrder] = useState<DashboardOrder | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolvedOrderIds, setResolvedOrderIds] = useState<Set<string>>(new Set())

  // Live Backend Data States
  const [liveOrders, setLiveOrders] = useState<BackendOrder[]>([])
  const [liveMachines, setLiveMachines] = useState<BackendMachine[]>([])
  const [liveInventory, setLiveInventory] = useState<BackendInventorySummary | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [dbStatus, setDbStatus] = useState<'connected' | 'unavailable' | 'checking'>('checking')
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)

  const permissions = getRolePermissions(currentRole)
  const roleProfile = ROLE_PROFILES[currentRole]

  // Fetch real data from FastAPI backend
  const fetchLiveData = useCallback(async () => {
    setLiveLoading(true)
    setLiveError(null)

    try {
      await api.checkHealth()

      let isDbReady = false
      try {
        const readyRes = await api.checkReadiness()
        isDbReady = readyRes.status === 'ready'
        setDbStatus(isDbReady ? 'connected' : 'unavailable')
      } catch {
        setDbStatus('unavailable')
      }

      const [ordersRes, machinesRes, inventoryRes] = await Promise.allSettled([
        api.getOrders(),
        api.getMachines(),
        api.getInventory(),
      ])

      let hasDatabaseError = false

      if (ordersRes.status === 'fulfilled') {
        setLiveOrders(ordersRes.value)
      } else {
        hasDatabaseError = true
      }

      if (machinesRes.status === 'fulfilled') {
        setLiveMachines(machinesRes.value)
      } else {
        hasDatabaseError = true
      }

      if (inventoryRes.status === 'fulfilled') {
        setLiveInventory(inventoryRes.value)
      }

      if (hasDatabaseError && !isDbReady) {
        setLiveError(
          `FastAPI service is running at ${API_BASE_URL} (/health OK), but PostgreSQL database connection is unavailable (/ready 503).`
        )
      } else {
        setLastRefreshedAt(new Date().toLocaleTimeString())
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend'
      setLiveError(msg)
      setDbStatus('unavailable')
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => {
    if (apiStateMode === 'live') {
      fetchLiveData()
    }
  }, [apiStateMode, fetchLiveData])

  // Convert live backend orders to UI DashboardOrder shape
  const liveDashboardOrders = useMemo<DashboardOrder[]>(() => {
    return liveOrders.map((o) => {
      const target = Number(o.quantity_metres) || 0
      const isDone =
        o.derived_status === 'dispatched' ||
        o.derived_status === 'ready_to_ship' ||
        o.status === 'completed'
      const inProg =
        o.derived_status === 'in_production' || o.status === 'in_progress'

      const produced = isDone ? target : inProg ? Math.round(target * 0.5) : 0
      const statusStr: 'In Production' | 'Completed' | 'Scheduled' = isDone
        ? 'Completed'
        : inProg
        ? 'In Production'
        : 'Scheduled'

      const deadlineTime = new Date(o.deadline).getTime()
      const dueHours = Number.isNaN(deadlineTime)
        ? 48
        : Math.max(0, Math.round((deadlineTime - Date.now()) / (1000 * 3600)))

      return {
        id: formatCanonicalOrderId(o.id),
        buyer: `Buyer #${o.buyer_id}`,
        fabric: `${o.fabric_type} (${o.colour})`,
        articleCode: `ID #${o.id} · ${o.colour}`,
        targetMeters: target,
        producedMeters: produced,
        stage: isDone ? 'Finished' : inProg ? 'Weaving' : 'Spinning',
        status: statusStr,
        dueHours,
        priority: `P${Math.min(3, Math.max(0, 3 - (o.priority_weight ?? (o.priority === 'urgent' ? 3 : o.priority === 'high' ? 2 : o.priority === 'normal' ? 1 : 0))))}` as 'P0' | 'P1' | 'P2' | 'P3',
      }
    })
  }, [liveOrders])

  // Master Orders Source with Canonical IDs & Individual Resolution override
  const masterOrders = useMemo<DashboardOrder[]>(() => {
    const rawList =
      apiStateMode === 'live' && liveDashboardOrders.length > 0
        ? liveDashboardOrders
        : dashboardDemoData.orders.map((o) => ({
            ...o,
            id: formatCanonicalOrderId(o.id),
            // Mark ORD-004 as Disrupted initially if not resolved
            status:
              o.id === 'ORD-004' && !resolvedOrderIds.has(formatCanonicalOrderId(o.id))
                ? ('Delayed' as const)
                : resolvedOrderIds.has(formatCanonicalOrderId(o.id))
                ? ('In Production' as const)
                : o.status,
          }))

    // Customer RBAC filter: If customer, show only their assigned buyer (Buyer #1 / ZARA Sourcing)
    if (currentRole === 'customer') {
      return rawList.filter((o) =>
        o.buyer.toLowerCase().includes('zara') || o.buyer.includes('#1')
      )
    }

    return rawList
  }, [apiStateMode, liveDashboardOrders, resolvedOrderIds, currentRole])

  // Filtered orders list based on search & filter tab
  const filteredOrders = useMemo(() => {
    if (apiStateMode === 'empty') return []

    return masterOrders.filter((order) => {
      const matchesSearch = matchesOrderQuery(
        {
          id: order.id,
          legacyId: formatLegacyOrderId(order.id),
          buyer: order.buyer,
          fabric: order.fabric,
          articleCode: order.articleCode,
        },
        orderSearch
      )

      let matchesStatus = true
      if (orderFilter === 'In Production') matchesStatus = order.status === 'In Production'
      else if (orderFilter === 'Completed') matchesStatus = order.status === 'Completed'
      else if (orderFilter === 'Scheduled') matchesStatus = order.status === 'Scheduled'
      else if (orderFilter === 'Disrupted') matchesStatus = order.status === 'Delayed'

      return matchesSearch && matchesStatus
    })
  }, [masterOrders, orderSearch, orderFilter, apiStateMode])

  // Machines List: Live vs Demo
  const masterMachines = useMemo(() => {
    if (apiStateMode === 'live' && liveMachines.length > 0) {
      return liveMachines.map((m) => ({
        id: m.machine_code,
        type: m.machine_type,
        status: m.state === 'running' ? 'Running' : m.state === 'breakdown' ? 'Breakdown' : m.state === 'maintenance' ? 'Maintenance' : 'Idle',
        capacityRate: `${m.capacity_rate} m/hr`,
        isActive: m.is_active,
        assignedJob: m.state === 'running' ? 'Active Run' : m.state === 'breakdown' ? 'Halted' : 'Available',
      }))
    }

    // Default factory machine dataset
    return [
      { id: 'SPIN-01', type: 'spinning', status: 'Running', capacityRate: '450 m/hr', isActive: true, assignedJob: 'ETM-ORD-000001 (Yarn Drafting)' },
      { id: 'SPIN-02', type: 'spinning', status: 'Running', capacityRate: '450 m/hr', isActive: true, assignedJob: 'ETM-ORD-000002 (Twisting)' },
      { id: 'SPIN-03', type: 'spinning', status: 'Running', capacityRate: '420 m/hr', isActive: true, assignedJob: 'ETM-ORD-000003 (Ring Spinning)' },
      { id: 'WEAVE-01', type: 'weaving', status: 'Running', capacityRate: '120 m/hr', isActive: true, assignedJob: 'ETM-ORD-000001 (Poplin)' },
      { id: 'WEAVE-02', type: 'weaving', status: 'Running', capacityRate: '115 m/hr', isActive: true, assignedJob: 'ETM-ORD-000005 (Twill)' },
      { id: 'WEAVE-03', type: 'weaving', status: resolvedOrderIds.has('ETM-ORD-000004') ? 'Maintenance' : 'Breakdown', capacityRate: '120 m/hr', isActive: false, assignedJob: resolvedOrderIds.has('ETM-ORD-000004') ? 'Maintenance Cleared' : 'Halted (Collision Alert)' },
      { id: 'WEAVE-04', type: 'weaving', status: 'Running', capacityRate: '110 m/hr', isActive: true, assignedJob: 'ETM-ORD-000007 (Oxford)' },
      { id: 'WEAVE-05', type: 'weaving', status: 'Running', capacityRate: '125 m/hr', isActive: true, assignedJob: 'ETM-ORD-000008 (Sateen)' },
      { id: 'DYE-01', type: 'dyeing', status: 'Running', capacityRate: '280 m/hr', isActive: true, assignedJob: 'ETM-ORD-000009 (Navy Jet Dye)' },
      { id: 'DYE-02', type: 'dyeing', status: 'Running', capacityRate: '300 m/hr', isActive: true, assignedJob: 'ETM-ORD-000010 (Olive Jet Dye)' },
    ]
  }, [apiStateMode, liveMachines, resolvedOrderIds])

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    return masterMachines.filter((m) => {
      const matchesSearch =
        m.id.toLowerCase().includes(machineSearch.toLowerCase()) ||
        m.type.toLowerCase().includes(machineSearch.toLowerCase()) ||
        m.status.toLowerCase().includes(machineSearch.toLowerCase()) ||
        m.assignedJob.toLowerCase().includes(machineSearch.toLowerCase())

      const matchesType = machineTypeFilter === 'all' || m.type === machineTypeFilter
      return matchesSearch && matchesType
    })
  }, [masterMachines, machineSearch, machineTypeFilter])

  // Calculated Metrics
  const metrics = useMemo(() => {
    const totalOrdersCount = masterOrders.length
    const completedCount = masterOrders.filter((o) => o.status === 'Completed').length
    const inProductionCount = masterOrders.filter((o) => o.status === 'In Production').length
    const delayedCount = masterOrders.filter((o) => o.status === 'Delayed').length

    const totalTarget = masterOrders.reduce((acc, o) => acc + o.targetMeters, 0)
    const totalProduced = masterOrders.reduce((acc, o) => acc + o.producedMeters, 0)

    const activeLooms = masterMachines.filter((m) => m.status === 'Running').length
    const totalLooms = masterMachines.length || 10

    return {
      totalOrders: totalOrdersCount,
      completedOrders: completedCount,
      inProductionOrders: inProductionCount,
      delayedOrders: delayedCount,
      totalTargetMeters: totalTarget,
      totalProducedMeters: totalProduced,
      overallProgress: totalTarget > 0 ? Math.min(100, Math.round((totalProduced / totalTarget) * 100)) : 0,
      activeMachines: activeLooms,
      totalMachines: totalLooms,
      utilizationRate: Math.round((activeLooms / totalLooms) * 100),
      firstPassYield: 98.4,
    }
  }, [masterOrders, masterMachines])

  // Open Anchored Order Details Popover
  const handleOpenOrderDetails = (order: DashboardOrder, rect: DOMRect) => {
    setPopoverOrder({
      id: order.id,
      buyer: order.buyer,
      fabric: order.fabric,
      targetMeters: order.targetMeters,
      producedMeters: order.producedMeters,
      progress:
        order.targetMeters > 0
          ? Math.min(100, Math.round((order.producedMeters / order.targetMeters) * 100))
          : 0,
      currentStage: order.stage,
      status: order.status,
      disruptionNote:
        order.id === 'ETM-ORD-000004' || order.id === 'ORD-004'
          ? 'Mechanical collision halted weaving on WEAVE-03. 1,200m woven passed, 1,800m remaining halted.'
          : undefined,
    })
    setPopoverRect(rect)
  }

  // Execute Individual Order Resolution Preview (Phase 4)
  const handleConfirmResolveOrder = () => {
    if (!resolveModalOrder) return

    setIsResolving(true)
    setTimeout(() => {
      setResolvedOrderIds((prev) => new Set(prev).add(resolveModalOrder.id))
      setIsResolving(false)
      setResolveModalOrder(null)
    }, 600)
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-3 sm:p-5 space-y-4">
      {/* 1. COMPACT TOP STATUS STRIP */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 shadow-xs text-xs font-body">
        <div className="flex items-center gap-2 flex-wrap">
          {apiStateMode === 'live' ? (
            liveError ? (
              <Badge variant="warning" size="xs" className="gap-1 font-semibold">
                <MaterialIcon name="warning" size="xs" color="#B45309" />
                API Connected · DB Offline
              </Badge>
            ) : (
              <Badge variant="success" size="xs" dotColor="#15803D" className="gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 live-dot inline-block" />
                Live Backend API · Port 8000
              </Badge>
            )
          ) : (
            <Badge variant="warning" size="xs" className="font-semibold">
              DEMO: Synthetic Reference Data
            </Badge>
          )}

          <span className="text-stone-500 hidden sm:inline">
            Role: <strong className="text-[#181816] font-semibold">{roleProfile.name}</strong>
          </span>

          {currentRole === 'customer' && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10.5px] font-semibold">
              Restricted Client View: ZARA Sourcing
            </span>
          )}

          {lastRefreshedAt && <span className="text-stone-400 text-[10.5px]">Synced {lastRefreshedAt}</span>}
        </div>

        {/* State Simulator Switcher Controls */}
        <div className="flex items-center gap-1 bg-[#FAF7F0] border border-stone-200 rounded-lg p-0.5 text-[11px]">
          <span className="text-stone-400 font-medium px-1 hidden lg:inline">Mode:</span>
          <button
            onClick={() => {
              setApiStateMode('live')
              fetchLiveData()
            }}
            className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              apiStateMode === 'live' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Live API
          </button>
          <button
            onClick={() => setApiStateMode('demo')}
            className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              apiStateMode === 'demo' ? 'bg-amber-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Demo
          </button>
          <button
            onClick={() => setApiStateMode('empty')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              apiStateMode === 'empty' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Empty
          </button>
          <button
            onClick={() => setApiStateMode('error')}
            className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
              apiStateMode === 'error' ? 'bg-red-700 text-white shadow-xs' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Error
          </button>
        </div>
      </div>

      {/* ERROR FALLBACK ALERT */}
      {(apiStateMode === 'error' || (apiStateMode === 'live' && liveError)) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl shadow-xs flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <MaterialIcon name="error" size="md" color="#E05326" />
            <div>
              <strong className="text-red-900 font-semibold font-body">Backend Database Status:</strong>
              <p className="text-stone-700 text-[11px] mt-0.5 font-body">
                {liveError || 'FastAPI health check passed. PostgreSQL database probe returned HTTP 503 unavailable.'}
              </p>
            </div>
          </div>
          <Button variant="pop" size="xs" onClick={() => setApiStateMode('demo')}>
            Switch to Demo View
          </Button>
        </div>
      )}

      {/* 2. HIGH-DENSITY KPI STRIP (SPACE-EFFICIENT) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* KPI 1: Orders */}
        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[10.5px] uppercase font-semibold">
            <span>Production Orders</span>
            <MaterialIcon name="inventory_2" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#181816]">{metrics.totalOrders}</span>
            <span className="text-[10.5px] text-stone-500">
              {metrics.completedOrders} Done · {metrics.inProductionOrders} Active
            </span>
          </div>
          {metrics.delayedOrders > 0 && (
            <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.2 rounded font-medium inline-block">
              {metrics.delayedOrders} Attention Required
            </span>
          )}
        </div>

        {/* KPI 2: Meters Progress */}
        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[10.5px] uppercase font-semibold">
            <span>Fabric Output</span>
            <MaterialIcon name="straighten" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#0E4B3E]">{metrics.overallProgress}%</span>
            <span className="text-[10.5px] text-stone-500 truncate">
              {metrics.totalProducedMeters.toLocaleString()}m / {metrics.totalTargetMeters.toLocaleString()}m
            </span>
          </div>
          <Progress value={metrics.overallProgress} max={100} size="sm" color="primary" />
        </div>

        {/* KPI 3: Loom Utilization */}
        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[10.5px] uppercase font-semibold">
            <span>Loom Fleet Capacity</span>
            <MaterialIcon name="precision_manufacturing" size="xs" color="#15803D" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#15803D]">{metrics.utilizationRate}%</span>
            <span className="text-[10.5px] text-stone-500">
              {metrics.activeMachines}/{metrics.totalMachines} Looms Running
            </span>
          </div>
          <div className="text-[10px] text-stone-500">
            Spinning: 100% · Weaving: 80% · Dyeing: 100%
          </div>
        </div>

        {/* KPI 4: Yield Quality */}
        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-[10.5px] uppercase font-semibold">
            <span>First-Pass Yield</span>
            <MaterialIcon name="verified" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-[#181816]">{metrics.firstPassYield}%</span>
            <span className="text-[10.5px] text-emerald-800 font-semibold">Grade A Target</span>
          </div>
          <div className="text-[10px] text-stone-500">
            4-Point Inspection Standard
          </div>
        </div>
      </div>

      {/* 3. DUAL OPERATIONAL PANELS (ORDERS & MACHINES) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* ============================================================== */}
        {/* PANEL A: SEARCHABLE PRODUCTION ORDERS (COL-SPAN 7) */}
        {/* ============================================================== */}
        <div className="xl:col-span-7 bg-white border border-stone-200 rounded-xl shadow-xs p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-[#181816] flex items-center gap-1.5 font-body">
                <MaterialIcon name="list_alt" size="sm" color="#0E4B3E" />
                Production Orders
                <span className="text-xs font-mono font-normal text-stone-500">({filteredOrders.length})</span>
              </h2>
              <p className="text-[11px] text-stone-500 font-normal mt-0.5">
                Canonical order codes, routing progress &amp; details
              </p>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex border border-stone-200 rounded-lg overflow-hidden text-[11px] font-medium bg-stone-50 shrink-0">
              <button
                onClick={() => setOrderFilter('all')}
                className={`px-2.5 py-1 transition-colors cursor-pointer ${orderFilter === 'all' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setOrderFilter('In Production')}
                className={`px-2.5 py-1 border-l border-stone-200 transition-colors cursor-pointer ${orderFilter === 'In Production' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Active
              </button>
              <button
                onClick={() => setOrderFilter('Scheduled')}
                className={`px-2.5 py-1 border-l border-stone-200 transition-colors cursor-pointer ${orderFilter === 'Scheduled' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Plan
              </button>
              <button
                onClick={() => setOrderFilter('Completed')}
                className={`px-2.5 py-1 border-l border-stone-200 transition-colors cursor-pointer ${orderFilter === 'Completed' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Done
              </button>
              <button
                onClick={() => setOrderFilter('Disrupted')}
                className={`px-2.5 py-1 border-l border-stone-200 transition-colors cursor-pointer ${orderFilter === 'Disrupted' ? 'bg-red-700 text-white shadow-xs' : 'hover:bg-stone-200/60 text-red-800'}`}
              >
                Alert
              </button>
            </div>

            <Button
              variant="primary"
              size="xs"
              icon={<MaterialIcon name="add" size="xs" />}
              onClick={() => setIsCreateOrderOpen(true)}
            >
              + New Order
            </Button>
          </div>

          {/* Prominent Order Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Order ID (e.g. ETM-ORD-000001), Buyer, or Fabric..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-xs font-body bg-[#FAF7F0] border border-stone-200 rounded-lg shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-[#0E4B3E] focus:bg-white transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-stone-400">
              <MaterialIcon name="search" size="xs" />
            </span>
            {orderSearch && (
              <button
                onClick={() => setOrderSearch('')}
                className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-700 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="py-8 text-center text-stone-500 text-xs space-y-2 border border-dashed border-stone-200 rounded-xl font-body">
              <MaterialIcon name="search_off" size="lg" color="#A8A29E" />
              <div>No production orders match query &ldquo;{orderSearch}&rdquo;</div>
              <button
                onClick={() => {
                  setOrderSearch('')
                  setOrderFilter('all')
                }}
                className="text-[#0E4B3E] underline font-medium cursor-pointer"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-200 rounded-lg max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse font-body">
                <thead className="sticky top-0 bg-[#FAF7F0] border-b border-stone-200 text-stone-700 z-10 text-[11px]">
                  <tr>
                    <th className="py-2 px-2.5 font-semibold">Order ID</th>
                    <th className="py-2 px-2.5 font-semibold">Buyer</th>
                    <th className="py-2 px-2.5 font-semibold">Fabric Spec</th>
                    <th className="py-2 px-2.5 font-semibold">Progress (m)</th>
                    <th className="py-2 px-2.5 font-semibold">Status</th>
                    <th className="py-2 px-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredOrders.map((order) => {
                    const pct =
                      order.targetMeters > 0
                        ? Math.min(100, Math.round((order.producedMeters / order.targetMeters) * 100))
                        : 0
                    const isDisrupted = order.status === 'Delayed'

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-[#FAF7F0]/80 transition-colors ${
                          isDisrupted ? 'bg-red-50/40' : ''
                        }`}
                      >
                        <td className="py-2 px-2.5 align-middle">
                          <div className="font-bold text-[#0E4B3E] text-xs font-mono">{order.id}</div>
                          <div className="text-[10px] text-stone-400 font-mono">{formatLegacyOrderId(order.id)}</div>
                        </td>
                        <td className="py-2 px-2.5 align-middle font-medium text-stone-800 text-xs">
                          {order.buyer}
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <div className="font-medium text-stone-800 text-xs">{order.fabric}</div>
                          <div className="text-[10px] text-stone-500 capitalize">{order.stage} stage</div>
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-semibold text-stone-800">{order.producedMeters.toLocaleString()}/{order.targetMeters.toLocaleString()}m</span>
                            <span className="text-[10px] text-stone-500">({pct}%)</span>
                          </div>
                          <div className="w-20 bg-stone-200 rounded-full h-1.5 overflow-hidden mt-0.5">
                            <div
                              className={`h-full ${
                                order.status === 'Completed'
                                  ? 'bg-emerald-600'
                                  : isDisrupted
                                  ? 'bg-red-600'
                                  : 'bg-[#0E4B3E]'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              order.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : order.status === 'In Production'
                                ? 'bg-sky-100 text-sky-800 border-sky-300'
                                : isDisrupted
                                ? 'bg-red-100 text-red-800 border-red-300'
                                : 'bg-stone-100 text-stone-700 border-stone-300'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 align-middle text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Individual Resolve Action */}
                            {isDisrupted && permissions.canResolveOrder && (
                              <button
                                onClick={() => setResolveModalOrder(order)}
                                className="px-2 py-0.5 rounded bg-[#E05326] text-white border border-[#B83E18] text-[10px] font-semibold hover:bg-[#c7441a] transition-colors cursor-pointer shadow-2xs"
                                title="Inspect disruption resolution"
                              >
                                Resolve
                              </button>
                            )}

                            {/* Details popover trigger anchored to button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenOrderDetails(order, e.currentTarget.getBoundingClientRect())
                              }}
                              className="px-2 py-0.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 hover:text-black text-[10.5px] font-medium transition-colors cursor-pointer shadow-2xs"
                              title={`View details for ${order.id}`}
                            >
                              Details
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

        {/* ============================================================== */}
        {/* PANEL B: SEARCHABLE FACTORY MACHINES (COL-SPAN 5) */}
        {/* ============================================================== */}
        <div className="xl:col-span-5 bg-white border border-stone-200 rounded-xl shadow-xs p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-[#181816] flex items-center gap-1.5 font-body">
                <MaterialIcon name="precision_manufacturing" size="sm" color="#15803D" />
                Machine Floor Fleet
                <span className="text-xs font-mono font-normal text-stone-500">({filteredMachines.length})</span>
              </h2>
              <p className="text-[11px] text-stone-500 font-normal mt-0.5">
                Loom telemetry, capacity rates &amp; active assigned jobs
              </p>
            </div>

            {/* Division Filter */}
            <div className="flex border border-stone-200 rounded-lg overflow-hidden text-[11px] font-medium bg-stone-50 shrink-0">
              <button
                onClick={() => setMachineTypeFilter('all')}
                className={`px-2 py-1 transition-colors cursor-pointer ${machineTypeFilter === 'all' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setMachineTypeFilter('spinning')}
                className={`px-2 py-1 border-l border-stone-200 transition-colors cursor-pointer ${machineTypeFilter === 'spinning' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Spin
              </button>
              <button
                onClick={() => setMachineTypeFilter('weaving')}
                className={`px-2 py-1 border-l border-stone-200 transition-colors cursor-pointer ${machineTypeFilter === 'weaving' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Weave
              </button>
              <button
                onClick={() => setMachineTypeFilter('dyeing')}
                className={`px-2 py-1 border-l border-stone-200 transition-colors cursor-pointer ${machineTypeFilter === 'dyeing' ? 'bg-[#0E4B3E] text-white shadow-xs' : 'hover:bg-stone-200/60 text-stone-700'}`}
              >
                Dye
              </button>
            </div>
          </div>

          {/* Machine Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search Machine ID (e.g. WEAVE-03) or status..."
              value={machineSearch}
              onChange={(e) => setMachineSearch(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-xs font-body bg-[#FAF7F0] border border-stone-200 rounded-lg shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-[#0E4B3E] focus:bg-white transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-stone-400">
              <MaterialIcon name="search" size="xs" />
            </span>
            {machineSearch && (
              <button
                onClick={() => setMachineSearch('')}
                className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-700 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Machines Compact Grid / List */}
          {filteredMachines.length === 0 ? (
            <div className="py-8 text-center text-stone-500 text-xs space-y-1 border border-dashed border-stone-200 rounded-xl font-body">
              <MaterialIcon name="search_off" size="md" color="#A8A29E" />
              <div>No machine matches query &ldquo;{machineSearch}&rdquo;</div>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredMachines.map((machine) => (
                <div
                  key={machine.id}
                  className={`p-2.5 rounded-lg border border-stone-200 bg-white hover:border-stone-300 transition-all flex items-center justify-between text-xs font-body shadow-2xs ${
                    machine.status === 'Breakdown' ? 'border-red-300 bg-red-50/30 ring-1 ring-red-400' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-xs font-bold text-[#181816] font-mono">{machine.id}</strong>
                      <span className="text-[10px] text-stone-500 uppercase font-medium">({machine.type})</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9.5px] font-medium ${
                          machine.status === 'Running'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : machine.status === 'Breakdown'
                            ? 'bg-red-100 text-red-800 border border-red-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {machine.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-600 truncate mt-0.5 max-w-[240px]">
                      {machine.assignedJob}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-semibold text-[#0E4B3E] block font-mono">{machine.capacityRate}</span>
                    <span className="text-[10px] text-stone-400">
                      {machine.isActive ? 'Active Loom' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. DISRUPTION MITIGATION INSPECTION MODAL (PHASE 4) */}
      {resolveModalOrder && (
        <div className="fixed inset-0 bg-[#181816]/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-3.5 shadow-xl border border-stone-300">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#E05326] text-white flex items-center justify-center border border-[#B83E18] shadow-xs">
                  <MaterialIcon name="build" size="sm" color="#FFFFFF" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#181816]">Order Disruption Mitigation</h3>
                  <span className="font-mono text-xs text-[#0E4B3E] font-semibold">{resolveModalOrder.id}</span>
                </div>
              </div>
              <button
                onClick={() => setResolveModalOrder(null)}
                className="text-stone-400 hover:text-stone-700 font-bold p-1 cursor-pointer"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs font-body text-stone-700">
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg space-y-1">
                <strong className="text-red-900 block font-semibold">Incident Context:</strong>
                <p className="text-[11px] text-red-800">
                  Loom WEAVE-03 suffered a mechanical breakdown. Remaining 1,800m fabric weaving is currently halted.
                </p>
              </div>

              <div className="p-2.5 bg-[#FAF7F0] border border-stone-200 rounded-lg space-y-1.5">
                <strong className="text-[#0E4B3E] block font-semibold">Proposed Recovery Route:</strong>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 text-stone-700">
                  <li>Freeze 1,200m already woven on WEAVE-03 as passed inventory.</li>
                  <li>Re-allocate remaining 1,800m to available loom <strong className="font-mono">WEAVE-02</strong>.</li>
                  <li>Target delivery maintained within deadline window.</li>
                </ul>
              </div>

              {/* Honest disclosure of backend solver status */}
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-1 text-amber-900">
                <div className="flex items-center gap-1 font-semibold text-[11px]">
                  <MaterialIcon name="info" size="xs" color="#D97706" />
                  <span>Backend Solver Service: Integration Pending</span>
                </div>
                <p className="text-[10.5px] text-amber-800 leading-snug">
                  Automated CP-SAT re-scheduling requires the backend optimization endpoint (<code className="font-mono bg-white/70 px-1 py-0.2 rounded border border-amber-300">POST /schedules/optimize</code>). The FastAPI backend currently supports orders and downtimes, but automated mathematical re-solving is not yet deployed.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResolveModalOrder(null)}
                disabled={isResolving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmResolveOrder}
                disabled={isResolving}
                icon={
                  isResolving ? (
                    <MaterialIcon name="sync" size="xs" className="animate-spin" />
                  ) : (
                    <MaterialIcon name="check_circle" size="xs" />
                  )
                }
              >
                {isResolving ? 'Simulating Re-plan...' : 'Simulate Mitigation (Preview)'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Anchored Order Details Floating Popover */}
      {popoverOrder && popoverRect && (
        <OrderDetailsPopover
          order={popoverOrder}
          anchorRect={popoverRect}
          onClose={() => setPopoverOrder(null)}
        />
      )}

      {/* ORDER CREATION MODAL */}
      <OrderCreationModal
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
        onOrderCreated={fetchLiveData}
      />

      {/* FOOTER NOTE */}
      <footer className="pt-2 text-center font-mono text-[10px] text-stone-500">
        Everest Textile Mills · Operations Intelligence · Connected to {API_BASE_URL}
      </footer>
    </div>
  )
}

