import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, X, ShieldCheck, Lock, RefreshCw, Users, ChevronDown, ChevronRight, Trophy,
} from 'lucide-react'
import type { Competition, Player, Sport, Team } from '../data/types'
import { playersApi, teamsApi, type TeamCompetitionLink, type TeamInput } from '../services'
import { Badge, Button, EmptyState, Modal, Toggle } from '../components/ui'
import { useToast } from '../components/Toast'

interface TeamsViewProps {
  sports: Sport[]
  competitions: Competition[]
  canEdit: boolean
}

type DrawerTab = 'overview' | 'roster' | 'remarks' | 'sources'

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

export function TeamsView({ sports, competitions, canEdit }: TeamsViewProps) {
  const toast = useToast()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [sportId, setSportId] = useState<number | null>(null)
  const [competitionId, setCompetitionId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [managedOnly, setManagedOnly] = useState(false)
  const [selected, setSelected] = useState<Team | null>(null)
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [showAdd, setShowAdd] = useState(false)

  const competitionsBySport = useMemo(() => {
    const m = new Map<number, Competition[]>()
    for (const c of competitions) {
      const list = m.get(c.sportId) ?? []
      list.push(c)
      m.set(c.sportId, list)
    }
    return m
  }, [competitions])

  const loadTeams = useCallback(async () => {
    setLoading(true)
    try {
      const data = await teamsApi.list({
        sportId: competitionId == null ? (sportId ?? undefined) : undefined,
        competitionId: competitionId ?? undefined,
        managed: managedOnly || undefined,
      })
      setTeams(data)
    } catch {
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }, [sportId, competitionId, managedOnly, toast])

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

  const scopeLabel = useMemo(() => {
    if (competitionId != null) return competitions.find((c) => c.id === competitionId)?.name ?? null
    if (sportId != null) return sports.find((s) => s.id === sportId)?.name ?? null
    return null
  }, [competitionId, sportId, competitions, sports])

  function selectAll() {
    setSportId(null)
    setCompetitionId(null)
  }
  function selectSport(id: number) {
    setSportId(id)
    setCompetitionId(null)
    setExpanded((prev) => new Set(prev).add(id))
  }
  function selectCompetition(c: Competition) {
    setCompetitionId(c.id)
    setSportId(c.sportId)
  }
  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const treeBtn = (active: boolean) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active ? 'bg-primary/10 text-primary' : 'text-text-2 hover:bg-surface-2 hover:text-text'
    }`

  return (
    <div className="flex gap-4 min-h-[calc(100vh-7rem)]">
      {/* Tree */}
      <aside className="w-56 flex-shrink-0">
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-1">
          Repository
        </p>
        <button onClick={selectAll} className={treeBtn(sportId === null && competitionId === null)}>
          <Users className="w-4 h-4" />
          <span className="flex-1 text-left">All teams</span>
        </button>

        {sports.map((s) => {
          const comps = competitionsBySport.get(s.id) ?? []
          const isOpen = expanded.has(s.id)
          return (
            <div key={s.id}>
              <div className={treeBtn(sportId === s.id && competitionId === null)}>
                {comps.length > 0 ? (
                  <button
                    onClick={() => toggleExpand(s.id)}
                    className="text-text-3 hover:text-text -ml-1"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <span className="w-3.5" />
                )}
                <button onClick={() => selectSport(s.id)} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-base leading-none">{s.icon}</span>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                </button>
              </div>
              {isOpen &&
                comps.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCompetition(c)}
                    className={`w-full flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-[12.5px] transition-all border-l border-border ml-4 ${
                      competitionId === c.id
                        ? 'bg-primary/10 text-primary border-primary'
                        : 'text-text-2 hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    <Trophy className="w-3 h-3 flex-shrink-0 opacity-70" />
                    <span className="flex-1 text-left truncate">{c.name}</span>
                  </button>
                ))}
            </div>
          )
        })}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-4 mb-4">
          <div>
            <h1 className="font-head text-2xl font-bold tracking-tight">Squads &amp; Athletes</h1>
            <p className="text-text-2 text-sm mt-0.5">
              {loading ? 'Loading…' : `${filtered.length} team${filtered.length === 1 ? '' : 's'}`}
              {scopeLabel && ` · ${scopeLabel}`}
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
            title="No teams here yet"
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
                    onClick={() => {
                      setSelected(t)
                      setTab('overview')
                    }}
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
          competitions={competitions}
          tab={tab}
          setTab={setTab}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSavedNotes={(notes) => {
            setTeams((prev) => prev.map((t) => (t.id === selected.id ? { ...t, notes } : t)))
            setSelected({ ...selected, notes })
          }}
          onMembershipChange={loadTeams}
        />
      )}

      {showAdd && (
        <AddTeamModal
          sports={sports}
          competitions={competitions}
          defaultSportId={sportId}
          defaultCompetitionId={competitionId}
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
  competitions,
  tab,
  setTab,
  canEdit,
  onClose,
  onSavedNotes,
  onMembershipChange,
}: {
  team: Team
  competitions: Competition[]
  tab: DrawerTab
  setTab: (t: DrawerTab) => void
  canEdit: boolean
  onClose: () => void
  onSavedNotes: (notes: string | null) => void
  onMembershipChange: () => void
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
          {(['overview', 'roster', 'remarks', 'sources'] as DrawerTab[]).map((t) => (
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
                <div key={label} className="py-3 border-b border-border/50">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3 font-mono mb-1">
                    {label}
                  </div>
                  <div className="text-sm">{value || <span className="text-text-3">—</span>}</div>
                </div>
              ))}

              <CompetitionMemberships
                team={team}
                competitions={competitions}
                canEdit={canEdit}
                onChange={onMembershipChange}
              />
            </div>
          )}

          {tab === 'roster' && <RosterTab team={team} />}

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

