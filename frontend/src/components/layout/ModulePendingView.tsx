'use client'

import { useState } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import { api, API_BASE_URL } from '@/lib/api'

interface ModulePendingViewProps {
  moduleId: string
  onSwitchModule: (module: string) => void
}

interface ModuleInfo {
  title: string
  icon: string
  description: string
  implementedEndpoint?: string
  status: 'live' | 'pending'
  notes: string
}

const MODULE_DETAILS: Record<string, ModuleInfo> = {
  yarn: {
    title: 'Yarn Stock & Lot Traceability',
    icon: 'inventory_2',
    description: 'Raw-material warehouse bale inventory, spinning lot codes, and supplier ledger movements.',
    implementedEndpoint: 'GET /inventory, GET /inventory/movements, GET /materials',
    status: 'live',
    notes: 'FastAPI routes are fully implemented and connected to the inventory ledger models.',
  },
  validator: {
    title: 'CP-SAT Schedule Constraint Validator',
    icon: 'verified',
    description: 'Formal solver constraint checker verifying precedence, no-overlap, and machine suitability rules.',
    implementedEndpoint: 'POST /schedules/optimize (Scheduler Microservice Pending)',
    status: 'pending',
    notes: 'Independent validation rules are specified in validator.py. Full OR-Tools microservice is pending integration.',
  },
  rolls: {
    title: 'Fabric Rolls & Quality Traceability',
    icon: 'qr_code',
    description: 'Post-weaving fabric roll grading (A/B/C/Defect grade) and 4-point inspection traceability.',
    implementedEndpoint: 'GET /rolls, GET /rolls/{id}/traceability, POST /rolls/{id}/inspections',
    status: 'live',
    notes: 'Quality inspection and roll lineage models are implemented in FastAPI.',
  },
  dispatch: {
    title: 'Finished Goods & Dispatch Logistics',
    icon: 'local_shipping',
    description: 'Finished goods packing lists, buyer dispatch invoices, and delivery confirmation.',
    implementedEndpoint: 'GET /dispatches, POST /dispatches, POST /dispatches/{id}/confirm',
    status: 'live',
    notes: 'Two-step dispatch creation and atomic confirmation ledger implemented in FastAPI.',
  },
}

export function ModulePendingView({ moduleId, onSwitchModule }: ModulePendingViewProps) {
  const [testResult, setTestResult] = useState<{
    loading: boolean
    endpoint: string
    status: number | null
    data: unknown
    error: string | null
  } | null>(null)

  const info: ModuleInfo = MODULE_DETAILS[moduleId] || {
    title: 'Plant Intelligence Module',
    icon: 'apps',
    description: 'Textile plant management module.',
    status: 'pending',
    notes: 'Pending backend microservice implementation.',
  }

  const handleTestEndpoint = async () => {
    let endpoint = ''
    if (moduleId === 'yarn') endpoint = '/inventory'
    else if (moduleId === 'rolls') endpoint = '/rolls'
    else if (moduleId === 'dispatch') endpoint = '/dispatches'
    else endpoint = '/health'

    setTestResult({ loading: true, endpoint, status: null, data: null, error: null })

    try {
      if (moduleId === 'yarn') {
        const res = await api.getInventory()
        setTestResult({ loading: false, endpoint, status: 200, data: res, error: null })
      } else if (moduleId === 'rolls') {
        const res = await api.getRolls()
        setTestResult({ loading: false, endpoint, status: 200, data: res, error: null })
      } else if (moduleId === 'dispatch') {
        const res = await api.getDispatches()
        setTestResult({ loading: false, endpoint, status: 200, data: res, error: null })
      } else {
        const res = await api.checkHealth()
        setTestResult({ loading: false, endpoint, status: 200, data: res, error: null })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 500
      setTestResult({ loading: false, endpoint, status, data: null, error: msg })
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-6 flex items-center justify-center">
      <Card variant="elevated" padding="lg" className="max-w-xl w-full bg-white space-y-4 text-center pop-shadow-lg">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D7F4E5] border-2 border-[#181816] pop-shadow-xs flex items-center justify-center text-[#0E4B3E]">
          <MaterialIcon name={info.icon} size="xl" color="#0E4B3E" />
        </div>

        <div className="space-y-1">
          {info.status === 'live' ? (
            <Badge variant="success" size="xs">
              Backend Endpoint Active
            </Badge>
          ) : (
            <Badge variant="warning" size="xs">
              Backend Microservice Pending
            </Badge>
          )}
          <h2 className="text-xl font-black text-[#181816] tracking-tight">{info.title}</h2>
          <p className="text-xs text-stone-600 max-w-md mx-auto">{info.description}</p>
        </div>

        <div className="p-3 bg-[#FAF7F0] rounded-xl border border-stone-300 text-left font-mono text-xs space-y-1">
          <div className="text-stone-500">FastAPI Backend Contract ({API_BASE_URL}):</div>
          <code className="text-[#0E4B3E] font-bold block">{info.implementedEndpoint}</code>
          <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-200">
            {info.notes}
          </div>
        </div>

        {/* Live Endpoint Tester */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="xs"
            onClick={handleTestEndpoint}
            disabled={testResult?.loading}
            icon={<MaterialIcon name="api" size="xs" color="#0E4B3E" />}
          >
            {testResult?.loading ? 'Pinging API...' : `Test Live Request (${API_BASE_URL})`}
          </Button>

          {testResult && (
            <div className="mt-3 p-3 bg-stone-900 text-stone-100 rounded-xl text-left font-mono text-[11px] overflow-x-auto max-h-40 border border-stone-700">
              <div className="flex items-center justify-between pb-1 border-b border-stone-700">
                <span className="text-stone-400">Endpoint: {testResult.endpoint}</span>
                <span className={testResult.error ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {testResult.status ? `HTTP ${testResult.status}` : 'Offline'}
                </span>
              </div>
              <pre className="mt-1 text-[10px] leading-tight">
                {testResult.error
                  ? `Error: ${testResult.error}`
                  : JSON.stringify(testResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-2 border-t border-stone-200">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSwitchModule('dashboard')}
            icon={<MaterialIcon name="dashboard" size="xs" />}
          >
            Go to Operations Dashboard
          </Button>
          <Button
            variant="pop"
            size="sm"
            onClick={() => onSwitchModule('floor')}
            icon={<MaterialIcon name="grid_view" size="xs" />}
          >
            Production Floor Board
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSwitchModule('workforce')}
            icon={<MaterialIcon name="badge" size="xs" />}
          >
            Workforce & Attendance
          </Button>
        </div>
      </Card>
    </div>
  )
}
