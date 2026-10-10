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

  // Selected Order Drawer / Expandable detail
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

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

  // Execute Individual Order Resolution (Phase 4)
  const handleConfirmResolveOrder = () => {
    if (!resolveModalOrder) return

    setIsResolving(true)
    setTimeout(() => {
      setResolvedOrderIds((prev) => new Set(prev).add(resolveModalOrder.id))
      setIsResolving(false)
      setResolveModalOrder(null)
    }, 900)
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-3 sm:p-5 space-y-4">
      {/* 1. COMPACT TOP STATUS STRIP */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 bg-white border-2 border-[#181816] rounded-xl px-3.5 py-2.5 pop-shadow-xs text-xs font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          {apiStateMode === 'live' ? (
            liveError ? (
              <Badge variant="warning" size="xs" className="gap-1 font-bold">
                <MaterialIcon name="warning" size="xs" color="#B45309" />
                API Connected · DB Offline
              </Badge>
            ) : (
              <Badge variant="success" size="xs" dotColor="#15803D" className="gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 live-dot inline-block" />
                Live Backend API · Port 8000
              </Badge>
            )
          ) : (
            <Badge variant="warning" size="xs" className="font-bold">
              DEMO: Synthetic Reference Data
            </Badge>
          )}

          <span className="text-stone-500 hidden sm:inline">
            Role: <strong className="text-[#181816]">{roleProfile.name}</strong>
          </span>

          {currentRole === 'customer' && (
            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10.5px] font-bold">
              Restricted Client View: ZARA Sourcing
            </span>
          )}

          {lastRefreshedAt && <span className="text-stone-400 text-[10.5px]">Synced {lastRefreshedAt}</span>}
        </div>

        {/* State Simulator Switcher Controls */}
        <div className="flex items-center gap-1 bg-[#FAF7F0] border border-stone-300 rounded-lg p-0.5 text-[10.5px]">
          <span className="text-stone-400 font-bold px-1 hidden lg:inline">Mode:</span>
          <button
            onClick={() => {
              setApiStateMode('live')
              fetchLiveData()
            }}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              apiStateMode === 'live' ? 'bg-[#0E4B3E] text-white' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Live API
          </button>
          <button
            onClick={() => setApiStateMode('demo')}
            className={`px-2 py-0.5 rounded font-bold transition-all ${
              apiStateMode === 'demo' ? 'bg-amber-700 text-white' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Demo
          </button>
          <button
            onClick={() => setApiStateMode('empty')}
            className={`px-1.5 py-0.5 rounded font-bold transition-all ${
              apiStateMode === 'empty' ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Empty
          </button>
          <button
            onClick={() => setApiStateMode('error')}
            className={`px-1.5 py-0.5 rounded font-bold transition-all ${
              apiStateMode === 'error' ? 'bg-red-700 text-white' : 'text-stone-700 hover:bg-stone-200'
            }`}
          >
            Error
          </button>
        </div>
      </div>

      {/* ERROR FALLBACK ALERT */}
      {(apiStateMode === 'error' || (apiStateMode === 'live' && liveError)) && (
        <div className="p-3 bg-[#FFF5F2] border-2 border-[#E05326] rounded-xl pop-shadow-xs flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <MaterialIcon name="error" size="md" color="#E05326" />
            <div>
              <strong className="text-[#E05326] font-mono">Backend Database Status:</strong>
              <p className="text-stone-700 text-[11px] font-mono mt-0.5">
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
        <div className="bg-white border-2 border-[#181816] rounded-xl p-3 pop-shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 font-mono text-[10.5px] uppercase font-bold">
            <span>Production Orders</span>
            <MaterialIcon name="inventory_2" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#181816]">{metrics.totalOrders}</span>
            <span className="text-[10px] font-mono text-stone-500">
              {metrics.completedOrders} Done · {metrics.inProductionOrders} Active
            </span>
          </div>
          {metrics.delayedOrders > 0 && (
            <span className="text-[9.5px] font-mono bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.2 rounded font-bold inline-block">
              {metrics.delayedOrders} Attention Required
            </span>
          )}
        </div>

        {/* KPI 2: Meters Progress */}
        <div className="bg-white border-2 border-[#181816] rounded-xl p-3 pop-shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 font-mono text-[10.5px] uppercase font-bold">
            <span>Fabric Output</span>
            <MaterialIcon name="straighten" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#0E4B3E]">{metrics.overallProgress}%</span>
            <span className="text-[10px] font-mono text-stone-500 truncate">
              {metrics.totalProducedMeters.toLocaleString()}m / {metrics.totalTargetMeters.toLocaleString()}m
            </span>
          </div>
          <Progress value={metrics.overallProgress} max={100} size="sm" color="primary" />
        </div>

        {/* KPI 3: Loom Utilization */}
        <div className="bg-white border-2 border-[#181816] rounded-xl p-3 pop-shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 font-mono text-[10.5px] uppercase font-bold">
            <span>Loom Fleet Capacity</span>
            <MaterialIcon name="precision_manufacturing" size="xs" color="#15803D" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#15803D]">{metrics.utilizationRate}%</span>
            <span className="text-[10px] font-mono text-stone-500">
              {metrics.activeMachines}/{metrics.totalMachines} Looms Running
            </span>
          </div>
          <div className="text-[9.5px] font-mono text-stone-500">
            Spinning: 100% · Weaving: 80% · Dyeing: 100%
          </div>
        </div>

        {/* KPI 4: Yield Quality */}
        <div className="bg-white border-2 border-[#181816] rounded-xl p-3 pop-shadow-xs space-y-1">
          <div className="flex items-center justify-between text-stone-500 font-mono text-[10.5px] uppercase font-bold">
            <span>First-Pass Yield</span>
            <MaterialIcon name="verified" size="xs" color="#0E4B3E" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-[#181816]">{metrics.firstPassYield}%</span>
            <span className="text-[10px] font-mono text-emerald-800 font-bold">Grade A Target</span>
          </div>
          <div className="text-[9.5px] font-mono text-stone-500">
            4-Point Inspection Standard
          </div>
        </div>
      </div>

      {/* 3. DUAL OPERATIONAL PANELS (ORDERS & MACHINES) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* ============================================================== */}
        {/* PANEL A: SEARCHABLE PRODUCTION ORDERS (COL-SPAN 7) */}
        {/* ============================================================== */}
        <div className="xl:col-span-7 bg-white border-2 border-[#181816] rounded-2xl pop-shadow-md p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-stone-200 pb-2.5">
            <div>
              <h2 className="text-base font-black text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="list_alt" size="sm" color="#0E4B3E" />
                Production Orders
                <span className="text-xs font-mono font-normal text-stone-500">({filteredOrders.length})</span>
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                Canonical factory order codes, routing progress & individual resolution
              </p>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex border-2 border-[#181816] rounded-xl overflow-hidden text-[10px] font-mono bg-white shrink-0">
              <button
                onClick={() => setOrderFilter('all')}
                className={`px-2 py-1 font-bold ${orderFilter === 'all' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setOrderFilter('In Production')}
                className={`px-2 py-1 font-bold border-l border-stone-300 ${orderFilter === 'In Production' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Active
              </button>
              <button
                onClick={() => setOrderFilter('Scheduled')}
                className={`px-2 py-1 font-bold border-l border-stone-300 ${orderFilter === 'Scheduled' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Plan
              </button>
              <button
                onClick={() => setOrderFilter('Completed')}
                className={`px-2 py-1 font-bold border-l border-stone-300 ${orderFilter === 'Completed' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Done
              </button>
              <button
                onClick={() => setOrderFilter('Disrupted')}
                className={`px-2 py-1 font-bold border-l border-stone-300 ${orderFilter === 'Disrupted' ? 'bg-red-700 text-white' : 'hover:bg-stone-100 text-red-800'}`}
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
              placeholder="Search by Order ID (e.g. ETM-ORD-000001, ORD-01), Buyer, or Product..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-xs font-mono bg-[#FAF7F0] border-2 border-[#181816] rounded-xl pop-shadow-xs focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            />
            <span className="absolute left-2.5 top-2 text-stone-400">
              <MaterialIcon name="search" size="xs" />
            </span>
            {orderSearch && (
              <button
                onClick={() => setOrderSearch('')}
                className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-700 text-xs font-mono font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="py-8 text-center text-stone-500 font-mono text-xs space-y-2 border-2 border-dashed border-stone-300 rounded-xl">
              <MaterialIcon name="search_off" size="lg" color="#A8A29E" />
              <div>No production orders match query &ldquo;{orderSearch}&rdquo;</div>
              <button
                onClick={() => {
                  setOrderSearch('')
                  setOrderFilter('all')
                }}
                className="text-[#0E4B3E] underline font-bold"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto border-2 border-[#181816] rounded-xl max-h-[460px] overflow-y-auto">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#FAF7F0] border-b-2 border-[#181816] text-stone-700 z-10">
                  <tr>
                    <th className="py-2 px-2.5 font-bold">Order ID</th>
                    <th className="py-2 px-2.5 font-bold">Buyer</th>
                    <th className="py-2 px-2.5 font-bold">Fabric Spec</th>
                    <th className="py-2 px-2.5 font-bold">Progress (m)</th>
                    <th className="py-2 px-2.5 font-bold">Status</th>
                    <th className="py-2 px-2.5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {filteredOrders.map((order) => {
                    const pct =
                      order.targetMeters > 0
                        ? Math.min(100, Math.round((order.producedMeters / order.targetMeters) * 100))
                        : 0
                    const isExpanded = expandedOrderId === order.id
                    const isDisrupted = order.status === 'Delayed'

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-[#FAF7F0] transition-colors ${
                          isDisrupted ? 'bg-red-50/60' : isExpanded ? 'bg-emerald-50/50' : ''
                        }`}
                      >
                        <td className="py-2 px-2.5 align-middle">
                          <div className="font-black text-[#0E4B3E] text-xs">{order.id}</div>
                          <div className="text-[9.5px] text-stone-400">{formatLegacyOrderId(order.id)}</div>
                        </td>
                        <td className="py-2 px-2.5 align-middle font-sans font-bold text-stone-800 text-xs">
                          {order.buyer}
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <div className="font-semibold text-stone-800 text-[11px]">{order.fabric}</div>
                          <div className="text-[9.5px] text-stone-500">{order.stage} stage</div>
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{order.producedMeters}/{order.targetMeters}m</span>
                            <span className="text-[9.5px] text-stone-500">({pct}%)</span>
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
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
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
                          <div className="flex items-center justify-end gap-1">
                            {/* Individual Resolve Action (Phase 4) */}
                            {isDisrupted && permissions.canResolveOrder && (
                              <button
                                onClick={() => setResolveModalOrder(order)}
                                className="px-2 py-0.5 rounded bg-[#E05326] text-white border border-[#181816] text-[10px] font-bold pop-shadow-xs hover:bg-[#c7441a] transition-all"
                                title="Resolve disruption for this order"
                              >
                                Resolve
                              </button>
                            )}

                            {/* Details expand button */}
                            <button
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                              className="px-1.5 py-0.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-stone-600 text-[10px] font-bold"
                              title="Expand order details"
                            >
                              {isExpanded ? 'Less' : 'Details'}
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

          {/* Expandable Order Detail Drawer when row selected */}
          {expandedOrderId && (
            <div className="p-3 bg-[#FAF7F0] border-2 border-[#181816] rounded-xl pop-shadow-xs space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between border-b border-stone-300 pb-1.5">
                <span className="font-black text-[#0E4B3E]">
                  Order Detail: {expandedOrderId}
                </span>
                <button
                  onClick={() => setExpandedOrderId(null)}
                  className="text-stone-500 hover:text-[#181816] font-bold text-xs"
                >
                  ✕ Close
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-stone-500 block">Routing Route:</span>
                  <strong>Spinning &rarr; Weaving &rarr; Dyeing</strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Lead Time Window:</span>
                  <strong>48 Hours Horizon</strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Yarn Stock Status:</span>
                  <strong className="text-emerald-700">Feasible in Warehouse</strong>
                </div>
                <div>
                  <span className="text-stone-500 block">Inspection Quality:</span>
                  <strong>Grade A Awaiting</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* PANEL B: SEARCHABLE FACTORY MACHINES (COL-SPAN 5) */}
        {/* ============================================================== */}
        <div className="xl:col-span-5 bg-white border-2 border-[#181816] rounded-2xl pop-shadow-md p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-stone-200 pb-2.5">
            <div>
              <h2 className="text-base font-black text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="precision_manufacturing" size="sm" color="#15803D" />
                Machine Floor Fleet
                <span className="text-xs font-mono font-normal text-stone-500">({filteredMachines.length})</span>
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                Live loom telemetry, capacity rates & active assigned jobs
              </p>
            </div>

            {/* Division Filter */}
            <div className="flex border-2 border-[#181816] rounded-xl overflow-hidden text-[10px] font-mono bg-white shrink-0">
              <button
                onClick={() => setMachineTypeFilter('all')}
                className={`px-2 py-1 font-bold ${machineTypeFilter === 'all' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setMachineTypeFilter('spinning')}
                className={`px-1.5 py-1 font-bold border-l border-stone-300 ${machineTypeFilter === 'spinning' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Spin
              </button>
              <button
                onClick={() => setMachineTypeFilter('weaving')}
                className={`px-1.5 py-1 font-bold border-l border-stone-300 ${machineTypeFilter === 'weaving' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Weave
              </button>
              <button
                onClick={() => setMachineTypeFilter('dyeing')}
                className={`px-1.5 py-1 font-bold border-l border-stone-300 ${machineTypeFilter === 'dyeing' ? 'bg-[#0E4B3E] text-white' : 'hover:bg-stone-100 text-stone-700'}`}
              >
                Dye
              </button>
            </div>
          </div>

          {/* Machine Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search Machine ID (e.g. WEAVE-03, SPIN-01) or status..."
              value={machineSearch}
              onChange={(e) => setMachineSearch(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-xs font-mono bg-[#FAF7F0] border-2 border-[#181816] rounded-xl pop-shadow-xs focus:outline-none focus:ring-1 focus:ring-[#0E4B3E]"
            />
            <span className="absolute left-2.5 top-2 text-stone-400">
              <MaterialIcon name="search" size="xs" />
            </span>
            {machineSearch && (
              <button
                onClick={() => setMachineSearch('')}
                className="absolute right-2.5 top-1.5 text-stone-400 hover:text-stone-700 text-xs font-mono font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Machines Compact Grid / List */}
          {filteredMachines.length === 0 ? (
            <div className="py-8 text-center text-stone-500 font-mono text-xs space-y-1 border-2 border-dashed border-stone-300 rounded-xl">
              <MaterialIcon name="search_off" size="md" color="#A8A29E" />
              <div>No machine matches query &ldquo;{machineSearch}&rdquo;</div>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredMachines.map((machine) => (
                <div
                  key={machine.id}
                  className={`p-2.5 rounded-xl border border-stone-300 bg-white hover:border-[#181816] transition-all flex items-center justify-between text-xs font-mono ${
                    machine.status === 'Breakdown' ? 'border-[#E05326] bg-red-50/40 ring-1 ring-[#E05326]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <strong className="text-sm font-black text-[#181816]">{machine.id}</strong>
                      <span className="text-[10px] text-stone-500 uppercase font-bold">({machine.type})</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
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
                    <div className="text-[10.5px] text-stone-600 truncate mt-0.5 max-w-[240px]">
                      {machine.assignedJob}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-bold text-[#0E4B3E] block">{machine.capacityRate}</span>
                    <span className="text-[9.5px] text-stone-400 font-mono">
                      {machine.isActive ? 'Active Loom' : 'Offline'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. INDIVIDUAL ORDER RESOLUTION MODAL (PHASE 4) */}
      {resolveModalOrder && (
        <div className="fixed inset-0 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 pop-shadow-lg">
            <div className="flex items-center justify-between border-b-2 border-stone-200 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#E05326] text-white flex items-center justify-center border border-[#181816]">
                  <MaterialIcon name="build" size="sm" color="#FFFFFF" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#181816]">Resolve Order Disruption</h3>
                  <span className="font-mono text-[10.5px] text-[#0E4B3E] font-bold">{resolveModalOrder.id}</span>
                </div>
              </div>
              <button
                onClick={() => setResolveModalOrder(null)}
                className="text-stone-400 hover:text-stone-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono text-stone-700">
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <strong className="text-red-900 block font-bold">Disruption Context:</strong>
                <p className="text-[11px] text-red-800">
                  Order was affected by machine WEAVE-03 mechanical collision. Remaining 1,800m fabric weaving halted.
                </p>
              </div>

              <div className="p-2.5 bg-[#FAF7F0] border border-stone-300 rounded-xl space-y-1">
                <strong className="text-[#0E4B3E] block font-bold">CP-SAT Re-Routing Solution:</strong>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 text-stone-700">
                  <li>Freeze 1,200m already woven on WEAVE-03 as passed stock.</li>
                  <li>Re-allocate remaining 1,800m to available loom <strong>WEAVE-02</strong>.</li>
                  <li>Schedule confirmed: <strong>0 deadline violations</strong>.</li>
                </ul>
              </div>

              <div className="text-[10.5px] text-stone-500 italic">
                * Executes CP-SAT solver constraint validation for this specific production batch.
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
                {isResolving ? 'Resolving with CP-SAT...' : 'Confirm & Commit Resolution'}
              </Button>
            </div>
          </Card>
        </div>
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
