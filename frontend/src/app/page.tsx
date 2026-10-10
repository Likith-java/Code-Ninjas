'use client'

import { useState, useEffect } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { ProductionBoard } from '@/components/board/ProductionBoard'
import { DisruptionModal } from '@/components/modals/DisruptionModal'
import { ToastContainer } from '@/components/ui/Toast'
import { OperationsDashboard } from '@/components/dashboard/OperationsDashboard'
import { WorkforceAttendance } from '@/components/workforce/WorkforceAttendance'
import { ModulePendingView } from '@/components/layout/ModulePendingView'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'

export default function Home() {
  const [activeModule, setActiveModule] = useState<string>('floor')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [currentRole, setCurrentRole] = useState<UserRole>('admin')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab === 'login') {
        setIsAuthenticated(false)
        setActiveModule('login')
      } else if (tab) {
        setActiveModule(tab)
      } else {
        setActiveModule('floor')
      }
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') || 'floor'
      if (tab === 'login') {
        setIsAuthenticated(false)
      }
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
    setIsAuthenticated(false)
    setActiveModule('login')
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', 'login')
      window.history.pushState({}, '', url.toString())
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

  // Unauthenticated / Login View
  if (!isAuthenticated || activeModule === 'login') {
    return (
      <LoginScreen
        currentRole={currentRole}
        onLoginSuccess={handleLoginSuccess}
        isStandalone={true}
      />
    )
  }

  return (
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

        {activeModule !== 'floor' && activeModule !== 'dashboard' && activeModule !== 'workforce' && (
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
  )
}