/* ---------------- Roster tab ---------------- */

function PlayerAvatar({ player, size = 30 }: { player: Pick<Player, 'fullName' | 'photoUrl'>; size?: number }) {
  const dim = { width: size, height: size, fontSize: size * 0.36 }
  if (player.photoUrl) {
    return (
      <img
        src={player.photoUrl}
        alt=""
        style={dim}
        className="rounded-full object-cover border border-border-s bg-surface-2 flex-shrink-0"
      />
    )
  }
  return (
    <div
      style={dim}
      className="rounded-full flex items-center justify-center font-head font-bold flex-shrink-0 border border-border-s bg-surface-3 text-text-2"
    >
      {initials(player.fullName)}
    </div>
  )
}

function RosterTab({ team }: { team: Team }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPlayers(await playersApi.list({ teamId: team.id }))
    } catch {
      /* non-fatal — empty state below covers it */
    } finally {
      setLoading(false)
    }
  }, [team.id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-surface-2 rounded-md animate-pulse" />
        ))}
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <EmptyState
        icon="🧑‍🤝‍🧑"
        title="No roster yet"
        subtitle="Run a players import from the Import workspace, or add players via the API — squad members appear here automatically."
      />
    )
  }

  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-2.5">
        Roster · {players.length} player{players.length === 1 ? '' : 's'}
      </p>
      <div className="border border-border rounded-lg overflow-hidden">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-3.5 py-2.5 border-b border-border/60 last:border-0"
          >
            <PlayerAvatar player={p} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1.5 truncate">
                {p.fullName}
                {p.notes ? <Lock className="w-3 h-3 text-warning flex-shrink-0" /> : null}
              </div>
              <div className="text-[11px] text-text-3">
                {[p.position, p.countryCode].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            {p.canonicalPlayerId ? (
              <Badge variant="success">synced</Badge>
            ) : (
              <Badge variant="draft">manual</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Competition memberships ---------------- */

function CompetitionMemberships({
  team,
  competitions,
  canEdit,
  onChange,
}: {
  team: Team
  competitions: Competition[]
  canEdit: boolean
  onChange: () => void
}) {
  const toast = useToast()
  const [links, setLinks] = useState<TeamCompetitionLink[]>([])
  const [loading, setLoading] = useState(true)
  const [addId, setAddId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLinks(await teamsApi.listCompetitions(team.id))
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [team.id])

  useEffect(() => {
    void load()
  }, [load])

  const linkedIds = new Set(links.map((l) => l.competitionId))
  const assignable = competitions.filter(
    (c) => !linkedIds.has(c.id) && (team.sportId == null || c.sportId === team.sportId),
  )

  async function add() {
    if (!addId) return
    setBusy(true)
    try {
      await teamsApi.addCompetition(team.id, Number(addId))
      setAddId('')
      await load()
      onChange()
      toast.success('Assigned to competition')
    } catch {
      toast.error('Could not assign')
    } finally {
      setBusy(false)
    }
  }

  async function remove(link: TeamCompetitionLink) {
    setBusy(true)
    try {
      await teamsApi.removeCompetition(team.id, link.id)
      await load()
      onChange()
    } catch {
      toast.error('Could not remove')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-text-3 font-mono mb-2.5">
        Competitions
      </p>

      {loading ? (
        <div className="h-8 bg-surface-2 rounded-md animate-pulse" />
      ) : links.length === 0 ? (
        <p className="text-sm text-text-3 mb-2">Not assigned to any competition yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {links.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-surface-3 text-text-2 text-[11.5px]"
            >
              <Trophy className="w-3 h-3 opacity-70" />
              {l.competition?.name ?? `Competition ${l.competitionId}`}
              {l.source !== 'manual' && (
                <span className="text-[9px] font-mono text-text-3 uppercase">· {l.source}</span>
              )}
              {canEdit && (
                <button
                  onClick={() => remove(l)}
                  disabled={busy}
                  className="ml-0.5 rounded-full hover:bg-danger-bg hover:text-danger p-0.5"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && assignable.length > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <select
            value={addId}
            onChange={(e) => setAddId(e.target.value ? Number(e.target.value) : '')}
            className="flex-1 bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
          >
            <option value="">Assign to competition…</option>
            {assignable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={add} disabled={!addId || busy}>
            Assign
          </Button>
        </div>
      )}
    </div>
  )
}

/* ---------------- Add team modal ---------------- */

function AddTeamModal({
  sports,
  competitions,
  defaultSportId,
  defaultCompetitionId,
  onClose,
  onCreated,
}: {
  sports: Sport[]
  competitions: Competition[]
  defaultSportId: number | null
  defaultCompetitionId: number | null
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
  const [competitionId, setCompetitionId] = useState<number | ''>(defaultCompetitionId ?? '')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const assignable = competitions.filter((c) => form.sportId == null || c.sportId === form.sportId)

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
      if (competitionId) {
        try {
          await teamsApi.addCompetition(team.id, Number(competitionId))
        } catch {
          /* team created; membership is best-effort */
        }
      }
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Sport</label>
            <select
              className={input}
              value={form.sportId ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null
                setForm({ ...form, sportId: v })
                setCompetitionId('')
              }}
            >
              <option value="">— none —</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Competition</label>
            <select
              className={input}
              value={competitionId}
              onChange={(e) => setCompetitionId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— optional —</option>
              {assignable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
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
