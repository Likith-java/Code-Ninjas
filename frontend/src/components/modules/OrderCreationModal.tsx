'use client'

import { useState, useEffect } from 'react'
import { Card, Button, MaterialIcon } from '@/components/ui'
import { api, BackendBuyer, ApiClientError } from '@/lib/api'
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
  const [orderForm, setOrderForm] = useState({
    buyer_id: isCustomer && user?.buyer_id ? String(user.buyer_id) : '',
    fabric_type: 'Cotton',
    colour: 'Navy Blue',
    quantity_metres: '500',
    agreed_rate: '45.50',
    deadlineDays: '14',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
  })

  useEffect(() => {
    if (!isOpen) return

    if (isCustomer && user?.buyer_id) {
      setOrderForm((prev) => ({ ...prev, buyer_id: String(user.buyer_id) }))
      setLoadingBuyers(false)
      return
    }

    const fetchBuyers = async () => {
      setLoadingBuyers(true)
      try {
        const b = await api.getBuyers()
        setBuyers(b)
        if (b.length > 0) {
          setOrderForm((prev) => (prev.buyer_id ? prev : { ...prev, buyer_id: String(b[0].id) }))
        }


      } catch (err: unknown) {
        console.error('Error fetching buyers:', err)
      } finally {
        setLoadingBuyers(false)
      }
    }
    fetchBuyers()
  }, [isOpen, isCustomer, user?.buyer_id])


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
      setOrderForm((prev) => ({ ...prev, buyer_id: String(created.id) }))
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
      const deadlineDate = new Date()
      deadlineDate.setDate(deadlineDate.getDate() + Number(orderForm.deadlineDays || 7))

      const targetBuyerId = isCustomer && user?.buyer_id ? Number(user.buyer_id) : Number(orderForm.buyer_id)
      if (!targetBuyerId) {
        throw new Error('Valid buyer account is required to place an order.')
      }

      await api.createOrder({
        buyer_id: targetBuyerId,
        fabric_type: orderForm.fabric_type,
        colour: orderForm.colour,
        quantity_metres: Number(orderForm.quantity_metres),
        agreed_rate: Number(orderForm.agreed_rate),
        deadline: deadlineDate.toISOString(),
        priority: orderForm.priority,
      })

      setSuccess('Order successfully created and registered in PostgreSQL!')
      onOrderCreated()
      setTimeout(() => {
        onClose()
        setSuccess(null)
      }, 1400)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <Card variant="elevated" padding="lg" className="max-w-md w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-stone-200">
          <h3 className="font-bold text-sm text-[#181816] flex items-center gap-1.5">
            <MaterialIcon name="post_add" size="sm" color="#0E4B3E" />
            Create Customer Production Order
          </h3>
          <button onClick={onClose} className="font-bold text-stone-500 hover:text-black">✕</button>
        </div>

        {error && <div className="p-2.5 bg-red-50 border border-red-300 rounded text-red-800 text-xs font-mono">{error}</div>}
        {success && <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs font-mono font-bold">{success}</div>}

        {isAddingBuyer ? (
          <form onSubmit={handleCreateBuyer} className="p-3 bg-stone-50 border-2 border-[#181816] rounded-xl space-y-2 font-mono text-xs">
            <div className="font-bold text-stone-800">Add New Buyer Account</div>
            <input
              type="text"
              required
              placeholder="Buyer / Company Name *"
              value={newBuyerName}
              onChange={(e) => setNewBuyerName(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded"
            />
            <input
              type="text"
              placeholder="Contact Person / Phone"
              value={newBuyerContact}
              onChange={(e) => setNewBuyerContact(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded"
            />
            <input
              type="email"
              placeholder="Email"
              value={newBuyerEmail}
              onChange={(e) => setNewBuyerEmail(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="xs" onClick={() => setIsAddingBuyer(false)} type="button">Cancel</Button>
              <Button variant="primary" size="xs" disabled={submitting} type="submit">Save Buyer</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleCreateOrder} className="space-y-3 font-mono text-xs">
            <div>
              {isCustomer ? (
                <div>
                  <label className="text-stone-600 font-bold block mb-1">Authenticated Buyer Account</label>
                  <div className="p-2 bg-stone-100 border border-stone-300 rounded-xl text-stone-800 font-bold flex items-center justify-between">
                    <span>{user?.name || 'Customer Account'} (Buyer #{user?.buyer_id || 'N/A'})</span>
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
                    value={orderForm.buyer_id}
                    onChange={(e) => setOrderForm({ ...orderForm, buyer_id: e.target.value })}
                    className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                  >
                    {loadingBuyers ? (
                      <option value="">Loading buyers...</option>
                    ) : (
                      buyers.map((b) => (
                        <option key={b.id} value={b.id}>{b.name} (ID #{b.id})</option>
                      ))
                    )}
                  </select>
                </>
              )}
            </div>


            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Fabric Type *</label>
                <input
                  type="text"
                  required
                  value={orderForm.fabric_type}
                  onChange={(e) => setOrderForm({ ...orderForm, fabric_type: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-bold mb-1">Colour *</label>
                <input
                  type="text"
                  required
                  value={orderForm.colour}
                  onChange={(e) => setOrderForm({ ...orderForm, colour: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Quantity (Metres) *</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={orderForm.quantity_metres}
                  onChange={(e) => setOrderForm({ ...orderForm, quantity_metres: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-bold mb-1">Agreed Rate ($/m) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={orderForm.agreed_rate}
                  onChange={(e) => setOrderForm({ ...orderForm, agreed_rate: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Lead Time (Days) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={orderForm.deadlineDays}
                  onChange={(e) => setOrderForm({ ...orderForm, deadlineDays: e.target.value })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-stone-600 font-bold mb-1">Priority *</label>
                <select
                  value={orderForm.priority}
                  onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value as 'low' | 'normal' | 'high' | 'urgent' })}
                  className="w-full p-2 border-2 border-[#181816] rounded-xl font-mono text-xs"
                >
                  <option value="normal">Normal (P2)</option>
                  <option value="high">High (P1)</option>
                  <option value="urgent">Urgent (P0)</option>
                  <option value="low">Low (P3)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="ghost" size="xs" onClick={onClose} type="button">Cancel</Button>
              <Button variant="primary" size="xs" disabled={submitting} type="submit">
                {submitting ? 'Creating...' : 'Create Order'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
