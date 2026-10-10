'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, BackendLotDetail } from '@/lib/api'
import { Header } from '@/components/layout/Header'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import { clearSession, getUser } from '@/lib/auth-storage'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'

export default function LotDirectRoutePage() {
  const params = useParams()
  const router = useRouter()
  const [lot, setLot] = useState<BackendLotDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<UserRole>('admin')

  useEffect(() => {
    const user = getUser()
    if (user?.role && ROLE_PROFILES[user.role as UserRole]) {
      setCurrentRole(user.role as UserRole)
    }
  }, [])

  useEffect(() => {
    const lotId = params?.id
    if (!lotId) return

    setLoading(true)
    setError(null)
    api
      .scanLot(String(lotId))
      .then((data) => {
        setLot(data)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Lot not found or access denied'
        setError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [params?.id])

  const handleLogout = () => {
    clearSession()
    router.replace('/')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-[#F5F0E3] text-[#181816] font-body flex flex-col antialiased">
      <Header
        currentRole={currentRole}
        onLogout={handleLogout}
        onBrandClick={() => router.push('/')}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="xs"
            icon={<MaterialIcon name="arrow_back" size="xs" />}
            onClick={() => router.push('/?tab=yarn')}
          >
            Back to Warehouse Ledger
          </Button>
          <div className="flex items-center gap-2">
            {lot && (
              <Button
                variant="primary"
                size="xs"
                icon={<MaterialIcon name="print" size="xs" />}
                onClick={handlePrint}
              >
                Print Label
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border-2 border-[#181816] p-12 text-center font-mono text-xs text-stone-500 pop-shadow-sm space-y-3">
            <div className="w-8 h-8 border-2 border-[#0E4B3E]/30 border-t-[#0E4B3E] rounded-full animate-spin mx-auto" />
            <div>Loading authoritative lot data from PostgreSQL...</div>
          </div>
        ) : error ? (
          <div className="bg-red-50 rounded-2xl border-2 border-red-300 p-8 text-center font-mono text-xs text-red-800 pop-shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center mx-auto text-red-600">
              <MaterialIcon name="error" size="md" />
            </div>
            <h3 className="font-bold text-sm">QR Code Resolution Error</h3>
            <p>{error}</p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => router.push('/?tab=yarn')}
              className="mt-2"
            >
              Return to Inventory
            </Button>
          </div>
        ) : lot ? (
          <div className="bg-white rounded-2xl border-2 border-[#181816] p-6 pop-shadow-md space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-stone-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-stone-500 font-bold uppercase tracking-wider">
                    Scanned Yarn Lot
                  </span>
                  <Badge variant={Number(lot.available_kg) > 0 ? 'success' : 'warning'} size="xs">
                    {lot.quality_status}
                  </Badge>
                </div>
                <h1 className="text-xl font-black font-mono text-[#0E4B3E] mt-0.5">{lot.lot_code}</h1>
                <p className="text-xs text-stone-600 font-mono mt-0.5">
                  {lot.material_type} · {lot.colour} · {lot.specification}
                </p>
              </div>

              {/* QR Image Preview */}
              <div className="p-2 bg-stone-50 border-2 border-[#181816] rounded-xl flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={api.getLotQrUrl(lot.lot_id)}
                  alt={`QR ${lot.lot_code}`}
                  className="w-20 h-20 object-contain"
                />
                <div className="text-[10px] font-mono text-stone-500 space-y-1">
                  <div className="font-bold text-black">Scan Verified</div>
                  <div>ID #{lot.lot_id}</div>
                  <a
                    href={api.getLotQrUrl(lot.lot_id, true)}
                    className="text-[#0E4B3E] underline font-bold block"
                  >
                    Download PNG
                  </a>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                <div className="text-[10px] text-stone-500 uppercase font-bold">Available Stock</div>
                <div className="text-lg font-black text-[#0E4B3E]">
                  {Number(lot.available_kg).toFixed(1)} kg
                </div>
              </Card>
              <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                <div className="text-[10px] text-stone-500 uppercase font-bold">Initial Received</div>
                <div className="text-lg font-black text-[#181816]">
                  {Number(lot.initial_received_kg).toFixed(1)} kg
                </div>
              </Card>
              <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                <div className="text-[10px] text-stone-500 uppercase font-bold">Supplier Vendor</div>
                <div className="text-xs font-bold text-stone-800 truncate mt-1">
                  {lot.supplier_name || `Supplier #${lot.supplier_id}`}
                </div>
              </Card>
              <Card variant="elevated" padding="sm" className="bg-[#FAF8F5] border border-stone-300">
                <div className="text-[10px] text-stone-500 uppercase font-bold">Received Date</div>
                <div className="text-xs font-bold text-stone-800 mt-1">
                  {new Date(lot.received_at).toLocaleDateString()}
                </div>
              </Card>
            </div>

            {/* Movement Audit Log */}
            <div className="space-y-3 font-mono">
              <h3 className="font-bold text-sm text-[#181816]">Recent Warehouse Movement Audit Log</h3>
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
                    {lot.movements.map((m) => (
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
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
