'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, MaterialIcon, Badge } from '@/components/ui'
import { SpinningColumn, WeavingColumn, DyeingColumn } from './index'
import { OrderDetailsPopover, OrderDetailsData } from './OrderDetailsPopover'
import { api, BackendProductionRun, BackendOrder, BackendMachine } from '@/lib/api'
import { mockOrders } from '@/lib/mockData'
import type { Order, ProductionStage } from '@/types'

interface ProductionBoardProps {
  selectedOrder: string | null
  onOrderSelect: (orderId: string) => void
  onFilterStage?: (stage: string) => void
  onSelectDisruption: (type: 'breakdown' | 'yarn_delay') => void
  onSimulateDisruption?: () => void
  isResolved: boolean
  disruptionText?: string
}

type FloorStatusFilter = 'all' | 'running' | 'planned' | 'ready' | 'paused' | 'completed' | 'blocked'

export function ProductionBoard({
  selectedOrder,
  onOrderSelect,
  onSelectDisruption,
  onSimulateDisruption,
  isResolved,
  disruptionText = '1 Breakdown (WEAVE-03)',
}: ProductionBoardProps) {
  const [popoverOrder, setPopoverOrder] = useState<OrderDetailsData | null>(null)
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null)

  // Live Backend Data
  const [runs, setRuns] = useState<BackendProductionRun[]>([])
  const [orders, setOrders] = useState<BackendOrder[]>([])
  const [machines, setMachines] = useState<BackendMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<FloorStatusFilter>('all')

  const fetchFloorData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const [runsData, ordersData, machinesData] = await Promise.all([
        api.getProductionRuns().catch(() => [] as BackendProductionRun[]),
        api.getOrders().catch(() => [] as BackendOrder[]),
        api.getMachines().catch(() => [] as BackendMachine[]),
      ])

      setRuns(runsData)
      setOrders(ordersData)
      setMachines(machinesData)
    } catch (err: unknown) {
      console.error('Failed to fetch floor data from PostgreSQL:', err)
      setError((err as Error).message || 'Failed to sync with PostgreSQL production floor.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial fetch and automatic polling interval (every 5 seconds) with cleanup
  useEffect(() => {
    fetchFloorData()

    const interval = setInterval(() => {
      fetchFloorData(true)
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchFloorData])

  // Map Backend Data into Stage-Specific Order Cards
  const { spinningOrders, weavingOrders, dyeingOrders, machineCounts } = useMemo(() => {
    // Count machines by type
    const spinMachines = machines.filter(m => m.machine_type.toLowerCase() === 'spinning')
    const weaveMachines = machines.filter(m => m.machine_type.toLowerCase() === 'weaving')
    const dyeMachines = machines.filter(m => m.machine_type.toLowerCase() === 'dyeing' || m.machine_type.toLowerCase().includes('dye'))

    const counts = {
      spinning: spinMachines.length || 3,
      weaving: weaveMachines.length || 5,
      dyeing: dyeMachines.length || 2,
    }

    // If no backend runs or orders exist yet, fall back gracefully to mockOrders
    if (runs.length === 0 && orders.length === 0) {
      const spin = mockOrders.filter(o => 
        o.currentStage === 'spinning' || (o.status === 'not_started' && o.eligible.spinning.length > 0)
      )
      const weave = mockOrders.filter(o => 
        o.currentStage === 'weaving' || (o.status === 'spinning' && o.id !== 'ORD-001' && o.id !== 'ORD-003' && o.id !== 'ORD-005')
      )
      const dye = mockOrders.filter(o => o.currentStage === 'dyeing' || o.currentStage === 'inspection')
      return { spinningOrders: spin, weavingOrders: weave, dyeingOrders: dye, machineCounts: counts }
    }

    // Convert PostgreSQL Runs to UI Order Cards
    const runOrderMap = new Map<number, BackendOrder>()
    orders.forEach(o => runOrderMap.set(o.id, o))

    // Build items from active and planned runs
    const allFloorItems: Order[] = []

    // 1. Process all Production Runs
    for (const r of runs) {
      const ord = runOrderMap.get(r.order_id)
      const targetM = Number(r.target_metres || ord?.quantity_metres || 0)
      const producedM = Number(r.output_metres || 0)
      const pct = targetM > 0 ? Math.min(100, Math.round((producedM / targetM) * 100)) : (r.status === 'running' ? 30 : r.status === 'completed' ? 100 : 0)
      const stage = (r.stage || 'spinning').toLowerCase() as ProductionStage
      const code = ord?.order_code || `ORD-${String(r.order_id).padStart(3, '0')}`

      const floorItem: Order = {
        id: code,
        buyer: r.buyer_name || ord?.buyer_name || 'Customer Account',
        fabric: r.fabric_type || ord?.fabric_type || 'Cotton',
        colour: r.colour || ord?.colour || 'Standard',
        metres: targetM,
        due: ord?.deadline ? Math.max(0, Math.round((new Date(ord.deadline).getTime() - Date.now()) / 60000)) : 180,
        priorityWeight: ord?.priority === 'urgent' ? 95 : ord?.priority === 'high' ? 80 : 50,
        yarnReady: 1,
        eligible: {
          spinning: [r.machine_code || 'SPIN-01'],
          weaving: [r.machine_code || 'WEAVE-01'],
          dyeing: [r.machine_code || 'DYE-01'],
        },
        status: r.status === 'running' ? stage : r.status === 'completed' ? 'inspection' : 'not_started',
        currentStage: stage,
        progress: pct,
        assignedMachine: r.machine_code || undefined,
      }
      allFloorItems.push(floorItem)
    }

    // 2. Add queued/planned Orders that do not yet have an active run
    const ordersWithRuns = new Set(runs.map(r => r.order_id))
    for (const ord of orders) {
      if (!ordersWithRuns.has(ord.id)) {
        const stage = (ord.current_stage || 'spinning').toLowerCase() as ProductionStage
        const code = ord.order_code || `ORD-${String(ord.id).padStart(3, '0')}`
        const targetM = Number(ord.quantity_metres || 0)
        const producedM = Number(ord.produced_metres || 0)
        const pct = targetM > 0 ? Math.min(100, Math.round((producedM / targetM) * 100)) : 0

        const floorItem: Order = {
          id: code,
          buyer: ord.buyer_name || 'Direct Buyer',
          fabric: ord.fabric_type,
          colour: ord.colour,
          metres: targetM,
          due: ord.deadline ? Math.max(0, Math.round((new Date(ord.deadline).getTime() - Date.now()) / 60000)) : 240,
          priorityWeight: ord.priority === 'urgent' ? 95 : ord.priority === 'high' ? 80 : 50,
          yarnReady: 1,
          eligible: {
            spinning: ['SPIN-01', 'SPIN-02'],
            weaving: ['WEAVE-01', 'WEAVE-02'],
            dyeing: ['DYE-01'],
          },
          status: 'not_started',
          currentStage: stage,
          progress: pct,
          assignedMachine: undefined,
        }
        allFloorItems.push(floorItem)
      }
    }

    // Apply floor status filter
    const filterFn = (item: Order) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'running') return item.status === item.currentStage && (item.progress ?? 0) > 0
      if (statusFilter === 'planned') return item.status === 'not_started'
      if (statusFilter === 'ready') return item.yarnReady === 1
      if (statusFilter === 'completed') return item.progress === 100 || item.status === 'inspection'
      if (statusFilter === 'blocked') return item.id === 'ORD-004' && !isResolved
      if (statusFilter === 'paused') return false
      return true
    }

    const filtered = allFloorItems.filter(filterFn)

    const spin = filtered.filter(o => o.currentStage === 'spinning')
    const weave = filtered.filter(o => o.currentStage === 'weaving')
    const dye = filtered.filter(o => o.currentStage === 'dyeing' || o.currentStage === 'inspection')

    return { spinningOrders: spin, weavingOrders: weave, dyeingOrders: dye, machineCounts: counts }
  }, [runs, orders, machines, statusFilter, isResolved])

  const handleOpenDetails = useCallback((order: Order, rect: DOMRect) => {
    const targetM = order.metres || 0
    const progressVal = order.progress ?? (order.status === 'spinning' ? 45 : 0)
    const producedM =
      order.progress !== undefined
        ? Math.round((targetM * order.progress) / 100)
        : order.status === 'spinning'
        ? Math.round((targetM * 45) / 100)
        : 0

    setPopoverOrder({
      id: order.id,
      buyer: order.buyer,
      fabric: order.fabric,
      colour: order.colour,
      metres: targetM,
      targetMeters: targetM,
      producedMeters: producedM,
      progress: progressVal,
      due: order.due,
      deadline: `t = ${order.due}m`,
      assignedMachine:
        order.assignedMachine ||
        (order.currentStage && order.currentStage in order.eligible
          ? order.eligible[order.currentStage as 'spinning' | 'weaving' | 'dyeing']?.[0]
          : undefined),
      status:
        order.id === 'ORD-004' && !isResolved
          ? 'Breakdown'
          : order.currentStage === 'inspection'
          ? 'Completed'
          : order.status === 'spinning'
          ? 'In Production'
          : 'Active',
      priority: order.id === 'ORD-004' ? 'P0 Critical' : 'P1 High',
      disruptionNote:
        order.id === 'ORD-004' && !isResolved
          ? 'Mechanical collision halted weaving on WEAVE-03. 1,200m woven passed, 1,800m remaining halted.'
          : undefined,
    })
    setPopoverRect(rect)
  }, [isResolved])

  const handleCloseDetails = useCallback(() => {
    setPopoverOrder(null)
    setPopoverRect(null)
  }, [])

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#F5F0E3] overflow-hidden">
      {/* Floor Operational Toolbar */}
      <div className="min-h-12 px-4 py-2.5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0E4B3E]" />
            <h1 className="text-sm font-bold text-[#181816] tracking-tight">Production Floor Pipeline</h1>
            <Badge variant="metric" size="xs" className="bg-[#FAF7F0] border border-stone-200 text-stone-700">
              Live PostgreSQL
            </Badge>
          </div>

          {/* Machine breakdown alert badge beside affected orders */}
          {!isResolved && (
            <Button
              variant="outline"
              size="xs"
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 font-medium text-[11px] shadow-xs"
              icon={<span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />}
              onClick={() => onSelectDisruption('breakdown')}
              title="Inspect WEAVE-03 collision & machine state"
            >
              {disruptionText}
            </Button>
          )}

          {/* Status Filter Tabs */}
          <div className="flex border border-stone-200 rounded-lg overflow-hidden text-[11px] font-medium bg-stone-50">
            {(['all', 'running', 'planned', 'ready', 'completed', 'blocked'] as FloorStatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1 capitalize transition-colors cursor-pointer ${
                  statusFilter === f
                    ? 'bg-[#0E4B3E] text-white shadow-xs font-semibold'
                    : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => fetchFloorData(false)}
            disabled={loading || refreshing}
            className="text-xs font-medium text-stone-700 bg-white hover:bg-stone-50"
            icon={
              <MaterialIcon
                name="refresh"
                size="xs"
                className={refreshing || loading ? 'animate-spin' : ''}
              />
            }
          >
            {refreshing ? 'Syncing...' : 'Refresh Floor'}
          </Button>

          {onSimulateDisruption && (
            <Button
              variant="pop"
              size="sm"
              icon={<MaterialIcon name="warning" size="xs" color="#E05326" />}
              onClick={onSimulateDisruption}
              className="text-xs font-semibold"
              title="Simulate machine breakdown or delayed yarn"
            >
              Simulate Disruption
            </Button>
          )}
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="mx-4 mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs font-mono flex items-center justify-between">
          <span>Failed to sync with backend: {error}</span>
          <button
            onClick={() => fetchFloorData(false)}
            className="text-red-700 underline font-bold hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Production floor board columns: Full-width responsive 3-stage pipeline */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4">
        <SpinningColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          onOpenDetails={handleOpenDetails}
          orders={spinningOrders}
          loading={loading}
          machineCount={machineCounts.spinning}
        />
        <WeavingColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          isResolved={isResolved}
          onOpenDetails={handleOpenDetails}
          orders={weavingOrders}
          loading={loading}
          machineCount={machineCounts.weaving}
        />
        <DyeingColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          onOpenDetails={handleOpenDetails}
          orders={dyeingOrders}
          loading={loading}
          machineCount={machineCounts.dyeing}
        />
      </div>

      {/* Anchored Order Details Floating Popover */}
      {popoverOrder && popoverRect && (
        <OrderDetailsPopover
          order={popoverOrder}
          anchorRect={popoverRect}
          onClose={handleCloseDetails}
        />
      )}
    </main>
  )
}