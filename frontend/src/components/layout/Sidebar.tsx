'use client'

import { Button, MaterialIcon, Card } from '@/components/ui'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'

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
  currentRole?: UserRole
}

const allModules = [
  { id: 'floor', label: 'Production Floor', icon: 'grid_view', count: '12 Orders', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'dashboard', label: 'Operations Dashboard', icon: 'dashboard', count: 'Executive', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'workforce', label: 'Workforce & Attendance', icon: 'badge', count: '10 Workers', color: '#0E4B3E', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'yarn', label: 'Yarn Stock & Lots', icon: 'inventory_2', count: '1 Delay', badgeBg: '#FEF08A', badgeColor: '#713F12' },
  { id: 'validator', label: 'Schedule Validator', icon: 'verified', count: '0 Viol', badgeBg: '#D7F4E5', badgeColor: '#0B382F' },
  { id: 'rolls', label: 'Rolls & Traceability', icon: 'qr_code' },
  { id: 'dispatch', label: 'Finished Dispatches', icon: 'local_shipping' },
]

export function Sidebar({
  onModuleClick,
  activeModule,
  isOpenMobile = false,
  onCloseMobile,
  currentRole = 'admin',
}: SidebarProps) {
  const roleProfile = ROLE_PROFILES[currentRole]
  const allowed = roleProfile.allowedModules
  const visibleModules = allModules.filter((m) => allowed.includes(m.id))

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
                <MaterialIcon name={currentRole === 'customer' ? 'person' : 'precision_manufacturing'} size="lg" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[13px] leading-tight truncate">
                  {currentRole === 'customer' ? 'Buyer Tracking Portal' : 'Production Operations'}
                </span>
                <span className="font-mono text-[10px] text-[#1E3A2F] font-semibold truncate">
                  {currentRole === 'customer' ? 'ZARA Sourcing Orders' : 'Operations Navigation'}
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
        </div>

        {/* Navigation list */}
        <div className="flex-1 py-3 px-2 overflow-y-auto space-y-1.5">
          <div className="px-2 pb-0.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#1E3A2F] uppercase tracking-wider font-bold">
              {currentRole === 'customer' ? 'Customer Views' : 'Operational Modules'}
            </span>
            <span className="font-mono text-[9px] bg-[#FAF7F0] px-1.5 py-0.2 rounded border border-[#181816] font-bold">
              {visibleModules.length} Active
            </span>
          </div>

          {visibleModules.map((module) => (
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

          {/* Customer info card - shown only for customer role */}
          {currentRole === 'customer' && (
            <div className="pt-2">
              <Card variant="elevated" padding="sm" className="space-y-2 bg-white">
                <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#0E4B3E]">
                  <MaterialIcon name="verified_user" size="xs" color="#0E4B3E" />
                  <span>Authenticated Client</span>
                </div>
                <div className="text-[11px] text-stone-600 space-y-1 font-mono">
                  <div>Buyer ID: <strong>#1</strong></div>
                  <div>Account: <strong>ZARA Sourcing</strong></div>
                  <div>Contract: <strong>FY2026 Batch</strong></div>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Clean, compact footer */}
        <div className="border-t-2 border-[#181816] p-2.5 bg-[#718D80] font-mono text-[10px] space-y-0.5">
          <div className="flex justify-between items-center text-[#181816] font-bold">
            <span>FastAPI Server</span>
            <span className="text-[9.5px] bg-[#D7F4E5] text-[#0B382F] px-1.5 py-0.2 rounded border border-[#181816]">
              Port 8000
            </span>
          </div>
          <div className="text-[#1E3A2F]">Role: {roleProfile.name}</div>
        </div>
      </aside>
    </>
  )
}