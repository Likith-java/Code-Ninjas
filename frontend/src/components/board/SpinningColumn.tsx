'use client'

import { Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface SpinningColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
}

const spinningOrders = mockOrders.filter(o => 
  o.currentStage === 'spinning' || (o.status === 'not_started' && o.eligible.spinning.length > 0)
)

export function SpinningColumn({ onOrderSelect, selectedOrder }: SpinningColumnProps) {
  return (
    <div className="flex-1 min-w-[320px] max-w-2xl flex flex-col bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl h-full shrink-0 pop-shadow-md">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-[#EFE8D8] rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0E4B3E] border border-[#181816]" />
          <span className="font-bold text-[13px] text-[#181816]">Stage 1: Spinning</span>
          <Badge variant="metric" size="xs" className="bg-white border-2 border-[#181816] px-2 py-0.2">
            3 Machines
          </Badge>
        </div>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-2 py-0.5 rounded-full text-[#0B382F] font-bold">
          {spinningOrders.length} Orders
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {spinningOrders.map((order) => (
          <SpinningOrderCard key={order.id} order={order} isSelected={selectedOrder === order.id} onSelect={onOrderSelect} />
        ))}
      </div>
    </div>
  )
}

function SpinningOrderCard({ order, isSelected, onSelect }: { order: Order; isSelected: boolean; onSelect: (id: string) => void }) {
  const progress = order.progress || 0
  const isActive = order.status === 'spinning'
  const isQueued = order.status === 'not_started'

  return (
    <Card
      variant="stage"
      className={`cursor-pointer ${isSelected ? 'border-[#0E4B3E]' : ''}`}
      onClick={() => onSelect(order.id)}
    >
      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#0E4B3E]">{order.id}</span>
        <Badge
          variant={isActive ? 'success' : 'default'}
          size="xs"
          className={isActive ? 'bg-[#D7F4E5] text-[#0B382F] border border-[#181816]' : 'bg-[#FAF7F0] text-[#181816] border border-[#181816]'}
        >
          {isActive ? `Spinning: ${progress}%` : 'Queued'}
        </Badge>
      </div>
      <p className="font-bold text-[12.5px] text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="font-mono text-[11px] text-[#4E4B47] mt-1">
        Buyer: <span className="font-bold text-[#181816]">{order.buyer}</span> • {order.metres.toLocaleString()}m
      </div>

      {isActive && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between text-[10.5px] font-mono">
            <span className="text-[#4E4B47]">Frame: <span className="font-bold text-[#181816]">{order.assignedMachine || 'SPIN-01'}</span></span>
            <span className="font-bold text-[#0E4B3E]">{order.metres ? Math.round((order.metres * progress) / 100) : 0}m / {order.metres}m</span>
          </div>
          <Progress value={progress} color="primary" size="sm" />
        </div>
      )}

      {isQueued && (
        <div className="mt-2.5 flex items-center justify-between bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-2 py-1 font-mono text-[10.5px] text-[#4E4B47]">
          <span>Assigned: <strong className="text-[#181816]">{order.eligible.spinning[0]}</strong></span>
          <span className="text-[#0E4B3E] font-bold">Yarn Ready</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t-2 border-[#E7DFCE] text-[10.5px] font-mono text-[#4E4B47]">
        <span>Due: t = {order.due}m</span>
        <span className="text-[#15803D] font-bold flex items-center gap-0.5">
          <MaterialIcon name="schedule" size="xs" />
          Optimal
        </span>
      </div>
    </Card>
  )
}