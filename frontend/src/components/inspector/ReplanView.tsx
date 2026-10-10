'use client'

import { Card, Badge, Button, MaterialIcon, Progress } from '@/components/ui'
import { validatorRules } from '@/lib/mockData'

interface ReplanViewProps {
  isResolved: boolean
  onApplyReplan: (action: 'freeze' | 'split' | 'commit') => void
}

export function ReplanView({ isResolved, onApplyReplan }: ReplanViewProps) {
  return (
    <div className="space-y-3.5">
      <Card variant="elevated" padding="md" className="flex items-start gap-2.5" style={{ backgroundColor: '#FFEFEA', borderColor: '#181816' }}>
        <MaterialIcon name="handyman" size="xl" color="#E05326" className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px] text-[#962C0B]">Machine Breakdown: Loom WEAVE-03</div>
          <p className="font-mono text-[11px] text-[#962C0B] mt-1 leading-relaxed">
            Downtime window injected: <code className="bg-white border border-[#181816] px-1 py-0.2 rounded font-bold text-[#181816]">t = 480m to 960m (8 hours)</code>. Unfinished metres in <b className="text-[#181816]">ORD-004</b> require split and reassignment.
          </p>
        </div>
      </Card>

      <Card variant="default" padding="none" className="overflow-hidden pop-shadow-md bg-white">
        <div className="grid grid-cols-2 bg-[#EFE8D8] border-b-2 border-[#181816] font-mono text-[10.5px]">
          <div className="p-2 border-r-2 border-[#181816] text-[#78716C] font-bold flex justify-between">
            <span>BASELINE (EDF)</span>
            <span>DELAY: +520m</span>
          </div>
          <div className="p-2 text-[#0E4B3E] font-bold flex justify-between">
            <span>CP-SAT RE-PLAN</span>
            <span>DELAY: +0m</span>
          </div>
        </div>

        <div className="p-3 font-mono text-[11px] space-y-2 bg-white">
          <div className="text-[#78716C] text-[10px] uppercase font-bold">Shift & Split Plan:</div>
          <Card variant="default" padding="sm" className="space-y-1 bg-[#FAF7F0] border border-[#181816]">
            <div className="flex justify-between">
              <span className="text-[#4E4B47]">Frozen Metres (WEAVE-03):</span>
              <span className="font-bold text-[#15803D]">1,200m (Passed)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4E4B47]">Split Metres:</span>
              <span className="font-bold text-[#E05326]">1,800m remaining</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4E4B47]">Re-allocated Machine:</span>
              <span className="font-bold text-[#0E4B3E]">WEAVE-02 (Rate: 45 m/h)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4E4B47]">New Weave Start:</span>
              <span className="font-bold text-[#181816]">t = 360m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4E4B47]">Projected Delivery:</span>
              <span className="font-bold text-[#15803D]">t = 4,140m (due: 4,320m)</span>
            </div>
          </Card>
        </div>
      </Card>

      <Card variant="default" padding="md" className="pop-shadow-md bg-white border-2 border-[#181816] rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-[#181816] uppercase tracking-wider font-bold">Independent Validator Proof</span>
          <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-2 py-0.2 rounded-full text-[#0B382F] font-bold">
            PASS (8/8)
          </Badge>
        </div>
        <div className="space-y-1.5 font-mono text-[11px] text-[#4E4B47]">
          {validatorRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-1.5 text-[#15803D]">
              <MaterialIcon name="check_circle" size="sm" color="#15803D" />
              <span>{rule.description}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-2 pt-1">
        <span className="font-mono text-[10px] text-[#181816] uppercase tracking-wider block font-bold">Apply Re-Plan Actions</span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="pop"
            size="sm"
            className="h-8 px-2 rounded-xl font-mono text-[11px] font-bold flex items-center justify-center gap-1"
            icon={<MaterialIcon name="lock" size="sm" />}
            onClick={() => onApplyReplan('freeze')}
            disabled={isResolved}
          >
            Freeze Running
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 rounded-xl font-mono text-[11px] font-bold flex items-center justify-center gap-1 text-[#962C0B] border-[#181816]"
            icon={<MaterialIcon name="call_split" size="sm" color="#962C0B" />}
            onClick={() => onApplyReplan('split')}
            disabled={isResolved}
          >
            Split ORD-004
          </Button>
        </div>
        <Button
          variant="primary"
          size="md"
          className="w-full h-9 rounded-xl border-2 border-[#181816] text-[12.5px] font-bold flex items-center justify-center gap-2"
          icon={<MaterialIcon name="task_alt" size="md" />}
          onClick={() => onApplyReplan('commit')}
          disabled={isResolved}
        >
          Commit Validated Re-Plan to Floor
        </Button>
      </div>
    </div>
  )
}