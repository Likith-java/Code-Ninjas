'use client'

import { Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface WeavingColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
  isResolved: boolean
}

const weavingOrders = mockOrders.filter(o => 
  o.currentStage === 'weaving' || (o.status === 'spinning' && o.id !== 'ORD-001' && o.id !== 'ORD-003' && o.id !== 'ORD-005')
)

export function WeavingColumn({ onOrderSelect, selectedOrder, isResolved }: WeavingColumnProps) {
  return (
    <div className="w-80 flex flex-col bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl h-full shrink-0 pop-shadow-md">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-[#EFE8D8] rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E05326] border border-[#181816]" />
          <span className="font-bold text-[13px] text-[#181816]">Stage 2: Weaving</span>
          <Badge variant="metric" size="xs" className="bg-white border-2 border-[#181816] px-2 py-0.2">
            5 Looms
          </Badge>
        </div>
        <Badge variant="warning" size="xs" dotColor="#E05326" className="bg-[#FFEFEA] border border-[#181816] px-2 py-0.5 rounded-full text-[#962C0B] font-bold">
          {isResolved ? 'Resolved' : '1 Breakdown'}
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {weavingOrders.map((order) => (
          <WeavingOrderCard key={order.id} order={order} isSelected={selectedOrder === order.id} onSelect={onOrderSelect} isResolved={isResolved} />
        ))}
      </div>
    </div>
  )
}

function WeavingOrderCard({ order, isSelected, onSelect, isResolved }: { order: Order; isSelected: boolean; onSelect: (id: string) => void; isResolved: boolean }) {
  const isORD004 = order.id === 'ORD-004'
  const isBreakdown = isORD004 && !isResolved

  return (
    <Card
      variant={isBreakdown ? 'disruption' : 'stage'}
      id={isORD004 ? 'card-ORD-004' : undefined}
      className={`cursor-pointer ${isSelected && !isBreakdown ? 'border-[#0E4B3E]' : ''} ${isBreakdown ? 'relative' : ''}`}
      onClick={() => onSelect(order.id)}
    >
      {isBreakdown && (
        <div className="flex items-center justify-between bg-[#FFEFEA] border-2 border-[#181816] rounded-xl px-2 py-1 mb-2 font-mono text-[10px] text-[#962C0B] pop-shadow-xs">
          <div className="flex items-center gap-1 font-bold">
            <MaterialIcon name="warning" size="sm" color="#E05326" />
            <span>MACHINE BREAKDOWN</span>
          </div>
          <span className="font-bold underline">WEAVE-03 [480–960m]</span>
        </div>
      )}

      {isResolved && isORD004 && (
        <div className="flex items-center justify-between bg-[#D7F4E5] border-2 border-[#181816] rounded-xl px-2 py-1 mb-2 font-mono text-[10px] text-[#0B382F] pop-shadow-xs">
          <div className="flex items-center gap-1 font-bold">
            <MaterialIcon name="check_circle" size="sm" color="#15803D" />
            <span>RE-PLAN ACTIVE (WEAVE-02)</span>
          </div>
          <span className="font-bold text-[#0B382F]">On-Time</span>
        </div>
      )}

      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#0E4B3E]">{order.id}</span>
        <Badge
          variant={isORD004 ? 'priority' : 'priority'}
          size="xs"
          className={isORD004 ? 'bg-[#FEE2E2] text-[#991B1B] border border-[#181816]' : 'bg-[#FAF7F0] text-[#181816] border border-[#181816]'}
        >
          {isORD004 ? 'P0 Critical' : 'P1 High'}
        </Badge>
      </div>
      <p className="font-bold text-[12.5px] text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="font-mono text-[11px] text-[#4E4B47] mt-1">
        Buyer: <span className="font-bold text-[#181816]">{order.buyer}</span> {isORD004 ? '' : `• ${order.metres.toLocaleString()}m`}
      </div>

      {isBreakdown && (
        <div className="mt-2.5 p-2 bg-[#FAF7F0] border-2 border-[#181816] rounded-xl font-mono text-[10.5px] space-y-1">
          <div className="flex justify-between text-[#15803D] font-bold">
            <span>Completed before fault:</span>
            <span>1,200m (Passed)</span>
          </div>
          <div className="flex justify-between text-[#E05326] font-bold">
            <span>Unfinished remainder:</span>
            <span>1,800m (Ready @ t=360)</span>
          </div>
          <div className="text-[9.5px] text-[#78716C] pt-1 border-t border-[#E7DFCE]">
            Re-plan action: Route 1,800m to <span className="font-bold text-[#181816]">WEAVE-02</span>
          </div>
        </div>
      )}

      {!isBreakdown && (
        <div className="mt-2.5 flex items-center justify-between bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-2 py-1 font-mono text-[10.5px]">
          <span className="font-bold text-[#181816]">{order.assignedMachine || order.eligible.weaving[0]} (40 m/hr)</span>
          <span className="text-[#0E4B3E] font-bold">Optimal Schedule</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t-2 border-[#E7DFCE] text-[10.5px] font-mono text-[#4E4B47]">
        <span>Deadline: t = {order.due}m</span>
        <span className={`font-bold flex items-center gap-0.5 ${isBreakdown ? 'text-[#E05326]' : 'text-[#0E4B3E]'}`}>
          {isBreakdown && <MaterialIcon name="schedule" size="xs" />}
          {isBreakdown ? 'At Risk' : 'Optimal Schedule'}
        </span>
      </div>
    </Card>
  )
}