'use client'

import { useState } from 'react'
import { Button, MaterialIcon, Card } from '@/components/ui'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'

import { getUser } from '@/lib/auth-storage'

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
  { id: 'validator', label: 'Production Scheduling', icon: 'verified' },
  { id: 'rolls', label: 'Rolls & Traceability', icon: 'qr_code' },
  { id: 'dispatch', label: 'Finished Dispatches', icon: 'local_shipping' },
  { id: 'reports', label: 'Reports & Export', icon: 'description', count: 'PDF/XLSX', badgeBg: '#E0E7FF', badgeColor: '#3730A3' },
]

export function Sidebar({
  onModuleClick,
  activeModule,
  isOpenMobile = false,
  onCloseMobile,
  currentRole = 'admin',
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const roleProfile = ROLE_PROFILES[currentRole]
  const allowed = roleProfile.allowedModules
  const visibleModules = allModules.filter((m) => allowed.includes(m.id))
  const user = getUser()
  const buyerIdText = user?.buyer_id ? `#${user.buyer_id}` : 'Direct Account'
  const accountName = user?.name || roleProfile.name

  const handleSelectModule = (id: string) => {
    onModuleClick(id)
    onCloseMobile?.()
  }

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-[#181816]/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static top-12 bottom-0 left-0 z-40 lg:z-30 bg-[#7D988B] border-r border-[#637d71] flex flex-col justify-between shrink-0 text-[#181816] transition-all duration-200 ease-in-out shadow-lg lg:shadow-none relative ${
          isOpenMobile ? 'translate-x-0 w-60' : '-translate-x-full lg:translate-x-0'
        } ${!isOpenMobile ? (isCollapsed ? 'lg:w-16' : 'lg:w-60') : ''}`}
      >
        {/* Accessible Toggle Button at halfway down the right boundary */}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-50 w-7 h-7 rounded-full bg-white border border-stone-300 shadow-md items-center justify-center text-stone-700 hover:text-black hover:bg-stone-50 transition-transform active:scale-95 cursor-pointer focus:outline-hidden"
          aria-label={isCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MaterialIcon name={isCollapsed ? 'chevron_right' : 'chevron_left'} size="xs" />
        </button>

        {/* Brand / Role Header */}
        <div className="p-3 border-b border-[#637d71] bg-[#718D80] shrink-0">
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
                  {currentRole === 'customer' ? accountName : 'Operations Navigation'}
                </span>
              </div>

              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-xs leading-tight truncate">
                    {currentRole === 'customer' ? 'Buyer Tracking Portal' : 'Operations Nav'}
                  </span>
                  <span className="text-[10px] text-[#1E3A2F] truncate">
                    {currentRole === 'customer' ? 'ZARA Sourcing Orders' : roleProfile.name}
                  </span>
                </div>
              )}
            </div>

            {/* Close button on mobile */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center text-[#181816] hover:bg-stone-100 shadow-xs shrink-0 cursor-pointer"
              aria-label="Close navigation"
            >
              <MaterialIcon name="close" size="xs" />
            </button>
          </div>
        </div>

        {/* Navigation list - independently scrollable vertically */}
        <div className="flex-1 py-3 px-2 overflow-y-auto overflow-x-hidden space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-[10px] text-[#1E3A2F] uppercase tracking-wider font-bold">
                {currentRole === 'customer' ? 'Customer Views' : 'Modules'}
              </span>
              <span className="text-[9px] bg-[#FAF7F0] px-1.5 py-0.2 rounded border border-stone-300 font-semibold">
                {visibleModules.length} Active
              </span>
            </div>
          )}

          {visibleModules.map((module) => {
            const isActive = activeModule === module.id
            return (
              <Button
                key={module.id}
                variant={isActive ? 'pop' : 'ghost'}
                size="sm"
                className={`w-full rounded-lg transition-colors cursor-pointer ${
                  isCollapsed ? 'justify-center px-0' : 'justify-start'
                } ${
                  isActive
                    ? 'bg-white border-stone-200 text-[#0E4B3E] font-semibold shadow-xs'
                    : 'text-[#181816] hover:bg-white/60 border-transparent'
                }`}
                icon={<MaterialIcon name={module.icon} size="sm" color={module.color || '#181816'} />}
                onClick={() => handleSelectModule(module.id)}
                title={module.label}
              >
                {!isCollapsed && <span className="flex-1 truncate text-left text-xs">{module.label}</span>}
                {!isCollapsed && module.count && (
                  <span
                    className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded border border-stone-300/80 shrink-0"
                    style={{
                      backgroundColor: module.badgeBg || '#D7F4E5',
                      color: module.badgeColor || '#0B382F',
                    }}
                  >
                    {module.count}
                  </span>
                )}
              </Button>
            )
          })}

          {/* Customer info card - shown only for customer role when expanded */}
          {currentRole === 'customer' && !isCollapsed && (
            <div className="pt-2">
              <Card variant="elevated" padding="sm" className="space-y-1.5 bg-white border-stone-200">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0E4B3E]">
                  <MaterialIcon name="verified_user" size="xs" color="#0E4B3E" />
                  <span>Authenticated Client</span>
                </div>
                <div className="text-[11px] text-stone-600 space-y-1 font-mono">
                  <div>Buyer ID: <strong>{buyerIdText}</strong></div>
                  <div>Account: <strong className="truncate">{accountName}</strong></div>
                  <div>Email: <strong className="truncate">{user?.email || 'N/A'}</strong></div>
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