'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { WorkforceAttendance } from '@/components/workforce/WorkforceAttendance'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'
import { clearSession, getUser } from '@/lib/auth-storage'

export default function WorkforceRoutePage() {
  const router = useRouter()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState<UserRole>('admin')

  useEffect(() => {
    const user = getUser()
    if (user?.role && ROLE_PROFILES[user.role as UserRole]) {
      setCurrentRole(user.role as UserRole)
    }
  }, [])

  const handleLogout = () => {
    clearSession()
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    } else {
      router.replace('/')
    }
  }

  const handleModuleClick = (module: string) => {
    setIsMobileSidebarOpen(false)
    if (module === 'workforce') return
    if (module === 'floor') {
      router.push('/')
    } else if (module === 'dashboard') {
      router.push('/dashboard')
    } else {
      router.push(`/?tab=${module}`)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased w-full min-w-0 overflow-hidden select-none font-body text-[13px]">
      <Header
        currentRole={currentRole}
        onLogout={handleLogout}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onBrandClick={() => router.push('/')}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          onModuleClick={handleModuleClick}
          onOrderSelect={() => router.push('/')}
          activeModule="workforce"
          selectedOrder={null}
          currentTime={360}
          currentShift="Shift 1 (08:00 - 16:00)"
          onFilterStage={() => router.push('/')}
          onSelectDisruption={() => router.push('/')}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          currentRole={currentRole}
        />

        <WorkforceAttendance />
      </div>
    </div>
  )
}
