// Extracted from AdminView.tsx in C-4 (TD-4) — pure move.
import { useState } from 'react'
import type { Sport } from '../../data/types'
import { sportsApi } from '../../services'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'
import { useConfirmDialog } from '../ui/ConfirmDialog'

// ── Sports Tab ───────────────────────────────────────────────────────────────

export function SportsTab({ sports, setSports }: {
  sports: (Sport & { _count?: { competitions: number; events: number } })[]
  setSports: React.Dispatch<React.SetStateAction<(Sport & { _count?: { competitions: number; events: number } })[]>>
}) {
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editSport, setEditSport] = useState<Sport | null>(null)
  const [form, setForm] = useState({ name: '', icon: '', federation: '' })
  const [saving, setSaving] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirmDialog()

  const openCreate = () => { setEditSport(null); setForm({ name: '', icon: '', federation: '' }); setShowForm(true) }
  const openEdit = (s: Sport) => { setEditSport(s); setForm({ name: s.name, icon: s.icon, federation: s.federation }); setShowForm(true) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editSport) {
        const updated = await sportsApi.update(editSport.id, form)
        setSports(prev => prev.map(s => s.id === editSport.id ? { ...s, ...updated } : s))
      } else {
        const created = await sportsApi.create(form)
        setSports(prev => [...prev, created])
      }
      setShowForm(false)
    } catch (err) { handleApiError(err, 'Failed to save sport', toast) } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s: Sport & { _count?: { competitions: number; events: number } }) => {
    const hasComps = (s._count?.competitions ?? 0) > 0
    const ok = await confirm({
      title: 'Delete sport',
      message: hasComps
        ? 'This will also delete all associated competitions and events.'
        : `Delete "${s.name}"? This cannot be undone.`,
      variant: 'danger',
    })
    if (!ok) return
    await sportsApi.delete(s.id).catch(err => handleApiError(err, 'Failed to delete sport', toast))
    setSports(prev => prev.filter(x => x.id !== s.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn btn-p btn-sm">+ Add Sport</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Sport</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Federation</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Competitions</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sports.map(s => (
              <tr key={s.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">{s.icon} {s.name}</td>
                <td className="px-4 py-3 text-muted">{s.federation}</td>
                <td className="px-4 py-3 text-muted">{s._count?.competitions ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end items-center">
                    <button onClick={() => openEdit(s)} className="btn btn-g btn-sm">Edit</button>
                    <button onClick={() => handleDelete(s)} className="text-xs text-danger hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-sm rounded-lg p-5 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">{editSport ? 'Edit Sport' : 'Add Sport'}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <input type="text" className="inp w-full" placeholder="Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <input type="text" className="inp w-full" placeholder="Icon (emoji)" value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} required />
              <input type="text" className="inp w-full" placeholder="Federation" value={form.federation} onChange={e => setForm(p => ({ ...p, federation: e.target.value }))} required />
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-s">Cancel</button>
                <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  )
}

