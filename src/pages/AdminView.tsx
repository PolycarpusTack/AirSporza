import { useState, useEffect } from 'react'
import { Users, Database, Activity, RefreshCw } from 'lucide-react'
import type { DashboardWidget, Sport, Competition, Encoder } from '../data/types'
import { FieldConfigurator } from '../components/admin/FieldConfigurator'
import { PublishPanel } from '../components/admin/PublishPanel'
import { OrgConfigPanel } from '../components/admin/OrgConfigPanel'
import { CrewRosterPanel } from '../components/admin/CrewRosterPanel'
import { CrewTemplatesPanel } from '../components/admin/CrewTemplatesPanel'
import { AuditLogViewer } from '../components/admin/AuditLogViewer'
import { sportsApi, competitionsApi, encodersApi, importsApi, usersApi, type UserRecord } from '../services'
import { settingsApi, type AdminStats } from '../services/settings'
import { auditApi, type AuditEntry } from '../services/audit'
import { Badge } from '../components/ui'
import { Toggle } from '../components/ui/Toggle'

interface AdminViewProps {
  widgets: DashboardWidget[]
  activeTab?: AdminTab
  onTabChange?: (tab: AdminTab) => void
}

export type AdminTab = 'fields' | 'sports' | 'competitions' | 'encoders' | 'csv' | 'publish' | 'org' | 'crew-roster' | 'crew-templates' | 'audit-log'

interface AdminGroup {
  label: string
  items: { id: AdminTab; label: string }[]
}

// ── Sports Tab ───────────────────────────────────────────────────────────────

function SportsTab({ sports, setSports }: {
  sports: (Sport & { _count?: { competitions: number; events: number } })[]
  setSports: React.Dispatch<React.SetStateAction<(Sport & { _count?: { competitions: number; events: number } })[]>>
}) {
  const [showForm, setShowForm] = useState(false)
  const [editSport, setEditSport] = useState<Sport | null>(null)
  const [form, setForm] = useState({ name: '', icon: '', federation: '' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

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
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    await sportsApi.delete(id).catch(() => {})
    setSports(prev => prev.filter(s => s.id !== id))
    setConfirmDelete(null)
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
                    {confirmDelete === s.id ? (
                      <>
                        {(s._count?.competitions ?? 0) > 0 && <span className="text-xs text-warning">Has competitions</span>}
                        <button onClick={() => handleDelete(s.id)} className="btn btn-sm text-danger border border-danger/30 bg-danger/10 hover:bg-danger/20">Delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="btn btn-s btn-sm">Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(s.id)} className="text-xs text-danger hover:underline">Delete</button>
                    )}
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
    </div>
  )
}

// ── Competitions Tab ─────────────────────────────────────────────────────────

