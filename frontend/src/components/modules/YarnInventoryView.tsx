'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import {
  api,
  BackendInventorySummary,
  BackendInventoryLot,
  BackendInventoryMovement,
  BackendMaterial,
  BackendSupplier,
  BackendOrder,
  FeasibilityOut,
  ApiClientError,
} from '@/lib/api'

export function YarnInventoryView() {
  const [inventory, setInventory] = useState<BackendInventorySummary | null>(null)
  const [movements, setMovements] = useState<BackendInventoryMovement[]>([])
  const [materials, setMaterials] = useState<BackendMaterial[]>([])
  const [suppliers, setSuppliers] = useState<BackendSupplier[]>([])
  const [orders, setOrders] = useState<BackendOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lowStockFilter, setLowStockFilter] = useState(false)

  // Modals state
  const [activeModal, setActiveModal] = useState<'receipt' | 'issue' | 'adjust' | 'feasibility' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)

  // Receipt form
  const [receiptForm, setReceiptForm] = useState({
    lot_code: '',
    material_id: '',
    supplier_id: '',
    quantity_kg: '',
    lot_cost: '',
    intended_order_id: '',
    note: '',
  })

  // Issue form
  const [issueForm, setIssueForm] = useState({
    lot_id: '',
    order_id: '',
    quantity_kg: '',
    note: '',
  })

  // Adjust form
  const [adjustForm, setAdjustForm] = useState({
    lot_id: '',
    quantity_kg: '',
    reason: '',
  })

  // Feasibility form & result
  const [feasibilityForm, setFeasibilityForm] = useState({
    fabric_type: 'Cotton Twill',
    colour: 'Deep Navy',
    quantity_metres: '1000',
  })
  const [feasibilityResult, setFeasibilityResult] = useState<FeasibilityOut | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [invRes, movRes, matRes, supRes, ordRes] = await Promise.all([
        api.getInventory(lowStockFilter),
        api.getInventoryMovements({ limit: 50 }),
        api.getMaterials(),
        api.getSuppliers(),
        api.getOrders(),
      ])
      setInventory(invRes)
      setMovements(movRes)
      setMaterials(matRes)
      setSuppliers(supRes)
      setOrders(ordRes)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load inventory'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [lowStockFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await api.createReceipt({
        lot_code: receiptForm.lot_code,
        material_id: Number(receiptForm.material_id),
        supplier_id: Number(receiptForm.supplier_id),
        quantity_kg: Number(receiptForm.quantity_kg),
        lot_cost: Number(receiptForm.lot_cost),
        intended_order_id: receiptForm.intended_order_id ? Number(receiptForm.intended_order_id) : null,
        note: receiptForm.note || null,
      })
      setModalSuccess(`Successfully received lot ${receiptForm.lot_code}!`)
      setReceiptForm({ lot_code: '', material_id: '', supplier_id: '', quantity_kg: '', lot_cost: '', intended_order_id: '', note: '' })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await api.createIssue({
        lot_id: Number(issueForm.lot_id),
        order_id: Number(issueForm.order_id),
        quantity_kg: Number(issueForm.quantity_kg),
        note: issueForm.note || null,
      })
      setModalSuccess(`Successfully issued ${issueForm.quantity_kg} kg!`)
      setIssueForm({ lot_id: '', order_id: '', quantity_kg: '', note: '' })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      await api.createAdjustment({
        lot_id: Number(adjustForm.lot_id),
        quantity_kg: Number(adjustForm.quantity_kg),
        reason: adjustForm.reason,
      })
      setModalSuccess(`Stock adjustment recorded successfully!`)
      setAdjustForm({ lot_id: '', quantity_kg: '', reason: '' })
      await loadData()
      setTimeout(() => { setActiveModal(null); setModalSuccess(null) }, 1500)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckFeasibility = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setModalError(null)
    try {
      const res = await api.checkFeasibility({
        fabric_type: feasibilityForm.fabric_type,
        colour: feasibilityForm.colour,
        quantity_metres: Number(feasibilityForm.quantity_metres),
      })
      setFeasibilityResult(res)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setModalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const totalKg = inventory?.lots.reduce((acc, l) => acc + Number(l.available_kg), 0) || 0

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-4 sm:p-6 space-y-6">
      {/* Module Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border-2 border-[#181816] pop-shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D7F4E5] border-2 border-[#181816] flex items-center justify-center text-[#0E4B3E]">
            <MaterialIcon name="inventory_2" size="md" color="#0E4B3E" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#181816] tracking-tight">Yarn Warehouse & Raw Materials Ledger</h1>
            <p className="text-xs text-stone-600">Track lots, warehouse receipts, issues, reorder thresholds, and live material feasibility.</p>
          </div>
        </div>

        {/* Global Module Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="pop"
            size="xs"
            icon={<MaterialIcon name="calculate" size="xs" color="#0E4B3E" />}
            onClick={() => { setActiveModal('feasibility'); setModalError(null); setFeasibilityResult(null) }}
          >
            Check Feasibility
          </Button>
          <Button
            variant="outline"
            size="xs"
            icon={<MaterialIcon name="call_split" size="xs" color="#0E4B3E" />}
            onClick={() => { setActiveModal('adjust'); setModalError(null); setModalSuccess(null) }}
          >
            Adjust Stock
          </Button>
          <Button
            variant="outline"
            size="xs"
            icon={<MaterialIcon name="output" size="xs" color="#0E4B3E" />}
            onClick={() => { setActiveModal('issue'); setModalError(null); setModalSuccess(null) }}
          >
            Issue to Order
          </Button>
          <Button
            variant="primary"
            size="xs"
            icon={<MaterialIcon name="add" size="xs" />}
            onClick={() => { setActiveModal('receipt'); setModalError(null); setModalSuccess(null) }}
          >
            Receive Inbound Lot
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Total Warehouse Lots</div>
          <div className="text-xl font-black text-[#181816] mt-0.5">{inventory?.total_lots ?? 0} Lots</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Physical yarn tracking</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Available Stock</div>
          <div className="text-xl font-black text-[#0E4B3E] mt-0.5">{totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Authoritative balance</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Low Stock Alerts</div>
          <div className={`text-xl font-black mt-0.5 ${(inventory?.low_stock_materials ?? 0) > 0 ? 'text-[#962C0B]' : 'text-[#15803D]'}`}>
            {inventory?.low_stock_materials ?? 0} Materials
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">Below reorder trigger</div>
        </Card>
        <Card variant="elevated" padding="sm" className="bg-white border-2 border-[#181816] pop-shadow-xs">
          <div className="text-[11px] font-mono text-stone-500 uppercase font-bold">Approved Suppliers</div>
          <div className="text-xl font-black text-[#181816] mt-0.5">{suppliers.length} Vendors</div>
          <div className="text-[10px] text-stone-500 mt-0.5">Active procurement</div>
        </Card>
      </div>

      {/* Main Content: Lots Ledger */}
      <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b-2 border-stone-200">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-sm text-[#181816]">Yarn Inventory Lots</h2>
            <Button
              variant={lowStockFilter ? 'danger' : 'outline'}
              size="xs"
              onClick={() => setLowStockFilter(!lowStockFilter)}
            >
              {lowStockFilter ? 'Showing Low Stock Only' : 'Filter Low Stock'}
            </Button>
          </div>
          <Button variant="ghost" size="xs" onClick={loadData} disabled={loading} icon={<MaterialIcon name="refresh" size="xs" />}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-stone-500 font-mono">Loading inventory ledger from PostgreSQL...</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 text-xs font-mono">
            <strong>Error:</strong> {error}
            <Button variant="outline" size="xs" className="mt-2 block" onClick={loadData}>Retry</Button>
          </div>
        ) : !inventory || inventory.lots.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500">No inventory lots found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11.5px] border-collapse">
              <thead>
                <tr className="border-b-2 border-stone-300 text-stone-600 bg-stone-50">
                  <th className="py-2 px-3">Lot Code</th>
                  <th className="py-2 px-3">Material Type</th>
                  <th className="py-2 px-3">Colour / Spec</th>
                  <th className="py-2 px-3">Supplier</th>
                  <th className="py-2 px-3 text-right">Available (kg)</th>
                  <th className="py-2 px-3 text-right">Threshold</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {inventory.lots.map((lot) => {
                  const supplier = suppliers.find((s) => s.id === lot.supplier_id)
                  return (
                    <tr key={lot.lot_id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-[#0E4B3E]">{lot.lot_code}</td>
                      <td className="py-2.5 px-3 font-sans font-bold text-[#181816]">{lot.material_type}</td>
                      <td className="py-2.5 px-3 text-stone-600">{lot.colour} · {lot.specification}</td>
                      <td className="py-2.5 px-3 text-stone-600">{supplier ? supplier.name : `Supplier #${lot.supplier_id}`}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-[#181816]">{Number(lot.available_kg).toLocaleString(undefined, { minimumFractionDigits: 1 })} kg</td>
                      <td className="py-2.5 px-3 text-right text-stone-500">{Number(lot.reorder_threshold_kg).toLocaleString()} kg</td>
                      <td className="py-2.5 px-3 text-center">
                        {lot.low_stock ? (
                          <Badge variant="warning" size="xs" className="bg-[#FFEFEA] text-[#962C0B] border border-[#181816] font-bold">
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="success" size="xs" className="bg-[#D7F4E5] text-[#0B382F] border border-[#181816]">
                            Available
                          </Badge>
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

      {/* Warehouse Movements History */}
      <div className="bg-white rounded-2xl border-2 border-[#181816] p-4 pop-shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b-2 border-stone-200">
          <h2 className="font-bold text-sm text-[#181816]">Recent Warehouse Movement Audit Log</h2>
          <span className="text-[11px] font-mono text-stone-500">{movements.length} logged events</span>
        </div>

        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead className="sticky top-0 bg-stone-50 border-b border-stone-300 text-stone-500">
              <tr>
                <th className="py-1.5 px-3">Date / Time</th>
                <th className="py-1.5 px-3">Type</th>
                <th className="py-1.5 px-3">Lot ID</th>
                <th className="py-1.5 px-3">Order</th>
                <th className="py-1.5 px-3 text-right">Quantity (kg)</th>
                <th className="py-1.5 px-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50">
                  <td className="py-1.5 px-3 text-stone-600">{new Date(m.movement_date).toLocaleString()}</td>
                  <td className="py-1.5 px-3 font-bold uppercase">
                    <span className={
                      m.movement_type === 'receipt' ? 'text-emerald-700' :
                      m.movement_type === 'issue' ? 'text-amber-700' : 'text-purple-700'
                    }>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-stone-600">Lot #{m.lot_id}</td>
                  <td className="py-1.5 px-3 text-stone-600">{m.order_id ? `Order #${m.order_id}` : '—'}</td>
                  <td className="py-1.5 px-3 text-right font-bold">{Number(m.quantity_kg).toFixed(1)} kg</td>
                  <td className="py-1.5 px-3 text-stone-500">{m.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Receive Inbound Lot */}
      {activeModal === 'receipt' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="add_shopping_cart" size="sm" color="#0E4B3E" />
                Receive Inbound Yarn Lot
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateReceipt} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Lot Code *</label>
                <input
                  type="text"
                  required
                  value={receiptForm.lot_code}
                  onChange={(e) => setReceiptForm({ ...receiptForm, lot_code: e.target.value })}
                  placeholder="e.g. LOT-COT-2026-X"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Material *</label>
                  <select
                    required
                    value={receiptForm.material_id}
                    onChange={(e) => setReceiptForm({ ...receiptForm, material_id: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  >
                    <option value="">Select Material</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>{m.material_type} ({m.colour})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Supplier *</label>
                  <select
                    required
                    value={receiptForm.supplier_id}
                    onChange={(e) => setReceiptForm({ ...receiptForm, supplier_id: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Quantity (kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={receiptForm.quantity_kg}
                    onChange={(e) => setReceiptForm({ ...receiptForm, quantity_kg: e.target.value })}
                    placeholder="e.g. 500"
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Lot Cost ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={receiptForm.lot_cost}
                    onChange={(e) => setReceiptForm({ ...receiptForm, lot_cost: e.target.value })}
                    placeholder="e.g. 2500"
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Notes</label>
                <input
                  type="text"
                  value={receiptForm.note}
                  onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
                  placeholder="Inbound delivery note"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting} type="submit">
                  {submitting ? 'Submitting...' : 'Record Receipt'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Issue Yarn to Order */}
      {activeModal === 'issue' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="output" size="sm" color="#0E4B3E" />
                Issue Yarn to Production Order
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateIssue} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Source Lot *</label>
                <select
                  required
                  value={issueForm.lot_id}
                  onChange={(e) => setIssueForm({ ...issueForm, lot_id: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Lot</option>
                  {inventory?.lots.map((l) => (
                    <option key={l.lot_id} value={l.lot_id}>
                      {l.lot_code} — {l.material_type} ({Number(l.available_kg).toFixed(1)} kg avail)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Target Production Order *</label>
                <select
                  required
                  value={issueForm.order_id}
                  onChange={(e) => setIssueForm({ ...issueForm, order_id: e.target.value })}
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

              <div>
                <label className="block text-stone-600 font-bold mb-1">Issue Quantity (kg) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={issueForm.quantity_kg}
                  onChange={(e) => setIssueForm({ ...issueForm, quantity_kg: e.target.value })}
                  placeholder="e.g. 150"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Notes</label>
                <input
                  type="text"
                  value={issueForm.note}
                  onChange={(e) => setIssueForm({ ...issueForm, note: e.target.value })}
                  placeholder="Reason for issuance"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting} type="submit">
                  {submitting ? 'Issuing...' : 'Issue Yarn'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Stock Adjustment */}
      {activeModal === 'adjust' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="tune" size="sm" color="#0E4B3E" />
                Record Stock Adjustment
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}
            {modalSuccess && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{modalSuccess}</div>}

            <form onSubmit={handleCreateAdjust} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Target Lot *</label>
                <select
                  required
                  value={adjustForm.lot_id}
                  onChange={(e) => setAdjustForm({ ...adjustForm, lot_id: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="">Select Lot</option>
                  {inventory?.lots.map((l) => (
                    <option key={l.lot_id} value={l.lot_id}>
                      {l.lot_code} — {l.material_type} ({Number(l.available_kg).toFixed(1)} kg)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Adjustment Delta (kg) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjustForm.quantity_kg}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity_kg: e.target.value })}
                  placeholder="e.g. -15.5 for shrinkage, +20 for surplus"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
                <span className="text-[10px] text-stone-500">Positive for audit surplus, negative for shrinkage/scrap.</span>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="e.g. Physical inventory cycle count difference"
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button variant="ghost" size="xs" onClick={() => setActiveModal(null)} type="button">Cancel</Button>
                <Button variant="primary" size="xs" disabled={submitting} type="submit">
                  {submitting ? 'Applying...' : 'Apply Adjustment'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Yarn Feasibility Calculator */}
      {activeModal === 'feasibility' && (
        <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card variant="elevated" padding="lg" className="max-w-lg w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
                <MaterialIcon name="calculate" size="sm" color="#0E4B3E" />
                Yarn Material Feasibility Checker
              </h3>
              <button onClick={() => setActiveModal(null)} className="font-bold text-stone-500 hover:text-black">✕</button>
            </div>

            {modalError && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{modalError}</div>}

            <form onSubmit={handleCheckFeasibility} className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Fabric Type *</label>
                  <input
                    type="text"
                    required
                    value={feasibilityForm.fabric_type}
                    onChange={(e) => setFeasibilityForm({ ...feasibilityForm, fabric_type: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 font-bold mb-1">Colour *</label>
                  <input
                    type="text"
                    required
                    value={feasibilityForm.colour}
                    onChange={(e) => setFeasibilityForm({ ...feasibilityForm, colour: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Order Metres *</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={feasibilityForm.quantity_metres}
                  onChange={(e) => setFeasibilityForm({ ...feasibilityForm, quantity_metres: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>

              <Button variant="pop" size="xs" disabled={submitting} type="submit" className="w-full">
                {submitting ? 'Checking Backend...' : 'Run Feasibility Analysis'}
              </Button>
            </form>

            {feasibilityResult && (
              <div className="mt-3 p-3 bg-stone-50 border-2 border-[#181816] rounded-xl font-mono text-xs space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-stone-200">
                  <span className="font-bold">Result:</span>
                  <Badge variant={feasibilityResult.feasible ? 'success' : 'warning'} size="xs">
                    {feasibilityResult.feasible ? '100% FEASIBLE' : 'MATERIAL SHORTFALL'}
                  </Badge>
                </div>
                <div className="text-stone-700">{feasibilityResult.message}</div>
                {feasibilityResult.options.map((opt) => (
                  <div key={opt.material_id} className="p-2 bg-white rounded border border-stone-300 space-y-1 text-[11px]">
                    <div className="font-bold text-[#181816]">{opt.material_type} ({opt.colour})</div>
                    <div className="flex justify-between text-stone-600">
                      <span>Required: {Number(opt.required_kg).toFixed(1)} kg</span>
                      <span>Available: {Number(opt.available_kg).toFixed(1)} kg</span>
                    </div>
                    {Number(opt.shortfall_kg) > 0 && (
                      <div className="text-red-700 font-bold">Shortfall: {Number(opt.shortfall_kg).toFixed(1)} kg</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
