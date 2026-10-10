'use client'

import { Button, Badge, MaterialIcon } from '@/components/ui'
import { YarnFeasibilityColumn, SpinningColumn, WeavingColumn, DyeingColumn } from './index'
import type { ScenarioName } from '@/types'

interface ProductionBoardProps {
  selectedOrder: string | null
  onOrderSelect: (orderId: string) => void
  activeScenario: ScenarioName
  onScenarioChange: (scenario: ScenarioName) => void
  onFilterStage: (stage: string) => void
  onSelectDisruption: (type: 'breakdown' | 'yarn_delay') => void
  isResolved: boolean
}

const scenarios: { id: ScenarioName; label: string }[] = [
  { id: 'feasible', label: 'feasible.json' },
  { id: 'breakdown', label: 'breakdown.json' },
  { id: 'late_yarn', label: 'late_yarn.json' },
]

const stageFilters = [
  { id: 'all', label: 'All Route Stages (12 Orders)', color: '#0E4B3E' },
  { id: 'spinning', label: 'Spinning (3)', count: 3 },
  { id: 'weaving', label: 'Weaving (5)', count: 5 },
  { id: 'dyeing', label: 'Dyeing (4)', count: 4 },
]

export function ProductionBoard({
  selectedOrder,
  onOrderSelect,
  activeScenario,
  onScenarioChange,
  onFilterStage,
  onSelectDisruption,
  isResolved,
}: ProductionBoardProps) {
  return (
    <main className="flex-1 flex flex-col min-w-0 bg-dot-grid overflow-hidden">
      <div className="h-10 px-4 bg-white border-b-2 border-[#181816] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[#4E4B47] uppercase font-bold">Pipeline Stage:</span>
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
          <div className="h-4 w-0.5 bg-[#181816]/30 mx-1" />
          <Button
            variant="outline"
            size="xs"
            className="flex items-center gap-1.5 bg-[#FFEFEA] hover:bg-[#FEDCCE] border-2 border-[#181816] text-[#962C0B] pop-shadow-xs btn-pop font-mono font-bold"
            icon={<span className="w-2 h-2 rounded-full bg-[#E05326] border border-[#181816]" />}
            onClick={() => onSelectDisruption('breakdown')}
          >
            WEAVE-03 Collision (Active)
          </Button>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-[#78716C] font-semibold">Scenario:</span>
          <div className="flex items-center bg-white rounded-full border-2 border-[#181816] pop-shadow-xs overflow-hidden p-0.5">
            {scenarios.map((scenario) => (
              <Button
                key={scenario.id}
                variant={activeScenario === scenario.id ? 'primary' : 'ghost'}
                size="xs"
                className="rounded-full"
                onClick={() => onScenarioChange(scenario.id)}
              >
                {scenario.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4">
        <YarnFeasibilityColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} onAddOrder={() => {}} />
        <SpinningColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} />
        <WeavingColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} isResolved={isResolved} />
        <DyeingColumn onOrderSelect={onOrderSelect} selectedOrder={selectedOrder} />
      </div>
    </main>
  )
}