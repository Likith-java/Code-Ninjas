'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import {
  api,
  BackendFabricRoll,
  TraceabilityOut,
  BackendOrder,
  BackendProductionRun,
  ApiClientError,
} from '@/lib/api'

export function FabricRollsView() {
  const [rolls, setRolls] = useState<BackendFabricRoll[]>([])
  const [orders, setOrders] = useState<BackendOrder[]>([])
  const [runs, setRuns] = useState<BackendProductionRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals & Traceability Drawer
  const [activeModal, setActiveModal] = useState<'createRoll' | 'inspect' | null>(null)
  const [selectedTraceability, setSelectedTraceability] = useState<TraceabilityOut | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)

  // Create roll form
  const [rollForm, setRollForm] = useState({
    roll_code: '',
    order_id: '',
    production_run_id: '',
    metres: '',
  })

  // Inspection form
  const [inspectForm, setInspectForm] = useState({
    roll_id: '',
    result: 'pass' as 'pass' | 'rework' | 'reject',
    defect_type: '',
    severity: 'low' as 'low' | 'medium' | 'high' | 'critical',
    disposition: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filterParams = statusFilter !== 'all' ? { status: statusFilter } : undefined
      const [rollsRes, ordersRes, runsRes] = await Promise.all([
        api.getRolls(filterParams),
        api.getOrders(),
        api.getProductionRuns(),
      ])
      setRolls(rollsRes)
      setOrders(ordersRes)
      setRuns(runsRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load fabric rolls'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleOpenTraceability = async (rollId: number) => {
    setTraceLoading(true)
    setSelectedTraceability(null)
    try {
      const trace = await api.getRollTraceability(rollId)
      setSelectedTraceability(trace)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch traceability'
      alert(`Traceability error: ${msg}`)
    } finally {
      setTraceLoading(false)
    }
  }

  const handleCreateRoll = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await api.createRoll({
        roll_code: rollForm.roll_code,
        order_id: Number(rollForm.order_id),
        production_run_id: Number(rollForm.production_run_id),
        metres: Number(rollForm.metres),
      })
      setModalSuccess(`Fabric Roll ${rollForm.roll_code} registered!`)
      setRollForm({ roll_code: '', order_id: '', production_run_id: '', metres: '' })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await api.createRollInspection(Number(inspectForm.roll_id), {
        result: inspectForm.result,
        defect_type: inspectForm.defect_type || null,
        severity: inspectForm.defect_type ? inspectForm.severity : null,
        disposition: inspectForm.disposition || null,
      })
      setModalSuccess(`Inspection recorded for Roll #${inspectForm.roll_id}: ${inspectForm.result.toUpperCase()}`)
      setInspectForm({ roll_id: '', result: 'pass', defect_type: '', severity: 'low', disposition: '' })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const passedRollsCount = rolls.filter((r) => r.status === 'passed').length
  const awaitingInspectionCount = rolls.filter((r) => r.status === 'awaiting_inspection').length
  const totalMetres = rolls.reduce((acc, r) => acc + Number(r.metres || r.length_metres || 0), 0)

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-[#181816] pop-shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D7F4E5] border-2 border-[#181816] flex items-center justify-center text-[#0E4B3E]">
            <MaterialIcon name="qr_code" size="md" color="#0E4B3E" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#181816] tracking-tight">Fabric Rolls & Quality Inspection Traceability</h1>
            <p className="text-xs text-stone-600">Post-weaving fabric roll grading, 4-point inspection defects, and complete backward lineage.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="pop"
            size="xs"
            icon={<MaterialIcon name="fact_check" size="xs" color="#0E4B3E" />}
            onClick={() => { setActiveModal('inspect'); setModalError(null); setModalSuccess(null) }}
          >
            Record Inspection
          </Button>
          <Button
            variant="primary"
            size="xs"
            icon={<MaterialIcon name="add" size="xs" />}
            onClick={() => { setActiveModal('createRoll'); setModalError(null); setModalSuccess(null) }}
          >
            Register Fabric Roll
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Fabric Rolls</div>
          <div className="text-xl font-black text-[#181816] mt-0.5">{rolls.length} Rolls</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Physical roll ledger</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Inspected & Passed</div>
          <div className="text-xl font-black text-[#15803D] mt-0.5">{passedRollsCount} Passed</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Dispatch eligible</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Awaiting Inspection</div>
          <div className="text-xl font-black text-[#962C0B] mt-0.5">{awaitingInspectionCount} Pending</div>
          <div className="text-[10px] text-stone-500 mt-0.5">QA bottleneck gate</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Woven Output</div>
          <div className="text-xl font-black text-[#0E4B3E] mt-0.5">{totalMetres.toLocaleString()}m</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Active inventory metres</div>
        </Card>
      </div>

      {/* Rolls Table */}
      <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b-2 border-stone-200">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-sm text-[#181816]">Fabric Roll Inventory Ledger</h2>
            <div className="flex items-center gap-1">
              {['all', 'passed', 'awaiting_inspection', 'rejected'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                    statusFilter === s
                      ? 'bg-[#181816] text-white border-[#181816]'
                      : 'bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="xs" onClick={loadData} disabled={loading} icon={<MaterialIcon name="refresh" size="xs" />}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-stone-500 font-mono">Loading rolls from PostgreSQL...</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 text-xs font-mono">
            <strong>Error:</strong> {error}
            <Button variant="outline" size="xs" className="mt-2 block" onClick={loadData}>Retry</Button>
          </div>
        ) : rolls.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">No fabric rolls found for this status.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11.5px] border-collapse">
              <thead>
                <tr className="border-b-2 border-stone-300 text-stone-600 bg-stone-50">
                  <th className="py-2 px-3">Roll Code</th>
                  <th className="py-2 px-3">Order</th>
                  <th className="py-2 px-3">Run ID</th>
                  <th className="py-2 px-3 text-right">Length (m)</th>
                  <th className="py-2 px-3 text-center">Quality Status</th>
                  <th className="py-2 px-3 text-center">Dispatch Gate</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rolls.map((r) => {
                  const m = Number(r.metres || r.length_metres || 0)
                  return (
                    <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-[#0E4B3E]">{r.roll_code}</td>
                      <td className="py-2.5 px-3 text-stone-700">Order #{r.order_id}</td>
                      <td className="py-2.5 px-3 text-stone-500">Run #{r.production_run_id}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#181816]">{m.toLocaleString()}m</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={
                            r.status === 'passed' ? 'success' :
                            r.status === 'rejected' ? 'warning' :
                            r.status === 'rework' ? 'warning' : 'default'
                          }
                          size="xs"
                        >
                          {r.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.is_dispatch_eligible ? (
                          <Badge variant="success" size="xs" className="bg-[#D7F4E5] text-[#0B382F] border border-[#181816]">
                            Eligible
                          </Badge>
                        ) : (
                          <Badge variant="default" size="xs" className="bg-stone-100 text-stone-500 border border-stone-300">
                            Locked
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleOpenTraceability(r.id)}
                          icon={<MaterialIcon name="route" size="xs" />}
                        >
                          Trace
                        </Button>
                        {r.status !== 'passed' && r.status !== 'rejected' && (
                          <Button
                            variant="pop"
                            size="xs"
                            onClick={() => {
                              setInspectForm({ ...inspectForm, roll_id: String(r.id) })
                              setActiveModal('inspect')
                            }}
                          >
                            Inspect
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TRACEABILITY DRAWER / MODAL */}
      {(selectedTraceability || traceLoading) && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-xl w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="schema" size="sm" color="#0E4B3E" />
                Full End-to-End Roll Lineage & Traceability
              </h3>
              <button onClick={() => setSelectedTraceability(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {traceLoading ? (
              <div className="py-8 text-center text-xs font-mono text-stone-500">Querying backward lineage tree...</div>
            ) : selectedTraceability ? (
              <div className="space-y-4 font-mono text-xs">
                {/* Roll Identity Block */}
                <div className="p-3 bg-[#FAF7F0] border-2 border-[#181816] rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-[#0E4B3E]">{selectedTraceability.roll_code}</span>
                    <Badge variant={selectedTraceability.is_dispatch_eligible ? 'success' : 'warning'} size="xs">
                      {selectedTraceability.is_dispatch_eligible ? 'Passed Dispatch Gate' : 'Quality Gate Restricted'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-stone-600 text-[11px]">
                    <div>Length: <strong className="text-black">{Number(selectedTraceability.metres)}m</strong></div>
                    <div>Status: <strong className="text-black uppercase">{selectedTraceability.status}</strong></div>
                    <div>Order: <strong className="text-black">#{selectedTraceability.order_id} ({selectedTraceability.fabric_type || '—'})</strong></div>
                    <div>Colour: <strong className="text-black">{selectedTraceability.colour || '—'}</strong></div>
                    <div>Loom Machine: <strong className="text-black">{selectedTraceability.machine_code || '—'} ({selectedTraceability.machine_type || 'weaving'})</strong></div>
                    <div>Production Run: <strong className="text-black">#{selectedTraceability.production_run_id} ({selectedTraceability.run_status || 'completed'})</strong></div>
                  </div>
                </div>

                {/* Inspection Chronology */}
                <div className="space-y-2">
                  <h4 className="font-bold text-stone-800 text-xs">Inspection History ({selectedTraceability.inspections.length} events)</h4>
                  {selectedTraceability.inspections.length === 0 ? (
                    <div className="p-3 bg-stone-50 rounded border border-stone-200 text-stone-500 text-center">
                      No inspection results recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedTraceability.inspections.map((insp) => (
                        <div key={insp.id} className="p-2.5 bg-white border-2 border-stone-300 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge
                              variant={insp.result === 'pass' ? 'success' : 'warning'}
                              size="xs"
                            >
                              Result: {insp.result.toUpperCase()}
                            </Badge>
                            <span className="text-stone-400 text-[10px]">{new Date(insp.inspected_at).toLocaleString()}</span>
                          </div>
                          {insp.defect_type && (
                            <div className="text-stone-700">
                              Defect: <strong>{insp.defect_type}</strong> (Severity: <span className="uppercase text-red-700">{insp.severity || 'low'}</span>)
                            </div>
                          )}
                          {insp.disposition && (
                            <div className="text-stone-500 text-[10.5px]">Disposition: {insp.disposition}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-stone-200">
                  <Button variant="primary" size="xs" onClick={() => setSelectedTraceability(null)}>Close</Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {/* MODAL: Register Fabric Roll */}
      {activeModal === 'createRoll' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="add" size="sm" color="#0E4B3E" />
                Register New Woven Fabric Roll
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateRoll} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Roll Code *</label>
                <input
                  type="text"
                  required
                  value={rollForm.roll_code}
                  onChange={(e) => setRollForm({ ...rollForm, roll_code: e.target.value })}
                  placeholder="e.g. ROLL-2026-X01"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Parent Order *</label>
                <select
                  required
                  value={rollForm.order_id}
                  onChange={(e) => setRollForm({ ...rollForm, order_id: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      Order #{o.id} ({o.fabric_type} · {o.colour})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Production Run *</label>
                <select
                  required
                  value={rollForm.production_run_id}
                  onChange={(e) => setRollForm({ ...rollForm, production_run_id: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Production Run</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      Run #{r.id} (Order #{r.order_id} · Machine #{r.machine_id} · {r.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Length in Metres *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={rollForm.metres}
                  onChange={(e) => setRollForm({ ...rollForm, metres: e.target.value })}
                  placeholder="e.g. 500"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting} type="submit">
                  {submitting ? 'Registering...' : 'Register Roll'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Record Inspection */}
      {activeModal === 'inspect' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="fact_check" size="sm" color="#0E4B3E" />
                Record 4-Point Quality Inspection
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateInspection} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Select Fabric Roll *</label>
                <select
                  required
                  value={inspectForm.roll_id}
                  onChange={(e) => setInspectForm({ ...inspectForm, roll_id: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Roll</option>
                  {rolls.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roll_code} ({Number(r.metres || r.length_metres || 0)}m · {r.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Inspection Decision *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pass', 'rework', 'reject'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setInspectForm({ ...inspectForm, result: res })}
                      className={`p-2 rounded-xl border-2 font-bold uppercase transition-all ${
                        inspectForm.result === res
                          ? res === 'pass'
                            ? 'bg-emerald-100 border-emerald-700 text-emerald-900 pop-shadow-xs'
                            : res === 'reject'
                            ? 'bg-red-100 border-red-700 text-red-900 pop-shadow-xs'
                            : 'bg-amber-100 border-amber-700 text-amber-900 pop-shadow-xs'
                          : 'bg-stone-50 border-stone-300 text-stone-500 hover:bg-stone-100'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              {inspectForm.result !== 'pass' && (
                <>
                  <div>
                    <label className="block text-stone-600 font-bold mb-1">Defect Type</label>
                    <input
                      type="text"
                      value={inspectForm.defect_type}
                      onChange={(e) => setInspectForm({ ...inspectForm, defect_type: e.target.value })}
                      placeholder="e.g. Warp break streak, dye shade variance"
                      className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-600 font-bold mb-1">Severity</label>
                    <select
                      value={inspectForm.severity}
                      onChange={(e) => setInspectForm({ ...inspectForm, severity: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
                      className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-stone-600 font-bold mb-1">Disposition Notes</label>
                <input
                  type="text"
                  value={inspectForm.disposition}
                  onChange={(e) => setInspectForm({ ...inspectForm, disposition: e.target.value })}
                  placeholder="e.g. Approved for dispatch or scrap lot"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting} type="submit">
                  {submitting ? 'Recording...' : 'Submit Inspection'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
