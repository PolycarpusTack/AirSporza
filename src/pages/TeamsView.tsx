import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, X, ShieldCheck, Lock, RefreshCw, Users } from 'lucide-react'
import type { Sport, Team } from '../data/types'
import { teamsApi, type TeamInput } from '../services'
import { Badge, Button, EmptyState, Modal, Toggle } from '../components/ui'
import { useToast } from '../components/Toast'

interface TeamsViewProps {
  sports: Sport[]
  canEdit: boolean
}

type DrawerTab = 'overview' | 'remarks' | 'sources'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function Crest({ team, size = 34 }: { team: Pick<Team, 'name' | 'logoUrl'>; size?: number }) {
  const dim = { width: size, height: size, fontSize: size * 0.38 }
  if (team.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt=""
        style={dim}
        className="rounded-md object-contain border border-border-s bg-surface-2 flex-shrink-0"
      />
    )
  }
  return (
    <div
      style={dim}
      className="rounded-md flex items-center justify-center font-head font-bold flex-shrink-0 border border-border-s bg-surface-3 text-text-2"
    >
      {initials(team.name)}
    </div>
  )
}

export function TeamsView({ sports, canEdit }: TeamsViewProps) {
  const toast = useToast()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [sportId, setSportId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [managedOnly, setManagedOnly] = useState(false)
  const [selected, setSelected] = useState<Team | null>(null)
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [showAdd, setShowAdd] = useState(false)

  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const data = await teamsApi.list({
        sportId: sportId ?? undefined,
        managed: managedOnly || undefined,
      })
      setTeams(data)
    } catch {
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }, [sportId, managedOnly, toast])

  useEffect(() => {
    void loadTeams()
  }, [loadTeams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return teams
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.shortName ?? '').toLowerCase().includes(q),
    )
  }, [teams, search])

  const countsBySport = useMemo(() => {
    const m = new Map<number, number>()
    for (const t of teams) if (t.sportId != null) m.set(t.sportId, (m.get(t.sportId) ?? 0) + 1)
    return m
  }, [teams])

  async function handleToggleManaged(team: Team) {
    try {
      const updated = await teamsApi.update(team.id, { isManaged: !team.isManaged })
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, isManaged: updated.isManaged } : t)))
      if (selected?.id === team.id) setSelected({ ...selected, isManaged: updated.isManaged })
      toast.success(
        updated.isManaged
          ? `${team.name} marked as managed — manual edits are protected`
          : `${team.name} unmanaged`,
      )
    } catch {
      toast.error('Could not update team')
    }
  }

  function openTeam(team: Team) {
    setSelected(team)
    setTab('overview')
  }

  return (
    <div className="flex gap-4 min-h-[calc(100vh-7rem)]">
      {/* Tree */}
      <aside className="w-52 flex-shrink-0">
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-1">
          Repository
        </p>
        <button
          onClick={() => setSportId(null)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            sportId === null ? 'bg-primary/10 text-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="flex-1 text-left">All teams</span>
          <span className="text-[10px] font-mono text-text-3">{teams.length}</span>
        </button>
        {sports.map((s) => (
          <button
            key={s.id}
            onClick={() => setSportId(s.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              sportId === s.id ? 'bg-primary/10 text-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'
            }`}
          >
            <span className="text-base leading-none">{s.icon}</span>
            <span className="flex-1 text-left truncate">{s.name}</span>
            <span className="text-[10px] font-mono text-text-3">{countsBySport.get(s.id) ?? 0}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-4 mb-4">
          <div>
            <h1 className="font-head text-2xl font-bold tracking-tight">Squads &amp; Athletes</h1>
            <p className="text-text-2 text-sm mt-0.5">
              {loading ? 'Loading…' : `${filtered.length} team${filtered.length === 1 ? '' : 's'}`}
              {sportId !== null && ` · ${sports.find((s) => s.id === sportId)?.name ?? ''}`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => loadTeams()} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" /> Add team
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-1.5 w-64 focus-within:border-primary">
            <Search className="w-3.5 h-3.5 text-text-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter teams…"
              className="bg-transparent outline-none text-sm w-full placeholder:text-text-3"
            />
          </div>
          <Toggle active={managedOnly} onChange={setManagedOnly} label="Managed only" />
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-surface-2 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🏟️"
            title="No teams yet"
            subtitle={
              canEdit
                ? 'Add a team manually, or import a competition from the Import workspace.'
                : 'Teams will appear here once imported.'
            }
          />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2">
                  {['Team', 'Sport', 'Country', 'Status', 'Managed'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-text-3 font-mono px-4 py-2.5 border-b border-border"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openTeam(t)}
                    className="border-b border-border/60 last:border-0 hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Crest team={t} />
                        <div>
                          <div className="font-semibold text-sm flex items-center gap-1.5">
                            {t.name}
                            {t.notes ? <Lock className="w-3 h-3 text-warning" /> : null}
                          </div>
                          {t.shortName && (
                            <div className="text-[11px] text-text-3 font-mono">{t.shortName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-text-2">
                      {t.sport ? `${t.sport.icon} ${t.sport.name}` : <span className="text-text-3">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-text-2">{t.country ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {t.canonicalTeamId ? (
                        <Badge variant="success">synced</Badge>
                      ) : (
                        <Badge variant="draft">manual</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Toggle active={!!t.isManaged} onChange={() => handleToggleManaged(t)} disabled={!canEdit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <TeamDrawer
          team={selected}
          tab={tab}
          setTab={setTab}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSavedNotes={(notes) => {
            setTeams((prev) => prev.map((t) => (t.id === selected.id ? { ...t, notes } : t)))
            setSelected({ ...selected, notes })
          }}
        />
      )}

      {showAdd && (
        <AddTeamModal
          sports={sports}
          defaultSportId={sportId}
          onClose={() => setShowAdd(false)}
          onCreated={(team) => {
            setShowAdd(false)
            void loadTeams()
            toast.success(`${team.name} created`)
          }}
        />
      )}
    </div>
  )
}

/* ---------------- Drawer ---------------- */

function TeamDrawer({
  team,
  tab,
  setTab,
  canEdit,
  onClose,
  onSavedNotes,
}: {
  team: Team
  tab: DrawerTab
  setTab: (t: DrawerTab) => void
  canEdit: boolean
  onClose: () => void
  onSavedNotes: (notes: string | null) => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState(team.notes ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = (team.notes ?? '') !== notes

  useEffect(() => {
    setNotes(team.notes ?? '')
  }, [team.id, team.notes])

  async function saveNotes() {
    setSaving(true)
    try {
      await teamsApi.saveNotes(team.id, notes || null)
      onSavedNotes(notes || null)
      toast.success('Remark saved — protected from sync')
    } catch {
      toast.error('Could not save remark')
    } finally {
      setSaving(false)
    }
  }

  const fields: [string, string | null | undefined][] = [
    ['Full name', team.name],
    ['Short name', team.shortName],
    ['Sport', team.sport ? `${team.sport.icon} ${team.sport.name}` : null],
    ['Country', team.country],
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-screen w-[460px] max-w-[92vw] bg-surface border-l border-border-s shadow-lg z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-start gap-3.5 p-5 border-b border-border">
          <Crest team={team} size={52} />
          <div className="flex-1 min-w-0">
            <h2 className="font-head text-lg font-bold flex items-center gap-2">{team.name}</h2>
            <div className="text-xs text-text-2 mt-1 flex items-center gap-2 flex-wrap">
              {team.country && <span>{team.country}</span>}
              {team.shortName && <span className="font-mono">· {team.shortName}</span>}
              {team.canonicalTeamId ? (
                <Badge variant="success">synced</Badge>
              ) : (
                <Badge variant="draft">manual</Badge>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-2 hover:bg-surface-2 hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-3 border-b border-border">
          {(['overview', 'remarks', 'sources'] as DrawerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-2.5 text-sm font-semibold border-b-2 capitalize transition ${
                tab === t
                  ? 'text-primary border-primary'
                  : 'text-text-3 border-transparent hover:text-text-2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-2.5">
                Identity
              </p>
              {fields.map(([label, value]) => (
                <div key={label} className="py-3 border-b border-border/50 last:border-0">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 font-mono mb-1">
                    {label}
                  </div>
                  <div className="text-sm">{value || <span className="text-text-3">—</span>}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'remarks' && (
            <div>
              <div className="flex gap-2.5 p-3 rounded-md bg-warning-bg border border-warning-dim mb-4 text-[12.5px] text-text-2">
                <ShieldCheck className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                <span>
                  <b className="text-warning">Editorial remarks are manual-only.</b> They are never
                  imported or overwritten by a sync.
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="Add planning notes, coverage priority, venue caveats…"
                className="w-full bg-surface-2 border border-border rounded-md px-3.5 py-3 text-sm leading-relaxed min-h-[140px] outline-none focus:border-primary disabled:opacity-60 resize-y"
              />
              {canEdit && (
                <div className="flex justify-end mt-3">
                  <Button size="sm" onClick={saveNotes} disabled={!dirty || saving}>
                    {saving ? 'Saving…' : 'Save remark'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'sources' && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-2.5">
                Import linkage
              </p>
              {team.canonicalTeamId ? (
                <div className="border border-border rounded-md p-4 bg-surface-2 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="success">linked</Badge>
                    <span className="text-text-2">Bridged to a canonical (imported) team</span>
                  </div>
                  <div className="text-[11px] font-mono text-text-3 break-all">
                    canonicalTeamId: {team.canonicalTeamId}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="🔌"
                  title="Not linked to a source"
                  subtitle="This team was created manually. Import a competition to link it to TheSportsDB / football-data.org."
                />
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

/* ---------------- Add team modal ---------------- */

function AddTeamModal({
  sports,
  defaultSportId,
  onClose,
  onCreated,
}: {
  sports: Sport[]
  defaultSportId: number | null
  onClose: () => void
  onCreated: (team: Team) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState<TeamInput>({
    name: '',
    shortName: '',
    country: '',
    sportId: defaultSportId,
    isManaged: true,
  })
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function submit() {
    if (!form.name.trim()) {
      toast.error('Team name is required')
      return
    }
    setSaving(true)
    try {
      const team = await teamsApi.create({
        ...form,
        shortName: form.shortName || null,
        country: form.country || null,
      })
      onCreated(team)
    } catch {
      toast.error('Could not create team (name may already exist)')
    } finally {
      setSaving(false)
    }
  }

  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-text-3 font-mono mb-1.5'
  const input =
    'w-full bg-surface-2 border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary'

  return (
    <Modal title="Add team" onClose={onClose} width="max-w-md">
      <div className="p-6 space-y-4">
        <div>
          <label className={label}>Team name *</label>
          <input
            ref={nameRef}
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Royal Antwerp FC"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Short name</label>
            <input
              className={input}
              value={form.shortName ?? ''}
              onChange={(e) => setForm({ ...form, shortName: e.target.value })}
              placeholder="ANT"
            />
          </div>
          <div>
            <label className={label}>Country</label>
            <input
              className={input}
              value={form.country ?? ''}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="Belgium"
            />
          </div>
        </div>
        <div>
          <label className={label}>Sport</label>
          <select
            className={input}
            value={form.sportId ?? ''}
            onChange={(e) => setForm({ ...form, sportId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— none —</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? 'Creating…' : 'Create team'}
        </Button>
      </div>
    </Modal>
  )
}
