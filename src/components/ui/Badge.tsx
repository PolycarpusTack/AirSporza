import type { HTMLAttributes } from 'react'
import type { BadgeVariant } from '../../data/types'
import { cn } from './cn'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'border border-border bg-surface-2 text-foreground',
  live: 'bg-primary text-primary-foreground',
  delayed: 'border border-warning/25 bg-warning/10 text-warning',
  valid: 'bg-success text-white',
  expiring: 'border border-warning/25 bg-warning/10 text-warning',
  none: 'bg-danger text-white',
  draft: 'border border-border bg-brand/10 text-foreground',
  success: 'bg-success text-white',
  danger: 'bg-danger text-white',
  warning: 'border border-warning/25 bg-warning/10 text-warning',
}

export function Badge({ children, variant = 'default', className, ...props }: BadgeProps & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
        variantStyles[variant] || variantStyles.default,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
