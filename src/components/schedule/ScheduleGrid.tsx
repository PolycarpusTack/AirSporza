import { useMemo } from 'react'
import { SlotCard } from './SlotCard'
import type { BroadcastSlot, Channel } from '../../data/types'

interface ScheduleGridProps {
  channels: Channel[]
  slots: BroadcastSlot[]
  date: string
  dayStartHour?: number
  dayEndHour?: number
  onSlotClick?: (slot: BroadcastSlot) => void
}

const PIXELS_PER_HOUR = 80

export function ScheduleGrid({
  channels,
  slots,
  date: _date,
  dayStartHour = 6,
  dayEndHour = 30, // 06:00 to 06:00 next day
  onSlotClick,
}: ScheduleGridProps) {
  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = dayStartHour; h < dayEndHour; h++) {
      arr.push(h)
    }
    return arr
  }, [dayStartHour, dayEndHour])

  const totalHeight = hours.length * PIXELS_PER_HOUR

  // Group slots by channel
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
      {/* Time axis */}
      <div className="flex-shrink-0 w-16 border-r border-border">
        <div className="h-10 border-b border-border" />
        <div style={{ height: totalHeight }} className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/30 px-2 text-[10px] text-text-3 font-mono"
              style={{ top: `${(h - dayStartHour) * PIXELS_PER_HOUR}px` }}
            >
              {String(h % 24).padStart(2, '0')}:00
            </div>
          ))}
        </div>
      </div>

      {/* Channel columns */}
      {channels.map((ch) => (
        <div key={ch.id} className="flex-1 min-w-[160px] border-r border-border last:border-r-0">
          {/* Channel header */}
          <div className="h-10 border-b border-border flex items-center justify-center px-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: ch.color || '#6B7280' }}
              />
              <span className="text-xs font-semibold truncate">{ch.name}</span>
            </div>
          </div>

          {/* Slot area */}
          <div style={{ height: totalHeight }} className="relative">
            {/* Hour gridlines */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/15"
                style={{ top: `${(h - dayStartHour) * PIXELS_PER_HOUR}px` }}
              />
            ))}

            {/* Slots */}
            {(slotsByChannel.get(ch.id) || []).map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                pixelsPerHour={PIXELS_PER_HOUR}
                dayStartHour={dayStartHour}
                onClick={onSlotClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
