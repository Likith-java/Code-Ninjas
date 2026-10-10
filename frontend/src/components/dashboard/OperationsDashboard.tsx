'use client'

import { useState, useMemo } from 'react'
import { Card, Button, Badge, MaterialIcon, Progress } from '@/components/ui'
import { dashboardDemoData } from '@/lib/dashboardDemoData'
import { ApiStateMode, DashboardOrder } from '@/types/operations'

export function OperationsDashboard() {
  const [apiStateMode, setApiStateMode] = useState<ApiStateMode>('demo')
  const [orderSearch, setOrderSearch] = useState('')
  const [orderFilter, setOrderFilter] = useState<'all' | 'In Production' | 'Completed' | 'Scheduled'>('all')
  const [selectedMachineGroup, setSelectedMachineGroup] = useState<string | null>(null)

  const { metrics, machineGroups, shifts } = dashboardDemoData

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (apiStateMode === 'empty') return []
    return dashboardDemoData.orders.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.buyer.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.fabric.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.articleCode.toLowerCase().includes(orderSearch.toLowerCase())
      const matchesStatus = orderFilter === 'all' || order.status === orderFilter
      return matchesSearch && matchesStatus
    })
  }, [orderSearch, orderFilter, apiStateMode])

  // Progress metrics
  const totalTarget = metrics.totalTargetMeters
  const totalProduced = metrics.totalProducedMeters
  const overallRate =
    totalTarget > 0 ? Math.min(100, Math.round((totalProduced / totalTarget) * 100)) : 0

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 lg:p-6 space-y-6">
      {/* Top Banner / Synthetic Demo Notice */}
      <div className="rounded-2xl border-2 border-[#181816] bg-[#FFFBEB] p-4 pop-shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white border-2 border-[#181816] pop-shadow-xs flex items-center justify-center shrink-0">
            <MaterialIcon name="warning" size="md" color="#FFFFFF" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black tracking-wider uppercase bg-amber-200 text-amber-900 border border-[#181816] px-2 py-0.5 rounded-full">
                {dashboardDemoData.label}
              </span>
              <span className="font-mono text-[11px] text-amber-800 font-bold hidden sm:inline">
                API Endpoint: /api/v1/factory/overview (Stubbed)
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-900/90 font-medium">
              {dashboardDemoData.disclaimer}
            </p>
          </div>
        </div>

        {/* State Simulator Controls */}
        <div className="flex items-center gap-1.5 self-end md:self-center bg-white border-2 border-[#181816] p-1 rounded-xl pop-shadow-xs text-[11px] font-mono shrink-0">
          <span className="text-[10px] text-stone-500 font-bold px-1.5 hidden xl:inline">
            Simulate API State:
          </span>
          <button
            onClick={() => setApiStateMode('demo')}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
              apiStateMode === 'demo'
                ? 'bg-[#0E4B3E] text-white border border-[#181816]'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
            title="Default realistic demo data"
          >
            Live Demo
          </button>
          <button
            onClick={() => setApiStateMode('loading')}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
              apiStateMode === 'loading'
                ? 'bg-blue-600 text-white border border-[#181816]'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
            title="Simulate loading skeleton"
          >
            Loading State
          </button>
          <button
            onClick={() => setApiStateMode('empty')}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
              apiStateMode === 'empty'
                ? 'bg-amber-600 text-white border border-[#181816]'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
            title="Simulate empty orders list"
          >
            Empty State
          </button>
          <button
            onClick={() => setApiStateMode('error')}
            className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
              apiStateMode === 'error'
                ? 'bg-red-600 text-white border border-[#181816]'
                : 'text-stone-700 hover:bg-stone-100'
            }`}
            title="Simulate backend API error"
          >
            Error State
          </button>
        </div>
      </div>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#181816]/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold tracking-widest text-[#0E4B3E] uppercase">
              Executive Overview · Unit 1 Plant
            </span>
            <Badge variant="success" size="xs" dotColor="#15803D">
              Shift B Active
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#181816] tracking-tight">
            Operations & Manufacturing Dashboard
          </h1>
          <p className="text-xs text-stone-600 font-medium">
            Owner-facing production telemetry, progress metrics, machine utilization, and batch orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white border-2 border-[#181816] rounded-xl px-3 py-1.5 pop-shadow-xs font-mono text-xs font-bold">
            <span className="text-stone-500">Plant Horizon:</span> 7 Days · 10,080m
          </div>
          <div className="bg-[#D7F4E5] border-2 border-[#181816] text-[#0B382F] rounded-xl px-3 py-1.5 pop-shadow-xs font-mono text-xs font-bold">
            <span className="text-stone-600">Yield:</span> {metrics.firstPassYield}%
          </div>
        </div>
      </div>

      {/* API ERROR STATE VIEW */}
      {apiStateMode === 'error' && (
        <Card variant="disruption" padding="lg" className="border-4 border-[#E05326] bg-[#FFF5F2] pop-shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#E05326] text-white border-2 border-[#181816] pop-shadow-xs flex items-center justify-center shrink-0">
                <MaterialIcon name="error" size="lg" color="#FFFFFF" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" size="sm" className="bg-[#E05326] text-white">
                    HTTP 503 · Service Unavailable
                  </Badge>
                  <span className="font-mono text-xs font-bold text-[#E05326]">
                    Backend API Not Ready
                  </span>
                </div>
                <h2 className="text-lg font-black text-[#181816] mt-1">
                  Unable to fetch live factory metrics from backend
                </h2>
                <p className="text-xs text-stone-700 mt-1 max-w-2xl">
                  The client attempted to query <code className="bg-white px-1.5 py-0.5 rounded border border-[#181816] font-mono text-[11px]">GET http://localhost:8000/api/v1/factory/overview</code>, but the FastAPI backend service has not yet provisioned this telemetry endpoint.
                </p>
              </div>
            </div>
            <Button
              variant="pop"
              size="md"
              icon={<MaterialIcon name="refresh" size="sm" color="#0E4B3E" />}
              onClick={() => setApiStateMode('demo')}
            >
              Restore Demo Mode
            </Button>
          </div>
        </Card>
      )}

      {/* LOADING SKELETON STATE VIEW */}
      {apiStateMode === 'loading' && (
        <div className="space-y-6 animate-pulse">
          <div className="bg-blue-50 border-2 border-blue-400 rounded-2xl p-4 text-blue-900 flex items-center gap-3 font-mono text-xs">
            <MaterialIcon name="sync" size="md" className="animate-spin" color="#2563EB" />
            <span>Fetching factory telemetry from backend API /api/v1/factory/overview...</span>
            <button
              onClick={() => setApiStateMode('demo')}
              className="ml-auto underline font-bold"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl border-2 border-stone-300 bg-stone-200" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl border-2 border-stone-300 bg-stone-200" />
            ))}
          </div>
          <div className="h-64 rounded-2xl border-2 border-stone-300 bg-stone-200" />
        </div>
      )}

      {/* NORMAL & EMPTY STATES CONTENT */}
      {apiStateMode !== 'loading' && (
        <>
          {/* SECTION 1: KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Card 1: Total Orders */}
            <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full bg-white space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                    Total Orders
                  </span>
                  <span className="w-8 h-8 rounded-xl bg-[#D7F4E5] border border-[#181816] flex items-center justify-center text-[#0E4B3E] shrink-0">
                    <MaterialIcon name="inventory_2" size="sm" color="#0E4B3E" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black font-mono text-[#181816]">
                    {apiStateMode === 'empty' ? '0' : metrics.totalOrders}
                  </span>
                  <span className="text-xs font-bold text-stone-500 font-mono">Registered</span>
                </div>
                <div className="pt-2">
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden border border-stone-200">
                    <div
                      className="h-full bg-[#0E4B3E]"
                      style={{ width: apiStateMode === 'empty' ? '0%' : '83%' }}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] font-mono text-stone-600">
                <span>In Production: <strong className="text-[#0E4B3E]">{apiStateMode === 'empty' ? 0 : metrics.inProductionOrders}</strong></span>
                <span>Scheduled: <strong>{apiStateMode === 'empty' ? 0 : 2}</strong></span>
              </div>
            </Card>

            {/* Card 2: Completed Orders */}
            <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full bg-white space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                    Completed Orders
                  </span>
                  <span className="w-8 h-8 rounded-xl bg-[#D7F4E5] border border-[#181816] flex items-center justify-center text-[#15803D] shrink-0">
                    <MaterialIcon name="check_circle" size="sm" color="#15803D" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black font-mono text-[#15803D]">
                    {apiStateMode === 'empty' ? '0' : metrics.completedOrders}
                  </span>
                  <span className="text-xs font-bold text-emerald-800 font-mono">
                    {apiStateMode === 'empty' ? '0%' : '25.0% Finished'}
                  </span>
                </div>
                <div className="pt-2">
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden border border-stone-200">
                    <div
                      className="h-full bg-[#15803D]"
                      style={{ width: apiStateMode === 'empty' ? '0%' : '25%' }}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] font-mono text-stone-600">
                <span>On-time Delivery: <strong className="text-[#15803D]">100%</strong></span>
                <span>Audit: <strong className="text-[#0E4B3E]">Verified</strong></span>
              </div>
            </Card>

            {/* Card 3: Production Progress */}
            <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full bg-white space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                    Production Progress
                  </span>
                  <span className="w-8 h-8 rounded-xl bg-amber-100 border border-[#181816] flex items-center justify-center text-amber-800 shrink-0">
                    <MaterialIcon name="trending_up" size="sm" color="#B45309" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black font-mono text-[#0E4B3E]">
                    {apiStateMode === 'empty' ? '0%' : `${overallRate}%`}
                  </span>
                  <span className="text-xs font-mono text-stone-500 truncate">
                    {apiStateMode === 'empty' ? '0 / 0 m' : `${totalProduced.toLocaleString()} / ${totalTarget.toLocaleString()} m`}
                  </span>
                </div>
                <div className="pt-2">
                  <Progress value={apiStateMode === 'empty' ? 0 : overallRate} max={100} size="sm" color="primary" />
                </div>
              </div>
              <div className="pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] font-mono text-stone-500">
                <span>Remaining: {apiStateMode === 'empty' ? 0 : (totalTarget - totalProduced).toLocaleString()}m</span>
                <span className="text-[#0E4B3E] font-bold">Target: 8.5k m</span>
              </div>
            </Card>

            {/* Card 4: Machine Status */}
            <Card variant="elevated" padding="md" className="flex flex-col justify-between h-full bg-white space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                    Machine Status
                  </span>
                  <span className="w-8 h-8 rounded-xl bg-[#D7F4E5] border border-[#181816] flex items-center justify-center text-[#0E4B3E] shrink-0">
                    <MaterialIcon name="precision_manufacturing" size="sm" color="#0E4B3E" />
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black font-mono text-[#181816]">
                    {metrics.activeMachines}
                    <span className="text-lg text-stone-400 font-normal"> / {metrics.totalMachines}</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-[#15803D]">
                    {metrics.machineOperationalRate}% Active
                  </span>
                </div>
                <div className="pt-2">
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden border border-stone-200">
                    <div
                      className="h-full bg-[#15803D]"
                      style={{ width: `${metrics.machineOperationalRate}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] font-mono">
                <span className="text-emerald-700 font-bold">9 Running</span>
                <span className="text-[#E05326] font-bold">1 Down (WEAVE-03)</span>
                <span className="text-stone-500">0 Idle</span>
              </div>
            </Card>
          </div>

          {/* SECTION 2 & 3: MACHINE GROUP STATUS & ORDER PROGRESS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Machine Groups Breakdown (Spinning, Weaving, Dyeing) */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-[#181816] flex items-center gap-2">
                    <MaterialIcon name="settings_suggest" size="sm" color="#0E4B3E" />
                    Machine-Group Status
                  </h2>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Division performance & telemetry breakdown
                  </p>
                </div>
                <Badge variant="metric" size="xs">
                  3 Divisions
                </Badge>
              </div>

              <div className="space-y-3">
                {machineGroups.map((group) => {
                  const isAttention = group.status === 'Attention'
                  const isSelected = selectedMachineGroup === group.name

                  return (
                    <Card
                      key={group.name}
                      variant="elevated"
                      padding="md"
                      className={`bg-white transition-all cursor-pointer hover:border-[#0E4B3E] ${
                        isSelected ? 'ring-2 ring-[#0E4B3E]' : ''
                      }`}
                      onClick={() => setSelectedMachineGroup(isSelected ? null : group.name)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-[#181816]">
                              {group.name} Division
                            </span>
                            <span className="font-mono text-[10px] text-stone-500 font-bold">
                              ({group.code})
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600 font-medium mt-0.5">
                            {group.primaryProcess}
                          </p>
                        </div>
                        <Badge
                          variant={isAttention ? 'warning' : 'success'}
                          size="xs"
                          dotColor={isAttention ? '#E05326' : '#15803D'}
                        >
                          {group.runningCount}/{group.totalCount} Active
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between items-center text-[10.5px] font-mono">
                          <span className="text-stone-500">Capacity Utilization</span>
                          <span className="font-bold text-[#0E4B3E]">{group.utilizationRate}%</span>
                        </div>
                        <Progress
                          value={group.utilizationRate}
                          max={100}
                          size="sm"
                          color={isAttention ? 'warning' : 'tertiary'}
                        />
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-stone-200 text-[10.5px] font-mono text-stone-600 flex items-center justify-between">
                        <span className="truncate pr-2">{group.telemetrySummary}</span>
                        <MaterialIcon
                          name={isSelected ? 'expand_less' : 'expand_more'}
                          size="xs"
                          color="#78716C"
                        />
                      </div>

                      {/* Expandable Machine Units List */}
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t-2 border-dashed border-stone-300 space-y-2">
                          <p className="font-mono text-[10px] uppercase font-bold text-stone-500">
                            Individual Machine Telemetry:
                          </p>
                          {group.machines.map((m) => (
                            <div
                              key={m.id}
                              className="p-2 rounded-xl border border-stone-200 bg-[#FAF7F0] flex items-center justify-between text-[11px] font-mono"
                            >
                              <div>
                                <span className="font-bold text-[#181816]">{m.id}</span>
                                {m.currentOrder && (
                                  <span className="text-[10px] text-stone-500 block truncate">
                                    {m.currentOrder}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                    m.status === 'Running'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                  }`}
                                >
                                  {m.status}
                                </span>
                                {m.speedMetric && (
                                  <span className="text-[9.5px] text-stone-500 block mt-0.5">
                                    {m.speedMetric}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Order Progress (Produced vs Target) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-black text-[#181816] flex items-center gap-2">
                    <MaterialIcon name="stacked_bar_chart" size="sm" color="#0E4B3E" />
                    Order Progress (Produced vs Target Quantity)
                  </h2>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Meters manufactured toward batch commitments
                  </p>
                </div>

                {/* Filter and Search */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search order or buyer..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="px-2.5 py-1 pl-7 text-[11px] font-mono bg-white border-2 border-[#181816] rounded-xl pop-shadow-xs focus:outline-none focus:ring-1 focus:ring-[#0E4B3E] w-44"
                    />
                    <span className="absolute left-2 top-1.5 text-stone-400">
                      <MaterialIcon name="search" size="xs" />
                    </span>
                  </div>

                  <div className="flex border-2 border-[#181816] rounded-xl overflow-hidden text-[10px] font-mono bg-white">
                    <button
                      onClick={() => setOrderFilter('all')}
                      className={`px-2 py-1 font-bold ${
                        orderFilter === 'all' ? 'bg-[#0E4B3E] text-white' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setOrderFilter('In Production')}
                      className={`px-2 py-1 font-bold border-l border-stone-300 ${
                        orderFilter === 'In Production'
                          ? 'bg-[#0E4B3E] text-white'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => setOrderFilter('Completed')}
                      className={`px-2 py-1 font-bold border-l border-stone-300 ${
                        orderFilter === 'Completed'
                          ? 'bg-[#0E4B3E] text-white'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Cards Grid */}
              {filteredOrders.length === 0 ? (
                <Card variant="elevated" padding="lg" className="bg-white text-center py-12 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-100 border-2 border-[#181816] flex items-center justify-center text-stone-400">
                    <MaterialIcon name="inbox" size="lg" />
                  </div>
                  <h3 className="font-bold text-stone-700">No orders match the selected filters</h3>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Try adjusting the search query or status filter to see production batch records.
                  </p>
                  {apiStateMode === 'empty' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setApiStateMode('demo')}
                      className="mx-auto"
                    >
                      Switch back to Demo Data
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredOrders.slice(0, 6).map((order) => {
                    const pct =
                      order.targetMeters > 0
                        ? Math.min(100, Math.round((order.producedMeters / order.targetMeters) * 100))
                        : 0

                    return (
                      <Card
                        key={order.id}
                        variant="elevated"
                        padding="md"
                        className="bg-white space-y-2 hover:border-[#0E4B3E] transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-black text-xs text-[#0E4B3E]">
                                {order.id}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-stone-100 border border-stone-300 rounded font-bold">
                                {order.priority}
                              </span>
                              <span className="font-mono text-[10px] text-stone-500 font-bold truncate max-w-[100px]">
                                {order.articleCode}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs text-[#181816] mt-0.5 truncate">
                              {order.fabric}
                            </h4>
                            <p className="text-[11px] text-stone-500 truncate">{order.buyer}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[9.5px] font-bold border ${
                              order.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : order.status === 'In Production'
                                ? 'bg-sky-100 text-sky-800 border-sky-300'
                                : 'bg-stone-100 text-stone-700 border-stone-300'
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>

                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between items-center font-mono text-[10.5px]">
                            <span className="text-stone-500">
                              <strong className="text-[#181816]">{order.producedMeters.toLocaleString()}m</strong> / {order.targetMeters.toLocaleString()}m
                            </span>
                            <span className="font-bold text-[#0E4B3E]">{pct}%</span>
                          </div>
                          <Progress
                            value={pct}
                            max={100}
                            size="md"
                            color={order.status === 'Completed' ? 'tertiary' : 'primary'}
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[10px] font-mono text-stone-500">
                          <span>Stage: <strong className="text-[#181816]">{order.stage}</strong></span>
                          <span>Due in: <strong className="text-stone-700">{order.dueHours} hrs</strong></span>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 4: PRODUCTION SUMMARY & RECENT ORDERS TABLE */}
          <div className="space-y-4">
            {/* Shift Summaries */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-[#181816] flex items-center gap-2">
                  <MaterialIcon name="summarize" size="sm" color="#0E4B3E" />
                  Production Summary by Shift
                </h2>
                <p className="text-[11px] text-stone-500 font-medium">
                  Supervisor performance, actual vs target output, and shift incident log
                </p>
              </div>
              <Badge variant="metric" size="xs">
                3 Plant Shifts
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shifts.map((shift) => (
                <Card
                  key={shift.shiftCode}
                  variant="elevated"
                  padding="md"
                  className={`bg-white space-y-2.5 ${
                    shift.status === 'Active' ? 'border-[#0E4B3E] ring-2 ring-[#0E4B3E]/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs text-[#181816]">
                          {shift.shiftName}
                        </span>
                        <span className="font-mono text-[10px] text-stone-500">({shift.timing})</span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-600 block mt-0.5">
                        Supervisor: <strong>{shift.supervisor}</strong>
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono text-[9.5px] font-bold border ${
                        shift.status === 'Active'
                          ? 'bg-[#D7F4E5] text-[#0B382F] border-[#181816]'
                          : shift.status === 'Completed'
                          ? 'bg-stone-100 text-stone-600 border-stone-300'
                          : 'bg-amber-50 text-amber-700 border-amber-300'
                      }`}
                    >
                      {shift.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-xs p-2 rounded-xl bg-[#FAF7F0] border border-stone-200">
                    <div>
                      <span className="text-[10px] text-stone-500 block">Actual Meters</span>
                      <span className="font-black text-[#0E4B3E]">
                        {shift.actualMeters.toLocaleString()} m
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Target Meters</span>
                      <span className="font-bold text-stone-800">
                        {shift.targetMeters.toLocaleString()} m
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] font-mono text-stone-600">
                    <span>Floor Operators: <strong>{shift.operatorCount}</strong></span>
                    <span>Scrap Loss: <strong className="text-amber-800">{shift.scrapPercentage}%</strong></span>
                  </div>

                  <p className="text-[10.5px] text-stone-600 bg-white p-2 rounded-lg border border-stone-200 italic">
                    &ldquo;{shift.notes}&rdquo;
                  </p>
                </Card>
              ))}
            </div>

            {/* Comprehensive Recent Orders Table */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-[#181816] flex items-center gap-2">
                    <MaterialIcon name="table_chart" size="sm" color="#0E4B3E" />
                    All Production Orders Schedule
                  </h3>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Showing batch specifications, targets, produced meters, and routing stages
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-stone-600">
                  {filteredOrders.length} Records
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border-2 border-[#181816] bg-white pop-shadow-md">
                <table className="w-full min-w-[760px] text-left font-mono text-[11.5px] border-collapse">
                  <thead>
                    <tr className="bg-[#FAF7F0] border-b-2 border-[#181816] text-stone-700">
                      <th className="py-2.5 px-3 font-black">Order ID</th>
                      <th className="py-2.5 px-3 font-black">Product</th>
                      <th className="py-2.5 px-3 font-black">Buyer</th>
                      <th className="py-2.5 px-3 font-black">Target (m)</th>
                      <th className="py-2.5 px-3 font-black">Produced (m)</th>
                      <th className="py-2.5 px-3 font-black">Progress</th>
                      <th className="py-2.5 px-3 font-black">Stage</th>
                      <th className="py-2.5 px-3 font-black">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredOrders.map((order) => {
                      const pct =
                        order.targetMeters > 0
                          ? Math.min(100, Math.round((order.producedMeters / order.targetMeters) * 100))
                          : 0

                      return (
                        <tr key={order.id} className="hover:bg-[#FAF7F0] transition-colors">
                          <td className="py-2.5 px-3 font-bold text-[#0E4B3E]">{order.id}</td>
                          <td className="py-2.5 px-3 font-sans text-stone-800">
                            <div className="font-bold">{order.fabric}</div>
                            <span className="text-[10px] font-mono text-stone-500">
                              {order.articleCode}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans font-semibold text-[#181816]">
                            {order.buyer}
                          </td>
                          <td className="py-2.5 px-3 font-bold">{order.targetMeters.toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-bold text-[#0E4B3E]">
                            {order.producedMeters.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-stone-200 rounded-full h-2 overflow-hidden border border-stone-300">
                                <div
                                  className={`h-full ${
                                    order.status === 'Completed' ? 'bg-[#15803D]' : 'bg-[#0E4B3E]'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="font-bold text-[10.5px]">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded border border-stone-300 bg-stone-50 font-bold text-[10px]">
                              {order.stage}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[9.5px] border ${
                                order.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : order.status === 'In Production'
                                  ? 'bg-sky-100 text-sky-800 border-sky-300'
                                  : 'bg-stone-100 text-stone-700 border-stone-300'
                              }`}
                            >
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer Disclaimer */}
      <footer className="pt-4 border-t border-stone-300 text-center font-mono text-[10.5px] text-stone-500 space-y-1">
        <p>
          Everest Textile Mills · Operations Intelligence System · Synthetic Demo Telemetry Active
        </p>
        <p className="text-stone-400">
          Backend API endpoints (<code className="font-mono">/api/v1/orders</code>, <code className="font-mono">/api/v1/telemetry</code>) will replace synthetic data once deployed.
        </p>
      </footer>
    </div>
  )
}
