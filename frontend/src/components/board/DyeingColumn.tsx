'use client'

import { Card, Badge } from '@/components/ui'
import { mockOrders } from '@/lib/mockData'
import type { Order } from '@/types'

interface DyeingColumnProps {
  onOrderSelect: (orderId: string) => void
  selectedOrder: string | null
  onOpenDetails?: (order: Order, anchorRect: DOMRect) => void
}

const dyeingOrders = mockOrders.filter(o => o.currentStage === 'dyeing' || o.currentStage === 'inspection')

export function DyeingColumn({ onOrderSelect, selectedOrder, onOpenDetails }: DyeingColumnProps) {
  return (
    <div className="flex-1 min-w-[320px] max-w-2xl flex flex-col bg-[#FAF7F0] border border-stone-200 rounded-2xl h-full shrink-0 shadow-sm">
      <div className="p-3 border-b border-stone-200 flex items-center justify-between bg-[#EFE8D8] rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
          <span className="font-semibold text-xs text-[#181816]">Stage 3: Dyeing & QA</span>
          <Badge variant="metric" size="xs" className="bg-white border border-stone-200 px-2 py-0.5">
            2 Vats
          </Badge>
        </div>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-emerald-200 px-2 py-0.5 rounded-md text-[#0B382F] font-semibold">
          100% On-Time
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {dyeingOrders.map((order) => (
          <DyeingOrderCard
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

function DyeingOrderCard({
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
  const isInspection = order.currentStage === 'inspection'

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
        <span className="font-bold text-[#181816]">{order.id}</span>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={isInspection ? 'success' : 'default'}
            size="xs"
            className={
              isInspection
                ? 'bg-[#D7F4E5] border border-emerald-200 text-[#0B382F]'
                : 'bg-stone-100 border border-stone-200 text-stone-700'
            }
          >
            {isInspection ? 'Inspection Passed' : 'Dyeing'}
          </Badge>
        </div>
      </div>
      <p className="font-semibold text-xs text-[#181816] leading-snug">{order.fabric} {order.colour}</p>
      <div className="text-[11px] text-[#4E4B47] mt-1 font-body">
        Buyer: <span className="font-medium text-[#181816]">{order.buyer}</span> • {order.metres.toLocaleString()}m
      </div>

      <div className="mt-2.5 p-2 bg-white border border-stone-200 rounded-lg text-[10.5px] space-y-0.5">
        <div className="flex justify-between">
          <span className="text-stone-500">{isInspection ? 'DYE-01 Vat:' : 'Dyeing Vat:'}</span>
          <span className="font-medium text-[#181816]">{isInspection ? 'Done (180m)' : 'In Progress'}</span>
        </div>
        {isInspection && (
          <div className="flex justify-between">
            <span className="text-stone-500">Rolls Inspected:</span>
            <span className="font-medium text-emerald-700">15 Passed, 0 Reject</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-stone-500">Dispatch Readiness:</span>
          <span className="font-medium text-[#0E4B3E]">{isInspection ? 'Invoice Generated' : 'Pending'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-stone-200 text-[10.5px] text-stone-500 font-body">
        <span>Dispatched: <span className="font-mono">{isInspection ? '0m' : 'N/A'}</span> / {order.metres.toLocaleString()}m</span>
        <span className="text-[#0E4B3E] font-medium">{isInspection ? 'Ready to Ship' : 'In Process'}</span>
      </div>
    </Card>
  )
}