// Extracted from AdminView.tsx in C-4 (TD-4) — pure move.
import { useState, useEffect } from 'react'
import type { Encoder } from '../../data/types'
import { encodersApi } from '../../services'
import { Badge } from '../ui'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'

// ── Encoders Tab ─────────────────────────────────────────────────────────────

export function EncodersTab() {
  const toast = useToast()
  const [encoders, setEncoders] = useState<Encoder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editEncoder, setEditEncoder] = useState<Encoder | null>(null)
  const [form, setForm] = useState({ name: '', location: '', notes: '', isActive: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    encodersApi.list().then(setEncoders).catch(err => handleApiError(err, 'Failed to load encoders', toast)).finally(() => setLoading(false))
  }, [])

  const openCreate = () => { setEditEncoder(null); setForm({ name: '', location: '', notes: '', isActive: true }); setShowForm(true) }
  const openEdit = (enc: Encoder) => { setEditEncoder(enc); setForm({ name: enc.name, location: enc.location ?? '', notes: enc.notes ?? '', isActive: enc.isActive }); setShowForm(true) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editEncoder) {
        const updated = await encodersApi.update(editEncoder.id, form)
        setEncoders(prev => prev.map(enc => enc.id === editEncoder.id ? updated : enc))
      } else {
        const created = await encodersApi.create(form)
        setEncoders(prev => [...prev, created])
      }
      setShowForm(false)
    } catch (err) { handleApiError(err, 'Failed to save encoder', toast) } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (enc: Encoder) => {
    const updated = await encodersApi.update(enc.id, { isActive: !enc.isActive }).catch(err => { handleApiError(err, 'Failed to toggle encoder', toast); return null })
    if (updated) setEncoders(prev => prev.map(e => e.id === enc.id ? updated : e))
  }

  if (loading) return <div className="text-sm text-muted py-4">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn btn-p btn-sm">+ Add Encoder</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Location</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Active</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {encoders.map(enc => (
              <tr key={enc.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-mono font-semibold">{enc.name}</td>
                <td className="px-4 py-3 text-muted">{enc.location ?? '—'}</td>
                <td className="px-4 py-3">
                  <Toggle active={enc.isActive} onChange={() => toggleActive(enc)} />
                </td>
                <td className="px-4 py-3">
                  {enc.inUse
                    ? <Badge variant="warning">In Use</Badge>
                    : <Badge variant="success">Free</Badge>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(enc)} className="btn btn-g btn-sm">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-sm rounded-lg p-5 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">{editEncoder ? 'Edit Encoder' : 'Add Encoder'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <input type="text" className="inp w-full" placeholder="Name (e.g. ENC-09)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <input type="text" className="inp w-full" placeholder="Location" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
              <textarea className="inp w-full" rows={2} placeholder="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              <Toggle active={form.isActive} onChange={v => setForm(p => ({ ...p, isActive: v }))} label="Active" />
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-s">Cancel</button>
                <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

