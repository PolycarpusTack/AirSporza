import { Clock, Zap, Tv, Radio, AlertCircle, AlertTriangle } from 'lucide-react'
import type { BroadcastSlot } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'

interface SlotBlockProps {
  slot: BroadcastSlot
  pxPerHour: number
  dayStartHour: number
  isSelected: boolean
  validations: ValidationResult[]
  onClick: (slotId: string) => void
  onDoubleClick: (slotId: string) => void
  onContextMenu: (e: React.MouseEvent, slotId: string) => void
  onDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
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

export function SlotBlock({
  slot,
  pxPerHour,
  dayStartHour,
  isSelected,
  validations,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
}: SlotBlockProps) {
  const startHour = parseHour(slot.plannedStartUtc || slot.estimatedStartUtc)
  const endHour = parseHour(slot.plannedEndUtc || slot.estimatedEndUtc)

  const top = (startHour - dayStartHour) * pxPerHour
  const height = Math.max((endHour - startHour) * pxPerHour, 15)

  const hasError = validations.some((v) => v.severity === 'ERROR')
  const hasWarning = validations.some((v) => v.severity === 'WARNING')

  const isFloatingOrWindow =
    slot.schedulingMode === 'FLOATING' || slot.schedulingMode === 'WINDOW'

  const borderColor = hasError
    ? 'border-red-500'
    : hasWarning
      ? 'border-amber-500'
      : isSelected
        ? 'border-primary'
        : 'border-blue-500/40'

  const StrategyIcon = STRATEGY_ICONS[slot.overrunStrategy] || Clock
  const eventName = slot.event?.participants || `Slot ${slot.id.slice(0, 8)}`
  const confidenceScore = (slot.sportMetadata as Record<string, unknown>)?.confidenceScore as
    | number
    | undefined

  return (
    <div
      className={`absolute left-1 right-1 rounded-md border px-2 py-1 cursor-grab select-none transition-all overflow-hidden bg-blue-500/15 hover:bg-blue-500/25 ${borderColor} ${isFloatingOrWindow ? 'border-dashed' : ''} ${isSelected ? 'ring-1 ring-primary/60' : ''}`}
      style={{ top: `${top}px`, height: `${height}px`, minHeight: '15px' }}
      onClick={() => onClick(slot.id)}
      onDoubleClick={() => onDoubleClick(slot.id)}
      onContextMenu={(e) => onContextMenu(e, slot.id)}
      onMouseDown={(e) => {
        if (e.button === 0) onDragStart(e, slot.id, 'move')
      }}
    >
      {/* Title row */}
      <div className="flex items-center gap-1 text-xs font-medium truncate text-text">
        <StrategyIcon className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span className="truncate">{eventName}</span>
        {(hasError || hasWarning) && (
          hasError ? (
            <AlertCircle className="w-3 h-3 flex-shrink-0 text-red-500" />
          ) : (
            <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-500" />
          )
        )}
      </div>

      {/* Time range + mode */}
      {height > 30 && (
        <div className="text-[10px] text-text-3 mt-0.5 truncate">
          {formatTime(slot.plannedStartUtc || slot.estimatedStartUtc)} –{' '}
          {formatTime(slot.plannedEndUtc || slot.estimatedEndUtc)}{' '}
          <span className="opacity-60">{slot.schedulingMode}</span>
        </div>
      )}

      {/* Confidence bar for floating slots */}
      {isFloatingOrWindow && confidenceScore !== undefined && height > 45 && (
        <div className="mt-1 flex items-center gap-1">
          <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.round(confidenceScore * 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-text-3 opacity-50">
            {Math.round(confidenceScore * 100)}%
          </span>
        </div>
      )}

      {/* Bottom resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] cursor-ns-resize hover:bg-primary/30"
        onMouseDown={(e) => {
          e.stopPropagation()
          onDragStart(e, slot.id, 'resize')
        }}
      />
    </div>
  )
}
