'use client'

import { Button, Badge, MaterialIcon } from '@/components/ui'
import type { ScenarioName } from '@/types'

interface HeaderProps {
  activeModule?: string
  onModuleClick?: (module: string) => void
  onToggleMobileSidebar?: () => void
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
  activeModule = 'floor',
  onModuleClick,
  onToggleMobileSidebar,
  activeScenario,
  onScenarioChange,
  onSimulateDisruption,
  onTriggerReplan,
  isResolved,
  disruptionText,
  solverStatus,
}: HeaderProps) {
  return (
    <header className="flex justify-between items-center w-full px-3 sm:px-5 h-12 z-40 border-b-2 border-[#181816] bg-[#FFFFFF] shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Sidebar Hamburger Toggle */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden w-8 h-8 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] hover:bg-[#E7DFCE] flex items-center justify-center pop-shadow-xs btn-pop shrink-0"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <MaterialIcon name="menu" size="sm" />
        </button>

        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => onModuleClick?.('floor')}>
          <span className="w-7 h-7 bg-[#0E4B3E] text-white rounded-xl border-2 border-[#181816] pop-shadow-xs flex items-center justify-center font-mono text-[13px] font-bold shrink-0">
            ET
          </span>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[13.5px] sm:text-[14px] text-[#181816] tracking-tight leading-none truncate">
              Everest Textile Mills
            </span>
            <span className="font-mono text-[9px] sm:text-[9.5px] text-[#4E4B47] leading-none mt-0.5 truncate hidden sm:block">
              Code-Ninjas Intelligence Platform
            </span>
          </div>
        </div>

        <div className="h-5 w-0.5 bg-[#181816]/30 mx-1 hidden xl:block" />

        <Button
          variant="pop"
          size="sm"
          icon={<MaterialIcon name="factory" size="sm" color="#0E4B3E" />}
          onClick={() => onModuleClick?.('dashboard')}
          title="Unit 1 Spinning, Weaving & Dyeing Operations"
          className="hidden 2xl:inline-flex"
        >
          <span>Unit 1: Spinning • Weaving • Dyeing</span>
        </Button>

        <nav className="hidden xl:flex items-center gap-1 ml-1 text-[12px]">
          <Button
            variant={activeModule === 'dashboard' ? 'primary' : 'ghost'}
            size="xs"
            className={activeModule === 'dashboard' ? 'pop-shadow-xs font-bold' : ''}
            onClick={() => onModuleClick?.('dashboard')}
          >
            Operations Dashboard
          </Button>
          <Button
            variant={activeModule === 'floor' ? 'primary' : 'ghost'}
            size="xs"
            className={activeModule === 'floor' ? 'pop-shadow-xs font-bold' : ''}
            onClick={() => onModuleClick?.('floor')}
          >
            Production Floor
          </Button>
          <Button
            variant={activeModule === 'workforce' ? 'primary' : 'ghost'}
            size="xs"
            className={activeModule === 'workforce' ? 'pop-shadow-xs font-bold' : ''}
            onClick={() => onModuleClick?.('workforce')}
          >
            Workforce & Attendance
          </Button>
        </nav>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Badge variant="success" size="xs" dotColor="#15803D" className="gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border-2 border-[#181816] pop-shadow-xs font-mono text-[10px] sm:text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#15803D] border border-[#181816] live-dot shrink-0" />
          <span className="hidden md:inline">{solverStatus}</span>
          <span className="md:hidden">OPTIMAL</span>
        </Badge>

        <Button
          variant="outline"
          size="xs"
          className={`flex items-center gap-1 bg-[#FFEFEA] hover:bg-[#FEDCCE] text-[#962C0B] border-2 border-[#181816] rounded-full px-2 sm:px-2.5 py-1 font-mono text-[10px] sm:text-[11px] btn-pop font-bold ${isResolved ? 'hidden' : ''}`}
          icon={<MaterialIcon name="broken_image" size="sm" color="#E05326" />}
          title={disruptionText}
        >
          <span className="hidden sm:inline">{disruptionText}</span>
          <span className="sm:hidden">Alert</span>
        </Button>

        <Badge variant="warning" size="xs" className="hidden lg:inline-flex px-2 py-0.5 rounded-full border-2 border-[#181816] font-mono text-[10px] font-bold pop-shadow-xs">
          synthetic: true
        </Badge>

        <Button
          variant="pop"
          size="sm"
          icon={<MaterialIcon name="warning" size="sm" color="#E05326" />}
          onClick={onSimulateDisruption}
          className="hidden md:inline-flex text-[11px]"
        >
          <span>Disrupt</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={<MaterialIcon name="refresh" size="md" />}
          onClick={onTriggerReplan}
          className="text-[11px]"
        >
          <span className="hidden sm:inline">Re-Solve</span>
        </Button>

        <div className="w-7 h-7 rounded-full bg-[#E7DFCE] text-[#181816] flex items-center justify-center font-mono text-[11px] font-bold border-2 border-[#181816] pop-shadow-xs ml-0.5 sm:ml-1 shrink-0" title="Shift Supervisor: Likith">
          LK
        </div>
      </div>
    </header>
  )
}