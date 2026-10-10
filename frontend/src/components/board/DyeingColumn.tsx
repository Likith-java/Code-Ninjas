'use client'

import { Card, Badge, MaterialIcon } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface DyeingColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
}

const dyeingOrders = mockOrders.filter(o => o.currentStage === 'dyeing' || o.currentStage === 'inspection')

export function DyeingColumn({ onOrderSelect, selectedOrder }: DyeingColumnProps) {
  return (
    <div className="flex-1 min-w-[320px] max-w-2xl flex flex-col bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl h-full shrink-0 pop-shadow-md">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-[#EFE8D8] rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] border border-[#181816]" />
          <span className="font-bold text-[13px] text-[#181816]">Stage 3: Dyeing & QA</span>
          <Badge variant="metric" size="xs" className="bg-white border-2 border-[#181816] px-2 py-0.2">
            2 Vats
          </Badge>
        </div>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-2 py-0.5 rounded-full text-[#0B382F] font-bold">
          100% On-Time
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {dyeingOrders.map((order) => (
          <DyeingOrderCard key={order.id} order={order} isSelected={selectedOrder === order.id} onSelect={onOrderSelect} />
        ))}
      </div>
    </div>
  )
}

function DyeingOrderCard({ order, isSelected, onSelect }: { order: Order; isSelected: boolean; onSelect: (id: string) => void }) {
  const isInspection = order.currentStage === 'inspection'

  return (
    <Card
      variant="stage"
      className={`cursor-pointer ${isSelected ? 'border-[#0E4B3E]' : ''}`}
      onClick={() => onSelect(order.id)}
    >
      <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
        <span className="font-bold text-[#181816]">{order.id}</span>
        <Badge
          variant={isInspection ? 'success' : 'default'}
          size="xs"
          className={isInspection 
            ? 'bg-[#D7F4E5] border border-[#181816] text-[#0B382F]' 
            : 'bg-[#FAF7F0] border border-[#181816] text-[#181816]'}
        >
          {isInspection ? 'Inspection Passed' : 'Dyeing'}
        </Badge>
      </div>
      <p className="font-bold text-[12.5px] text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="font-mono text-[11px] text-[#4E4B47] mt-1">
        Buyer: <span className="font-bold text-[#181816]">{order.buyer}</span> • {order.metres.toLocaleString()}m
      </div>

      <div className="mt-2.5 p-2 bg-[#FAF7F0] border border-[#181816] rounded-xl font-mono text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>{isInspection ? 'DYE-01 Vat:' : 'Dyeing Vat:'}</span>
          <span className="font-bold text-[#181816]">{isInspection ? 'Done (180m)' : 'In Progress'}</span>
        </div>
        {isInspection && (
          <div className="flex justify-between">
            <span>Rolls Inspected:</span>
            <span className="font-bold text-[#15803D]">15 Passed, 0 Reject</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Dispatch Readiness:</span>
          <span className="font-bold text-[#0E4B3E]">{isInspection ? 'Invoice Generated' : 'Pending'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t-2 border-[#E7DFCE] text-[10.5px] font-mono text-[#4E4B47]">
        <span>Dispatched: {isInspection ? '0m' : 'N/A'} / {order.metres.toLocaleString()}m</span>
        <span className="text-[#0E4B3E] font-bold">{isInspection ? 'Ready to Ship' : 'In Process'}</span>
      </div>
    </Card>
  )
}