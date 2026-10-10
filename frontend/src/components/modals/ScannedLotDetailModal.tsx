'use client'

import React, { useState } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import { api, BackendLotDetail, BackendOrder, ApiClientError } from '@/lib/api'

interface ScannedLotDetailModalProps {
  isOpen: boolean
  onClose: () => void
  lotDetail: BackendLotDetail | null
  orders: BackendOrder[]
  onStockChanged: () => void
  onOpenQrLabel?: (lotDetail: BackendLotDetail) => void
}

export function ScannedLotDetailModal({
  isOpen,
  onClose,
  lotDetail,
  orders,
  onStockChanged,
  onOpenQrLabel,
}: ScannedLotDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'issue' | 'movements'>('overview')
  const [issueOrderId, setIssueOrderId] = useState<string>('')
  const [issueQuantity, setIssueQuantity] = useState<string>('')
  const [issueNote, setIssueNote] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [liveLot, setLiveLot] = useState<BackendLotDetail | null>(null)

  // Use liveLot if updated after issue, else lotDetail
  const currentLot = liveLot || lotDetail

  // Reset states when opening or switching lot
  React.useEffect(() => {
    if (lotDetail) {
      setLiveLot(lotDetail)
      setActiveTab('overview')
      setActionError(null)
      setActionSuccess(null)
      setIssueQuantity('')
      setIssueNote('')
      // Pre-select intended order if one exists
      if (lotDetail.intended_order_id) {
        setIssueOrderId(String(lotDetail.intended_order_id))
      } else if (orders.length > 0) {
        // Pre-select first compatible order if any
        const compatible = orders.find(
          (o) =>
            o.fabric_type.toLowerCase() === lotDetail.material_type.toLowerCase() &&
            o.colour.toLowerCase() === lotDetail.colour.toLowerCase()
        )
        setIssueOrderId(compatible ? String(compatible.id) : String(orders[0].id))
      }
    }
  }, [lotDetail, orders])

  if (!isOpen || !currentLot) return null

  const availableKg = Number(currentLot.available_kg)
  const isDepleted = availableKg <= 0

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError(null)
    setActionSuccess(null)

    const qty = parseFloat(issueQuantity)
    if (isNaN(qty) || qty <= 0) {
      setActionError('Quantity must be greater than zero kg.')
      return
    }
    if (qty > availableKg) {
      setActionError(`Cannot issue ${qty} kg. Only ${availableKg} kg available in this lot.`)
      return
    }
    if (!issueOrderId) {
      setActionError('Please select a destination production order.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.createIssue({
        lot_id: currentLot.lot_id,
        order_id: parseInt(issueOrderId, 10),
        quantity_kg: qty,
        note: issueNote.trim() || `QR Mobile Scan Issue to Order #${issueOrderId}`,
      })

      setActionSuccess(`Successfully issued ${qty} kg from Lot ${currentLot.lot_code} to Order #${issueOrderId}.`)
      setIssueQuantity('')
      setIssueNote('')

      // Refresh lot details from server
      const refreshed = await api.getLotDetail(currentLot.lot_id)
      setLiveLot(refreshed)
      onStockChanged()
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        const detail = err.detail
        if (typeof detail === 'object' && detail !== null && 'message' in detail) {
          setActionError(String((detail as { message: string }).message))
        } else {
          setActionError(err.message)
        }
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to issue yarn')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-white border-2 border-[#181816] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden pop-shadow-lg z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#FAF8F5] border-b-2 border-stone-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0E4B3E]/10 flex items-center justify-center text-[#0E4B3E]">
              <MaterialIcon name="inventory_2" size="sm" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[#181816] font-mono">{currentLot.lot_code}</h3>
                <Badge
                  variant={isDepleted ? 'priority' : availableKg < 100 ? 'warning' : 'success'}
                  size="xs"
                >
                  {isDepleted ? 'Depleted' : `${availableKg.toFixed(1)} kg Available`}
                </Badge>
              </div>
              <p className="text-[11px] font-mono text-stone-500">
                {currentLot.material_type} · {currentLot.colour}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
          >
            <MaterialIcon name="close" size="xs" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b-2 border-stone-200 bg-stone-50 text-xs font-mono">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 px-3 font-bold border-b-2 -mb-[2px] transition-colors ${
              activeTab === 'overview'
                ? 'border-[#0E4B3E] text-[#0E4B3E]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Lot Overview
          </button>
          <button
            onClick={() => setActiveTab('issue')}
            className={`py-2.5 px-3 font-bold border-b-2 -mb-[2px] transition-colors flex items-center gap-1 ${
              activeTab === 'issue'
                ? 'border-[#0E4B3E] text-[#0E4B3E]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <MaterialIcon name="output" size="xs" />
            Issue to Order
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`py-2.5 px-3 font-bold border-b-2 -mb-[2px] transition-colors ${
              activeTab === 'movements'
                ? 'border-[#0E4B3E] text-[#0E4B3E]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Ledger History ({currentLot.movements.length})
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Notification Feedback */}
          {actionSuccess && (
            <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-emerald-800 text-xs font-mono flex items-center gap-2">
              <MaterialIcon name="check_circle" size="xs" color="#0B382F" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-3 bg-red-50 border-2 border-red-300 rounded-xl text-red-800 text-xs font-mono flex items-center gap-2">
              <MaterialIcon name="error" size="xs" color="#962C0B" />
              <span>{actionError}</span>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Quick Metrics */}
              <div className="grid grid-cols-3 gap-3 font-mono">
                <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Available Stock</div>
                  <div className="text-lg font-black text-[#0E4B3E]">{availableKg.toFixed(1)} kg</div>
                  <div className="text-[10px] text-stone-400">Ledger balance</div>
                </Card>
                <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Initial Receipt</div>
                  <div className="text-lg font-black text-[#181816]">
                    {Number(currentLot.initial_received_kg).toFixed(1)} kg
                  </div>
                  <div className="text-[10px] text-stone-400">Total received</div>
                </Card>
                <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                  <div className="text-[10px] text-stone-500 uppercase font-bold">Quality Status</div>
                  <div className="text-sm font-black text-emerald-700 mt-1">{currentLot.quality_status}</div>
                  <div className="text-[10px] text-stone-400">QC Passed</div>
                </Card>
              </div>

              {/* Detailed Specs Card */}
              <div className="bg-stone-50 border-2 border-stone-200 rounded-xl p-4 space-y-2.5 font-mono text-xs">
                <div className="grid grid-cols-2 gap-y-2">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Yarn Material</span>
                    <span className="font-bold text-[#181816]">{currentLot.material_type}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Colour & Shade</span>
                    <span className="font-bold text-[#181816]">{currentLot.colour}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Yarn Count / Spec</span>
                    <span className="text-stone-700">{currentLot.specification}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Supplier Vendor</span>
                    <span className="text-stone-700">{currentLot.supplier_name || `Supplier #${currentLot.supplier_id}`}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Received Date</span>
                    <span className="text-stone-700">{new Date(currentLot.received_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Intended Order</span>
                    <span className="text-stone-700 font-bold">
                      {currentLot.intended_order_code || currentLot.intended_order_id ? (
                        <span className="text-amber-700 font-bold">
                          Reserved for {currentLot.intended_order_code || `Order #${currentLot.intended_order_id}`}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Open Warehouse Pool</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="primary"
                  size="xs"
                  icon={<MaterialIcon name="output" size="xs" />}
                  disabled={isDepleted}
                  onClick={() => setActiveTab('issue')}
                >
                  {isDepleted ? 'Lot Depleted' : 'Issue Yarn from this Lot'}
                </Button>
                {onOpenQrLabel && (
                  <Button
                    variant="outline"
                    size="xs"
                    icon={<MaterialIcon name="qr_code_2" size="xs" />}
                    onClick={() => {
                      onOpenQrLabel(currentLot)
                    }}
                  >
                    View / Print QR Label
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ISSUE FORM */}
          {activeTab === 'issue' && (
            <form onSubmit={handleIssueSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-amber-900 text-xs font-mono">
                <strong>Warehouse Stock Deduction:</strong> Authoritative deduction will be atomically written to PostgreSQL with row-level locks.
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* Destination Order Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Destination Production Order <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={issueOrderId}
                    onChange={(e) => setIssueOrderId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-stone-50 border-2 border-[#181816] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]"
                  >
                    <option value="">Select order...</option>
                    {orders.map((o) => {
                      const isMatch =
                        o.fabric_type.toLowerCase() === currentLot.material_type.toLowerCase() &&
                        o.colour.toLowerCase() === currentLot.colour.toLowerCase()
                      return (
                        <option key={o.id} value={o.id}>
                          Order #{o.id} · {o.fabric_type} ({o.colour}) · {Number(o.quantity_metres).toLocaleString()}m {isMatch ? '★ Compatible' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Quantity Input with Max Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-stone-700">
                      Issue Quantity (kg) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-stone-500">
                      Max Available: <strong>{availableKg.toFixed(1)} kg</strong>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max={availableKg}
                      value={issueQuantity}
                      onChange={(e) => setIssueQuantity(e.target.value)}
                      placeholder="e.g. 50.0"
                      required
                      className="flex-1 px-3 py-2 bg-stone-50 border-2 border-[#181816] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setIssueQuantity(String(availableKg))}
                    >
                      Max ({availableKg.toFixed(1)}kg)
                    </Button>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Movement Note / Dispatch Tag (Optional)
                  </label>
                  <input
                    type="text"
                    value={issueNote}
                    onChange={(e) => setIssueNote(e.target.value)}
                    placeholder="e.g. Floor dispatch for Loom WEAVE-01 shift 1"
                    className="w-full px-3 py-2 bg-stone-50 border-2 border-[#181816] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <Button variant="ghost" size="xs" type="button" onClick={() => setActiveTab('overview')}>
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="xs"
                  disabled={isSubmitting || isDepleted}
                  icon={<MaterialIcon name="output" size="xs" />}
                >
                  {isSubmitting ? 'Recording Ledger Issue...' : 'Confirm & Issue Yarn'}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 3: MOVEMENTS AUDIT LOG */}
          {activeTab === 'movements' && (
            <div className="space-y-3 font-mono">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-700">Movement History for Lot {currentLot.lot_code}</span>
                <span className="text-[11px] text-stone-400">{currentLot.movements.length} records</span>
              </div>

              {currentLot.movements.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">No movements recorded yet for this lot.</div>
              ) : (
                <div className="overflow-x-auto border-2 border-stone-200 rounded-xl">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3 text-right">Quantity (kg)</th>
                        <th className="py-2 px-3">Order</th>
                        <th className="py-2 px-3">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {currentLot.movements.map((m) => (
                        <tr key={m.id} className="hover:bg-stone-50">
                          <td className="py-2 px-3 text-stone-500">
                            {new Date(m.movement_date).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 font-bold">
                            {m.movement_type === 'receipt' ? (
                              <span className="text-emerald-700">+ Receipt</span>
                            ) : m.movement_type === 'issue' ? (
                              <span className="text-amber-800">- Issue</span>
                            ) : (
                              <span className="text-stone-700">~ Adjustment</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-[#181816]">
                            {Number(m.quantity_kg).toFixed(1)} kg
                          </td>
                          <td className="py-2 px-3 text-stone-600">
                            {m.order_id ? `Order #${m.order_id}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-stone-500 truncate max-w-xs">{m.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#FAF8F5] border-t-2 border-stone-200">
          <span className="text-[10px] font-mono text-stone-400">
            Everest Textile Mills · Authoritative Yarn Tracking
          </span>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
