'use client'

import { Button, Badge, MaterialIcon } from '@/components/ui'
import type { ScenarioName } from '@/types'

interface HeaderProps {
  activeScenario: ScenarioName
  onScenarioChange: (scenario: ScenarioName) => void
  onSimulateDisruption: () => void
  onTriggerReplan: () => void
  isResolved: boolean
  disruptionText: string
  solverStatus: string
}

const scenarios: { id: ScenarioName; label: string }[] = [
  { id: 'feasible', label: 'feasible.json' },
  { id: 'breakdown', label: 'breakdown.json' },
  { id: 'late_yarn', label: 'late_yarn.json' },
]

export function Header({
  activeScenario,
  onScenarioChange,
  onSimulateDisruption,
  onTriggerReplan,
  isResolved,
  disruptionText,
  solverStatus,
}: HeaderProps) {
  return (
    <header className="flex justify-between items-center w-full px-5 h-12 z-40 border-b-2 border-[#181816] bg-[#FFFFFF] shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-[#0E4B3E] text-white rounded-xl border-2 border-[#181816] pop-shadow-xs flex items-center justify-center font-mono text-[13px] font-bold">
            ET
          </span>
          <div className="flex flex-col">
            <span className="font-bold text-[14px] text-[#181816] tracking-tight leading-none">
              Everest Textile Mills
            </span>
            <span className="font-mono text-[9.5px] text-[#4E4B47] leading-none mt-0.5">
              Code-Ninjas Intelligence Platform
            </span>
          </div>
        </div>
        <div className="h-5 w-0.5 bg-[#181816]/30 mx-1" />

        <Button variant="pop" size="sm" icon={<MaterialIcon name="factory" size="sm" color="#0E4B3E" />}>
          <span>Unit 1: Spinning • Weaving • Dyeing</span>
          <MaterialIcon name="unfold_more" size="xs" />
        </Button>

        <nav className="flex items-center gap-1 ml-2 text-[12px]">
          <Button variant="primary" size="xs" className="pop-shadow-xs">
            Production Floor
          </Button>
          <Button variant="ghost" size="xs">Gantt Timeline</Button>
          <Button variant="ghost" size="xs">Yarn Inventory</Button>
          <Button variant="ghost" size="xs">Quality & Rolls</Button>
          <Button variant="ghost" size="xs">Buyer Portal</Button>
        </nav>
      </div>

      <div className="flex items-center gap-2.5">
        <Badge variant="success" size="xs" dotColor="#15803D" className="gap-1.5 px-2.5 py-1 rounded-full border-2 border-[#181816] pop-shadow-xs font-mono text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#15803D] border border-[#181816] live-dot" />
          {solverStatus}
        </Badge>

        <Button
          variant="outline"
          size="xs"
          className={`flex items-center gap-1 bg-[#FFEFEA] hover:bg-[#FEDCCE] text-[#962C0B] border-2 border-[#181816] rounded-full px-2.5 py-1 font-mono text-[11px] btn-pop font-bold ${isResolved ? 'hidden' : ''}`}
          icon={<MaterialIcon name="broken_image" size="sm" color="#E05326" />}
        >
          {disruptionText}
        </Button>

        <Badge variant="warning" size="xs" className="px-2 py-0.5 rounded-full border-2 border-[#181816] font-mono text-[10px] font-bold pop-shadow-xs">
          synthetic: true
        </Badge>

        <Button
          variant="pop"
          size="sm"
          icon={<MaterialIcon name="warning" size="sm" color="#E05326" />}
          onClick={onSimulateDisruption}
        >
          Simulate Disruption
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={<MaterialIcon name="refresh" size="md" />}
          onClick={onTriggerReplan}
        >
          Re-Solve Schedule
        </Button>

        <div className="w-7 h-7 rounded-full bg-[#E7DFCE] text-[#181816] flex items-center justify-center font-mono text-[11px] font-bold border-2 border-[#181816] pop-shadow-xs ml-1" title="Shift Supervisor">
          LK
        </div>
      </div>
    </header>
  )
}