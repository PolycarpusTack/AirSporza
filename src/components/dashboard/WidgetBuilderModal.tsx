import { useState } from 'react'
import { Modal, Btn } from '../ui'
import { useApp } from '../../context/AppProvider'
import type { DashboardWidget, CustomWidgetType, CustomWidgetDateRange } from '../../data/types'

interface WidgetBuilderModalProps {
  onClose: () => void
  onSave: (widget: DashboardWidget) => void
  editWidget?: DashboardWidget | null
}

const WIDGET_TYPES: { value: CustomWidgetType; label: string; desc: string }[] = [
  { value: 'metric', label: 'Metric Card', desc: 'Shows a count of matching events' },
  { value: 'list', label: 'Event List', desc: 'Shows a filtered list of events' },
  { value: 'my-assignments', label: 'My Assignments', desc: 'Events where you are assigned as crew' },
]

const DATE_RANGES: { value: CustomWidgetDateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'next-7-days', label: 'Next 7 Days' },
  { value: 'this-month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
]

const STATUSES = ['draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled']

export function WidgetBuilderModal({ onClose, onSave, editWidget }: WidgetBuilderModalProps) {
  const { sports, competitions } = useApp()
  const isEdit = !!editWidget?.custom

  const [label, setLabel] = useState(editWidget?.label || '')
  const [widgetType, setWidgetType] = useState<CustomWidgetType>(editWidget?.custom?.type || 'metric')
  const [sportId, setSportId] = useState<number | undefined>(editWidget?.custom?.sportId)
  const [competitionId, setCompetitionId] = useState<number | undefined>(editWidget?.custom?.competitionId)
  const [status, setStatus] = useState<string | undefined>(editWidget?.custom?.status)
  const [dateRange, setDateRange] = useState<CustomWidgetDateRange>(editWidget?.custom?.dateRange || 'this-week')
  const [maxItems, setMaxItems] = useState(editWidget?.custom?.maxItems ?? 5)

  const showFilters = widgetType !== 'my-assignments'

  const handleSave = () => {
    if (!label.trim()) return
    const widget: DashboardWidget = {
      id: editWidget?.id || `custom-${Date.now()}`,
      label: label.trim(),
      visible: true,
      order: editWidget?.order ?? 999,
      custom: {
        type: widgetType,
        dateRange,
        maxItems: widgetType === 'metric' ? undefined : maxItems,
        ...(showFilters && sportId ? { sportId } : {}),
        ...(showFilters && competitionId ? { competitionId } : {}),
        ...(showFilters && status ? { status } : {}),
      },
    }
    onSave(widget)
  }

  const selectClass = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary'
  const inputClass = selectClass

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Widget' : 'Add Widget'} width="max-w-md">
      <div className="p-5 space-y-4">
        {/* Widget Type */}
        <div>
          <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Type</label>
          <div className="grid grid-cols-1 gap-2">
            {WIDGET_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setWidgetType(t.value)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                  widgetType === t.value
                    ? 'border-primary bg-primary/10 text-text'
                    : 'border-border bg-surface-2 text-text-2 hover:border-text-3'
                }`}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-text-3 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Name</label>
          <input
            className={inputClass}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={widgetType === 'my-assignments' ? 'My Assignments' : 'Widget name...'}
          />
        </div>

        {/* Date Range */}
        <div>
          <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Date Range</label>
          <select className={selectClass} value={dateRange} onChange={e => setDateRange(e.target.value as CustomWidgetDateRange)}>
            {DATE_RANGES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        {/* Filters (not for my-assignments) */}
        {showFilters && (
          <>
            <div>
              <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Sport</label>
              <select className={selectClass} value={sportId ?? ''} onChange={e => setSportId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">All sports</option>
                {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Competition</label>
              <select
                className={selectClass}
                value={competitionId ?? ''}
                onChange={e => setCompetitionId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">All competitions</option>
                {competitions
                  .filter(c => !sportId || c.sportId === sportId)
                  .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Status</label>
              <select className={selectClass} value={status ?? ''} onChange={e => setStatus(e.target.value || undefined)}>
                <option value="">Any status</option>
                {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Max items (for list and my-assignments) */}
        {widgetType !== 'metric' && (
          <div>
            <label className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1.5 block">Max Items</label>
            <input
              type="number"
              min={1}
              max={20}
              className={inputClass}
              value={maxItems}
              onChange={e => setMaxItems(Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={!label.trim()}>
          {isEdit ? 'Save' : 'Add Widget'}
        </Btn>
      </div>
    </Modal>
  )
}
