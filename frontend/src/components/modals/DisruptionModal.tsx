'use client'

import { useState } from 'react'
import { Modal, Button, MaterialIcon } from '@/components/ui'

interface DisruptionModalProps {
  isOpen: boolean
  onClose: () => void
  onExecute: (type: 'machine_down' | 'yarn_delay', data: { machine?: string; from?: number; to?: number; order?: string; hours?: number }) => void
}

export function DisruptionModal({ isOpen, onClose, onExecute }: DisruptionModalProps) {
  const [disruptionType, setDisruptionType] = useState<'machine_down' | 'yarn_delay'>('machine_down')
  const [machine, setMachine] = useState('WEAVE-03')
  const [from, setFrom] = useState(480)
  const [to, setTo] = useState(960)
  const [order, setOrder] = useState('ORD-007')
  const [hours, setHours] = useState(12)

  const machines = ['WEAVE-03', 'WEAVE-01', 'SPIN-02', 'DYE-01']
  const orders = ['ORD-007', 'ORD-009', 'ORD-001', 'ORD-003']

  const handleExecute = () => {
    if (disruptionType === 'machine_down') {
      onExecute('machine_down', { machine, from, to })
    } else {
      onExecute('yarn_delay', { order, hours })
    }
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Simulate Production Disruption"
      icon={<MaterialIcon name="warning" size="xl" color="#E05326" />}
      actionButtons={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleExecute}>Inject & Re-Solve</Button>
        </>
      }
    >
      <div className="space-y-3 font-mono text-[11.5px]">
        <div>
          <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Disruption Type</label>
          <select
            value={disruptionType}
            onChange={(e) => setDisruptionType(e.target.value as 'machine_down' | 'yarn_delay')}
            className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
          >
            <option value="machine_down">Machine Breakdown (Loom / Spindle Down)</option>
            <option value="yarn_delay">Delayed Yarn Lot (Supplier Shipment Delay)</option>
          </select>
        </div>

        {disruptionType === 'machine_down' && (
          <>
            <div>
              <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Machine Target</label>
              <select
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
                className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
              >
                {machines.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Downtime From (min)</label>
                <input
                  type="number"
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value))}
                  className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
                />
              </div>
              <div>
                <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Downtime To (min)</label>
                <input
                  type="number"
                  value={to}
                  onChange={(e) => setTo(Number(e.target.value))}
                  className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
                />
              </div>
            </div>
          </>
        )}

        {disruptionType === 'yarn_delay' && (
          <>
            <div>
              <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Order Affected</label>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
              >
                {orders.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block uppercase mb-1 font-bold text-[#181816] text-[10px]">Delay (hours)</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full bg-[#FAF7F0] border-2 border-[#181816] rounded-xl px-3 py-1.5 font-bold"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}