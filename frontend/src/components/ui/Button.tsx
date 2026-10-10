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
  primary: 'bg-[#0E4B3E] hover:bg-[#0A382E] text-white border border-[#0A382E] shadow-xs active:bg-[#072922]',
  secondary: 'bg-[#FAF7F0] hover:bg-[#FFFFFF] text-[#181816] border border-stone-300 shadow-xs active:bg-stone-100',
  outline: 'bg-transparent hover:bg-stone-100 text-[#181816] border border-stone-300 active:bg-stone-200',
  ghost: 'bg-transparent hover:bg-stone-200/60 text-[#4E4B47] hover:text-[#181816] border border-transparent',
  danger: 'bg-[#E05326] hover:bg-[#C94318] text-white border border-[#B83E18] shadow-xs active:bg-[#9B2F0F]',
  pop: 'bg-[#FFFFFF] hover:bg-stone-50 text-[#181816] border border-stone-200 shadow-xs active:bg-stone-100',
}

const sizeStyles = {
  xs: 'px-2 py-0.5 text-[11px] h-6 rounded-md',
  sm: 'px-2.5 py-1 text-xs h-7 rounded-md',
  md: 'px-3 py-1.5 text-xs h-8 rounded-lg',
  lg: 'px-4 py-2 text-sm h-10 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', icon, iconPosition = 'left', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'font-semibold flex items-center justify-center gap-1.5 transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
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