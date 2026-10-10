'use client'

import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'stage' | 'elevated' | 'disruption'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles = {
  default: 'bg-[#FAF7F0] border border-stone-200/80',
  stage: 'bg-[#FFFFFF] border border-stone-200/90 stage-card',
  elevated: 'bg-[#FFFFFF] border border-stone-200 shadow-sm',
  disruption: 'bg-[#FFFFFF] border border-[#E05326]/80',
}

const paddingStyles = {
  none: '',
  sm: 'p-2.5',
  md: 'p-3',
  lg: 'p-4',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl',
          variantStyles[variant],
          paddingStyles[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'