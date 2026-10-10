'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'priority' | 'status' | 'stage' | 'metric' | 'scenario' | 'warning' | 'success'
  size?: 'xs' | 'sm' | 'md'
  dotColor?: string
}

const variantStyles = {
  default: 'bg-[#FAF7F0] text-[#4E4B47] border border-[#181816]',
  priority: 'border-2 border-[#181816]',
  status: 'border-2 border-[#181816]',
  stage: 'border-2 border-[#181816]',
  metric: 'bg-[#FAF7F0] border border-[#181816]',
  scenario: 'rounded-full border-2 border-[#181816]',
  warning: 'bg-[#FEF3C7] text-[#92400E] border-2 border-[#181816]',
  success: 'bg-[#D7F4E5] text-[#0B382F] border-2 border-[#181816]',
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