'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'priority' | 'status' | 'stage' | 'metric' | 'scenario' | 'warning' | 'success'
  size?: 'xs' | 'sm' | 'md'
  dotColor?: string
}

const variantStyles = {
  default: 'bg-[#FAF7F0] text-[#4E4B47] border border-stone-200/90 shadow-2xs',
  priority: 'border border-stone-200/90 shadow-2xs',
  status: 'border border-stone-200/90 shadow-2xs',
  stage: 'border border-stone-200/90 shadow-2xs',
  metric: 'bg-[#FAF7F0] border border-stone-200/90 shadow-2xs',
  scenario: 'rounded-full border border-stone-200/90 shadow-2xs',
  warning: 'bg-[#FEF3C7] text-[#92400E] border border-amber-300/80 shadow-2xs',
  success: 'bg-[#D7F4E5] text-[#0B382F] border border-emerald-300/80 shadow-2xs',
}

const sizeStyles = {
  xs: 'px-1.5 py-0.5 text-[9.5px]',
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-0.5 text-[11px]',
}

export function Badge({ className, variant = 'default', size = 'sm', dotColor, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono font-bold rounded-full',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dotColor && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </span>
  )
}