import type { BroadcastSlot, Channel } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'
import { SlotBlock } from './SlotBlock'

interface ChannelColumnProps {
  channel: Channel
  slots: BroadcastSlot[]
  dayStartHour: number
  dayEndHour: number
  pxPerHour: number
  selectedSlotId: string | null
  validationBySlot: Map<string, ValidationResult[]>
  onSlotClick: (slotId: string) => void
  onSlotDoubleClick: (slotId: string) => void
  onSlotContextMenu: (e: React.MouseEvent, slotId: string) => void
  onSlotDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
  onEmptyClick: (channelId: number, hour: number) => void
}

export function ChannelColumn({
  channel,
  slots,
  dayStartHour,
  dayEndHour,
  pxPerHour,
  selectedSlotId,
  validationBySlot,
  onSlotClick,
  onSlotDoubleClick,
  onSlotContextMenu,
  onSlotDragStart,
  onEmptyClick,
}: ChannelColumnProps) {
  const totalHeight = (dayEndHour - dayStartHour) * pxPerHour
  const hourCount = dayEndHour - dayStartHour

  const handleAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only trigger on direct clicks on the slot area (not on SlotBlocks)
    if (e.target !== e.currentTarget) return

    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const rawHour = dayStartHour + y / pxPerHour
    // Snap to 5 minutes (1/12 hour)
    const snappedHour = Math.round(rawHour * 12) / 12
    onEmptyClick(channel.id, snappedHour)
  }

  return (
    <div className="flex-1 min-w-[140px] border-r border-border last:border-r-0">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center gap-2 px-2">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: channel.color || '#6366f1' }}
        />
        <span className="text-xs font-medium text-text truncate">{channel.name}</span>
      </div>

      {/* Slot area */}
      <div
        className="relative"
        style={{ height: `${totalHeight}px` }}
        onClick={handleAreaClick}
      >
        {/* Hour gridlines */}
        {Array.from({ length: hourCount }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/15"
            style={{ top: `${i * pxPerHour}px` }}
          />
        ))}

        {/* Slot blocks */}
        {slots.map((slot) => (
          <SlotBlock
            key={slot.id}
            slot={slot}
            pxPerHour={pxPerHour}
            dayStartHour={dayStartHour}
            isSelected={slot.id === selectedSlotId}
            validations={validationBySlot.get(slot.id) || []}
            onClick={onSlotClick}
            onDoubleClick={onSlotDoubleClick}
            onContextMenu={onSlotContextMenu}
            onDragStart={onSlotDragStart}
          />
        ))}
      </div>
    </div>
  )
}
