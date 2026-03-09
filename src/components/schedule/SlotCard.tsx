import { Clock, Tv, AlertTriangle, Zap, Radio } from 'lucide-react'
import type { BroadcastSlot } from '../../data/types'

interface SlotCardProps {
  slot: BroadcastSlot
  pixelsPerHour: number
  dayStartHour: number
  onClick?: (slot: BroadcastSlot) => void
}

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-blue-500/20 border-blue-500/40 text-blue-200',
  LIVE: 'bg-green-500/20 border-green-500/40 text-green-200',
  OVERRUN: 'bg-orange-500/20 border-orange-500/40 text-orange-200',
  SWITCHED_OUT: 'bg-gray-500/20 border-gray-500/30 text-gray-400',
  COMPLETED: 'bg-surface-2 border-border text-text-3',
}

const STRATEGY_ICONS: Record<string, typeof Clock> = {
  EXTEND: Clock,
  CONDITIONAL_SWITCH: Zap,
  HARD_CUT: Tv,
  SIMULCAST: Radio,
}

function parseHour(utcStr?: string): number {
  if (!utcStr) return 0
  const d = new Date(utcStr)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

function formatTime(utcStr?: string): string {
  if (!utcStr) return '--:--'
  const d = new Date(utcStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function SlotCard({ slot, pixelsPerHour, dayStartHour, onClick }: SlotCardProps) {
  const startHour = parseHour(slot.plannedStartUtc || slot.estimatedStartUtc)
  const endHour = parseHour(slot.plannedEndUtc || slot.estimatedEndUtc)

  const top = (startHour - dayStartHour) * pixelsPerHour
  const height = Math.max((endHour - startHour) * pixelsPerHour, 24)

  const statusClass = STATUS_COLORS[slot.status] || STATUS_COLORS.PLANNED
  const isFloating = slot.schedulingMode === 'FLOATING'
  const StrategyIcon = STRATEGY_ICONS[slot.overrunStrategy] || Clock

  return (
    <div
      className={`absolute left-1 right-1 rounded-md border px-2 py-1 cursor-pointer transition-all hover:ring-1 hover:ring-primary/50 overflow-hidden ${statusClass} ${isFloating ? 'border-dashed' : ''}`}
      style={{ top: `${top}px`, height: `${height}px`, minHeight: '24px' }}
      onClick={() => onClick?.(slot)}
    >
      <div className="flex items-center gap-1 text-xs font-medium truncate">
        <StrategyIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span className="truncate">{slot.event?.participants || `Slot ${slot.id.slice(0, 8)}`}</span>
      </div>
      {height > 40 && (
        <div className="text-[10px] opacity-70 mt-0.5">
          {formatTime(slot.plannedStartUtc || slot.estimatedStartUtc)} – {formatTime(slot.plannedEndUtc || slot.estimatedEndUtc)}
        </div>
      )}
      {isFloating && (slot.sportMetadata as any)?.confidenceScore !== undefined && height > 56 && (
        <div className="mt-1 flex items-center gap-1">
          <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${((slot.sportMetadata as any).confidenceScore || 0) * 100}%` }}
            />
          </div>
          <span className="text-[9px] opacity-50">{Math.round(((slot.sportMetadata as any).confidenceScore || 0) * 100)}%</span>
        </div>
      )}
      {slot.conditionalTriggerUtc && (
        <AlertTriangle className="absolute top-1 right-1 w-3 h-3 text-amber-400" />
      )}
    </div>
  )
}
