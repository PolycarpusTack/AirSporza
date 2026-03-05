import { useState, useEffect, useCallback } from 'react'
import { Search, Merge, Trash2, RefreshCw } from 'lucide-react'
import { Btn, Badge } from '../ui'
import { crewMembersApi } from '../../services/crewMembers'
import { useToast } from '../Toast'
import type { CrewMember } from '../../data/types'

export function CrewRosterPanel() {
  const [members, setMembers] = useState<CrewMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [mergeSource, setMergeSource] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await crewMembersApi.list(search ? { search } : undefined)
      setMembers(data)
    } catch {
      toast.error('Failed to load crew roster')
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => { load() }, [load])

  const handleExtract = async () => {
    try {
      const result = await crewMembersApi.extract()
      toast.success(`Extracted ${result.created} new, updated ${result.updated} existing (${result.total} total)`)
      load()
    } catch {
      toast.error('Extraction failed')
    }
  }

  const handleRename = async (id: number) => {
    if (!editName.trim()) return
    try {
      await crewMembersApi.update(id, { name: editName.trim() })
      toast.success('Renamed')
      setEditingId(null)
      load()
    } catch {
      toast.error('Rename failed')
    }
  }

  const handleMerge = async (targetId: number) => {
    if (!mergeSource || mergeSource === targetId) return
    try {
      const result = await crewMembersApi.merge(mergeSource, targetId)
      toast.success(`Merged. ${result.planUpdates} plan(s) updated.`)
      setMergeSource(null)
      load()
    } catch {
      toast.error('Merge failed')
    }
  }

  const handleToggleActive = async (member: CrewMember) => {
    try {
      await crewMembersApi.update(member.id, { isActive: !member.isActive })
      load()
    } catch {
      toast.error('Update failed')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await crewMembersApi.delete(id)
      toast.success('Deleted')
      load()
    } catch {
      toast.error('Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-bold">Crew Roster</h3>
        <Btn variant="secondary" size="sm" onClick={handleExtract}>
          <RefreshCw className="w-4 h-4" /> Extract from Plans
        </Btn>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search crew members..." className="inp w-full pl-9" />
      </div>

      {mergeSource && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-sm">
          <strong>Merge mode:</strong> Select a target to merge "{members.find(m => m.id === mergeSource)?.name}" into.
          <button onClick={() => setMergeSource(null)} className="ml-2 text-xs underline text-text-2">Cancel</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />)}</div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center text-text-3 text-sm">No crew members found. Click "Extract from Plans" to build the roster from existing tech plans.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Roles</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-surface-2 transition">
                  <td className="px-4 py-3">
                    {editingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="inp px-2 py-0.5 text-sm w-40" autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(m.id); if (e.key === 'Escape') setEditingId(null) }} />
                        <Btn variant="primary" size="xs" onClick={() => handleRename(m.id)}>Save</Btn>
                        <Btn variant="ghost" size="xs" onClick={() => setEditingId(null)}>Cancel</Btn>
                      </div>
                    ) : (
                      <span className="font-medium">{m.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(m.roles as string[]).map(r => (
                        <span key={r} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-2">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(m)}>
                      {m.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="none">Inactive</Badge>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {mergeSource && mergeSource !== m.id ? (
                        <Btn variant="secondary" size="xs" onClick={() => handleMerge(m.id)}>Merge here</Btn>
                      ) : !mergeSource ? (
                        <>
                          <Btn variant="ghost" size="xs" onClick={() => { setEditingId(m.id); setEditName(m.name) }}>Rename</Btn>
                          <Btn variant="ghost" size="xs" onClick={() => setMergeSource(m.id)}><Merge className="w-3 h-3" /></Btn>
                          <Btn variant="ghost" size="xs" onClick={() => handleDelete(m.id)}><Trash2 className="w-3 h-3 text-danger" /></Btn>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
