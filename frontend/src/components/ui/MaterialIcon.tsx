'use client'

import { HTMLAttributes } from 'react'

export interface MaterialIconProps extends HTMLAttributes<HTMLSpanElement> {
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  color?: string
}

const sizeStyles = {
  xs: 'text-[12px]',
  sm: 'text-[14px]',
  md: 'text-[16px]',
  lg: 'text-[18px]',
  xl: 'text-[24px]',
}

export function MaterialIcon({ name, size = 'md', color, className, ...props }: MaterialIconProps) {
  return (
    <span
      className={`
        material-symbols-outlined
        inline-block
        align-middle
        select-none
        ${sizeStyles[size]}
        ${className || ''}
      `}
      style={{ color, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
      {...props}
    >
      {name}
    </span>
  )
}