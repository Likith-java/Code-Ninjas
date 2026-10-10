'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Button, MaterialIcon } from '@/components/ui'
import { api, BackendLotDetail } from '@/lib/api'

interface YarnQrScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onLotResolved: (lotDetail: BackendLotDetail) => void
}

export function YarnQrScannerModal({ isOpen, onClose, onLotResolved }: YarnQrScannerModalProps) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanHandledRef = useRef(false)

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch (err) {
        console.warn('Error stopping QR scanner:', err)
      }
      scannerRef.current = null
    }
    setCameraActive(false)
  }, [])

  const handleResolveScan = useCallback(async (query: string) => {
    if (scanHandledRef.current) return
    scanHandledRef.current = true
    setIsResolving(true)
    setErrorMessage(null)

    try {
      const lotDetail = await api.scanLot(query)
      await stopScanner()
      onLotResolved(lotDetail)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lot not found or scan resolution failed'
      setErrorMessage(msg)
      scanHandledRef.current = false // Allow retry
    } finally {
      setIsResolving(false)
    }
  }, [onLotResolved, stopScanner])

  const startScanner = useCallback(async () => {
    setCameraError(null)
    setErrorMessage(null)
    scanHandledRef.current = false

    try {
      const html5QrCode = new Html5Qrcode('yarn-qr-reader')
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          handleResolveScan(decodedText)
        },
        () => {
          // Frame-level decode pass silently
        }
      )
      setCameraActive(true)
    } catch (err: unknown) {
      console.error('Camera start error:', err)
      const errStr = String(err)
      if (errStr.includes('NotAllowedError') || errStr.includes('Permission')) {
        setCameraError('Camera access denied. Please allow camera permissions in your browser or use the manual search below.')
      } else if (errStr.includes('NotFoundError') || errStr.includes('DevicesNotFoundError')) {
        setCameraError('No video camera device detected. Please connect a webcam or use manual lot search.')
      } else {
        setCameraError('Unable to start camera scanner. Note: HTTPS or localhost is required for camera streaming.')
      }
      setCameraActive(false)
    }
  }, [handleResolveScan])

  useEffect(() => {
    if (isOpen) {
      scanHandledRef.current = false
      setErrorMessage(null)
      setManualInput('')
      // Automatically attempt camera start when modal opens
      const timer = setTimeout(() => {
        startScanner()
      }, 250)
      return () => clearTimeout(timer)
    } else {
      stopScanner()
    }
  }, [isOpen, startScanner, stopScanner])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear()
        })
      }
    }
  }, [])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualInput.trim()) return
    handleResolveScan(manualInput.trim())
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-white border-2 border-[#181816] rounded-2xl w-full max-w-md overflow-hidden pop-shadow-lg z-10 space-y-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#FAF8F5] border-b-2 border-stone-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0E4B3E]/10 flex items-center justify-center text-[#0E4B3E]">
              <MaterialIcon name="qr_code_scanner" size="sm" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#181816]">Scan Yarn Lot QR</h3>
              <p className="text-[11px] font-mono text-stone-500">Fast warehouse mobile & camera lookup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
          >
            <MaterialIcon name="close" size="xs" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Scanner Viewport */}
          <div className="relative bg-stone-900 border-2 border-[#181816] rounded-xl overflow-hidden aspect-square flex flex-col items-center justify-center">
            {/* The HTML5 QR Code Mount Element */}
            <div id="yarn-qr-reader" className="w-full h-full overflow-hidden" />

            {/* Overlay Status when resolving or camera not ready */}
            {isResolving && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white z-20 space-y-2 p-4 text-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="font-mono text-xs font-bold">Resolving Yarn Lot in PostgreSQL...</span>
              </div>
            )}

            {!cameraActive && !isResolving && (
              <div className="absolute inset-0 bg-stone-900/90 flex flex-col items-center justify-center p-6 text-center text-stone-300 z-10 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-400">
                  <MaterialIcon name="videocam" size="md" />
                </div>
                {cameraError ? (
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-red-400">{cameraError}</p>
                    <p className="text-[11px] text-stone-400">Use manual lot search below to proceed immediately.</p>
                  </div>
                ) : (
                  <p className="text-xs font-mono">Initializing camera video feed...</p>
                )}
                {cameraError && (
                  <Button variant="outline" size="xs" onClick={startScanner} className="bg-white text-[#181816]">
                    Retry Camera
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Error Message if resolution fails */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border-2 border-red-200 rounded-xl text-red-800 text-xs font-mono space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <MaterialIcon name="error" size="xs" />
                Scan Resolution Error
              </div>
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Manual Entry Fallback */}
          <div className="pt-2 border-t border-stone-200">
            <div className="text-[11px] font-mono font-bold text-stone-600 mb-1.5 flex items-center gap-1">
              <MaterialIcon name="keyboard" size="xs" />
              Manual Lot Code or ID Lookup
            </div>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. LOT-2026-001 or 1"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-stone-50 border-2 border-[#181816] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E4B3E]"
              />
              <Button
                type="submit"
                variant="primary"
                size="xs"
                disabled={isResolving || !manualInput.trim()}
              >
                Look Up
              </Button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#FAF8F5] border-t-2 border-stone-200 text-[11px] font-mono text-stone-500">
          <span>Camera stream stops automatically on close</span>
          <Button variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
