import { ChevronLeft, ChevronRight, Undo2, Redo2, CheckCircle, Upload } from 'lucide-react'
import type { ScheduleDraft } from '../../data/types'
import { Button as Btn } from '../ui/Button'
import { Badge } from '../ui/Badge'

interface ScheduleToolbarProps {
  date: string
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onDateChange: (date: string) => void
  timezone: string
  onTimezoneChange: (tz: string) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  draft: ScheduleDraft | null
  operationCount: number
  onValidate: () => void
  onPublish: () => void
  validating?: boolean
  publishing?: boolean
}

const TIMEZONES = ['UTC', 'CET', 'GMT']

function formatDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ScheduleToolbar({
  date,
  onPrevDay,
  onNextDay,
  onToday,
  onDateChange,
  timezone,
  onTimezoneChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  draft,
  operationCount,
  onValidate,
  onPublish,
  validating,
  publishing,
}: ScheduleToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Left group: date navigation */}
      <div className="flex items-center gap-2">
        <Btn variant="ghost" size="xs" onClick={onPrevDay}>
          <ChevronLeft className="w-4 h-4" />
        </Btn>
        <Btn variant="ghost" size="xs" onClick={onNextDay}>
          <ChevronRight className="w-4 h-4" />
        </Btn>
        <Btn variant="secondary" size="xs" onClick={onToday}>
          Today
        </Btn>

        <span className="text-sm font-medium ml-1">{formatDate(date)}</span>

        <input
          type="date"
          className="input text-xs h-7 px-2"
          value={date}
          onChange={e => onDateChange(e.target.value)}
        />

        <select
          className="input text-xs h-7 px-2"
          value={timezone}
          onChange={e => onTimezoneChange(e.target.value)}
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Right group: undo/redo, draft, validate, publish */}
      <div className="flex items-center gap-2">
        <Btn variant="ghost" size="xs" onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 className="w-4 h-4" />
        </Btn>
        <Btn variant="ghost" size="xs" onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 className="w-4 h-4" />
        </Btn>

        {draft && (
          <Badge variant="draft">
            v{draft.version} &middot; {operationCount} op{operationCount !== 1 ? 's' : ''}
          </Badge>
        )}

        <Btn variant="secondary" size="sm" onClick={onValidate} disabled={validating || !draft}>
          <CheckCircle className="w-3.5 h-3.5" />
          {validating ? 'Validating...' : 'Validate'}
        </Btn>

        <Btn variant="primary" size="sm" onClick={onPublish} disabled={publishing || !draft}>
          <Upload className="w-3.5 h-3.5" />
          {publishing ? 'Publishing...' : 'Publish'}
        </Btn>
      </div>
    </div>
  )
}
