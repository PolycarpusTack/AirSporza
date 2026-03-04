import { Badge } from './Badge'
import { cn } from './cn'

export function LivePill({ className }: { className?: string }) {
  return (
    <Badge variant="live" className={cn('gap-2', className)}>
      <span className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
      LIVE
    </Badge>
  )
}
