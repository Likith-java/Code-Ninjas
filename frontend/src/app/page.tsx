'use client'

import { useAppState } from '@/hooks/useAppState'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { ProductionBoard } from '@/components/board/ProductionBoard'
import { InspectorPanel } from '@/components/inspector/InspectorPanel'
import { DisruptionModal } from '@/components/modals/DisruptionModal'
import { ToastContainer } from '@/components/ui/Toast'

export default function Home() {
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
    <div className="flex flex-col h-screen bg-[#F5F0E3] text-[#181816] antialiased min-w-[1440px] overflow-hidden select-none font-body text-[13px]">
      <Header
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
          onModuleClick={() => {}}
          onOrderSelect={selectOrder}
          activeModule="floor"
          selectedOrder={selectedOrder}
          currentTime={currentTime}
          currentShift={currentShift}
          onFilterStage={onFilterStage}
          onSelectDisruption={selectDisruption}
        />

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