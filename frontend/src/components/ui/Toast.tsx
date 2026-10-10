'use client'

import { Fragment, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Toast } from '@/types'

interface ToastProps {
  toast: Toast
  onClose: (id: string) => void
}

export function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 3200)
    return () => clearTimeout(timer)
  }, [toast.id, onClose])

  const iconColors: Record<Toast['type'], string> = {
    success: '#15803D',
    warning: '#D97706',
    error: '#E05326',
    info: '#0E4B3E',
  }

  return (
    <Fragment>
      <div
        className={cn(
          'fixed bottom-5 right-5 bg-[#FFFFFF] border-2 border-[#181816] pop-shadow-lg rounded-2xl px-4 py-2.5 flex items-center gap-3 z-50',
          'animate-slide-up'
        )}
        role="alert"
        aria-live="polite"
      >
        <span className="material-symbols-outlined text-[18px]" style={{ color: iconColors[toast.type] }}>
          {toast.icon}
        </span>
        <span className="font-mono text-[12px] text-[#181816] font-bold">
          {toast.message}
        </span>
        <button
          onClick={() => onClose(toast.id)}
          className="ml-2 w-5 h-5 rounded-full border border-[#181816] bg-[#FAF7F0] hover:bg-[#FFFFFF] flex items-center justify-center text-[#4E4B47] font-mono text-[10px]"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    </Fragment>
  )
}

export function ToastContainer({ toasts, onClose }: { toasts: Toast[]; onClose: (id: string) => void }) {
  return (
    <Fragment>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </Fragment>
  )
}