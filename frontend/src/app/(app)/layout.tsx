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
import { clearSession, getUser } from '@/lib/auth-storage'
import { useAppState } from '@/hooks/useAppState'
import { MaterialIcon, Button } from '@/components/ui'




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
    const role: UserRole = user?.role && ROLE_PROFILES[user.role as UserRole] ? (user.role as UserRole) : 'admin'
    setCurrentRole(role)
    const roleProfile = ROLE_PROFILES[role]

    let target = roleProfile.defaultModule
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab && tab !== 'login') {
        target = tab
      } else if (window.location.pathname.includes('dashboard')) {
        target = 'dashboard'
      } else if (window.location.pathname.includes('workforce')) {
        target = 'workforce'
      } else if (window.location.pathname.includes('reports')) {
        target = 'reports'
      }
    }

    // Direct route protection: Verify target module is authorized for current role
    if (!roleProfile.allowedModules.includes(target)) {
      target = roleProfile.defaultModule
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        if (target === 'floor') {
          url.searchParams.delete('tab')
        } else {
          url.searchParams.set('tab', target)
        }
        window.history.replaceState({}, '', url.toString())
      }
    }
    setActiveModule(target)

    const handlePopState = () => {
      const currentUser = getUser()
      const currentR: UserRole = currentUser?.role && ROLE_PROFILES[currentUser.role as UserRole] ? (currentUser.role as UserRole) : role
      const currentProfile = ROLE_PROFILES[currentR]
      const params = new URLSearchParams(window.location.search)
      let tab = params.get('tab') || currentProfile.defaultModule
      if (!currentProfile.allowedModules.includes(tab)) {
        tab = currentProfile.defaultModule
      }
      setActiveModule(tab)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleModuleClick = (module: string) => {
    const roleProfile = ROLE_PROFILES[currentRole] || ROLE_PROFILES.admin
    const safeModule = roleProfile.allowedModules.includes(module) ? module : roleProfile.defaultModule
    setActiveModule(safeModule)
    setIsMobileSidebarOpen(false)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (safeModule === 'floor') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', safeModule)
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
  const roleProfile = ROLE_PROFILES[currentRole] || ROLE_PROFILES.admin

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased w-full min-w-0 overflow-hidden select-none font-body text-[13px]">
        <Header
          currentRole={currentRole}
          onLogout={handleLogout}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          onBrandClick={() => handleModuleClick(roleProfile.defaultModule)}
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

          {activeModule === 'floor' && roleProfile.allowedModules.includes('floor') && (
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

          {activeModule === 'dashboard' && roleProfile.allowedModules.includes('dashboard') && (
            <OperationsDashboard currentRole={currentRole} />
          )}

          {activeModule === 'workforce' && roleProfile.allowedModules.includes('workforce') && (
            <WorkforceAttendance />
          )}

          {activeModule === 'yarn' && roleProfile.allowedModules.includes('yarn') && (
            <YarnInventoryView />
          )}

          {activeModule === 'rolls' && roleProfile.allowedModules.includes('rolls') && (
            <FabricRollsView />
          )}

          {activeModule === 'dispatch' && roleProfile.allowedModules.includes('dispatch') && (
            <DispatchesView />
          )}

          {activeModule === 'validator' && roleProfile.allowedModules.includes('validator') && (
            <ScheduleValidatorView />
          )}

          {activeModule === 'reports' && roleProfile.allowedModules.includes('reports') && (
            <ReportsView currentRole={currentRole} />
          )}

          {!roleProfile.allowedModules.includes(activeModule) && (
            <div className="flex-1 p-8 flex items-center justify-center">
              <div className="max-w-md w-full bg-white border-2 border-[#181816] rounded-2xl p-6 pop-shadow-md text-center space-y-3 font-mono">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto text-red-600 border border-[#181816]">
                  <MaterialIcon name="lock" size="lg" />
                </div>
                <h2 className="text-base font-black text-[#181816]">Access Restricted</h2>
                <p className="text-xs text-stone-600">
                  Your current role ({roleProfile.name}) is not authorized to view module &ldquo;{activeModule}&rdquo;.
                </p>
                <Button variant="primary" size="sm" onClick={() => handleModuleClick(roleProfile.defaultModule)}>
                  Go to {roleProfile.name} Workspace
                </Button>
              </div>
            </div>
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
import { ReportsView } from '@/components/modules/ReportsView'