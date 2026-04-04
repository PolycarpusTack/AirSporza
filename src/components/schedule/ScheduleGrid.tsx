import { useMemo } from 'react'
import { TimeGutter } from './TimeGutter'
import { ChannelColumn } from './ChannelColumn'
import type { Channel, BroadcastSlot } from '../../data/types'
import type { ValidationResult } from '../../hooks/useScheduleEditor'

interface ScheduleGridProps {
  channels: Channel[]
  slots: BroadcastSlot[]
  dayStartHour?: number   // default 6
  dayEndHour?: number     // default 30 (6am to 6am next day)
  pxPerHour?: number      // default 30
  selectedSlotId: string | null
  validationBySlot: Map<string, ValidationResult[]>
  onSlotClick: (slotId: string) => void
  onSlotDoubleClick: (slotId: string) => void
  onSlotContextMenu: (e: React.MouseEvent, slotId: string) => void
  onSlotDragStart: (e: React.MouseEvent, slotId: string, type: 'move' | 'resize') => void
  onEmptyClick: (channelId: number, hour: number) => void
}

export function ScheduleGrid({
  channels,
  slots,
  dayStartHour = 6,
  dayEndHour = 30,
  pxPerHour = 30,
  selectedSlotId,
  validationBySlot,
  onSlotClick,
  onSlotDoubleClick,
  onSlotContextMenu,
  onSlotDragStart,
  onEmptyClick,
}: ScheduleGridProps) {
  // Group slots by channelId
  const slotsByChannel = useMemo(() => {
    const map = new Map<number, BroadcastSlot[]>()
    for (const ch of channels) {
      map.set(ch.id, [])
    }
    for (const slot of slots) {
      const existing = map.get(slot.channelId) || []
      existing.push(slot)
      map.set(slot.channelId, existing)
    }
    return map
  }, [channels, slots])

  return (
    <div className="flex overflow-auto border border-border rounded-xl bg-surface">
      <TimeGutter
        dayStartHour={dayStartHour}
        dayEndHour={dayEndHour}
        pxPerHour={pxPerHour}
      />

      {channels.map((ch) => (
        <ChannelColumn
          key={ch.id}
          channel={ch}
          slots={slotsByChannel.get(ch.id) || []}
          dayStartHour={dayStartHour}
          dayEndHour={dayEndHour}
          pxPerHour={pxPerHour}
          selectedSlotId={selectedSlotId}
          validationBySlot={validationBySlot}
          onSlotClick={onSlotClick}
          onSlotDoubleClick={onSlotDoubleClick}
          onSlotContextMenu={onSlotContextMenu}
          onSlotDragStart={onSlotDragStart}
          onEmptyClick={onEmptyClick}
        />
      ))}
    </div>
  )
}
