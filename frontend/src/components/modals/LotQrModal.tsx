'use client'

import React, { useRef } from 'react'
import { Button, Badge, MaterialIcon } from '@/components/ui'
import { api, BackendInventoryLot, BackendSupplier } from '@/lib/api'

interface LotQrModalProps {
  isOpen: boolean
  onClose: () => void
  lot: BackendInventoryLot | null
  supplier?: BackendSupplier | null
}

export function LotQrModal({ isOpen, onClose, lot, supplier }: LotQrModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!isOpen || !lot) return null

  const qrImageUrl = api.getLotQrUrl(lot.lot_id, false)
  const downloadQrUrl = api.getLotQrUrl(lot.lot_id, true)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Background click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Modal Window */}
      <div className="relative bg-white border-2 border-[#181816] rounded-2xl w-full max-w-lg overflow-hidden pop-shadow-lg z-10 print:shadow-none print:border-none print:rounded-none">
        {/* Modal Header (hidden on print) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#FAF8F5] border-b-2 border-stone-200 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0E4B3E]/10 flex items-center justify-center text-[#0E4B3E]">
              <MaterialIcon name="qr_code_2" size="sm" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#181816] font-sans">Yarn Lot QR Label</h3>
              <p className="text-[11px] font-mono text-stone-500">Lot Code: {lot.lot_code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
          >
            <MaterialIcon name="close" size="xs" />
          </button>
        </div>

        {/* Modal Body / Printable Label */}
        <div className="p-6">
          {/* Printable Label Container */}
          <div
            ref={printRef}
            className="bg-[#FAFAFA] border-2 border-dashed border-[#181816] rounded-xl p-5 space-y-4 print:bg-white print:border-2 print:border-solid print:border-black print:p-6 print:m-0"
          >
            {/* Label Header */}
            <div className="flex items-center justify-between border-b-2 border-stone-300 pb-2">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Everest Textile Mills</span>
                <h4 className="text-sm font-black font-mono text-[#0E4B3E]">RAW YARN INVENTORY LOT</h4>
              </div>
              <Badge variant="metric" size="xs">UNIT 1 WAREHOUSE</Badge>
            </div>

            {/* QR Code & Lot Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* QR Image Frame */}
              <div className="flex flex-col items-center justify-center p-3 bg-white border-2 border-[#181816] rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt={`QR Code for Lot ${lot.lot_code}`}
                  className="w-40 h-40 object-contain"
                />
                <span className="mt-2 text-[10px] font-mono text-stone-500 font-bold">
                  ID: #{lot.lot_id}
                </span>
              </div>

              {/* Lot Specification Meta */}
              <div className="space-y-2 text-[12px] font-mono">
                <div>
                  <div className="text-[10px] uppercase text-stone-400 font-bold">Lot Code</div>
                  <div className="text-base font-black text-[#181816]">{lot.lot_code}</div>
                </div>

                <div>
                  <div className="text-[10px] uppercase text-stone-400 font-bold">Yarn / Material</div>
                  <div className="font-bold text-[#0E4B3E]">{lot.material_type}</div>
                  <div className="text-stone-600 text-[11px]">{lot.colour} · {lot.specification}</div>
                </div>

                <div>
                  <div className="text-[10px] uppercase text-stone-400 font-bold">Vendor / Supplier</div>
                  <div className="text-stone-700 font-medium">
                    {supplier ? supplier.name : `Supplier #${lot.supplier_id}`}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase text-stone-400 font-bold">Authoritative Available Stock</div>
                  <div className="text-sm font-black text-[#181816]">
                    {Number(lot.available_kg).toLocaleString(undefined, { minimumFractionDigits: 1 })} kg
                  </div>
                </div>
              </div>
            </div>

            {/* Label Footer */}
            <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[10px] font-mono text-stone-500">
              <span>Token: {lot.qr_token ? `${lot.qr_token.slice(0, 12)}...` : 'Deterministic'}</span>
              <span>Scannable via Mobile Camera / Barcode Terminal</span>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons (hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#FAF8F5] border-t-2 border-stone-200 print:hidden">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <a
              href={downloadQrUrl}
              download={`lot-${lot.lot_code}-qr.png`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold text-[#181816] bg-white border-2 border-[#181816] rounded-xl hover:bg-stone-50 transition-colors pop-shadow-xs"
            >
              <MaterialIcon name="download" size="xs" />
              Download PNG
            </a>

            <Button
              variant="primary"
              size="xs"
              icon={<MaterialIcon name="print" size="xs" />}
              onClick={handlePrint}
            >
              Print Warehouse Label
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
