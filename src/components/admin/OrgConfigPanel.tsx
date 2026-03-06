import { useState, useCallback } from 'react'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'
import { Btn } from '../ui'
import { useApp } from '../../context/AppProvider'
import { settingsApi } from '../../services/settings'
import type { OrgConfig, ChannelConfig } from '../../data/types'

type Panel = 'channels' | 'ondemand' | 'radio' | 'phases' | 'categories' | 'venues' | 'freeze'

const PANEL_LABELS: Record<Panel, string> = {
  channels:  'Linear Channels',
  ondemand:  'On-demand Platforms',
  radio:     'Radio Channels',
  phases:    'Event Phases',
  categories:'Categories',
  venues:    'Venues',
  freeze:    'Freeze Window',
}

const PALETTE = [
  '#F59E0B', '#EF4444', '#3B82F6', '#10B981',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#84CC16', '#6366F1', '#14B8A6', '#FBBF24',
]

// ── StringList: shared component for simple string lists ─────────────────────

interface StringListProps {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
}

function StringList({ items, onChange, placeholder }: StringListProps) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    setDraft('')
  }

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-lg">
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

// ── ChannelList ───────────────────────────────────────────────────────────────

interface ChannelListProps {
  channels: ChannelConfig[]
  onChange: (channels: ChannelConfig[]) => void
}

function ChannelList({ channels, onChange }: ChannelListProps) {
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(PALETTE[0])

  const add = () => {
    const name = draftName.trim()
    if (!name || channels.some(c => c.name === name)) return
    onChange([...channels, { name, color: draftColor }])
    setDraftName('')
    setDraftColor(PALETTE[0])
  }

  const remove = (i: number) => onChange(channels.filter((_, idx) => idx !== i))

  const updateColor = (i: number, color: string) => {
    onChange(channels.map((c, idx) => idx === i ? { ...c, color } : c))
  }

  return (
    <div className="space-y-2">
      {channels.map((ch, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-surface-2 rounded-lg">
          <GripVertical className="w-3.5 h-3.5 text-text-3 cursor-grab flex-shrink-0" />
          {/* Color swatch + picker */}
          <div className="relative flex-shrink-0">
            <div
              className="w-6 h-6 rounded border-2 border-border/50 cursor-pointer"
              style={{ background: ch.color }}
              title="Click to change color"
            />
            <input
              type="color"
              value={ch.color}
              onChange={e => updateColor(i, e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
            />
          </div>
          <span className="flex-1 text-sm text-text">{ch.name}</span>
          <span className="text-xs font-mono text-text-3">{ch.color}</span>
          {/* Palette quick-pick */}
          <div className="flex gap-1">
            {PALETTE.slice(0, 6).map(c => (
              <button
                key={c}
                className="w-3 h-3 rounded-full border border-border/30 hover:scale-125 transition-transform"
                style={{ background: c }}
                onClick={() => updateColor(i, c)}
                title={c}
              />
            ))}
          </div>
          <button
            onClick={() => remove(i)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Add row */}
      <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg">
        <div className="relative flex-shrink-0">
          <div className="w-6 h-6 rounded border-2 border-border/50" style={{ background: draftColor }} />
          <input
            type="color"
            value={draftColor}
            onChange={e => setDraftColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-6 h-6"
          />
        </div>
        <input
          type="text"
          value={draftName}
          onChange={e => setDraftName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Channel name…"
          className="flex-1 text-sm bg-transparent focus:outline-none text-text placeholder:text-text-3"
        />
        <div className="flex gap-1">
          {PALETTE.map(c => (
            <button
              key={c}
              className={`w-3 h-3 rounded-full border transition-transform hover:scale-125 ${draftColor === c ? 'border-white scale-125' : 'border-border/30'}`}
              style={{ background: c }}
              onClick={() => setDraftColor(c)}
            />
          ))}
        </div>
        <button
          onClick={add}
          className="px-2.5 py-1 text-xs font-medium bg-primary/10 border border-primary/20 text-primary rounded-lg hover:bg-primary/20 transition"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── OrgConfigPanel ─────────────────────────────────────────────────────────

export function OrgConfigPanel() {
  const { orgConfig, setOrgConfig } = useApp()
  const [local, setLocal] = useState<OrgConfig>(() => structuredClone(orgConfig))
  const [activePanel, setActivePanel] = useState<Panel>('channels')
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
            Configure channels, phases, categories, and venues — replaces hardcoded defaults.
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
              {p === 'channels'    ? local.channels.length
               : p === 'ondemand'  ? local.onDemandChannels.length
               : p === 'radio'    ? local.radioChannels.length
               : p === 'phases'   ? local.phases.length
               : p === 'categories' ? local.categories.length
               : p === 'freeze'   ? `${local.freezeWindowHours ?? 3}h`
               : local.complexes.length}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {activePanel === 'channels' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">
              Linear broadcast TV channels — shown as filter chips in the Planner calendar and as options in event forms. Each gets its own color.
            </p>
            <ChannelList
              channels={local.channels}
              onChange={v => update('channels', v)}
            />
          </div>
        )}

        {activePanel === 'ondemand' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">
              BVOD / streaming platforms (e.g. VRT MAX, BBC iPlayer). Shown as a separate "On-demand Platform" field in event forms alongside the linear channel. Availability date/time is set via the <em>On-demand Available From</em> fields.
            </p>
            <ChannelList
              channels={local.onDemandChannels}
              onChange={v => update('onDemandChannels', v)}
            />
          </div>
        )}

        {activePanel === 'radio' && (
          <div className="space-y-3">
            <p className="text-xs text-text-3">Radio channels available in the event form.</p>
            <StringList
              items={local.radioChannels}
              onChange={v => update('radioChannels', v)}
              placeholder="Radio channel name…"
            />
          </div>
        )}

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
