import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Undo2, Redo2, Eye, CheckCircle, Upload, Plus, ChevronDown } from 'lucide-react'
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
  drafts: ScheduleDraft[]
  onCreateDraft: () => void
  onSelectDraft: (draft: ScheduleDraft) => void
  operationCount: number
  onPreviewCascade: () => void
  onValidate: () => void
  onPublish: () => void
  previewing?: boolean
  validating?: boolean
  publishing?: boolean
  createDraftDisabled?: boolean
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

const STATUS_VARIANT: Record<string, 'draft' | 'success' | 'warning'> = {
  EDITING: 'draft',
  VALIDATING: 'warning',
  PUBLISHED: 'success',
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return start === end ? fmt(s) : `${fmt(s)} - ${fmt(e)}`
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
  drafts,
  onCreateDraft,
  onSelectDraft,
  operationCount,
  onPreviewCascade,
  onValidate,
  onPublish,
  previewing,
  validating,
  publishing,
  createDraftDisabled,
}: ScheduleToolbarProps) {
  const [draftMenuOpen, setDraftMenuOpen] = useState(false)
  const draftMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (draftMenuRef.current && !draftMenuRef.current.contains(e.target as Node)) {
        setDraftMenuOpen(false)
      }
    }
    if (draftMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [draftMenuOpen])
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

      {/* Right group: undo/redo, draft selector, new draft, validate, publish */}
      <div className="flex items-center gap-2">
        <Btn variant="ghost" size="xs" onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 className="w-4 h-4" />
        </Btn>
        <Btn variant="ghost" size="xs" onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 className="w-4 h-4" />
        </Btn>

        {/* Draft selector (only when multiple drafts exist) */}
        {drafts.length > 1 && (
          <div className="relative" ref={draftMenuRef}>
            <button
              onClick={() => setDraftMenuOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface-2 text-xs font-medium hover:bg-surface transition-colors"
            >
              {draft ? (
                <>
                  <Badge variant={STATUS_VARIANT[draft.status] || 'draft'} className="text-[10px] px-1.5 py-0">
                    {draft.status}
                  </Badge>
                  v{draft.version}
                </>
              ) : (
                'Select draft'
              )}
              <ChevronDown className="w-3 h-3 text-text-3" />
            </button>
            {draftMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] bg-surface border border-border rounded-lg shadow-lg py-1">
                {drafts.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { onSelectDraft(d); setDraftMenuOpen(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors ${
                      draft?.id === d.id ? 'bg-surface-2 font-medium' : ''
                    }`}
                  >
                    <Badge variant={STATUS_VARIANT[d.status] || 'draft'} className="text-[10px] px-1.5 py-0">
                      {d.status}
                    </Badge>
                    <span>v{d.version}</span>
                    <span className="text-text-3 ml-auto">{formatRange(d.dateRangeStart, d.dateRangeEnd)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active draft badge (single draft) */}
        {drafts.length <= 1 && draft && (
          <Badge variant="draft">
            v{draft.version} &middot; {operationCount} op{operationCount !== 1 ? 's' : ''}
          </Badge>
        )}

        <Btn variant="ghost" size="xs" onClick={onCreateDraft} disabled={createDraftDisabled} title="New Draft">
          <Plus className="w-3.5 h-3.5" />
          New Draft
        </Btn>

        <Btn variant="secondary" size="sm" onClick={onPreviewCascade} disabled={previewing || !draft || operationCount === 0} title="Preview cascade impact">
          <Eye className="w-3.5 h-3.5" />
          {previewing ? 'Previewing...' : 'Preview'}
        </Btn>

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
