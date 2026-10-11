'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import {
  api,
  BackendDispatch,
  BackendOrder,
  BackendFabricRoll,
  ApiClientError,
} from '@/lib/api'

export function DispatchesView() {
  const [dispatches, setDispatches] = useState<BackendDispatch[]>([])
  const [orders, setOrders] = useState<BackendOrder[]>([])
  const [passedRolls, setPassedRolls] = useState<BackendFabricRoll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [activeModal, setActiveModal] = useState<'createDispatch' | 'viewInvoice' | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<BackendDispatch | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)

  // Create dispatch form
  const [dispatchForm, setDispatchForm] = useState({
    order_id: '',
    invoice_number: '',
    vehicle: '',
    selectedRollIds: [] as number[],
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dispRes, ordRes, rollsRes] = await Promise.all([
        api.getDispatches(),
        api.getOrders(),
        api.getRolls({ status: 'passed' }),
      ])
      setDispatches(dispRes)
      setOrders(ordRes)
      setPassedRolls(rollsRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dispatches'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleConfirmDispatch = async (dispatchId: number) => {
    const targetDispatch = dispatches.find((d) => d.id === dispatchId)
    if (targetDispatch?.confirmed) {
      return
    }

    setConfirmingId(dispatchId)
    try {
      const result = await api.confirmDispatch(dispatchId)
      await loadData()
      alert(`Dispatch Confirmed Successfully:\n\nInvoice: ${result.invoice_number}\nTotal: $${Number(result.invoice_total).toLocaleString()}\n${result.message}`)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      alert(`Confirmation Error: ${msg}`)
    } finally {
      setConfirmingId(null)
    }
  }

  const handleCreateDispatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)

    if (dispatchForm.selectedRollIds.length === 0) {
      setModalError('Please select at least one passed fabric roll to dispatch')
      setSubmitting(false)
      return
    }

    try {
      const orderId = Number(dispatchForm.order_id)
      const selectedRolls = passedRolls.filter((r) => dispatchForm.selectedRollIds.includes(r.id))
      const items = selectedRolls.map((r) => ({
        roll_id: r.id,
        metres: Number(r.metres || r.length_metres || 0),
      }))

      await api.createDispatch({
        order_id: orderId,
        dispatch_date: new Date().toISOString(),
        invoice_number: dispatchForm.invoice_number,
        vehicle: dispatchForm.vehicle || null,
        items,
      })

      setModalSuccess(`Dispatch ${dispatchForm.invoice_number} created!`)
      setDispatchForm({ order_id: '', invoice_number: '', vehicle: '', selectedRollIds: [] })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRollSelect = (rollId: number) => {
    setDispatchForm((prev) => {
      const exists = prev.selectedRollIds.includes(rollId)
      return {
        ...prev,
        selectedRollIds: exists
          ? prev.selectedRollIds.filter((id) => id !== rollId)
          : [...prev.selectedRollIds, rollId],
      }
    })
  }

  const confirmedCount = dispatches.filter((d) => d.confirmed).length
  const totalValue = dispatches.reduce((acc, d) => acc + Number(d.invoice_total || d.total_amount || 0), 0)
  const totalMetres = dispatches.reduce((acc, d) => acc + Number(d.total_metres || 0), 0)

  // Rolls filtered for the selected order in the modal
  const eligibleRollsForOrder = dispatchForm.order_id
    ? passedRolls.filter((r) => r.order_id === Number(dispatchForm.order_id))
    : []

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-[#181816] pop-shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D7F4E5] border-2 border-[#181816] flex items-center justify-center text-[#0E4B3E]">
            <MaterialIcon name="local_shipping" size="md" color="#0E4B3E" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#181816] tracking-tight">Finished Goods Dispatches & Invoicing</h1>
            <p className="text-xs text-stone-600">Buyer dispatches, quality-gate passed roll allocations, and idempotent invoice confirmation.</p>
          </div>
        </div>

        <Button
          variant="primary"
          size="xs"
          icon={<MaterialIcon name="add" size="xs" />}
          onClick={() => {
            setActiveModal('createDispatch')
            setModalError(null)
            setModalSuccess(null)
            setDispatchForm({
              order_id: '',
              invoice_number: `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
              vehicle: 'Truck TN-38-AX-9912',
              selectedRollIds: [],
            })
          }}
        >
          Create Dispatch Note
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Invoices</div>
          <div className="text-xl font-black text-[#181816] mt-0.5">{dispatches.length} Dispatches</div>
          <div className="text-[10px] text-stone-500 mt-0.5">PostgreSQL ledger</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Confirmed Delivered</div>
          <div className="text-xl font-black text-[#15803D] mt-0.5">{confirmedCount} Finalized</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Idempotent state lock</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Dispatched Metres</div>
          <div className="text-xl font-black text-[#0E4B3E] mt-0.5">{totalMetres.toLocaleString()}m</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Passed rolls delivered</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Invoiced Value</div>
          <div className="text-xl font-black text-[#181816] mt-0.5">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Agreed rates applied</div>
        </Card>
      </div>

      {/* Dispatches Table */}
      <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b-2 border-stone-200">
          <h2 className="font-bold text-sm text-[#181816]">Dispatch Register & Billing Statements</h2>
          <Button variant="ghost" size="xs" onClick={loadData} disabled={loading} icon={<MaterialIcon name="refresh" size="xs" />}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-stone-500 font-mono">Loading dispatch records from PostgreSQL...</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 text-xs font-mono">
            <strong>Error:</strong> {error}
            <Button variant="outline" size="xs" className="mt-2 block" onClick={loadData}>Retry</Button>
          </div>
        ) : dispatches.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">No dispatches created yet. Create a dispatch note above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11.5px] border-collapse">
              <thead>
                <tr className="border-b-2 border-stone-300 text-stone-600 bg-stone-50">
                  <th className="py-2 px-3">Invoice #</th>
                  <th className="py-2 px-3">Order</th>
                  <th className="py-2 px-3">Vehicle</th>
                  <th className="py-2 px-3">Dispatch Date</th>
                  <th className="py-2 px-3 text-right">Metres</th>
                  <th className="py-2 px-3 text-right">Total Amount</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-[#0E4B3E]">{d.invoice_number}</td>
                    <td className="py-2.5 px-3 text-stone-700">Order #{d.order_id}</td>
                    <td className="py-2.5 px-3 text-stone-500">{d.vehicle || '—'}</td>
                    <td className="py-2.5 px-3 text-stone-600">{new Date(d.dispatch_date).toLocaleDateString()}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#181816]">{Number(d.total_metres).toLocaleString()}m</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[#181816]">${Number(d.invoice_total || d.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-center">
                      {d.confirmed ? (
                        <Badge variant="success" size="xs" className="bg-[#D7F4E5] text-[#0B382F] border border-[#181816] font-bold">
                          Confirmed ✓
                        </Badge>
                      ) : (
                        <Badge variant="warning" size="xs" className="bg-[#FEF08A] text-[#713F12] border border-[#181816]">
                          Pending Delivery
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setSelectedInvoice(d)
                          setActiveModal('viewInvoice')
                        }}
                      >
                        Invoice
                      </Button>
                      {!d.confirmed && (
                        <Button
                          variant="pop"
                          size="xs"
                          disabled={confirmingId === d.id}
                          onClick={() => handleConfirmDispatch(d.id)}
                          title="Confirm buyer delivery"
                        >
                          {confirmingId === d.id ? 'Confirming...' : 'Confirm'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: View Invoice Details */}
      {activeModal === 'viewInvoice' && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-lg w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="receipt_long" size="sm" color="#0E4B3E" />
                Dispatch Invoice #{selectedInvoice.invoice_number}
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-[#FAF7F0] border-2 border-[#181816] rounded-xl grid grid-cols-2 gap-2 text-[11px]">
                <div>Order: <strong>#{selectedInvoice.order_id}</strong></div>
                <div>Status: <strong className="uppercase">{selectedInvoice.confirmed ? 'CONFIRMED' : 'PENDING'}</strong></div>
                <div>Vehicle: <strong>{selectedInvoice.vehicle || 'Standard Dispatch'}</strong></div>
                <div>Date: <strong>{new Date(selectedInvoice.dispatch_date).toLocaleString()}</strong></div>
                {selectedInvoice.confirmed_at && (
                  <div className="col-span-2 text-emerald-800 font-bold">
                    Confirmed At: {new Date(selectedInvoice.confirmed_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-bold text-stone-800 text-xs mb-1">Dispatched Line Items</h4>
                <div className="border border-stone-300 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500">
                      <tr>
                        <th className="py-1 px-2">Roll</th>
                        <th className="py-1 px-2 text-right">Metres</th>
                        <th className="py-1 px-2 text-right">Agreed Rate</th>
                        <th className="py-1 px-2 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {selectedInvoice.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="py-1 px-2 font-bold text-[#0E4B3E]">Roll #{item.roll_id} {item.roll_code ? `(${item.roll_code})` : ''}</td>
                          <td className="py-1 px-2 text-right">{Number(item.line_metres || item.metres).toFixed(1)}m</td>
                          <td className="py-1 px-2 text-right">${Number(item.agreed_rate).toFixed(2)}</td>
                          <td className="py-1 px-2 text-right font-bold">${Number(item.line_total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-stone-100 font-bold border-t border-stone-300">
                      <tr>
                        <td className="py-1.5 px-2">Total</td>
                        <td className="py-1.5 px-2 text-right">{Number(selectedInvoice.total_metres).toFixed(1)}m</td>
                        <td className="py-1.5 px-2 text-right">—</td>
                        <td className="py-1.5 px-2 text-right text-[#0E4B3E]">${Number(selectedInvoice.invoice_total || selectedInvoice.total_amount || 0).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="primary" size="xs" onClick={() => setActiveModal(null)}>Close</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Create Dispatch Note */}
      {activeModal === 'createDispatch' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-lg w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="local_shipping" size="sm" color="#0E4B3E" />
                Create New Finished Goods Dispatch Note
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateDispatch} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Target Order *</label>
                <select
                  required
                  value={dispatchForm.order_id}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, order_id: e.target.value, selectedRollIds: [] })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      Order #{o.id} ({o.fabric_type} · {o.colour} · {o.quantity_metres}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Invoice Number *</label>
                  <input
                    type="text"
                    required
                    value={dispatchForm.invoice_number}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, invoice_number: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Delivery Vehicle</label>
                  <input
                    type="text"
                    value={dispatchForm.vehicle}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, vehicle: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
              </div>

              {/* Quality-Gate Passed Roll Selection */}
              <div>
                <label className="block text-stone-600 font-bold mb-1">
                  Select Passed Fabric Rolls ({eligibleRollsForOrder.length} available for this order)
                </label>
                {eligibleRollsForOrder.length === 0 ? (
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-500 text-center">
                    {dispatchForm.order_id
                      ? 'No passed, dispatch-eligible rolls found for this order. Quality inspection must pass first!'
                      : 'Please select an order first.'}
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-stone-50 border-2 border-[#181816] rounded-xl">
                    {eligibleRollsForOrder.map((roll) => {
                      const isSelected = dispatchForm.selectedRollIds.includes(roll.id)
                      const len = Number(roll.metres || roll.length_metres || 0)
                      return (
                        <div
                          key={roll.id}
                          onClick={() => toggleRollSelect(roll.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-colors ${
                            isSelected
                              ? 'bg-[#D7F4E5] border-[#0E4B3E] text-[#0B382F]'
                              : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="accent-[#0E4B3E]"
                            />
                            <span className="font-bold">{roll.roll_code}</span>
                          </div>
                          <span>{len.toLocaleString()}m</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting || dispatchForm.selectedRollIds.length === 0} type="submit">
                  {submitting ? 'Creating...' : 'Create Dispatch'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
