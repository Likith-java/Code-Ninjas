'use client'

import { useState, useEffect } from 'react'
import { Card, Button, MaterialIcon, Badge } from '@/components/ui'
import { api, OrderReadinessOut, ApiClientError } from '@/lib/api'

interface StartProductionModalProps {
  isOpen: boolean
  orderId: number | string | null
  orderSummary?: {
    id: string
    buyer: string
    fabric: string
    colour?: string
    targetMeters?: number
    status?: string
  } | null
  onClose: () => void
  onProductionStarted: () => void
}

export function StartProductionModal({
  isOpen,
  orderId,
  orderSummary,
  onClose,
  onProductionStarted,
}: StartProductionModalProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [readiness, setReadiness] = useState<OrderReadinessOut | null>(null)

  const [selectedOperationId, setSelectedOperationId] = useState<number | ''>('')
  const [selectedMachineId, setSelectedMachineId] = useState<number | ''>('')

  // Parse numeric order id
  const parseNumericId = (val: string | number | null | undefined): number | null => {
    if (val === null || val === undefined) return null
    if (typeof val === 'number') return val
    if (!isNaN(Number(val))) return Number(val)
    const digits = val.replace(/\D/g, '')
    return digits ? parseInt(digits, 10) : null
  }

  const numericId = parseNumericId(orderId || orderSummary?.id)

  useEffect(() => {
    if (!isOpen || !numericId) {
      setReadiness(null)
      setError(null)
      setSuccess(null)
      return
    }

    let isMounted = true
    const fetchReadiness = async () => {
      setLoading(true)
      setError(null)
      setSuccess(null)
      try {
        const data = await api.getOrderReadiness(numericId)
        if (!isMounted) return
        setReadiness(data)
        if (data.target_operation) {
          setSelectedOperationId(data.target_operation.id)
        }
        if (data.recommended_machine) {
          setSelectedMachineId(data.recommended_machine.id)
        } else if (data.eligible_machines.length > 0) {
          setSelectedMachineId(data.eligible_machines[0].id)
        }
      } catch (err: unknown) {
        if (!isMounted) return
        const msg =
          err instanceof ApiClientError ? err.message : (err as Error).message || 'Failed to check production readiness.'
        setError(msg)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchReadiness()
    return () => {
      isMounted = false
    }
  }, [isOpen, numericId])

  if (!isOpen) return null

  const handleConfirmStart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!numericId) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        operation_id: selectedOperationId !== '' ? Number(selectedOperationId) : undefined,
        machine_id: selectedMachineId !== '' ? Number(selectedMachineId) : undefined,
      }
      const result = await api.startProduction(numericId, payload)
      setSuccess(
        `Production started successfully!\nRun #${result.production_run_id} running on machine ${result.machine_code} (${result.stage}).`
      )
      onProductionStarted()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError ? err.message : (err as Error).message || 'Failed to start production.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMachine = readiness?.eligible_machines.find((m) => m.id === selectedMachineId)
  const isMachineAvailable =
    selectedMachine &&
    selectedMachine.is_active &&
    !['breakdown', 'maintenance', 'running'].includes(selectedMachine.state)

  const canStart =
    readiness &&
    readiness.yarn_feasible &&
    !readiness.has_active_run &&
    selectedMachineId !== '' &&
    isMachineAvailable &&
    !['completed', 'ready_for_dispatch', 'partially_dispatched'].includes(readiness.derived_status)

  return (
    <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <Card
        variant="elevated"
        padding="lg"
        className="max-w-lg w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0E4B3E] text-white flex items-center justify-center">
              <MaterialIcon name="play_arrow" size="sm" color="#FFFFFF" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#181816]">Start Production Workflow</h3>
              <span className="font-mono text-xs text-[#0E4B3E] font-semibold">
                Order #{numericId} {orderSummary?.buyer ? `· ${orderSummary.buyer}` : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 font-bold p-1 cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-10 text-center space-y-3 font-mono text-xs text-stone-600">
            <div className="size-6 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent mx-auto" />
            <p>Validating raw material ledger, operation routing & machine availability...</p>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-900 text-xs font-mono font-semibold flex items-start gap-2 animate-fade-in">
            <MaterialIcon name="check_circle" size="xs" color="#15803D" className="mt-0.5" />
            <div>{success}</div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-900 text-xs font-mono flex items-start gap-2 animate-fade-in">
            <MaterialIcon name="error" size="xs" color="#DC2626" className="mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Main Body */}
        {!loading && readiness && (
          <form onSubmit={handleConfirmStart} className="space-y-3 font-mono text-xs text-stone-700">
            {/* 1. Order Specifications Summary */}
            <div className="p-3 bg-[#FAF7F0] border border-stone-300 rounded-xl space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-bold text-stone-900">Order Specifications:</span>
                <Badge
                  variant={readiness.derived_status === 'in_production' ? 'scenario' : 'default'}
                  size="xs"
                >
                  Status: {readiness.derived_status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-stone-200">
                <div>
                  <span className="text-stone-500 block text-[10px]">BUYER / CLIENT</span>
                  <strong className="text-stone-900">{readiness.buyer_name || 'Direct Order'}</strong>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">FABRIC & COLOUR</span>
                  <strong className="text-stone-900">
                    {readiness.fabric_type} · {readiness.colour}
                  </strong>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">REQUIRED QUANTITY</span>
                  <strong className="text-stone-900 font-bold">
                    {Number(readiness.quantity_metres).toLocaleString()}m
                  </strong>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">PRIORITY & DEADLINE</span>
                  <strong className="text-stone-900">
                    {readiness.priority.toUpperCase()} · {new Date(readiness.deadline).toLocaleDateString()}
                  </strong>
                </div>
              </div>
            </div>

            {/* 2. Raw Yarn Feasibility Assessment */}
            <div
              className={`p-3 rounded-xl border text-[11px] space-y-1 ${
                readiness.yarn_feasible
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <MaterialIcon
                  name={readiness.yarn_feasible ? 'check_circle' : 'cancel'}
                  size="xs"
                  color={readiness.yarn_feasible ? '#15803D' : '#DC2626'}
                />
                <span>
                  {readiness.yarn_feasible
                    ? 'Yarn Feasibility: Stock Verified'
                    : 'Yarn Feasibility: Shortage Detected'}
                </span>
              </div>
              <p className="text-[10.5px] leading-snug">
                {readiness.feasibility_message}
              </p>
            </div>

            {/* 3. Conflicting Active Run Alert */}
            {readiness.has_active_run && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <MaterialIcon name="warning" size="xs" color="#D97706" />
                  <span>Active Production Run Already in Progress</span>
                </div>
                <p className="text-[10.5px]">
                  Order #{numericId} already has an active running job (Run #{readiness.active_run_id}) on machine{' '}
                  <strong className="font-bold">{readiness.active_machine_code}</strong>. Starting duplicate runs is
                  prohibited.
                </p>
              </div>
            )}

            {/* 4. Target Operation & Machine Selection */}
            {readiness.target_operation && (
              <div className="p-3 bg-white border border-stone-300 rounded-xl space-y-2.5">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-stone-600 text-[10.5px] font-bold">
                      Target Operation / Stage *
                    </label>
                    {readiness.target_operation.planned_duration_minutes && (
                      <span className="text-[10px] text-stone-500 font-medium">
                        ~{readiness.target_operation.planned_duration_minutes}m duration
                      </span>
                    )}
                  </div>
                  {readiness.all_operations && readiness.all_operations.length > 0 ? (
                    <select
                      value={selectedOperationId}
                      onChange={async (e) => {
                        const opId = Number(e.target.value)
                        setSelectedOperationId(opId)
                        if (numericId) {
                          try {
                            const data = await api.getOrderReadiness(numericId, opId)
                            setReadiness(data)
                            if (data.recommended_machine) {
                              setSelectedMachineId(data.recommended_machine.id)
                            } else if (data.eligible_machines.length > 0) {
                              setSelectedMachineId(data.eligible_machines[0].id)
                            } else {
                              setSelectedMachineId('')
                            }
                          } catch (err) {
                            console.error('Failed to update readiness for operation:', err)
                          }
                        }
                      }}
                      className="w-full p-2 border border-stone-300 rounded-lg text-xs font-semibold bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0E4B3E]"
                    >
                      {readiness.all_operations.map((op) => (
                        <option key={op.id} value={op.id}>
                          Stage {op.sequence}: {op.stage.toUpperCase()} {op.planned_duration_minutes ? `(~${op.planned_duration_minutes} min)` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex justify-between items-center text-[11px] p-2 bg-stone-50 border border-stone-200 rounded-lg">
                      <strong className="text-stone-900 font-bold capitalize">
                        Stage {readiness.target_operation.sequence}: {readiness.target_operation.stage}
                      </strong>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-stone-600 text-[10.5px] font-bold mb-1">
                    Assign Ready Machine / Loom *
                  </label>
                  {readiness.eligible_machines.length > 0 ? (
                    <select
                      value={selectedMachineId}
                      onChange={(e) => setSelectedMachineId(Number(e.target.value))}
                      className="w-full p-2 border border-stone-300 rounded-lg text-xs font-mono bg-white focus:outline-hidden focus:ring-1 focus:ring-[#0E4B3E]"
                    >
                      {readiness.eligible_machines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.machine_code} ({m.machine_type}) — ✓ Available {m.capacity_rate ? `(${m.capacity_rate} m/h)` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <MaterialIcon name="info" size="xs" color="#D97706" />
                        <span>Machine Capacity Notice</span>
                      </div>
                      <p>
                        {readiness.target_operation.stage.toLowerCase() === 'spinning'
                          ? 'No eligible spinning machines are currently available. Machines will appear here when they become available.'
                          : `No eligible ${readiness.target_operation.stage} machines are currently available. Machines will appear here when they become available.`}
                      </p>
                    </div>
                  )}

                  {selectedMachine && ['breakdown', 'maintenance', 'running'].includes(selectedMachine.state) && (
                    <p className="mt-1 text-[10.5px] text-red-700 font-semibold flex items-center gap-1">
                      <MaterialIcon name="warning" size="xs" color="#DC2626" />
                      Selected machine {selectedMachine.machine_code} is currently occupied or unavailable ({selectedMachine.state}).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Footer Summary Notice */}
            <p className="text-[10px] text-stone-500 leading-snug">
              Clicking <strong>Confirm & Start Production</strong> will commit an actual running production run in
              PostgreSQL, set the assigned loom to &lsquo;running&rsquo;, and reflect real-time floor progress.
            </p>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={submitting || !canStart}
                icon={
                  submitting ? (
                    <MaterialIcon name="sync" size="xs" className="animate-spin" />
                  ) : (
                    <MaterialIcon name="play_arrow" size="xs" />
                  )
                }
              >
                {submitting ? 'Starting Production...' : 'Confirm & Start Production'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
