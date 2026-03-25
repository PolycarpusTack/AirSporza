import { useState, useMemo, useEffect } from 'react'
import { eventsApi } from '../../services'
import { addDaysStr } from '../../utils/dateTime'

type RepeatType = 'none' | 'daily' | 'weekdays' | 'every_n_days' | 'matchday'

interface RepeatSectionProps {
  startDate: string           // YYYY-MM-DD from form
  onDatesChange: (dates: string[]) => void
  competitionId?: number      // from the form's competition field
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0..Sun=6
}

export function RepeatSection({ startDate, onDatesChange, competitionId }: RepeatSectionProps) {
  const [repeatType, setRepeatType] = useState<RepeatType>('none')
  const [selectedDays, setSelectedDays] = useState<boolean[]>([false, false, false, false, false, false, false])
  const [everyN, setEveryN] = useState(2)
  const [untilDate, setUntilDate] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [matchdays, setMatchdays] = useState<{ matchday: number; date: string; label: string; sample: string }[]>([])
  const [selectedMatchdays, setSelectedMatchdays] = useState<Set<number>>(new Set())
  const [matchdayLoading, setMatchdayLoading] = useState(false)

  useEffect(() => {
    if (repeatType !== 'matchday' || !competitionId) {
      setMatchdays([])
      return
    }
    setMatchdayLoading(true)
    eventsApi.fixturesByCompetition(competitionId)
      .then(data => {
        setMatchdays(data)
        setSelectedMatchdays(new Set(data.map(d => d.matchday)))
      })
      .catch(() => setMatchdays([]))
      .finally(() => setMatchdayLoading(false))
  }, [repeatType, competitionId])

  const dates = useMemo(() => {
    if (repeatType === 'matchday') {
      return matchdays
        .filter(m => selectedMatchdays.has(m.matchday))
        .map(m => m.date)
    }

    if (repeatType === 'none' || !startDate || !untilDate) return []
    const result: string[] = []
    const maxDate = untilDate

    if (repeatType === 'daily') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        result.push(current)
        current = addDaysStr(current, 1)
      }
    } else if (repeatType === 'weekdays') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        const dow = getDayOfWeek(current)
        if (selectedDays[dow]) result.push(current)
        current = addDaysStr(current, 1)
      }
    } else if (repeatType === 'every_n_days') {
      let current = startDate
      while (current <= maxDate && result.length < 100) {
        result.push(current)
        current = addDaysStr(current, everyN)
      }
    }

    return result
  }, [repeatType, startDate, untilDate, selectedDays, everyN, matchdays, selectedMatchdays])

  // Propagate dates up when they change
  useEffect(() => {
    onDatesChange(dates)
  }, [dates, onDatesChange])

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
          onClick={() => { setExpanded(false); setRepeatType('none'); onDatesChange([]) }}
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
        <option value="matchday">Every matchday of competition</option>
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

      {repeatType === 'matchday' && (
        <div className="space-y-2">
          {!competitionId && (
            <div className="text-xs text-warning">Select a competition in the form first</div>
          )}
          {matchdayLoading && (
            <div className="text-xs text-text-3 animate-pulse">Loading fixture schedule...</div>
          )}
          {matchdays.length > 0 && (
            <div className="max-h-48 overflow-auto space-y-1">
              {matchdays.map(m => (
                <label key={m.matchday} className="flex items-center gap-2 text-sm hover:bg-surface-2 rounded px-1 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMatchdays.has(m.matchday)}
                    onChange={() => {
                      setSelectedMatchdays(prev => {
                        const next = new Set(prev)
                        if (next.has(m.matchday)) next.delete(m.matchday)
                        else next.add(m.matchday)
                        return next
                      })
                    }}
                  />
                  <span className="font-mono text-xs text-text-3 w-16">{m.label}</span>
                  <span className="text-text-2">{new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-xs text-text-3 truncate ml-auto">{m.sample}</span>
                </label>
              ))}
            </div>
          )}
          {!matchdayLoading && matchdays.length === 0 && competitionId && (
            <div className="text-xs text-text-3">No fixtures found for this competition</div>
          )}
        </div>
      )}

      {repeatType !== 'none' && repeatType !== 'matchday' && (
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
