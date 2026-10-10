'use client'

import { useState, useCallback } from 'react'
import { Button, MaterialIcon } from '@/components/ui'
import { SpinningColumn, WeavingColumn, DyeingColumn } from './index'
import { OrderDetailsPopover, OrderDetailsData } from './OrderDetailsPopover'
import type { Order } from '@/types'

interface ProductionBoardProps {
  selectedOrder: string | null
  onOrderSelect: (orderId: string) => void
  onFilterStage?: (stage: string) => void
  onSelectDisruption: (type: 'breakdown' | 'yarn_delay') => void
  onSimulateDisruption?: () => void
  isResolved: boolean
  disruptionText?: string
}

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
      {/* Floor Operational Toolbar: Spacious and Clean (Stage filter buttons removed) */}
      <div className="min-h-12 px-4 py-2.5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0E4B3E]" />
            <h1 className="text-sm font-bold text-[#181816] tracking-tight">Production Floor Pipeline</h1>
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
        </div>

        {/* Primary Global Action: Simulate Disruption Only */}
        <div className="flex items-center gap-2">
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

      {/* Production floor board columns: Full-width responsive 3-stage pipeline */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4">
        <SpinningColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          onOpenDetails={handleOpenDetails}
        />
        <WeavingColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          isResolved={isResolved}
          onOpenDetails={handleOpenDetails}
        />
        <DyeingColumn
          onOrderSelect={onOrderSelect}
          selectedOrder={selectedOrder}
          onOpenDetails={handleOpenDetails}
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