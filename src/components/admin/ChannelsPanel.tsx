import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, GripVertical, Tv, Radio, Wifi, Zap, Monitor } from 'lucide-react'
import { channelsApi } from '../../services/channels'
import { useToast } from '../Toast'
import type { Channel, ChannelType } from '../../data/types'

const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string; icon: React.ReactNode }[] = [
  { value: 'linear', label: 'Linear', icon: <Tv className="w-3 h-3" /> },
  { value: 'on-demand', label: 'On-demand', icon: <Monitor className="w-3 h-3" /> },
  { value: 'radio', label: 'Radio', icon: <Radio className="w-3 h-3" /> },
  { value: 'fast', label: 'FAST', icon: <Zap className="w-3 h-3" /> },
  { value: 'pop-up', label: 'Pop-up', icon: <Wifi className="w-3 h-3" /> },
]

type FormState = {
  name: string
  types: ChannelType[]
  timezone: string
  broadcastDayStartLocal: string
  platformConfig: Record<string, unknown>
  color: string
  parentId: number | null
  sortOrder: number
}

const emptyForm: FormState = {
  name: '', types: ['linear'], timezone: 'Europe/Brussels',
  broadcastDayStartLocal: '06:00', platformConfig: {},
  color: '#6B7280', parentId: null, sortOrder: 0,
}

export function ChannelsPanel() {
  const toast = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editChannel, setEditChannel] = useState<Channel | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const reload = useCallback(() => {
    channelsApi.list().then(setChannels).catch(() => toast.error('Failed to load channels')).finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  // Build tree from flat list
  const rootChannels = channels.filter(c => !c.parentId)
  const childrenOf = (parentId: number) =>
    channels.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const openCreate = (parentId: number | null = null) => {
    setEditChannel(null)
    setForm({ ...emptyForm, parentId })
    setShowForm(true)
  }

  const openEdit = (c: Channel) => {
    setEditChannel(c)
    setForm({
      name: c.name,
      types: (c.types || ['linear']) as ChannelType[],
      timezone: c.timezone,
      broadcastDayStartLocal: c.broadcastDayStartLocal,
      platformConfig: (c.platformConfig || {}) as Record<string, unknown>,
      color: c.color,
      parentId: c.parentId,
      sortOrder: c.sortOrder ?? 0,
    })
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editChannel) {
        await channelsApi.update(editChannel.id, form)
        toast.success('Channel updated')
      } else {
        await channelsApi.create(form as any)
        toast.success('Channel created')
      }
      setShowForm(false)
      reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save channel')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await channelsApi.delete(id)
      toast.success('Channel deleted')
      reload()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const toggleType = (type: ChannelType) => {
    setForm(f => {
      const has = f.types.includes(type)
      const next = has ? f.types.filter(t => t !== type) : [...f.types, type]
      return { ...f, types: next.length ? next : f.types } // at least one type
    })
  }

  const renderRow = (ch: Channel, depth: number) => {
    const kids = childrenOf(ch.id)
    const hasChildren = kids.length > 0
    const isExpanded = expanded.has(ch.id)

    return (
      <tbody key={ch.id}>
        <tr className="hover:bg-surface-2 transition border-b border-border/40">
          <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + depth * 24}px` }}>
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 text-muted/40 cursor-grab" />
              {hasChildren ? (
                <button onClick={() => toggleExpand(ch.id)} className="p-0.5 text-muted hover:text-text">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-4.5" />
              )}
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ch.color }} />
              <span className="font-medium text-sm">{ch.name}</span>
              {depth > 0 && <span className="text-[10px] text-muted bg-surface-2 px-1.5 py-0.5 rounded">sub</span>}
            </div>
          </td>
          <td className="px-4 py-2.5">
            <div className="flex gap-1 flex-wrap">
              {(ch.types || ['linear']).map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-muted font-medium">
                  {t}
                </span>
              ))}
            </div>
          </td>
          <td className="px-4 py-2.5 text-muted text-xs">{ch.timezone}</td>
          <td className="px-4 py-2.5 text-muted text-xs font-mono">{ch.broadcastDayStartLocal}</td>
          <td className="px-4 py-2.5 text-right">
            <button onClick={() => openCreate(ch.id)} title="Add sub-channel" className="p-1 text-muted hover:text-text">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => openEdit(ch)} className="p-1 text-muted hover:text-text">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDelete(ch.id)} className="p-1 text-muted hover:text-danger ml-0.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </td>
        </tr>
        {isExpanded && kids.map(child => renderRow(child, depth + 1))}
      </tbody>
    )
  }

  if (loading) return <div className="h-32 bg-surface-2 rounded-xl animate-pulse" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => openCreate()} className="btn btn-p btn-sm flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Channel
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card p-4 space-y-3">
          <h4 className="font-bold text-sm">
            {editChannel ? 'Edit Channel' : form.parentId ? 'New Sub-channel' : 'New Channel'}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Name</label>
              <input className="inp w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Parent</label>
              <select className="inp w-full" value={form.parentId ?? ''} onChange={e => setForm(f => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">None (top-level)</option>
                {channels.filter(c => c.id !== editChannel?.id).map(c => (
                  <option key={c.id} value={c.id}>{c.parentId ? `  └ ${c.name}` : c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted block mb-1">Types</label>
              <div className="flex gap-2 flex-wrap">
                {CHANNEL_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleType(opt.value)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      form.types.includes(opt.value)
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'bg-surface-2 text-muted border border-border hover:border-border/80'
                    }`}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Timezone</label>
              <input className="inp w-full" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Broadcast Day Start</label>
              <input className="inp w-full" type="time" value={form.broadcastDayStartLocal} onChange={e => setForm(f => ({ ...f, broadcastDayStartLocal: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer" />
                <input className="inp flex-1" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Sort Order</label>
              <input className="inp w-full" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
            </div>
          </div>

          {/* Platform config for sub-channels */}
          {form.parentId && (
            <div>
              <label className="text-xs text-muted block mb-1">Platform Config (JSON)</label>
              <textarea
                className="inp w-full font-mono text-xs"
                rows={3}
                value={JSON.stringify(form.platformConfig, null, 2)}
                onChange={e => {
                  try { setForm(f => ({ ...f, platformConfig: JSON.parse(e.target.value) })) } catch { /* ignore invalid JSON while typing */ }
                }}
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-sm">Cancel</button>
            <button type="submit" className="btn btn-p btn-sm">Save</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Channel</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Types</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Timezone</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Day Start</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          {rootChannels.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(ch => renderRow(ch, 0))}
          {channels.length === 0 && (
            <tbody>
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No channels configured</td></tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  )
}
