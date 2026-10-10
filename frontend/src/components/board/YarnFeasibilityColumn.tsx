'use client'

import { Card, Badge, MaterialIcon, Button, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface YarnFeasibilityColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
  onAddOrder: () => void
}

const yarnOrders = mockOrders.filter(o => o.status === 'not_started' && o.yarnReady > 0 || o.id === 'ORD-007' || o.id === 'ORD-009')

export function YarnFeasibilityColumn({ onOrderSelect, selectedOrder, onAddOrder }: YarnFeasibilityColumnProps) {
  return (
    <div className="w-80 flex flex-col bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl h-full shrink-0 pop-shadow-md">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-[#EFE8D8] rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#78716C] border border-[#181816]" />
          <span className="font-bold text-[13px] text-[#181816]">Yarn Feasibility & Queue</span>
          <Badge variant="metric" size="xs" className="bg-white border-2 border-[#181816] px-2 py-0.2">
            {yarnOrders.length} Orders
          </Badge>
        </div>
        <Button variant="pop" size="xs" icon={<MaterialIcon name="add" size="sm" />} onClick={onAddOrder} />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {yarnOrders.map((order) => (
          <YarnOrderCard key={order.id} order={order} isSelected={selectedOrder === order.id} onSelect={onOrderSelect} />
        ))}
      </div>
    </div>
  )
}

function YarnOrderCard({ order, isSelected, onSelect }: { order: Order; isSelected: boolean; onSelect: (id: string) => void }) {
  const isDelayed = order.yarnReady > 0

  return (
    <Card
      variant="stage"
      className={`cursor-pointer ${isSelected ? 'border-[#0E4B3E]' : ''}`}
      onClick={() => onSelect(order.id)}
    >
      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#181816]">{order.id}</span>
        <Badge variant="priority" size="xs" className={getPriorityClass(order.priorityWeight)}>
          P{5 - order.priorityWeight} {getPriorityLabel(order.priorityWeight)}
        </Badge>
      </div>
      <p className="font-bold text-[12.5px] text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="font-mono text-[11px] text-[#4E4B47] mt-1">
        Buyer: <span className="font-bold text-[#181816]">{order.buyer}</span> • {order.metres.toLocaleString()}m
      </div>

      {isDelayed && (
        <div className="mt-2.5 flex items-center justify-between bg-[#FEF3C7] border-2 border-[#181816] rounded-xl px-2 py-1 font-mono text-[10px] text-[#92400E] pop-shadow-xs">
          <div className="flex items-center gap-1 font-bold">
            <MaterialIcon name="schedule" size="xs" />
            <span>Yarn Arrival: +{Math.round(order.yarnReady / 60)}h delay</span>
          </div>
          <span className="font-bold text-[#713F12]">t = {order.yarnReady}m</span>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {order.eligible.spinning.map(m => (
          <Badge key={m} variant="default" size="xs" className="bg-[#FAF7F0] border border-[#181816] text-[#181816]">
            {m}
          </Badge>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t-2 border-[#E7DFCE] text-[10.5px] font-mono text-[#4E4B47]">
        <span>Due: t = {order.due}m</span>
        <Badge variant="metric" size="xs" className="w-5 h-5 rounded-full border border-[#181816] flex items-center justify-center font-bold text-[10px]">
          M{5 - order.priorityWeight}
        </Badge>
      </div>
    </Card>
  )
}

function getPriorityClass(weight: number): string {
  switch (weight) {
    case 4: return 'bg-[#FEE2E2] text-[#991B1B]'
    case 3: return 'bg-[#FAF7F0] text-[#181816]'
    case 2: return 'bg-[#FEF3C7] text-[#92400E]'
    case 1: return 'bg-[#FAF7F0] text-[#4E4B47]'
    default: return 'bg-[#FAF7F0] text-[#181816]'
  }
}

function getPriorityLabel(weight: number): string {
  switch (weight) {
    case 4: return 'Critical'
    case 3: return 'High'
    case 2: return 'Normal'
    case 1: return 'Low'
    default: return 'Normal'
  }
}