function CompetitionsTab({ sports }: { sports: Sport[] }) {
  const [competitions, setCompetitions] = useState<(Competition & { sport: Sport; _count?: { events: number } })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ sportId: 0, name: '', season: '', matches: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    competitionsApi.list().then(setCompetitions).catch(() => {}).finally(() => setLoading(false))
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
    } catch { /* ignore */ } finally {
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

// ── Encoders Tab ─────────────────────────────────────────────────────────────

function EncodersTab() {
  const [encoders, setEncoders] = useState<Encoder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editEncoder, setEditEncoder] = useState<Encoder | null>(null)
  const [form, setForm] = useState({ name: '', location: '', notes: '', isActive: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    encodersApi.list().then(setEncoders).catch(() => {}).finally(() => setLoading(false))
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
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (enc: Encoder) => {
    const updated = await encodersApi.update(enc.id, { isActive: !enc.isActive }).catch(() => null)
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

// ── CSV Import Tab — 3-stage flow ─────────────────────────────────────────────

type ImportStage = 'upload' | 'confirm' | 'result'
type ImportResult = { inserted: number; skipped: number; errors?: { row: number; message: string }[] }

const IMPORT_STAGES: { id: ImportStage; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'result', label: 'Result' },
]

function CsvImportTab({ sports }: { sports: Sport[] }) {
  const [competitions, setCompetitions] = useState<(Competition & { sport: Sport })[]>([])
  const [stage, setStage] = useState<ImportStage>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [sportId, setSportId] = useState<number>(0)
  const [competitionId, setCompetitionId] = useState<number>(0)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    competitionsApi.list().then(setCompetitions).catch(() => {})
  }, [])

  const filteredComps = sportId
    ? competitions.filter(c => c.sport?.id === sportId || c.sportId === sportId)
    : competitions

  const canProceed = !!file && sportId > 0 && competitionId > 0

  const reset = () => {
    setStage('upload')
    setFile(null)
    setSportId(0)
    setCompetitionId(0)
    setResult(null)
    setUploadError(null)
  }

  const handleConfirm = async () => {
    if (!file || !sportId || !competitionId) return
    setUploading(true)
    setUploadError(null)
    try {
      const res = await importsApi.uploadCsv(file, sportId, competitionId)
      setResult(res)
      setStage('result')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const currentIdx = IMPORT_STAGES.findIndex(s => s.id === stage)

  return (
    <div className="max-w-lg space-y-6">
      {/* Stage indicator */}
      <div className="flex items-center gap-2">
        {IMPORT_STAGES.map((s, i) => {
          const isActive = stage === s.id
          const isDone = i < currentIdx
          return (
            <div key={s.id} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-border" />}
              <div className={`flex items-center gap-1.5 text-sm font-medium ${
                isActive ? 'text-primary' : isDone ? 'text-success' : 'text-muted'
              }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono ${
                  isActive ? 'bg-primary text-white' : isDone ? 'bg-success text-white' : 'bg-surface-2 text-muted'
                }`}>
                  {isDone ? '✓' : i + 1}
                </span>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {uploadError && (
        <div className="rounded-md bg-danger/10 border border-danger/25 px-4 py-3 text-sm text-danger">
          {uploadError}
        </div>
      )}

      {/* Stage 1: Upload */}
      {stage === 'upload' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">CSV File</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-md p-6 cursor-pointer hover:border-primary transition">
              <span className="text-2xl mb-1">📁</span>
              <span className="text-sm text-muted">{file ? file.name : 'Click to choose CSV file'}</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Sport</label>
            <select
              className="inp w-full"
              value={sportId}
              onChange={e => { setSportId(Number(e.target.value)); setCompetitionId(0) }}
            >
              <option value={0} disabled>Select sport…</option>
              {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Competition</label>
            <select
              className="inp w-full"
              value={competitionId}
              onChange={e => setCompetitionId(Number(e.target.value))}
            >
              <option value={0} disabled>Select competition…</option>
              {filteredComps.map(c => <option key={c.id} value={c.id}>{c.name} ({c.season})</option>)}
            </select>
          </div>
          <button
            onClick={() => setStage('confirm')}
            className="btn btn-p"
            disabled={!canProceed}
          >
            Continue →
          </button>
        </div>
      )}

      {/* Stage 2: Confirm */}
      {stage === 'confirm' && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-2 px-4 py-4 text-sm space-y-2">
            <div><span className="text-muted">File:</span> <span className="font-mono font-medium">{file?.name}</span></div>
            <div><span className="text-muted">Sport:</span> <span className="font-medium">{sports.find(s => s.id === sportId)?.icon} {sports.find(s => s.id === sportId)?.name}</span></div>
            <div><span className="text-muted">Competition:</span> <span className="font-medium">{filteredComps.find(c => c.id === competitionId)?.name}</span></div>
          </div>
          <p className="text-sm text-text-2">
            All rows will be imported. Existing records matching the same competition, date, and participants will be updated.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setStage('upload')} className="btn btn-s btn-sm">← Back</button>
            <button
              onClick={handleConfirm}
              disabled={uploading}
              className="btn btn-p btn-sm"
            >
              {uploading ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>
        </div>
      )}

      {/* Stage 3: Result */}
      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-lg bg-success/10 border border-success/25">
              <p className="text-2xl font-bold text-success font-mono">{result.inserted}</p>
              <p className="text-sm text-success">Inserted</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/25">
              <p className="text-2xl font-bold text-warning font-mono">{result.skipped}</p>
              <p className="text-sm text-warning">Skipped</p>
            </div>
            <div className="p-4 rounded-lg bg-danger/10 border border-danger/25">
              <p className="text-2xl font-bold text-danger font-mono">{result.errors?.length ?? 0}</p>
              <p className="text-sm text-danger">Errors</p>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <details className="border border-danger/25 rounded-md">
              <summary className="px-4 py-2 cursor-pointer text-sm font-semibold text-danger">
                {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
              </summary>
              <div className="px-4 pb-3 space-y-1">
                {result.errors.map((err, i) => (
                  <div key={i} className="text-xs text-danger font-mono">Row {err.row}: {err.message}</div>
                ))}
              </div>
            </details>
          )}
          <button onClick={reset} className="btn btn-p btn-sm">Import another file</button>
        </div>
      )}
    </div>
  )
}

// ── AdminView ────────────────────────────────────────────────────────────────

export function AdminView({ widgets, activeTab: externalTab, onTabChange }: AdminViewProps) {
  const [internalTab, setInternalTab] = useState<AdminTab>('org')
  const activeTab = externalTab ?? internalTab
  const setActiveTab = (tab: AdminTab) => { if (onTabChange) onTabChange(tab); else setInternalTab(tab) }
  const isControlled = externalTab !== undefined
  const [sports, setSports] = useState<(Sport & { _count?: { competitions: number; events: number } })[]>([])

  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [userList, setUserList] = useState<UserRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)

  const visWidgets = widgets.filter(w => w.visible).sort((a, b) => a.order - b.order)
  const showStatus = visWidgets.some(w => w.id === 'systemStatus')
  const showUsers = visWidgets.some(w => w.id === 'userManagement')
  const showAudit = visWidgets.some(w => w.id === 'auditLog')

  useEffect(() => {
    sportsApi.list().then(setSports).catch(() => {})
    settingsApi.getStats().then(setAdminStats).catch(() => {})
    usersApi.list().then(setUserList).catch(() => {})
    auditApi.listAll({ limit: 20 }).then(r => {
      setAuditLogs(r.logs)
      setAuditTotal(r.total)
    }).catch(() => {})
  }, [])

  const sidebarGroups: AdminGroup[] = [
    {
      label: 'Workspace',
      items: [
        { id: 'org', label: 'Organisation' },
        { id: 'sports', label: 'Sports' },
        { id: 'competitions', label: 'Competitions' },
      ],
    },
    {
      label: 'Planning',
      items: [
        { id: 'fields', label: 'Field Configuration' },
        { id: 'crew-roster', label: 'Crew Roster' },
        { id: 'crew-templates', label: 'Crew Templates' },
        { id: 'encoders', label: 'Encoders' },
      ],
    },
    {
      label: 'Data',
      items: [
        { id: 'csv', label: 'CSV Import' },
        { id: 'publish', label: 'Publish & Webhooks' },
        { id: 'audit-log', label: 'Audit Log' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      {showStatus && adminStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
          <div className="card p-4">
            <Users className="w-5 h-5 text-primary mb-2" />
            <div className="statv">{adminStats.users}</div>
            <div className="statl">Users</div>
          </div>
          <div className="card p-4">
            <Activity className="w-5 h-5 text-success mb-2" />
            <div className="statv">{adminStats.events}</div>
            <div className="statl">Events</div>
          </div>
          <div className="card p-4">
            <Database className="w-5 h-5 text-info mb-2" />
            <div className="statv">{adminStats.techPlans}</div>
            <div className="statl">Tech Plans</div>
          </div>
          <div className="card p-4">
            <RefreshCw className="w-5 h-5 text-warning mb-2" />
            <div className="statv">{adminStats.crewMembers}</div>
            <div className="statl">Crew Members</div>
          </div>
        </div>
      )}

      {showUsers && (
        <div className="card animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h4 className="font-bold">User Management</h4>
            <span className="text-xs text-muted">{userList.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Events</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {userList.map(u => (
                  <tr key={u.id} className="hover:bg-surface-2 transition">
                    <td className="px-4 py-3 font-medium">{u.name || '\u2014'}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        className="inp text-xs px-2 py-1"
                        value={u.role}
                        onChange={async (e) => {
                          const updated = await usersApi.updateRole(u.id, e.target.value)
                          setUserList(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x))
                        }}
                      >
                        <option value="planner">planner</option>
                        <option value="sports">sports</option>
                        <option value="contracts">contracts</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted">{u._count.events}</td>
                    <td className="px-4 py-3 text-right">
                      {u._count.events === 0 && u._count.techPlans === 0 && (
                        <button
                          className="text-xs text-danger hover:underline"
                          onClick={async () => {
                            await usersApi.delete(u.id)
                            setUserList(prev => prev.filter(x => x.id !== u.id))
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAudit && (
        <div className="card animate-fade-in">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h4 className="font-bold">Audit Log</h4>
            <span className="text-xs text-muted">{auditTotal} total entries</span>
          </div>
          <div className="divide-y divide-border">
            {auditLogs.length === 0 && (
              <div className="px-4 py-6 text-sm text-muted text-center">No audit entries yet.</div>
            )}
            {auditLogs.map(log => (
              <div key={log.id} className="px-4 py-3 hover:bg-surface-2 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{log.action}</span>
                    <span className="text-text-3 mx-2">&mdash;</span>
                    <span className="text-text-2">{log.entityType} #{log.entityId}</span>
                  </div>
                  <span className="text-xs text-text-3">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                {log.userId && <div className="text-xs text-text-3 mt-1">by {log.userId}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={isControlled ? '' : 'card animate-fade-in'}>
        {!isControlled ? (
          <div className="flex min-h-[500px]">
            {/* Sidebar */}
            <div className="w-48 flex-shrink-0 border-r border-border bg-surface-2/50 p-3 space-y-4">
              {sidebarGroups.map(group => (
                <div key={group.label}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted px-2 mb-1">
                    {group.label}
                  </div>
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm transition ${
                        activeTab === item.id
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-2 hover:bg-surface-2 hover:text-text'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-auto">
              {activeTab === 'fields' && <FieldConfigurator />}
              {activeTab === 'sports' && <SportsTab sports={sports} setSports={setSports} />}
              {activeTab === 'competitions' && <CompetitionsTab sports={sports} />}
              {activeTab === 'encoders' && <EncodersTab />}
              {activeTab === 'csv' && <CsvImportTab sports={sports} />}
              {activeTab === 'publish' && <PublishPanel />}
              {activeTab === 'org' && <OrgConfigPanel />}
              {activeTab === 'crew-roster' && <CrewRosterPanel />}
              {activeTab === 'crew-templates' && <CrewTemplatesPanel />}
              {activeTab === 'audit-log' && <AuditLogViewer />}
            </div>
          </div>
        ) : (
          <div>
            {activeTab === 'fields' && <FieldConfigurator />}
            {activeTab === 'sports' && <SportsTab sports={sports} setSports={setSports} />}
            {activeTab === 'competitions' && <CompetitionsTab sports={sports} />}
            {activeTab === 'encoders' && <EncodersTab />}
            {activeTab === 'csv' && <CsvImportTab sports={sports} />}
            {activeTab === 'publish' && <PublishPanel />}
            {activeTab === 'org' && <OrgConfigPanel />}
            {activeTab === 'crew-roster' && <CrewRosterPanel />}
            {activeTab === 'crew-templates' && <CrewTemplatesPanel />}
            {activeTab === 'audit-log' && <AuditLogViewer />}
          </div>
        )}
      </div>
    </div>
  )
}
