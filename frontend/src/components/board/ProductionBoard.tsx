'use client'

import { Button, MaterialIcon } from '@/components/ui'
import { SpinningColumn, WeavingColumn, DyeingColumn } from './index'

interface ProductionBoardProps {
  selectedOrder: string | null
  onOrderSelect: (orderId: string) => void
  onFilterStage: (stage: string) => void
  onSelectDisruption: (type: 'breakdown' | 'yarn_delay') => void
  onSimulateDisruption?: () => void
  isResolved: boolean
  disruptionText?: string
}

const stageFilters = [
  { id: 'all', label: 'All Stages (12 Orders)' },
  { id: 'spinning', label: 'Spinning (5)' },
  { id: 'weaving', label: 'Weaving (5)' },
  { id: 'dyeing', label: 'Dyeing (4)' },
]

export function ProductionBoard({
  selectedOrder,
  onOrderSelect,
  onFilterStage,
  onSelectDisruption,
  onSimulateDisruption,
  isResolved,
  disruptionText = '1 Breakdown (WEAVE-03)',
}: ProductionBoardProps) {
  return (
    <main className="flex-1 flex flex-col min-w-0 bg-dot-grid overflow-hidden">
      {/* Floor Operational Toolbar: Simplified and Uncluttered */}
      <div className="min-h-11 px-3 sm:px-4 py-2 bg-white border-b-2 border-[#181816] flex flex-wrap items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] text-[#4E4B47] uppercase font-bold">Pipeline:</span>
          {stageFilters.map((filter) => (
            <Button
              key={filter.id}
              variant={filter.id === 'all' ? 'primary' : 'pop'}
              size="xs"
              className={filter.id === 'all' ? 'pop-shadow-xs' : ''}
              onClick={() => onFilterStage(filter.id)}
            >
              {filter.label}
            </Button>
          ))}

          <div className="h-4 w-0.5 bg-[#181816]/20 mx-1 hidden sm:block" />

          {/* Machine breakdown alert badge beside affected orders */}
          {!isResolved && (
            <Button
              variant="outline"
              size="xs"
              className="flex items-center gap-1.5 bg-[#FFEFEA] hover:bg-[#FEDCCE] border-2 border-[#181816] text-[#962C0B] pop-shadow-xs btn-pop font-mono font-bold text-[10.5px]"
              icon={<span className="w-2 h-2 rounded-full bg-[#E05326] border border-[#181816]" />}
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
              className="font-mono text-xs font-bold"
              title="Simulate machine breakdown or delayed yarn"
            >
              Simulate Disruption
            </Button>
          )}
        </div>
      </div>

      {/* Production floor board columns: Full-width responsive 3-stage pipeline (Yarn Feasibility panel removed) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4">
        <SpinningColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} />
        <WeavingColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} isResolved={isResolved} />
        <DyeingColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} />
      </div>
    </main>
  )
}