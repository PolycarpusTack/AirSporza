// Extracted from AdminView.tsx in C-4 (TD-4) — pure move.
import { useState, useEffect } from 'react'
import type { Sport, Competition } from '../../data/types'
import { competitionsApi } from '../../services'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'

// ── Competitions Tab ─────────────────────────────────────────────────────────

export function CompetitionsTab({ sports }: { sports: Sport[] }) {
  const toast = useToast()
  const [competitions, setCompetitions] = useState<(Competition & { sport: Sport; _count?: { events: number } })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ sportId: 0, name: '', season: '', matches: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    competitionsApi.list().then(setCompetitions).catch(err => handleApiError(err, 'Failed to load competitions', toast)).finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const created = await competitionsApi.create({
        sportId: form.sportId,
        name: form.name,
        season: form.season,
        matches: form.matches ? Number(form.matches) : undefined,
      })
      const sport = sports.find(s => s.id === created.sportId) ?? { id: created.sportId, name: '', icon: '', federation: '' }
      setCompetitions(prev => [...prev, { ...created, sport }])
      setShowForm(false)
      setForm({ sportId: 0, name: '', season: '', matches: '' })
    } catch (err) { handleApiError(err, 'Failed to create competition', toast) } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-muted py-4">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn btn-p btn-sm">+ Add Competition</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Competition</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Sport</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Season</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Matches</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {competitions.map(c => (
              <tr key={c.id} className="hover:bg-surface-2 transition">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.sport?.icon} {c.sport?.name}</td>
                <td className="px-4 py-3 text-muted">{c.season}</td>
                <td className="px-4 py-3 text-muted">{c.matches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-sm rounded-lg p-5 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">Add Competition</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <select className="inp w-full" value={form.sportId} onChange={e => setForm(p => ({ ...p, sportId: Number(e.target.value) }))} required>
                <option value={0} disabled>Select sport…</option>
                {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
              <input type="text" className="inp w-full" placeholder="Competition name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <input type="text" className="inp w-full" placeholder="Season (e.g. 2025-26)" value={form.season} onChange={e => setForm(p => ({ ...p, season: e.target.value }))} required />
              <input type="number" className="inp w-full" placeholder="Matches (optional)" value={form.matches} onChange={e => setForm(p => ({ ...p, matches: e.target.value }))} />
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

