'use client'

import { Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface SpinningColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
  onOpenDetails?: (order: Order, anchorRect: DOMRect) => void
}

const spinningOrders = mockOrders.filter(o => 
  o.currentStage === 'spinning' || (o.status === 'not_started' && o.eligible.spinning.length > 0)
)

export function SpinningColumn({ onOrderSelect, selectedOrder, onOpenDetails }: SpinningColumnProps) {
  return (
    <div className="flex-1 min-w-[320px] max-w-2xl flex flex-col bg-[#FAF7F0] border border-stone-200 rounded-2xl h-full shrink-0 shadow-sm">
      <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-[#EFE8D8] rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0E4B3E]" />
          <span className="font-semibold text-xs text-[#181816]">Stage 1: Spinning</span>
          <Badge variant="metric" size="xs" className="bg-white border border-stone-200 px-2 py-0.5">
            3 Machines
          </Badge>
        </div>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-emerald-200 px-2 py-0.5 rounded-md text-[#0B382F] font-semibold">
          {spinningOrders.length} Orders
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {spinningOrders.map((order) => (
          <SpinningOrderCard
            key={order.id}
            order={order}
            isSelected={selectedOrder === order.id}
            onSelect={onOrderSelect}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
    </div>
  )
}

function SpinningOrderCard({
  order,
  isSelected,
  onSelect,
  onOpenDetails,
}: {
  order: Order
  isSelected: boolean
  onSelect: (id: string) => void
  onOpenDetails?: (order: Order, anchorRect: DOMRect) => void
}) {
  const progress = order.progress || 0
  const isActive = order.status === 'spinning'
  const isQueued = order.status === 'not_started'

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
      variant="stage"
      role="button"
      tabIndex={0}
      aria-label={`Order ${order.id}: ${order.buyer}, ${order.fabric}. Press Enter or Space to view details.`}
      className={`cursor-pointer transition-all hover:border-stone-400 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]/50 ${
        isSelected ? 'border-[#0E4B3E] ring-1 ring-[#0E4B3E]' : 'border-stone-200'
      }`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#0E4B3E]">{order.id}</span>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={isActive ? 'success' : 'default'}
            size="xs"
            className={isActive ? 'bg-[#D7F4E5] text-[#0B382F] border border-emerald-200' : 'bg-stone-100 text-stone-700 border border-stone-200'}
          >
            {isActive ? `Spinning: ${progress}%` : 'Queued'}
          </Badge>
        </div>
      </div>
      <p className="font-semibold text-xs text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="text-[11px] text-[#4E4B47] mt-1 font-body">
        Buyer: <span className="font-medium text-[#181816]">{order.buyer}</span> • {order.metres.toLocaleString()}m
      </div>

      {isActive && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between text-[10.5px]">
            <span className="text-stone-500">Frame: <span className="font-mono font-medium text-[#181816]">{order.assignedMachine || 'SPIN-01'}</span></span>
            <span className="font-semibold text-[#0E4B3E]">{order.metres ? Math.round((order.metres * progress) / 100) : 0}m / {order.metres}m</span>
          </div>
          <Progress value={progress} color="primary" size="sm" />
        </div>
      )}

      {isQueued && (
        <div className="mt-2.5 flex items-center justify-between bg-white border border-stone-200 rounded-lg px-2 py-1 text-[10.5px] text-stone-600">
          <span>Assigned: <strong className="font-mono text-[#181816]">{order.eligible.spinning[0]}</strong></span>
          <span className="text-[#0E4B3E] font-medium">Yarn Ready</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-stone-200 text-[10.5px] text-stone-500 font-body">
        <span>Due: <span className="font-mono">t = {order.due}m</span></span>
        <span className="text-[#15803D] font-medium flex items-center gap-0.5">
          <MaterialIcon name="schedule" size="xs" />
          Optimal
        </span>
      </div>
    </Card>
  )
}