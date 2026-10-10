'use client'

import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'stage' | 'elevated' | 'disruption'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles = {
  default: 'bg-[#FAF7F0] border-2 border-[#181816]',
  stage: 'bg-[#FFFFFF] border-2 border-[#181816] stage-card',
  elevated: 'bg-[#FFFFFF] border-2 border-[#181816] pop-shadow-md',
  disruption: 'bg-[#FFFFFF] border-2 border-[#E05326]',
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
          'rounded-2xl',
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