'use client'

import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'pop'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

const variantStyles = {
  primary: 'bg-[#0E4B3E] hover:bg-[#0A382E] text-white border-2 border-[#181816]',
  secondary: 'bg-[#FAF7F0] hover:bg-[#FFFFFF] text-[#181816] border-2 border-[#181816]',
  outline: 'bg-transparent hover:bg-[#FAF7F0] text-[#181816] border-2 border-[#181816]',
  ghost: 'bg-transparent hover:bg-[#FAF7F0] text-[#4E4B47] border-2 border-transparent',
  danger: 'bg-[#E05326] hover:bg-[#C94318] text-white border-2 border-[#181816]',
  pop: 'bg-[#FFFFFF] hover:bg-[#FAF7F0] text-[#181816] border-2 border-[#181816] pop-shadow-xs',
}

const sizeStyles = {
  xs: 'px-2 py-0.5 text-[10px] h-6',
  sm: 'px-2.5 py-1 text-[11px] h-7',
  md: 'px-3 py-1.5 text-[12px] h-8',
  lg: 'px-4 py-2 text-[13px] h-10',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', icon, iconPosition = 'left', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'rounded-full font-bold flex items-center justify-center gap-1.5 transition-all duration-100',
          'btn-pop',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
        {children}
        {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'