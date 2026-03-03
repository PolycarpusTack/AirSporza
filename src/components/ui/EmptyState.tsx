interface EmptyStateProps {
  icon: string
  title: string
  subtitle?: string
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="font-semibold text-foreground">{title}</p>
      {subtitle && <p className="mt-1 text-sm">{subtitle}</p>}
    </div>
  )
}
