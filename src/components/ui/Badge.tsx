import type { HTMLAttributes } from 'react'
import type { BadgeVariant } from '../../data/types'
import { cn } from './cn'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  live:     'bg-warning-bg border border-warning-dim text-warning',
  delayed:  'bg-warning-bg border border-warning-dim text-warning',
  valid:    'bg-success-bg border border-success-dim text-success',
  expiring: 'bg-warning-bg border border-warning-dim text-warning',
  none:     'bg-danger-bg  border border-danger-dim  text-danger',
  draft:    'bg-surface-2  border border-border       text-text-2',
  default:  'bg-surface-2  border border-border       text-text-2',
  success:  'bg-success-bg border border-success-dim text-success',
  danger:   'bg-danger-bg  border border-danger-dim  text-danger',
  warning:  'bg-warning-bg border border-warning-dim text-warning',
}

export function Badge({ children, variant = 'default', className, ...props }: BadgeProps & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono font-semibold tracking-wide whitespace-nowrap',
        'px-2 py-0.5 text-[10.5px]',
        variantStyles[variant] ?? variantStyles.default,
        className,
      )}
      style={{ borderRadius: '12px' }}
      {...props}
    >
      {children}
    </span>
  )
}
