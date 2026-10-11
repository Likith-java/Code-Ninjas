'use client'

import { Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface WeavingColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
  isResolved: boolean
  onOpenDetails?: (order: Order, anchorRect: DOMRect) => void
  orders?: Order[]
  loading?: boolean
  machineCount?: number
}

const defaultWeavingOrders = mockOrders.filter(o => 
  o.currentStage === 'weaving' || (o.status === 'spinning' && o.id !== 'ORD-001' && o.id !== 'ORD-003' && o.id !== 'ORD-005')
)

export function WeavingColumn({
  onOrderSelect,
  selectedOrder,
  isResolved,
  onOpenDetails,
  orders,
  loading = false,
  machineCount = 5,
}: WeavingColumnProps) {
  const displayOrders = orders !== undefined ? orders : defaultWeavingOrders

  return (
    <div className="flex-1 min-w-[320px] max-w-2xl flex flex-col bg-[#FAF7F0] border border-stone-200 rounded-2xl h-full shrink-0 shadow-sm">
      <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-[#EFE8D8] rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E05326]" />
          <span className="font-semibold text-xs text-[#181816]">Stage 2: Weaving</span>
          <Badge variant="metric" size="xs" className="bg-white border border-stone-200 px-2 py-0.5">
            {machineCount} Looms
          </Badge>
        </div>
        <Badge
          variant="warning"
          size="xs"
          dotColor="#E05326"
          className="bg-red-50 border border-red-200 px-2 py-0.5 rounded-md text-red-800 font-semibold"
        >
          {isResolved ? 'Resolved' : '1 Breakdown'}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="py-12 text-center text-stone-500 font-mono text-xs space-y-2">
            <div className="size-5 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent mx-auto" />
            <p>Loading weaving floor...</p>
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="py-12 text-center text-stone-400 font-mono text-xs space-y-1">
            <MaterialIcon name="inbox" size="md" color="#A8A29E" />
            <p className="font-medium text-stone-500">No weaving runs active</p>
            <p className="text-[10px]">Loom jobs will appear when Stage 1 completes</p>
          </div>
        ) : (
          displayOrders.map((order) => (
            <WeavingOrderCard
              key={order.id}
              order={order}
              isSelected={selectedOrder === order.id}
              onSelect={onOrderSelect}
              isResolved={isResolved}
              onOpenDetails={onOpenDetails}
            />
          ))
        )}
      </div>
    </div>
  )
}

function WeavingOrderCard({
  order,
  isSelected,
  onSelect,
  isResolved,
  onOpenDetails,
}: {
  order: Order
  isSelected: boolean
  onSelect: (id: string) => void
  isResolved: boolean
  onOpenDetails?: (order: Order, anchorRect: DOMRect) => void
}) {
  const isORD004 = order.id === 'ORD-004'
  const isBreakdown = isORD004 && !isResolved

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSelect(order.id)
    onOpenDetails?.(order, e.currentTarget.getBoundingClientRect())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(order.id)
      onOpenDetails?.(order, e.currentTarget.getBoundingClientRect())
    }
  }

  return (
    <Card
      variant={isBreakdown ? 'disruption' : 'stage'}
      id={isORD004 ? 'card-ORD-004' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Order ${order.id}: ${order.buyer}, ${order.fabric}. Press Enter or Space to view details.`}
      className={`cursor-pointer transition-all hover:border-stone-400 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]/50 ${
        isSelected && !isBreakdown
          ? 'border-[#0E4B3E] ring-1 ring-[#0E4B3E]'
          : isBreakdown
          ? 'border-red-400 bg-red-50/20'
          : 'border-stone-200'
      }`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      {isBreakdown && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 mb-2 text-[10.5px] text-red-900">
          <div className="flex items-center gap-1 font-semibold">
            <MaterialIcon name="warning" size="xs" color="#B91C1C" />
            <span>MACHINE BREAKDOWN</span>
          </div>
          <span className="font-mono font-medium text-red-700">WEAVE-03 [480–960m]</span>
        </div>
      )}

      {isResolved && isORD004 && (
        <div className="flex items-center justify-between bg-[#D7F4E5] border border-emerald-200 rounded-lg px-2.5 py-1 mb-2 text-[10.5px] text-[#0B382F]">
          <div className="flex items-center gap-1 font-semibold">
            <MaterialIcon name="check_circle" size="xs" color="#15803D" />
            <span>RE-PLAN ACTIVE (WEAVE-02)</span>
          </div>
          <span className="font-semibold text-emerald-800">On-Time</span>
        </div>
      )}

      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#0E4B3E]">{order.id}</span>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={isORD004 ? 'priority' : 'priority'}
            size="xs"
            className={isORD004 ? 'bg-red-100 text-red-800 border border-red-200 font-semibold' : 'bg-stone-100 text-stone-700 border border-stone-200'}
          >
            {isORD004 ? 'P0 Critical' : 'P1 High'}
          </Badge>
        </div>
      </div>
      <p className="font-semibold text-xs text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="text-[11px] text-[#4E4B47] mt-1 font-body">
        Buyer: <span className="font-medium text-[#181816]">{order.buyer}</span> {isORD004 ? '' : `• ${order.metres.toLocaleString()}m`}
      </div>

      {isBreakdown && (
        <div className="mt-2.5 p-2 bg-white border border-red-200 rounded-lg text-[10.5px] space-y-1">
          <div className="flex justify-between text-emerald-700 font-medium">
            <span>Completed before fault:</span>
            <span>1,200m (Passed)</span>
          </div>
          <div className="flex justify-between text-red-700 font-medium">
            <span>Unfinished remainder:</span>
            <span>1,800m (Ready @ t=360)</span>
          </div>
          <div className="text-[10px] text-stone-500 pt-1 border-t border-stone-100 font-body">
            Proposed action: Re-allocate 1,800m to <span className="font-mono font-semibold text-[#181816]">WEAVE-02</span>
          </div>
        </div>
      )}

      {!isBreakdown && order.status === 'weaving' && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between text-[10.5px]">
            <span className="text-stone-500">Loom: <span className="font-mono font-medium text-[#181816]">{order.assignedMachine || 'WEAVE-01'}</span></span>
            <span className="font-semibold text-[#0E4B3E]">{order.metres ? Math.round((order.metres * (order.progress || 0)) / 100) : 0}m / {order.metres}m</span>
          </div>
          <Progress value={order.progress || 0} color="primary" size="sm" />
        </div>
      )}

      {!isBreakdown && order.status !== 'weaving' && (
        <div className="mt-2.5 flex items-center justify-between bg-white border border-stone-200 rounded-lg px-2 py-1 text-[10.5px]">
          <span className="font-mono text-stone-700">{order.assignedMachine || order.eligible.weaving[0]} (40 m/hr)</span>
          <span className="text-[#0E4B3E] font-medium">Optimal Schedule</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-stone-200 text-[10.5px] text-stone-500 font-body">
        <span>Deadline: <span className="font-mono">t = {order.due}m</span></span>
        <span className={`font-medium flex items-center gap-0.5 ${isBreakdown ? 'text-red-700' : 'text-[#0E4B3E]'}`}>
          {isBreakdown && <MaterialIcon name="schedule" size="xs" />}
          {isBreakdown ? 'At Risk' : 'Optimal Schedule'}
        </span>
      </div>
    </Card>
  )
}