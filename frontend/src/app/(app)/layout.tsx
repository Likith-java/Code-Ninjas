"use client";

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { DisruptionModal } from '@/components/modals/DisruptionModal'
import { ToastContainer } from '@/components/ui/Toast'
import { ModulePendingView } from '@/components/layout/ModulePendingView'
import ProtectedRoute from '@/components/ProtectedRoute'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'
import { useAppState } from '@/hooks/useAppState'
import { clearSession, getUser } from '@/lib/auth-storage'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeModule, setActiveModule] = useState<string>('floor')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState<UserRole>('admin')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true)

  const router = useRouter()

  useEffect(() => {
    const user = getUser()
    if (user?.role && ROLE_PROFILES[user.role as UserRole]) {
      setCurrentRole(user.role as UserRole)
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab && tab !== 'login') {
        setActiveModule(tab)
      } else if (window.location.pathname.includes('dashboard')) {
        setActiveModule('dashboard')
      } else if (window.location.pathname.includes('workforce')) {
        setActiveModule('workforce')
      }
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') || 'floor'
      setActiveModule(tab)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleModuleClick = (module: string) => {
    setActiveModule(module)
    setIsMobileSidebarOpen(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (module === 'floor') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', module)
      }
      window.history.pushState({}, '', url.toString())
    }
  }

  const handleLogout = () => {
    clearSession()
    setIsAuthenticated(false)
    setActiveModule('login')
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    } else {
      router.replace('/')
    }
  }

  const handleLoginSuccess = (role: UserRole) => {
    setCurrentRole(role)
    setIsAuthenticated(true)
    const defaultMod = ROLE_PROFILES[role].defaultModule
    setActiveModule(defaultMod)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (defaultMod === 'floor') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', defaultMod)
      }
      window.history.pushState({}, '', url.toString())
    }
  }

  const {
    selectedOrder,
    simModalOpen,
    toasts,
    isResolved,
    currentTime,
    currentShift,
    selectOrder,
    setSimModalOpen,
    selectDisruption,
    executeSimDisruption,
    onFilterStage,
    removeToast,
  } = useAppState()

  const disruptionText = isResolved ? '0 Disruption Alerts' : '1 Breakdown (WEAVE-03)'

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased w-full min-w-0 overflow-hidden select-none font-body text-[13px]">
        <Header
          currentRole={currentRole}
          onLogout={handleLogout}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          onBrandClick={() => handleModuleClick('floor')}
        />

        <div className="flex-1 flex overflow-hidden relative">
          <Sidebar
            onModuleClick={handleModuleClick}
            onOrderSelect={selectOrder}
            activeModule={activeModule}
            selectedOrder={selectedOrder}
            currentTime={currentTime}
            currentShift={currentShift}
            onFilterStage={onFilterStage}
            onSelectDisruption={selectDisruption}
            isOpenMobile={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            currentRole={currentRole}
          />

          {activeModule === 'floor' && (
            <ProductionBoard
              selectedOrder={selectedOrder}
              onOrderSelect={selectOrder}
              onFilterStage={onFilterStage}
              onSelectDisruption={selectDisruption}
              onSimulateDisruption={() => setSimModalOpen(true)}
              isResolved={isResolved}
              disruptionText={disruptionText}
            />
          )}

          {activeModule === 'dashboard' && <OperationsDashboard currentRole={currentRole} />}
          {activeModule === 'workforce' && <WorkforceAttendance />}
          {activeModule === 'yarn' && <YarnInventoryView />}
          {activeModule === 'rolls' && <FabricRollsView />}
          {activeModule === 'dispatch' && <DispatchesView />}
          {activeModule === 'validator' && <ScheduleValidatorView />}
          {activeModule !== 'floor' &&
            activeModule !== 'dashboard' &&
            activeModule !== 'workforce' &&
            activeModule !== 'yarn' &&
            activeModule !== 'rolls' &&
            activeModule !== 'dispatch' &&
            activeModule !== 'validator' && (
              <ModulePendingView moduleId={activeModule} onSwitchModule={handleModuleClick} />
            )}
        </div>

        <DisruptionModal
          isOpen={simModalOpen}
          onClose={() => setSimModalOpen(false)}
          onExecute={executeSimDisruption}
        />

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </ProtectedRoute>
  )
}

// Dynamic imports to avoid circular dependencies
import { ProductionBoard } from '@/components/board/ProductionBoard'
import { OperationsDashboard } from '@/components/dashboard/OperationsDashboard'
import { WorkforceAttendance } from '@/components/workforce/WorkforceAttendance'
import { YarnInventoryView } from '@/components/modules/YarnInventoryView'
import { FabricRollsView } from '@/components/modules/FabricRollsView'
import { DispatchesView } from '@/components/modules/DispatchesView'
import { ScheduleValidatorView } from '@/components/modules/ScheduleValidatorView'