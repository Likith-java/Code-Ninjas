'use client'

import { useState, useEffect } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { ProductionBoard } from '@/components/board/ProductionBoard'
import { InspectorPanel } from '@/components/inspector/InspectorPanel'
import { DisruptionModal } from '@/components/modals/DisruptionModal'
import { ToastContainer } from '@/components/ui/Toast'
import { OperationsDashboard } from '@/components/dashboard/OperationsDashboard'
import { WorkforceAttendance } from '@/components/workforce/WorkforceAttendance'
import { ModulePendingView } from '@/components/layout/ModulePendingView'

export default function Home() {
  const [activeModule, setActiveModule] = useState<string>('floor')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab')
      if (tab) {
        setActiveModule(tab)
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

  const {
    selectedOrder,
    rightTab,
    inspectorOpen,
    activeScenario,
    simModalOpen,
    toasts,
    isResolved,
    currentTime,
    currentShift,
    disruption,
    mockOrders,
    mockMachines,
    orderDetails,
    selectOrder,
    setRightTab,
    setInspectorOpen,
    setSimModalOpen,
    selectDisruption,
    switchScenario,
    applyReplan,
    triggerReplan,
    executeSimDisruption,
    onFilterStage,
    removeToast,
  } = useAppState()

  const disruptionText = isResolved ? '0 Disruption Alerts' : '1 Breakdown (WEAVE-03)'
  const solverStatus = isResolved ? 'CP-SAT: RE-PLAN COMMITTED' : 'CP-SAT: OPTIMAL (3.4s)'

  const currentOrderDetail = selectedOrder ? orderDetails[selectedOrder] || null : null

  return (
    <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased w-full min-w-0 overflow-hidden select-none font-body text-[13px]">
      <Header
        activeModule={activeModule}
        onModuleClick={handleModuleClick}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        activeScenario={activeScenario}
        onScenarioChange={switchScenario}
        onSimulateDisruption={() => setSimModalOpen(true)}
        onTriggerReplan={triggerReplan}
        isResolved={isResolved}
        disruptionText={disruptionText}
        solverStatus={solverStatus}
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
        />

        {activeModule === 'floor' && (
          <>
            <ProductionBoard
              selectedOrder={selectedOrder}
              onOrderSelect={selectOrder}
              activeScenario={activeScenario}
              onScenarioChange={switchScenario}
              onFilterStage={onFilterStage}
              onSelectDisruption={selectDisruption}
              isResolved={isResolved}
            />

            <InspectorPanel
              isOpen={inspectorOpen}
              onToggle={() => setInspectorOpen(!inspectorOpen)}
              activeTab={rightTab}
              onTabChange={setRightTab}
              isResolved={isResolved}
              onApplyReplan={applyReplan}
              orderDetail={currentOrderDetail}
            />
          </>
        )}

        {activeModule === 'dashboard' && <OperationsDashboard />}

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