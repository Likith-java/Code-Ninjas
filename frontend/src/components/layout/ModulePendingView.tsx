'use client'

import { Card, Button, Badge, MaterialIcon } from '@/components/ui'

interface ModulePendingViewProps {
  moduleId: string
  onSwitchModule: (module: string) => void
}

const MODULE_DETAILS: Record<
  string,
  { title: string; icon: string; description: string; expectedEndpoint: string; nextSteps: string }
> = {
  yarn: {
    title: 'Yarn Stock & Lot Traceability',
    icon: 'inventory_2',
    description: 'Real-time yarn warehouse bale weights, spinning lot codes, and supplier delivery tracking.',
    expectedEndpoint: 'GET /api/v1/inventory/lots & /api/v1/suppliers/delays',
    nextSteps: 'Mock lot allocations are active in the Production Floor and Operations Dashboard.',
  },
  validator: {
    title: 'CP-SAT Schedule Constraint Validator',
    icon: 'verified',
    description: 'Formal solver constraint checker verifying precedence, no-overlap, and machine suitability rules.',
    expectedEndpoint: 'POST /api/v1/solve & /api/v1/validate/constraints',
    nextSteps: 'Constraint checking and re-planning can be tested live inside the Production Floor inspector panel.',
  },
  rolls: {
    title: 'Fabric Rolls & QR Traceability',
    icon: 'qr_code',
    description: 'Post-weaving fabric roll grading (A/B/C/Defect grade) and QR code labeling for cut-and-sew dispatch.',
    expectedEndpoint: 'GET /api/v1/rolls/batch/{id} & /api/v1/defects/heatmap',
    nextSteps: 'Roll grading data schema is planned for the next platform milestone.',
  },
  dispatch: {
    title: 'Finished Goods & Dispatch Logistics',
    icon: 'local_shipping',
    description: 'Finished packing lists, logistics bill of lading, and buyer dispatch tracking.',
    expectedEndpoint: 'POST /api/v1/dispatch/manifest',
    nextSteps: 'Completed orders are summarized in the Operations Dashboard recent orders table.',
  },
}

export function ModulePendingView({ moduleId, onSwitchModule }: ModulePendingViewProps) {
  const info = MODULE_DETAILS[moduleId] || {
    title: 'Plant Intelligence Module',
    icon: 'apps',
    description: 'Textile plant management module.',
    expectedEndpoint: 'Pending backend microservice',
    nextSteps: 'Please navigate to active modules.',
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-6 flex items-center justify-center">
      <Card variant="elevated" padding="lg" className="max-w-xl w-full bg-white space-y-4 text-center pop-shadow-lg">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D7F4E5] border-2 border-[#181816] pop-shadow-xs flex items-center justify-center text-[#0E4B3E]">
          <MaterialIcon name={info.icon} size="xl" color="#0E4B3E" />
        </div>

        <div className="space-y-1">
          <Badge variant="warning" size="xs">
            Backend API Pending
          </Badge>
          <h2 className="text-xl font-black text-[#181816] tracking-tight">{info.title}</h2>
          <p className="text-xs text-stone-600 max-w-md mx-auto">{info.description}</p>
        </div>

        <div className="p-3 bg-[#FAF7F0] rounded-xl border border-stone-300 text-left font-mono text-xs space-y-1">
          <div className="text-stone-500">Target Backend Contract:</div>
          <code className="text-[#0E4B3E] font-bold block">{info.expectedEndpoint}</code>
          <div className="text-[11px] text-stone-600 pt-1 border-t border-stone-200">
            {info.nextSteps}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
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
