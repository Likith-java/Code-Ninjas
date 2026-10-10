'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  icon?: ReactNode
  iconColor?: string
  children: ReactNode
  actionButtons?: ReactNode
}

export function Modal({ isOpen, onClose, title, icon, iconColor = '#E05326', children, actionButtons }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[#181816]/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="w-full max-w-[500px] max-h-[92vh] flex flex-col bg-[#FFFFFF] rounded-3xl border-2 border-[#181816] pop-shadow-xl overflow-hidden p-4 sm:p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-[#181816] pb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-xl shrink-0" style={{ color: iconColor }}>{icon}</span>}
            <h3 id="modal-title" className="font-bold text-[15px] text-[#181816] truncate">{title}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 shrink-0 rounded-full border-2 border-[#181816] bg-[#FFFFFF] hover:bg-[#FAF7F0] text-[#181816] flex items-center justify-center pop-shadow-xs btn-pop" aria-label="Close modal">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
        <div className="space-y-3 font-mono text-[11.5px] overflow-y-auto flex-1 pr-1">{children}</div>
        {actionButtons && <div className="flex justify-end gap-2.5 pt-3 border-t-2 border-[#181816] shrink-0">{actionButtons}</div>}
      </div>
    </div>
  )
}