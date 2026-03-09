import { useState, useCallback, useRef } from 'react'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { Btn } from '../ui'
import { useApp } from '../../context/AppProvider'
import { settingsApi } from '../../services/settings'
import type { OrgConfig } from '../../data/types'

type Panel = 'phases' | 'categories' | 'venues' | 'freeze'

const PANEL_LABELS: Record<Panel, string> = {
  phases:    'Event Phases',
  categories:'Categories',
  venues:    'Venues',
  freeze:    'Freeze Window',
}

// ── StringList: shared component for simple string lists ─────────────────────

interface StringListProps {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
}

function StringList({ items, onChange, placeholder }: StringListProps) {
  const [draft, setDraft] = useState('')
  const dragIdx = useRef<number | null>(null)

  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))

  const handleDragStart = (i: number) => { dragIdx.current = i }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }

  const handleDrop = (targetIdx: number) => {
    const srcIdx = dragIdx.current
    if (srcIdx === null || srcIdx === targetIdx) return
    const next = [...items]
    const [moved] = next.splice(srcIdx, 1)
    next.splice(targetIdx, 0, moved)
    onChange(next)
    dragIdx.current = null
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(i)}
          className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-lg"
        >
          <GripVertical className="w-3.5 h-3.5 text-text-3 cursor-grab flex-shrink-0" />
          <span className="flex-1 text-sm text-text">{item}</span>
          <button
            onClick={() => remove(i)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text placeholder:text-text-3"
        />
        <button
          onClick={add}
          className="px-2.5 py-1.5 bg-surface-2 border border-border rounded-lg hover:bg-surface-3 transition text-text-2"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── OrgConfigPanel ─────────────────────────────────────────────────────────

export function OrgConfigPanel() {
  const { orgConfig, setOrgConfig } = useApp()
  const [local, setLocal] = useState<OrgConfig>(() => structuredClone(orgConfig))
  const [activePanel, setActivePanel] = useState<Panel>('phases')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isDirty = JSON.stringify(local) !== JSON.stringify(orgConfig)

  const save = async () => {
    setSaving(true)
    try {
      await settingsApi.updateOrgConfig(local)
      setOrgConfig(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // API unavailable — still update local context for offline use
      setOrgConfig(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const update = useCallback(<K extends keyof OrgConfig>(key: K, value: OrgConfig[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text">Organisation Config</h2>
          <p className="text-xs text-text-3 mt-0.5">
            Configure phases, categories, and venues. Channels are managed in the Channels panel.
          </p>
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save changes'}
        </Btn>
      </div>

      {isDirty && (
        <div className="px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg text-xs text-warning">
          Unsaved changes — click Save changes to apply.
        </div>
      )}

      {/* Panel tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {(Object.keys(PANEL_LABELS) as Panel[]).map(p => (
          <button
            key={p}
            onClick={() => setActivePanel(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              activePanel === p
                ? 'border-primary text-primary'
                : 'border-transparent text-text-2 hover:text-text'
            }`}
          >
            {PANEL_LABELS[p]}
            <span className="ml-1.5 text-text-3">
              {p === 'phases'      ? local.phases.length
               : p === 'categories' ? local.categories.length
               : p === 'freeze'    ? `${local.freezeWindowHours ?? 3}h`
               : local.complexes.length}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {activePanel === 'phases' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">Competition phase options (e.g. Group Stage, Semi-final, Final).</p>
            <StringList
              items={local.phases}
              onChange={v => update('phases', v)}
              placeholder="Phase name…"
            />
          </div>
        )}

        {activePanel === 'categories' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">Athlete category options (e.g. Men, Women, Youth).</p>
            <StringList
              items={local.categories}
              onChange={v => update('categories', v)}
              placeholder="Category name…"
            />
          </div>
        )}

        {activePanel === 'venues' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">Sports venues / complexes available in the event form.</p>
            <StringList
              items={local.complexes}
              onChange={v => update('complexes', v)}
              placeholder="Venue name…"
            />
          </div>
        )}

        {activePanel === 'freeze' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">
              Automatically lock events that are within a certain number of hours of their air time.
              Locked events cannot be edited by non-admin users. Set to 0 to disable.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-text font-medium whitespace-nowrap">Auto-lock events within</label>
              <input
                type="number"
                min={0}
                max={72}
                value={local.freezeWindowHours ?? 3}
                onChange={e => {
                  const val = Math.max(0, Math.min(72, Number(e.target.value) || 0))
                  setLocal(prev => ({ ...prev, freezeWindowHours: val }))
                }}
                className="w-20 px-3 py-1.5 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-primary/50 text-text text-center"
              />
              <span className="text-sm text-text-2">hours of air time</span>
            </div>
            <div className="px-3 py-2 bg-surface-2 rounded-lg text-xs text-text-3">
              {(local.freezeWindowHours ?? 3) === 0
                ? 'Freeze window is disabled. Events will only be locked by status (approved, published, live).'
                : `Events starting within ${local.freezeWindowHours ?? 3} hour(s) will be auto-locked for non-admin users.`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
