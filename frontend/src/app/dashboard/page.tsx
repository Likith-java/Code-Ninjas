'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { OperationsDashboard } from '@/components/dashboard/OperationsDashboard'
import { UserRole } from '@/lib/permissions'

export default function DashboardRoutePage() {
  const router = useRouter()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState<UserRole>('admin')

  const handleModuleClick = (module: string) => {
    setIsMobileSidebarOpen(false)
    if (module === 'dashboard') return
    if (module === 'floor') {
      router.push('/')
    } else if (module === 'workforce') {
      router.push('/workforce')
    } else {
      router.push(`/?tab=${module}`)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased w-full min-w-0 overflow-hidden select-none font-body text-[13px]">
      <Header
        currentRole={currentRole}
        onLogout={() => router.push('/?tab=login')}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onBrandClick={() => router.push('/')}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onModuleClick={handleModuleClick}
          onOrderSelect={() => router.push('/')}
          activeModule="dashboard"
          selectedOrder={null}
          currentTime={360}
          currentShift="Shift 1 (08:00 - 16:00)"
          onFilterStage={() => router.push('/')}
          onSelectDisruption={() => router.push('/')}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          currentRole={currentRole}
        />

        <OperationsDashboard currentRole={currentRole} />
      </div>
    </div>
  )
}
