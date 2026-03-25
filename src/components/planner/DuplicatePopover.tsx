import { useMemo, useState } from 'react'
import { Btn } from '../ui'
import { getDateKey, addDaysStr } from '../../utils/dateTime'
import type { Event } from '../../data/types'

interface DuplicatePopoverProps {
  event: Event
  onDuplicate: (targetDate: string) => void
  onClose: () => void
}

function formatLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function DuplicatePopover({ event, onDuplicate, onClose }: DuplicatePopoverProps) {
  const sourceDate = getDateKey(event.startDateBE)
  const tomorrow = useMemo(() => addDaysStr(sourceDate, 1), [sourceDate])
  const nextWeek = useMemo(() => addDaysStr(sourceDate, 7), [sourceDate])
  const [customDate, setCustomDate] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="card p-5 w-full max-w-xs shadow-lg animate-scale-in relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-text-3 text-xs mb-1">Duplicate Event</p>
        <p className="font-medium text-sm mb-4 truncate">{event.participants}</p>

        <button
          className="w-full text-left px-3 py-2 rounded border border-border hover:bg-surface-2 text-sm mb-2 transition-colors"
          onClick={() => onDuplicate(tomorrow)}
        >
          Tomorrow <span className="text-text-3 ml-1">{formatLabel(tomorrow)}</span>
        </button>

        <button
          className="w-full text-left px-3 py-2 rounded border border-border hover:bg-surface-2 text-sm mb-4 transition-colors"
          onClick={() => onDuplicate(nextWeek)}
        >
          Next week <span className="text-text-3 ml-1">{formatLabel(nextWeek)}</span>
        </button>

        <div className="flex gap-2 mb-4">
          <input
            type="date"
            className="inp flex-1 text-sm"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
          <Btn
            size="sm"
            disabled={!customDate}
            onClick={() => customDate && onDuplicate(customDate)}
          >
            Go
          </Btn>
        </div>

        <button
          className="w-full text-center text-sm text-text-3 hover:text-text-2 transition-colors py-1"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
