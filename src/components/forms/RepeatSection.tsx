import { useState, useMemo, useCallback } from 'react'

type RepeatType = 'none' | 'daily' | 'weekdays' | 'every_n_days'

interface RepeatSectionProps {
  startDate: string           // YYYY-MM-DD from form
  onDatesChange: (dates: string[]) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function addDaysToDate(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0..Sun=6
}

export function RepeatSection({ startDate, onDatesChange }: RepeatSectionProps) {
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [selectedDays, setSelectedDays] = useState<boolean[]>([false, false, false, false, false, false, false])
  const [everyN, setEveryN] = useState(2)
  const [untilDate, setUntilDate] = useState('')
  const [expanded, setExpanded] = useState(false)

  const dates = useMemo(() => {
    if (repeatType === 'none' || !startDate || !untilDate) return []
    const result: string[] = []
    const maxDate = untilDate

    if (repeatType === 'daily') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        result.push(current)
        current = addDaysToDate(current, 1)
      }
    } else if (repeatType === 'weekdays') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        const dow = getDayOfWeek(current)
        if (selectedDays[dow]) result.push(current)
        current = addDaysToDate(current, 1)
      }
    } else if (repeatType === 'every_n_days') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        result.push(current)
        current = addDaysToDate(current, everyN)
      }
    }

    return result
  }, [repeatType, startDate, untilDate, selectedDays, everyN])

  // Use useCallback for the effect to avoid dependency issues
  const stableDatesChange = useCallback(onDatesChange, [onDatesChange])

  // Propagate dates up when they change
  useMemo(() => {
    stableDatesChange(dates)
  }, [dates, stableDatesChange])

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-primary hover:underline mb-2"
      >
        + Add repeat pattern
      </button>
    )
  }

  return (
    <div className="border border-border rounded p-3 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-3 uppercase tracking-wider">Repeat</span>
        <button
          type="button"
          onClick={() => { setExpanded(false); setRepeatType('none'); stableDatesChange([]) }}
          className="text-xs text-muted hover:text-text"
        >
          Remove
        </button>
      </div>

      <select
        className="inp text-sm w-full"
        value={repeatType}
        onChange={e => setRepeatType(e.target.value as RepeatType)}
      >
        <option value="none">None</option>
        <option value="daily">Daily</option>
        <option value="weekdays">Specific weekdays</option>
        <option value="every_n_days">Every N days</option>
      </select>

      {repeatType === 'weekdays' && (
        <div className="flex gap-1">
          {DAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const next = [...selectedDays]
                next[i] = !next[i]
                setSelectedDays(next)
              }}
              className={`px-2 py-1 text-xs rounded border transition ${
                selectedDays[i]
                  ? 'bg-primary/20 border-primary text-primary font-bold'
                  : 'border-border text-text-3 hover:border-text-3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {repeatType === 'every_n_days' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-2">Every</span>
          <input
            type="number"
            min={2}
            max={30}
            value={everyN}
            onChange={e => setEveryN(Math.max(2, Number(e.target.value)))}
            className="inp text-sm w-16 px-2 py-1"
          />
          <span className="text-xs text-text-2">days</span>
        </div>
      )}

      {repeatType !== 'none' && (
        <div>
          <label className="block text-xs text-text-3 mb-1">Until (required)</label>
          <input
            type="date"
            className="inp text-sm w-full px-2 py-1"
            value={untilDate}
            min={startDate || undefined}
            onChange={e => setUntilDate(e.target.value)}
          />
        </div>
      )}

      {dates.length > 0 && (
        <div className="text-xs text-text-2 bg-surface-2 rounded p-2 max-h-32 overflow-auto">
          <span className="font-bold">{dates.length} events:</span>{' '}
          {dates.map(d =>
            new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
          ).join(', ')}
        </div>
      )}
    </div>
  )
}
