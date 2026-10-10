'use client'

import { Button, Badge, MaterialIcon, Card } from '@/components/ui'
import { mockMachines, mockOrders } from '@/lib/mockData'
import type { Machine, Order } from '@/types'

interface SidebarProps {
  onModuleClick: (module: string) => void
  onOrderSelect: (orderId: string) => void
  activeModule: string
  selectedOrder: string | null
  currentTime: number
  currentShift: string
  onFilterStage: (stage: string) => void
  onSelectDisruption: (type: 'breakdown' | 'yarn_delay') => void
  isOpenMobile?: boolean
  onCloseMobile?: () => void
}

const modules = [
  { id: 'floor', label: 'Production Floor', icon: 'grid_view', count: '12 Orders', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'dashboard', label: 'Operations Dashboard', icon: 'dashboard', count: 'Executive', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'workforce', label: 'Workforce & Attendance', icon: 'badge', count: '10 Workers', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'yarn', label: 'Yarn Stock & Lots', icon: 'inventory_2', count: '1 Delay', badgeBg: '#FEF08A', badgeColor: '#713F12' },
  { id: 'validator', label: 'Schedule Validator', icon: 'verified', count: '0 Viol', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'rolls', label: 'Rolls & Traceability', icon: 'qr_code' },
  { id: 'dispatch', label: 'Finished Dispatches', icon: 'local_shipping' },
]

const machineGroups = [
  { stage: 'spinning', ids: 'SPIN-01..03', color: '#15803D', count: 3, label: '3 Active' },
  { stage: 'weaving', ids: 'WEAVE-01..05', color: '#E05326', count: 1, label: '1 Down', downCount: 4 },
  { stage: 'dyeing', ids: 'DYE-01..02', color: '#15803D', count: 2, label: '2 Active' },
]

export function Sidebar({
  onModuleClick,
  onOrderSelect,
  activeModule,
  selectedOrder,
  currentTime,
  currentShift,
  onFilterStage,
  onSelectDisruption,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const handleSelectModule = (id: string) => {
    onModuleClick(id)
    onCloseMobile?.()
  }

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-[#181816]/50 backdrop-blur-xs z-30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static top-12 bottom-0 left-0 z-40 lg:z-30 w-64 bg-[#7D988B] border-r-2 border-[#181816] flex flex-col justify-between shrink-0 text-[#181816] transition-transform duration-200 ease-in-out shadow-2xl lg:shadow-none ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-3.5 border-b-2 border-[#181816] bg-[#718D80]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-white border-2 border-[#181816] rounded-xl pop-shadow-xs flex items-center justify-center text-[#0E4B3E] shrink-0">
                <MaterialIcon name="precision_manufacturing" size="lg" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[13px] leading-tight truncate">Production Scheduler</span>
                <span className="font-mono text-[10px] text-[#1E3A2F] font-semibold">
                  10 Machines • 12 Orders
                </span>
              </div>
            </div>

            {/* Close button on mobile */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden w-7 h-7 rounded-lg border-2 border-[#181816] bg-white flex items-center justify-center text-[#181816] hover:bg-stone-100 pop-shadow-xs shrink-0"
              aria-label="Close navigation"
            >
              <MaterialIcon name="close" size="xs" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between bg-white border-2 border-[#181816] rounded-xl px-2.5 py-1.5 pop-shadow-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#181816]">
              <MaterialIcon name="schedule" size="sm" color="#0E4B3E" />
              <span>{currentShift}</span>
            </div>
            <span className="font-mono text-[10px] bg-[#D7F4E5] text-[#0B382F] px-1.5 py-0.5 rounded border border-[#181816] font-bold">
              t = {currentTime}m
            </span>
          </div>
        </div>

        <div className="flex-1 py-3 px-2 overflow-y-auto space-y-1.5">
          <div className="px-2 pb-0.5">
            <span className="font-mono text-[10px] text-[#1E3A2F] uppercase tracking-wider font-bold">
              Plant Core Modules
            </span>
          </div>

          {modules.map((module) => (
            <Button
              key={module.id}
              variant={activeModule === module.id ? 'pop' : 'ghost'}
              size="sm"
              className={`w-full justify-start rounded-xl ${
                activeModule === module.id
                  ? 'bg-white border-2 border-[#181816] pop-shadow-xs font-bold'
                  : 'hover:bg-white border-transparent'
              }`}
              icon={<MaterialIcon name={module.icon} size="sm" color={module.color || '#181816'} />}
              onClick={() => handleSelectModule(module.id)}
            >
              <span className="flex-1 truncate">{module.label}</span>
              {module.count && (
                <span
                  className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded border border-[#181816] shrink-0"
                  style={{
                    backgroundColor: module.badgeBg || '#D7F4E5',
                    color: module.badgeColor || '#0B382F',
                  }}
                >
                  {module.count}
                </span>
              )}
            </Button>
          ))}

          <div className="pt-2">
            <Card variant="elevated" padding="sm" className="space-y-2">
              <div className="flex items-center justify-between font-mono text-[10px] text-[#4E4B47] uppercase font-bold">
                <span>Optimization Delta</span>
                <span className="text-[#0E4B3E]">vs EDF Baseline</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div className="bg-[#FAF7F0] p-1.5 rounded-xl border border-[#181816]">
                  <span className="block text-[9.5px] text-[#78716C]">Weighted Tardiness</span>
                  <span className="font-bold text-[#15803D] text-[12px]">-34.2%</span>
                </div>
                <div className="bg-[#FAF7F0] p-1.5 rounded-xl border border-[#181816]">
                  <span className="block text-[9.5px] text-[#78716C]">Utilization</span>
                  <span className="font-bold text-[#0E4B3E] text-[12px]">84.6%</span>
                </div>
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] pt-1 border-t border-[#E7DFCE]">
                <span className="text-[#78716C]">Horizon: 10,080m (7d)</span>
                <span className="font-bold text-[#181816]">Seed: 42</span>
              </div>
            </Card>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between pb-1 px-1">
              <span className="font-mono text-[10px] text-[#1E3A2F] uppercase tracking-wider font-bold">Active Machines</span>
              <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-1.5 rounded-full text-[#0B382F] font-bold">
                9/10 Running
              </Badge>
            </div>
            <Card variant="elevated" padding="sm" className="font-mono text-[11px] space-y-1">
              {machineGroups.map((group) => (
                <div key={group.stage} className="flex items-center justify-between py-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.ids}
                  </span>
                  <span className="font-bold" style={{ color: group.color }}>
                    {group.label}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div className="border-t-2 border-[#181816] p-2.5 bg-[#718D80] font-mono text-[10px] space-y-1">
          <div className="flex justify-between items-center text-[#181816] font-bold">
            <span>FastAPI + OR-Tools v9.8</span>
            <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-1.5 rounded-full text-[#0B382F]">
              ready
            </Badge>
          </div>
          <div className="text-[#1E3A2F]">Reference: Everest Textile Mills</div>
        </div>
      </aside>
    </>
  )
}