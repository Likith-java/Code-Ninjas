'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { MaterialIcon, Progress } from '@/components/ui'

export interface OrderDetailsData {
  id: string
  buyer: string
  fabric: string
  colour?: string
  metres?: number
  targetMeters?: number
  producedMeters?: number
  progress?: number
  due?: number | string
  deadline?: string
  currentStage?: string
  assignedMachine?: string
  status?: string
  priority?: string
  disruptionNote?: string
  unitPrice?: number
  totalAmount?: number
  orderDate?: string
  qualityStatus?: string
  dispatchStatus?: string
}

interface OrderDetailsPopoverProps {
  order: OrderDetailsData | null
  anchorRect: DOMRect | null
  onClose: () => void
  onStartProduction?: (order: OrderDetailsData) => void
  canStartProduction?: boolean
}

export function OrderDetailsPopover({
  order,
  anchorRect,
  onClose,
  onStartProduction,
  canStartProduction,
}: OrderDetailsPopoverProps) {
  const [mounted, setMounted] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'right' | 'left' | 'below' }>({
    top: 0,
    left: 0,
    placement: 'right',
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate anchored viewport coordinates
  useLayoutEffect(() => {
    if (!anchorRect) return

    const popoverWidth = 330
    const popoverHeight = 380
    const gap = 10
    const padding = 12

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const spaceRight = viewportWidth - anchorRect.right
    const spaceLeft = anchorRect.left

    let calculatedLeft = 0
    let placement: 'right' | 'left' | 'below' = 'right'

    if (spaceRight >= popoverWidth + gap + padding) {
      // Place to the right
      calculatedLeft = anchorRect.right + gap
      placement = 'right'
    } else if (spaceLeft >= popoverWidth + gap + padding) {
      // Place to the left
      calculatedLeft = anchorRect.left - popoverWidth - gap
      placement = 'left'
    } else {
      // Place below or clamped within viewport
      calculatedLeft = Math.max(padding, Math.min(viewportWidth - popoverWidth - padding, anchorRect.left))
      placement = 'below'
    }

    let calculatedTop = anchorRect.top
    if (placement === 'below') {
      calculatedTop = anchorRect.bottom + gap
    }

    // Keep vertically within viewport
    if (calculatedTop + popoverHeight > viewportHeight - padding) {
      calculatedTop = Math.max(padding, viewportHeight - popoverHeight - padding)
    }
    if (calculatedTop < padding) {
      calculatedTop = padding
    }

    setPosition({ top: calculatedTop, left: calculatedLeft, placement })
  }, [anchorRect])

  // Dismiss on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  if (!mounted || !order || !anchorRect) return null

  const targetQty = order.targetMeters || order.metres || 0
  const progressVal = order.progress ?? 0
  const producedQty =
    order.producedMeters !== undefined
      ? order.producedMeters
      : Math.round((targetQty * progressVal) / 100)

  const isDisrupted =
    order.id === 'ORD-004' ||
    order.id === 'ETM-ORD-000004' ||
    order.status === 'Delayed' ||
    order.status === 'Breakdown'

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for order ${order.id}`}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: '330px',
        zIndex: 9999,
      }}
      className="bg-[#FAF7F0] border border-stone-300 rounded-xl shadow-xl overflow-hidden font-body text-xs text-[#181816] animate-slide-up select-none"
    >
      {/* Popover Header */}
      <div className="px-3.5 py-2.5 bg-white border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[#0E4B3E] bg-[#D7F4E5] px-1.5 py-0.5 rounded border border-emerald-300/80">
            {order.id}
          </span>
          <span className="text-[11px] font-semibold text-stone-600 capitalize">
            {order.currentStage || 'Production'}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-md hover:bg-stone-100 border border-stone-200 text-stone-500 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Close order details"
        >
          <MaterialIcon name="close" size="xs" />
        </button>
      </div>

      {/* Popover Body - Independently Scrollable */}
      <div className="p-3.5 max-h-[330px] overflow-y-auto space-y-3">
        {/* Buyer & Fabric */}
        <div>
          <div className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold">Buyer & Article</div>
          <div className="font-semibold text-[13px] text-[#181816] mt-0.5">{order.buyer}</div>
          <div className="text-xs text-stone-600 mt-0.5">
            {order.fabric} {order.colour ? `· ${order.colour}` : ''}
          </div>
        </div>

        {/* Progress & Target */}
        <div className="p-2.5 bg-white border border-stone-200 rounded-lg space-y-1.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-stone-500 font-medium">Production Progress:</span>
            <span className="font-bold text-[#0E4B3E]">{progressVal}%</span>
          </div>
          <Progress value={progressVal} color="primary" size="sm" />
          <div className="flex justify-between items-center text-[11px] text-stone-600 pt-0.5">
            <span>Produced: <strong className="text-[#181816]">{producedQty.toLocaleString()}m</strong></span>
            <span>Target: <strong className="text-[#181816]">{targetQty.toLocaleString()}m</strong></span>
          </div>
        </div>

        {/* Operational Context */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 bg-white border border-stone-200 rounded-lg">
            <span className="text-stone-400 text-[10px] block font-medium">ASSIGNED MACHINE</span>
            <span className="font-mono font-semibold text-stone-800">{order.assignedMachine || 'Auto-Scheduled'}</span>
          </div>
          <div className="p-2 bg-white border border-stone-200 rounded-lg">
            <span className="text-stone-400 text-[10px] block font-medium">STATUS</span>
            <span
              className={`font-semibold ${
                order.status === 'Completed'
                  ? 'text-emerald-700'
                  : isDisrupted
                  ? 'text-red-700'
                  : 'text-[#0E4B3E]'
              }`}
            >
              {order.status || 'Active'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 bg-white border border-stone-200 rounded-lg">
            <span className="text-stone-400 text-[10px] block font-medium">DEADLINE</span>
            <span className="font-mono font-semibold text-stone-800">
              {order.deadline || (order.due ? `t = ${order.due}m` : 'On Schedule')}
            </span>
          </div>
          <div className="p-2 bg-white border border-stone-200 rounded-lg">
            <span className="text-stone-400 text-[10px] block font-medium">PRIORITY</span>
            <span className="font-semibold text-stone-800">{order.priority || 'P1 High'}</span>
          </div>
        </div>

        {/* Authoritative Pricing Snapshot */}
        {(order.unitPrice !== undefined || order.totalAmount !== undefined) && (
          <div className="p-2 bg-[#FAF7F0] border border-stone-200 rounded-lg text-[11px] space-y-1 font-mono">
            <div className="flex justify-between text-stone-500 text-[10px] uppercase font-bold">
              <span>Authoritative Pricing</span>
              <span>PostgreSQL Snapshot</span>
            </div>
            <div className="flex justify-between text-stone-800">
              <span>Unit Rate:</span>
              <span className="font-bold">${order.unitPrice ? Number(order.unitPrice).toFixed(2) : '—'} / m</span>
            </div>
            <div className="flex justify-between text-[#0E4B3E] font-bold border-t border-stone-200 pt-0.5">
              <span>Total Contract:</span>
              <span>${order.totalAmount ? Number(order.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            </div>
          </div>
        )}

        {/* 7-Stage Order Lifecycle Tracker */}
        <div className="p-2.5 bg-white border border-stone-200 rounded-lg space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-stone-500 uppercase">
            <span>Lifecycle Pipeline</span>
            <span className="text-[#0E4B3E]">{order.currentStage || 'Active'}</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[8.5px] font-mono">
            {[
              { label: 'Placed', idx: 0 },
              { label: 'Feasible', idx: 1 },
              { label: 'Scheduled', idx: 2 },
              { label: 'Production', idx: 3 },
              { label: 'Quality', idx: 4 },
              { label: 'Ready', idx: 5 },
              { label: 'Dispatched', idx: 6 },
            ].map((st) => {
              const currentIdx = (() => {
                const s = (order.status || '').toLowerCase()
                const c = (order.currentStage || '').toLowerCase()
                if (s.includes('dispatch') || order.dispatchStatus === 'Dispatched') return 6
                if (s.includes('ready_to_ship') || s.includes('ready_for_dispatch') || order.dispatchStatus?.includes('Ready')) return 5
                if (c === 'inspection' || order.qualityStatus === 'In Inspection') return 4
                if (s.includes('in production') || s.includes('running') || c === 'spinning' || c === 'weaving' || c === 'dyeing') return 3
                if (s.includes('scheduled') || s.includes('planned')) return 2
                return 1
              })()
              const isPast = st.idx < currentIdx
              const isCurr = st.idx === currentIdx
              return (
                <div key={st.label} className="flex flex-col items-center">
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold mb-0.5 ${
                      isPast
                        ? 'bg-emerald-600 text-white'
                        : isCurr
                        ? 'bg-[#0E4B3E] text-white ring-2 ring-emerald-300'
                        : 'bg-stone-200 text-stone-400'
                    }`}
                  >
                    {isPast ? '✓' : isCurr ? '•' : ''}
                  </div>
                  <span className={isCurr ? 'font-bold text-[#0E4B3E]' : 'text-stone-500'}>
                    {st.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Breakdown / Delay Callout */}
        {isDisrupted && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-900 space-y-1">
            <div className="flex items-center gap-1 font-semibold text-[11px]">
              <MaterialIcon name="warning" size="xs" color="#B91C1C" />
              <span>Machine Disruption Alert</span>
            </div>
            <p className="text-[10.5px] text-red-800 leading-snug">
              {order.disruptionNote ||
                'Mechanical collision halted weaving on WEAVE-03. 1,200m woven passed, 1,800m remaining halted.'}
            </p>
          </div>
        )}
      </div>

      {/* Popover Footer */}
      <div className="px-3 py-2 bg-stone-100/70 border-t border-stone-200 flex justify-between items-center text-[10px] text-stone-500">
        {canStartProduction && onStartProduction && !['Completed', 'In Production', 'in_production', 'ready_for_dispatch', 'completed'].includes(order.status || '') ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              onStartProduction(order)
            }}
            className="px-2 py-1 rounded bg-[#0E4B3E] hover:bg-[#0B382F] text-white font-semibold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <MaterialIcon name="play_arrow" size="xs" color="#FFFFFF" />
            Start Production
          </button>
        ) : (
          <span>Everest Floor Operations</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-stone-600 hover:text-black font-semibold cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
