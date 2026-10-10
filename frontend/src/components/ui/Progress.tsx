'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  color?: 'primary' | 'secondary' | 'tertiary' | 'warning'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const colorStyles = {
  primary: 'bg-[#0E4B3E]',
  secondary: 'bg-[#E05326]',
  tertiary: 'bg-[#15803D]',
  warning: 'bg-[#D97706]',
}

const sizeStyles = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
}

export function Progress({ className, value, max = 100, color = 'primary', size = 'md', showLabel = false, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  return (
    <div className={cn('w-full bg-[#E7DFCE] rounded-full border border-[#181816] overflow-hidden p-px', className)} {...props}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-300',
          colorStyles[color],
          sizeStyles[size]
        )}
        style={{ width: `${percentage}%` }}
      />
      {showLabel && (
        <span className="font-mono text-[10px] text-[#4E4B47] mt-1 block text-right">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  )
}