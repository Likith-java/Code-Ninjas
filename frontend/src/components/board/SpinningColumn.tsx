'use client'

import { Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface SpinningColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
}

const spinningOrders = mockOrders.filter(o => 
  o.currentStage === 'spinning' || (o.status === 'not_started' && o.eligible.spinning.length > 0 && o.id !== 'ORD-007' && o.id !== 'ORD-009')
)

export function SpinningColumn({ onOrderSelect, selectedOrder }: SpinningColumnProps) {
  return (
    <div className="w-80 flex flex-col bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl h-full shrink-0 pop-shadow-md">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-[#EFE8D8] rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#0E4B3E] border border-[#181816]" />
          <span className="font-bold text-[13px] text-[#181816]">Stage 1: Spinning</span>
          <Badge variant="metric" size="xs" className="bg-white border-2 border-[#181816] px-2 py-0.2">
            3 Machines
          </Badge>
        </div>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-2 py-0.5 rounded-full text-[#0B382F] font-bold">
          3/3 Active
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

      <div className="mt-2.5 flex items-center justify-between bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-2 py-1 font-mono text-[10.5px]">
        <span className="font-bold text-[#181816] flex items-center gap-1">
          <MaterialIcon name="settings" size="sm" color="#0E4B3E" />
          {order.assignedMachine || order.eligible.spinning[0]} (60 m/hr)
        </span>
        <span className="text-[#0E4B3E] font-bold">Dur: {Math.ceil(order.metres / 60 * 60)}m</span>
      </div>

      {isActive && (
        <Progress value={progress} color="primary" size="md" className="mt-2" />
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t-2 border-[#E7DFCE] text-[10.5px] font-mono text-[#4E4B47]">
        <span>Next: {order.eligible.weaving[0]}</span>
        <span className="font-bold text-[#15803D]">Route Feasible</span>
      </div>
    </Card>
  )
}