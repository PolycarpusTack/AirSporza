import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'default' | 'accent' | 'danger'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
  size?: Size
}

const base =
  'inline-flex items-center justify-center gap-2 font-semibold transition-all ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg ' +
  'disabled:pointer-events-none disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary:   'border border-transparent bg-primary text-primary-fg hover:bg-primary-hover hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(245,158,11,0.35)]',
  accent:    'border border-transparent bg-primary text-primary-fg hover:bg-primary-hover hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(245,158,11,0.35)]',
  secondary: 'border border-border bg-surface text-text-2 hover:border-border-s hover:text-text',
  default:   'border border-border bg-surface text-text-2 hover:border-border-s hover:text-text',
  ghost:     'border border-transparent bg-transparent text-text-2 hover:bg-surface-2 hover:text-text hover:border-border',
  danger:    'border border-danger-dim bg-danger-bg text-danger hover:bg-danger/10',
}

const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] rounded-[4px]',
  sm: 'h-8 px-3 text-xs rounded-[4px]',
  md: 'h-9 px-4 text-sm rounded-[6px]',
  lg: 'h-11 px-5 text-sm rounded-[6px]',
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  )
}
