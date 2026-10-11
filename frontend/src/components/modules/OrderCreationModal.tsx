'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, MaterialIcon } from '@/components/ui'
import {
  api,
  BackendBuyer,
  FabricCatalogueItem,
  PriceQuoteOut,
  ApiClientError,
} from '@/lib/api'
import { UserRole } from '@/lib/permissions'
import { getUser } from '@/lib/auth-storage'

interface OrderCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onOrderCreated: () => void
  currentRole?: UserRole
}

export function OrderCreationModal({
  isOpen,
  onClose,
  onOrderCreated,
  currentRole = 'admin',
}: OrderCreationModalProps) {
  const [buyers, setBuyers] = useState<BackendBuyer[]>([])
  const [loadingBuyers, setLoadingBuyers] = useState(true)
  const [fabrics, setFabrics] = useState<FabricCatalogueItem[]>([])
  const [loadingFabrics, setLoadingFabrics] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const user = getUser()
  const isCustomer = currentRole === 'customer' || user?.role === 'customer'

  // Toggle for adding a new buyer inline
  const [isAddingBuyer, setIsAddingBuyer] = useState(false)
  const [newBuyerName, setNewBuyerName] = useState('')
  const [newBuyerContact, setNewBuyerContact] = useState('')
  const [newBuyerEmail, setNewBuyerEmail] = useState('')

  // Order form state
  const [selectedFabricId, setSelectedFabricId] = useState<string>('')
  const [quantityMetres, setQuantityMetres] = useState<string>('500')
  const [deadlineDays, setDeadlineDays] = useState<string>('14')
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [buyerId, setBuyerId] = useState<string>(
    isCustomer && user?.buyer_id ? String(user.buyer_id) : ''
  )

  // Authoritative server quote state
  const [quote, setQuote] = useState<PriceQuoteOut | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Fetch Buyers and Fabrics Catalogue on Modal Open
  useEffect(() => {
    if (!isOpen) return

    if (isCustomer && user?.buyer_id) {
      setBuyerId(String(user.buyer_id))
      setLoadingBuyers(false)
    } else {
      const fetchBuyers = async () => {
        setLoadingBuyers(true)
        try {
          const b = await api.getBuyers()
          setBuyers(b)
          if (b.length > 0) {
            setBuyerId((prev) => prev || String(b[0].id))
          }
        } catch (err: unknown) {
          console.error('Error fetching buyers:', err)
        } finally {
          setLoadingBuyers(false)
        }
      }
      fetchBuyers()
    }

    const fetchFabricsCatalogue = async () => {
      setLoadingFabrics(true)
      try {
        const fabList = await api.getFabrics()
        setFabrics(fabList)
        if (fabList.length > 0) {
          setSelectedFabricId(fabList[0].id)
        }
      } catch (err: unknown) {
        console.error('Error fetching fabrics catalogue:', err)
        setError('Failed to load supported fabric catalogue from factory database.')
      } finally {
        setLoadingFabrics(false)
      }
    }

    fetchFabricsCatalogue()
  }, [isOpen, isCustomer, user?.buyer_id])

  // Selected Fabric Object
  const selectedFabric = fabrics.find((f) => f.id === selectedFabricId) || fabrics[0]

  // Recalculate Authoritative Pricing Quote whenever fabric or length changes
  const updateQuote = useCallback(
    async (fabric: FabricCatalogueItem | undefined, qtyStr: string) => {
      if (!fabric) return
      const qty = Number(qtyStr)
      if (isNaN(qty) || qty <= 0) {
        setQuote(null)
        setQuoteError('Please enter a valid positive length.')
        return
      }

      setLoadingQuote(true)
      setQuoteError(null)

      try {
        const q = await api.getPriceQuote({
          fabric_type: fabric.fabric_type,
          colour: fabric.colour,
          quantity_metres: qty,
        })
        setQuote(q)
      } catch (err: unknown) {
        const msg =
          err instanceof ApiClientError ? err.message : (err as Error).message || 'Failed to calculate quote.'
        setQuoteError(msg)
        setQuote(null)
      } finally {
        setLoadingQuote(false)
      }
    },
    []
  )

  useEffect(() => {
    if (selectedFabric && quantityMetres) {
      updateQuote(selectedFabric, quantityMetres)
    }
  }, [selectedFabric, quantityMetres, updateQuote])

  if (!isOpen) return null

  const handleCreateBuyer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuyerName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.createBuyer({
        name: newBuyerName.trim(),
        contact: newBuyerContact.trim() || null,
        email: newBuyerEmail.trim() || null,
      })
      setBuyers((prev) => [...prev, created])
      setBuyerId(String(created.id))
      setIsAddingBuyer(false)
      setNewBuyerName('')
      setNewBuyerContact('')
      setNewBuyerEmail('')
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (!selectedFabric) {
        throw new Error('Please select a supported fabric from the catalogue.')
      }

      const qty = Number(quantityMetres)
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Please specify a positive ordered length.')
      }

      const minOrder = Number(selectedFabric.min_order_metres || 0)
      if (qty < minOrder) {
        throw new Error(`Minimum order quantity for ${selectedFabric.fabric_type} is ${minOrder}m.`)
      }

      const deadlineDate = new Date()
      deadlineDate.setDate(deadlineDate.getDate() + Number(deadlineDays || 7))

      const targetBuyerId = isCustomer && user?.buyer_id ? Number(user.buyer_id) : Number(buyerId)
      if (!targetBuyerId) {
        throw new Error('Valid buyer account is required to place an order.')
      }

      // Security: We do NOT pass client-tampered price! Backend server computes authoritative pricing.
      await api.createOrder({
        buyer_id: targetBuyerId,
        fabric_type: selectedFabric.fabric_type,
        colour: selectedFabric.colour,
        quantity_metres: qty,
        deadline: deadlineDate.toISOString(),
        priority,
      })

      setSuccess('Order successfully created with authoritative server pricing!')
      onOrderCreated()
      setTimeout(() => {
        onClose()
        setSuccess(null)
      }, 1200)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <Card
        variant="elevated"
        padding="lg"
        className="max-w-lg w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5 font-body">
            <MaterialIcon name="post_add" size="sm" color="#0E4B3E" />
            Create Customer Production Order
          </h3>
          <button
            onClick={onClose}
            className="font-bold text-stone-500 hover:text-black p-1 cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg text-red-800 text-xs font-mono">
            {error}
          </div>
        )}
        {success && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-mono font-bold">
            {success}
          </div>
        )}

        {isAddingBuyer ? (
          <form
            onSubmit={handleCreateBuyer}
            className="p-3 bg-stone-50 border-2 border-[#181816] rounded-xl space-y-2 font-mono text-xs"
          >
            <div className="font-bold text-stone-800">Add New Buyer Account</div>
            <input
              type="text"
              required
              placeholder="Buyer / Company Name *"
              value={newBuyerName}
              onChange={(e) => setNewBuyerName(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-lg"
            />
            <input
              type="text"
              placeholder="Contact Person / Phone"
              value={newBuyerContact}
              onChange={(e) => setNewBuyerContact(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-lg"
            />
            <input
              type="email"
              placeholder="Email"
              value={newBuyerEmail}
              onChange={(e) => setNewBuyerEmail(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setIsAddingBuyer(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button variant="primary" size="xs" disabled={submitting} type="submit">
                Save Buyer
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateOrder} className="space-y-3 font-mono text-xs">
            {/* Buyer Account */}
            <div>
              {isCustomer ? (
                <div>
                  <label className="text-stone-600 font-bold block mb-1">
                    Authenticated Buyer Account
                  </label>
                  <div className="p-2.5 bg-stone-100 border border-stone-300 rounded-xl text-stone-800 font-bold flex items-center justify-between">
                    <span>
                      {user?.name || 'Customer Account'} (Buyer #{user?.buyer_id || 'N/A'})
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Verified
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-stone-600 font-bold">Buyer Account *</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingBuyer(true)}
                      className="text-[11px] text-[#0E4B3E] font-bold underline hover:text-emerald-700"
                    >
                      + New Buyer
                    </button>
                  </div>
                  <select
                    required
                    value={buyerId}
                    onChange={(e) => setBuyerId(e.target.value)}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs bg-white"
                  >
                    {loadingBuyers ? (
                      <option value="">Loading buyers...</option>
                    ) : (
                      buyers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} (ID #{b.id})
                        </option>
                      ))
                    )}
                  </select>
                </>
              )}
            </div>

            {/* Controlled Fabric Catalogue Selection */}
            <div>
              <label className="block text-stone-600 font-bold mb-1">
                Supported Fabric Selection *
              </label>
              {loadingFabrics ? (
                <div className="p-2 border border-stone-300 rounded-xl text-stone-500">
                  Loading catalogue...
                </div>
              ) : fabrics.length === 0 ? (
                <div className="p-2.5 bg-red-50 border border-red-300 rounded-xl text-red-800">
                  No supported fabric products found in factory catalogue.
                </div>
              ) : (
                <select
                  required
                  value={selectedFabricId}
                  onChange={(e) => setSelectedFabricId(e.target.value)}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs bg-white"
                >
                  {fabrics.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.fabric_type} ({f.colour}) — ${Number(f.base_rate_per_metre).toFixed(2)}/m [MOQ: {f.min_order_metres}m]
                    </option>
                  ))}
                </select>
              )}
              {selectedFabric && (
                <div className="mt-1 text-[10.5px] text-stone-500 font-body">
                  Spec: <span className="font-mono text-stone-800">{selectedFabric.specification}</span>
                </div>
              )}
            </div>

            {/* Length and Lead Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Ordered Length (Metres) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={quantityMetres}
                  onChange={(e) => setQuantityMetres(e.target.value)}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-bold mb-1">Lead Time (Days) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={deadlineDays}
                  onChange={(e) => setDeadlineDays(e.target.value)}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-stone-600 font-bold mb-1">Scheduling Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
                className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs bg-white"
              >
                <option value="normal">Normal (Standard FIFO routing)</option>
                <option value="high">High (Priority slot on floor)</option>
                <option value="urgent">Urgent (Preemptive dispatch scheduling)</option>
                <option value="low">Low (Flexible batching)</option>
              </select>
            </div>

            {/* Authoritative Server Pricing Breakdown */}
            <div className="p-3 bg-[#FAF7F0] border-2 border-[#0E4B3E]/30 rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-stone-900 flex items-center gap-1">
                  <MaterialIcon name="receipt" size="xs" color="#0E4B3E" />
                  Authoritative Pricing Breakdown
                </span>
                <span className="text-[10px] text-stone-500 font-mono">
                  {loadingQuote ? 'Calculating...' : 'Central Pricing Service'}
                </span>
              </div>

              {quoteError && (
                <div className="text-red-700 text-[11px] font-semibold">{quoteError}</div>
              )}

              {quote && (
                <div className="space-y-1 text-[11px] pt-1 border-t border-stone-200">
                  <div className="flex justify-between text-stone-600">
                    <span>Base Unit Rate:</span>
                    <span className="font-bold text-stone-900">${Number(quote.unit_price).toFixed(2)} / metre</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Ordered Length:</span>
                    <span>{Number(quote.quantity_metres).toLocaleString()} metres</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Subtotal:</span>
                    <span className="font-bold">${Number(quote.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Applicable Tax ({Number(quote.tax_rate) * 100}% GST/VAT):</span>
                    <span>${Number(quote.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-[#0E4B3E] pt-1 border-t border-stone-300">
                    <span>Total Order Amount:</span>
                    <span>${Number(quote.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-stone-500 leading-tight">
                * Note: Pricing is authoritatively evaluated by factory pricing rules and snapshot on order creation.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting || !selectedFabric || !quote}
                type="submit"
                className="bg-[#0E4B3E] hover:bg-[#0B382F]"
              >
                {submitting ? 'Registering Order...' : 'Confirm & Place Order'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
