'use client'

import { useState, useCallback } from 'react'
import type { Toast, RightTab, ScenarioName, Order, Disruption } from '@/types'
import { mockOrders, mockScenarios, activeDisruption, orderDetails, validatorRules } from '@/lib/mockData'

export function useAppState() {
  const [selectedOrder, setSelectedOrder] = useState<string | null>('ORD-004')
  const [rightTab, setRightTab] = useState<RightTab>('replan')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [activeScenario, setActiveScenario] = useState<ScenarioName>('breakdown')
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isResolved, setIsResolved] = useState(false)
  const [disruption, setDisruption] = useState<Disruption>(activeDisruption)
  const [currentTime] = useState(360)
  const [currentShift] = useState('Shift 1 (08:00 - 16:00)')

  const showToast = useCallback((message: string, icon: string, type: Toast['type'] = 'success') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, icon, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3200)
  }, [])

  const selectOrder = useCallback((orderId: string) => {
    setSelectedOrder(orderId)
    setInspectorOpen(true)
    if (orderId === 'ORD-004' && !isResolved) {
      setRightTab('replan')
    } else {
      setRightTab('order')
    }
  }, [isResolved])

  const selectDisruption = useCallback((type: 'breakdown' | 'yarn_delay') => {
    selectOrder('ORD-004')
    setRightTab('replan')
  }, [selectOrder])

  const switchScenario = useCallback((scenario: ScenarioName) => {
    setActiveScenario(scenario)
    const scenarioNames: Record<ScenarioName, string> = {
      feasible: 'feasible.json',
      breakdown: 'machine_breakdown.json',
      late_yarn: 'late_yarn.json',
      infeasible: 'infeasible.json',
    }
    showToast(`Loaded ${scenarioNames[scenario]} scenario`, 'tune', 'info')
  }, [showToast])

  const applyReplan = useCallback((action: 'freeze' | 'split' | 'commit') => {
    switch (action) {
      case 'freeze':
        showToast('1,200m woven on WEAVE-03 locked into passed state.', 'lock', 'info')
        break
      case 'split':
        showToast('ORD-004 split into ORD-004-A (1200m done) & ORD-004-B (1800m).', 'call_split', 'info')
        break
      case 'commit':
        setIsResolved(true)
        showToast('Committed re-plan to floor: WEAVE-02 picking up 1,800m of ORD-004.', 'check_circle', 'success')
        break
    }
  }, [showToast])

  const triggerReplan = useCallback(() => {
    showToast('CP-SAT warm-starting from EDF baseline... (Random seed: 42)', 'sync', 'info')
    setTimeout(() => {
      showToast('Schedule optimal: Weighted tardiness minimized by 34.2%.', 'check_circle', 'success')
    }, 1200)
  }, [showToast])

  const executeSimDisruption = useCallback(() => {
    setSimModalOpen(false)
    showToast('Disruption injected: WEAVE-03 down (480-960m). Solving with OR-Tools CP-SAT...', 'precision_manufacturing', 'warning')
    setTimeout(() => {
      showToast('Solver Optimal: 1 operation split, 0 deadline breaches.', 'task_alt', 'success')
    }, 1500)
  }, [showToast])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const onFilterStage = useCallback((stage: string) => {
    showToast(`Filtering pipeline: Showing ${stage} route operations`, 'filter_list', 'info')
  }, [showToast])

  const currentScenario = mockScenarios[activeScenario]
  const currentOrderDetail = selectedOrder ? orderDetails[selectedOrder] : null

  return {
    // State
    selectedOrder,
    rightTab,
    inspectorOpen,
    activeScenario,
    simModalOpen,
    toasts,
    isResolved,
    disruption,
    currentTime,
    currentShift,
    currentScenario,
    currentOrderDetail,
    mockOrders,
    mockMachines: currentScenario?.machines || [],
    validatorRules,
    orderDetails,
    
    // Actions
    setRightTab,
    setInspectorOpen,
    setSimModalOpen,
    selectOrder,
    selectDisruption,
    switchScenario,
    applyReplan,
    triggerReplan,
    executeSimDisruption,
    onFilterStage,
    showToast,
    removeToast,
  }
}