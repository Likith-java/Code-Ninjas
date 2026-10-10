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
}

const modules = [
  { id: 'floor', label: 'Live Floor Routing', icon: 'grid_view', count: '12 Orders', color: '#0E4B3E', bgColor: '#D7F4E5' },
  { id: 'yarn', label: 'Yarn Stock & Lots', icon: 'inventory_2', count: '1 Delay', badgeColor: '#FEF08A', badgeTextColor: '#713F12' },
  { id: 'validator', label: 'Schedule Validator', icon: 'verified', count: '0 Viol', badgeColor: '#D7F4E5', badgeTextColor: '#0B382F' },
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
}: SidebarProps) {
  return (
    <aside className="w-64 bg-[#7D988B] border-r-2 border-[#181816] flex flex-col justify-between shrink-0 z-30 text-[#181816]">
      <div className="p-3.5 border-b-2 border-[#181816] bg-[#718D80]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white border-2 border-[#181816] rounded-xl pop-shadow-xs flex items-center justify-center text-[#0E4B3E]">
            <MaterialIcon name="precision_manufacturing" size="lg" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[13px] leading-tight truncate">Production Scheduler</span>
            <span className="font-mono text-[10px] text-[#1E3A2F] font-semibold">
              10 Machines • 12 Orders
            </span>
          </div>
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
            className={`w-full justify-start rounded-xl ${activeModule === module.id ? 'bg-white border-2 border-[#181816] pop-shadow-xs' : 'hover:bg-white border-transparent'}`}
            icon={<MaterialIcon name={module.icon} size="sm" color={module.color || '#181816'} />}
            onClick={() => onModuleClick(module.id)}
          >
            <span className="flex-1">{module.label}</span>
            {module.count && (
              <Badge
                variant={module.badgeColor ? 'default' : 'default'}
                size="xs"
                className={module.badgeColor ? `bg-[${module.badgeColor}] text-[${module.badgeTextColor}] border border-[#181816]` : 'bg-[#D7F4E5] text-[#0B382F] border border-[#181816]'}
              >
                {module.count}
              </Badge>
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
  )
}