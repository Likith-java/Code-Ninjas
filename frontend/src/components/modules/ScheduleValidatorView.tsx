'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import {
  api,
  BackendProductionRun,
  BackendOrder,
  BackendMachine,
  ScheduleImportResult,
  ApiClientError,
} from '@/lib/api'

export function ScheduleValidatorView() {
  const [scheduledRuns, setScheduledRuns] = useState<BackendProductionRun[]>([])
  const [orders, setOrders] = useState<BackendOrder[]>([])
  const [machines, setMachines] = useState<BackendMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Solver import state
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ScheduleImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Custom schedule JSON input
  const [scheduleJson, setScheduleJson] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [runsRes, ordRes, machRes] = await Promise.all([
        api.getProductionRuns({ kind: 'scheduled' }),
        api.getOrders(),
        api.getMachines(),
      ])
      setScheduledRuns(runsRes)
      setOrders(ordRes)
      setMachines(machRes)

      // Pre-populate a realistic CP-SAT payload using real database records if available
      if (ordRes.length > 0 && machRes.length > 0) {
        const order = ordRes[0]
        const samplePayload = {
          status: 'OPTIMAL',
          validation_status: 'valid',
          solve_time_seconds: 0.18,
          objective_value: 120.0,
          schedule: [
            {
              order_id: order.id,
              stage: 'spinning',
              machine_code: machRes.find((m) => m.machine_type === 'spinning')?.machine_code || 'SPIN-01',
              start_minute: 0,
              end_minute: 240,
            },
            {
              order_id: order.id,
              stage: 'weaving',
              machine_code: machRes.find((m) => m.machine_type === 'weaving')?.machine_code || 'WEAVE-01',
              start_minute: 240,
              end_minute: 600,
            },
          ],
        }
        setScheduleJson(JSON.stringify(samplePayload, null, 2))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load scheduler data'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleImportSchedule = async (payloadToSubmit?: unknown) => {
    setImporting(true)
    setImportError(null)
    setImportResult(null)

    try {
      let payload = payloadToSubmit
      if (!payload) {
        try {
          payload = JSON.parse(scheduleJson)
        } catch {
          throw new Error('Invalid JSON format in schedule payload editor')
        }
      }

      const res = await api.importSchedule(payload)
      setImportResult(res)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setImportError(msg)
    } finally {
      setImporting(false)
    }
  }

  const handleTestInfeasible = async () => {
    const invalidPayload = {
      status: 'INFEASIBLE',
      validation_status: 'invalid',
      schedule: [],
    }
    await handleImportSchedule(invalidPayload)
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-[#181816] pop-shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D7F4E5] border-2 border-[#181816] flex items-center justify-center text-[#0E4B3E]">
            <MaterialIcon name="verified" size="md" color="#0E4B3E" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#181816] tracking-tight">CP-SAT Schedule Constraint Validator & Import</h1>
            <p className="text-xs text-stone-600">Formally validate precedence, machine eligibility, and no-overlap rules before persisting planned runs to PostgreSQL.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={handleTestInfeasible}
            disabled={importing}
            icon={<MaterialIcon name="block" size="xs" color="#962C0B" />}
          >
            Test Infeasible Rejection
          </Button>
          <Button
            variant="primary"
            size="xs"
            onClick={() => handleImportSchedule()}
            disabled={importing}
            icon={<MaterialIcon name="publish" size="xs" />}
          >
            {importing ? 'Validating & Importing...' : 'Import to PostgreSQL'}
          </Button>
        </div>
      </div>

      {/* Solver Verification Rules Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Precedence Rule</div>
          <div className="text-sm font-bold text-[#181816] mt-0.5">Spinning → Weaving → Dyeing</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Strict sequence constraints</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Eligibility Rule</div>
          <div className="text-sm font-bold text-[#181816] mt-0.5">Machine Capability Matrix</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Operations mapped to valid frames</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">No Overlap Rule</div>
          <div className="text-sm font-bold text-[#181816] mt-0.5">Machine Disjunctive Intervals</div>
          <div className="text-[10px] text-stone-500 mt-0.5">0 concurrent runs per spindle/loom</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Database Persistence</div>
          <div className="text-sm font-bold text-[#0E4B3E] mt-0.5">{scheduledRuns.length} Scheduled Runs</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Planned production runs in DB</div>
        </Card>
      </div>

      {/* Import Status Feedback */}
      {importError && (
        <div className="p-3 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 text-xs font-mono space-y-1">
          <div className="font-bold flex items-center gap-1">
            <MaterialIcon name="error" size="xs" color="#962C0B" />
            Validation Constraint Rejected by Backend:
          </div>
          <div>{importError}</div>
        </div>
      )}

      {importResult && (
        <div className="p-3 bg-emerald-50 border-2 border-emerald-400 rounded-xl text-emerald-900 text-xs font-mono space-y-1">
          <div className="font-bold flex items-center gap-1">
            <MaterialIcon name="check_circle" size="xs" color="#0B382F" />
            Backend Schedule Import Succeeded:
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>Runs Created: <strong>{importResult.runs_created}</strong></div>
            <div>Runs Updated: <strong>{importResult.runs_updated}</strong></div>
            <div>Total Scheduled: <strong>{importResult.total_scheduled}</strong></div>
          </div>
        </div>
      )}

      {/* Schedule Input & Solver Results Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CP-SAT Payload Editor */}
        <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-stone-200">
            <h2 className="font-bold text-sm text-[#181816]">CP-SAT Solver Output Payload (JSON)</h2>
            <Badge variant="default" size="xs" className="bg-[#FAF7F0] border border-[#181816]">
              POST /production-runs/import-schedule
            </Badge>
          </div>
          <p className="text-[11px] text-stone-600">
            Submit solver schedule JSON matching Member 1 format to import directly into PostgreSQL scheduled production runs.
          </p>
          <textarea
            rows={12}
            value={scheduleJson}
            onChange={(e) => setScheduleJson(e.target.value)}
            className="w-full p-2.5 bg-stone-900 text-emerald-400 font-mono text-[11px] rounded-xl border-2 border-[#181816] focus:outline-none"
          />
          <div className="flex justify-between items-center pt-1">
            <span className="text-[10px] text-stone-500 font-mono">Converts minute offsets into UTC datetime runs</span>
            <Button
              variant="primary"
              size="xs"
              onClick={() => handleImportSchedule()}
              disabled={importing}
            >
              {importing ? 'Processing...' : 'Validate & Import'}
            </Button>
          </div>
        </div>

        {/* Persisted Scheduled Runs Table */}
        <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b-2 border-stone-200">
            <h2 className="font-bold text-sm text-[#181816]">Persisted Scheduled Runs in PostgreSQL</h2>
            <Button variant="ghost" size="xs" onClick={loadData} disabled={loading} icon={<MaterialIcon name="refresh" size="xs" />}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-500 font-mono">Loading scheduled runs from DB...</div>
          ) : scheduledRuns.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500">
              No scheduled production runs found in DB. Import a schedule above to generate planned runs.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead className="sticky top-0 bg-stone-50 border-b border-stone-300 text-stone-600">
                  <tr>
                    <th className="py-1.5 px-2">Run ID</th>
                    <th className="py-1.5 px-2">Order</th>
                    <th className="py-1.5 px-2">Op ID</th>
                    <th className="py-1.5 px-2">Machine</th>
                    <th className="py-1.5 px-2">Start Time</th>
                    <th className="py-1.5 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {scheduledRuns.map((r) => {
                    const mach = machines.find((m) => m.id === r.machine_id)
                    return (
                      <tr key={r.id} className="hover:bg-stone-50">
                        <td className="py-1.5 px-2 font-bold text-[#0E4B3E]">#{r.id}</td>
                        <td className="py-1.5 px-2 text-stone-700">Order #{r.order_id}</td>
                        <td className="py-1.5 px-2 text-stone-500">Op #{r.operation_id}</td>
                        <td className="py-1.5 px-2 font-bold">{mach ? mach.machine_code : `Mach #${r.machine_id}`}</td>
                        <td className="py-1.5 px-2 text-stone-600">
                          {r.start_time ? new Date(r.start_time).toLocaleTimeString() : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <Badge variant="default" size="xs" className="bg-[#FAF7F0] border border-[#181816]">
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
