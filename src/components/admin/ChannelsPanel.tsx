import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { channelsApi } from '../../services/channels'
import { useToast } from '../Toast'
import type { Channel } from '../../data/types'

export function ChannelsPanel() {
  const toast = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editChannel, setEditChannel] = useState<Channel | null>(null)
  const [form, setForm] = useState({ name: '', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#6B7280' })

  useEffect(() => {
    channelsApi.list().then(setChannels).catch(() => toast.error('Failed to load channels')).finally(() => setLoading(false))
  }, [])

  const openCreate = () => { setEditChannel(null); setForm({ name: '', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#6B7280' }); setShowForm(true) }
  const openEdit = (c: Channel) => { setEditChannel(c); setForm({ name: c.name, timezone: c.timezone, broadcastDayStartLocal: c.broadcastDayStartLocal, color: c.color }); setShowForm(true) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editChannel) {
        const updated = await channelsApi.update(editChannel.id, form)
        setChannels(prev => prev.map(c => c.id === editChannel.id ? { ...c, ...updated } : c))
        toast.success('Channel updated')
      } else {
        const created = await channelsApi.create({ ...form, epgConfig: {} } as any)
        setChannels(prev => [...prev, created])
        toast.success('Channel created')
      }
      setShowForm(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save channel')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await channelsApi.delete(id)
      setChannels(prev => prev.filter(c => c.id !== id))
      toast.success('Channel deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  if (loading) return <div className="h-32 bg-surface-2 rounded-xl animate-pulse" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn btn-p btn-sm flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Channel
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="card p-4 space-y-3">
          <h4 className="font-bold text-sm">{editChannel ? 'Edit Channel' : 'New Channel'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Name</label>
              <input className="inp w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
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
          </div>
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
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Timezone</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Day Start</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {channels.map(c => (
              <tr key={c.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted text-xs">{c.timezone}</td>
                <td className="px-4 py-3 text-muted text-xs font-mono">{c.broadcastDayStartLocal}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(c)} className="p-1 text-muted hover:text-text"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-1 text-muted hover:text-danger ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted text-sm">No channels configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
