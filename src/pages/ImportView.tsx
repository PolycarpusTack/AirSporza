import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { importsApi } from '../services'
import type {
  ImportSource,
  ImportJob,
  ImportMergeCandidate,
  ImportDeadLetter,
  ImportMetrics,
  ImportAliasRecord,
  FieldProvenanceRecord,
} from '../services/imports'
import { Toggle } from '../components/ui/Toggle'

type ImportTab = 'sources' | 'jobs' | 'review' | 'dead-letters' | 'aliases' | 'provenance'

function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

function readJobStat(job: ImportJob, key: string): number {
  const v = job.statsJson[key]
  return typeof v === 'number' ? v : 0
}

// ── Sources ───────────────────────────────────────────────────────────────────

function SourcesTab({ metrics }: { metrics: ImportMetrics | null }) {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ priority: 0, rateLimitPerMinute: '', rateLimitPerDay: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    importsApi.listSources().then(setSources).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleToggle = async (src: ImportSource) => {
    const updated = await importsApi.updateSource(src.id, { isEnabled: !src.isEnabled }).catch(() => null)
    if (updated) setSources(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  const openEdit = (src: ImportSource) => {
    setEditing(src.id)
    setEditForm({
      priority: src.priority,
      rateLimitPerMinute: src.rateLimitPerMinute != null ? String(src.rateLimitPerMinute) : '',
      rateLimitPerDay: src.rateLimitPerDay != null ? String(src.rateLimitPerDay) : '',
    })
  }

  const handleSave = async (src: ImportSource) => {
    setSaving(true)
    const updated = await importsApi.updateSource(src.id, {
      priority: Number(editForm.priority),
      rateLimitPerMinute: editForm.rateLimitPerMinute !== '' ? Number(editForm.rateLimitPerMinute) : null,
      rateLimitPerDay: editForm.rateLimitPerDay !== '' ? Number(editForm.rateLimitPerDay) : null,
    }).catch(() => null)
    if (updated) setSources(prev => prev.map(s => s.id === updated.id ? updated : s))
    setSaving(false)
    setEditing(null)
  }

  if (loading) return <div className="card p-8 text-center text-text-3 text-sm animate-pulse">Loading sources…</div>

  return (
    <div className="space-y-3">
      {sources.map(src => {
        const srcMetrics = metrics?.sources.find(m => m.id === src.id)
        const isEditing = editing === src.id
        return (
          <div key={src.id} className="card overflow-hidden">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono font-bold text-sm">{src.code}</span>
                  <span className="text-text-2 text-sm">{src.name}</span>
                  <span className="text-xs text-text-3 font-mono">{src.kind}</span>
                  <span className={`text-xs rounded-sm px-1.5 py-0.5 font-mono uppercase font-semibold ${
                    src.configStatus.status === 'ready'
                      ? 'bg-success/10 text-success'
                      : src.configStatus.status === 'missing_config'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger'
                  }`}>
                    {src.configStatus.status.replace(/_/g, ' ')}
                  </span>
                  {!src.capabilities.hasAdapter && (
                    <span className="text-xs rounded-sm px-1.5 py-0.5 bg-surface-2 text-text-3 font-mono">no adapter</span>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2 mb-2">
                  <span>Priority: <span className="font-mono font-medium">{src.priority}</span></span>
                  <span>Last fetch: <span className="font-mono">{fmtAgo(src.lastFetchAt)}</span></span>
                  <span>Jobs: <span className="font-mono font-medium">{src.stats.jobs}</span></span>
                  <span>Records: <span className="font-mono font-medium">{src.stats.records}</span></span>
                  {srcMetrics && (
                    <>
                      <span>Link coverage: <span className="font-mono font-medium">{srcMetrics.quality.linkCoverage}%</span></span>
                      <span className={srcMetrics.quality.deadLetterRate > 0 ? 'text-warning' : ''}>
                        Dead letter rate: <span className="font-mono font-medium">{srcMetrics.quality.deadLetterRate}%</span>
                      </span>
                    </>
                  )}
                  {src.stats.deadLetters > 0 && (
                    <span className="text-danger">Dead letters: <span className="font-mono font-medium">{src.stats.deadLetters}</span></span>
                  )}
                </div>

                {/* Scopes */}
                {src.capabilities.supportedScopes.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {src.capabilities.supportedScopes.map(scope => (
                      <span key={scope} className="text-[10px] font-mono uppercase tracking-wide rounded-sm border border-border bg-surface-2 px-1.5 py-0.5">
                        {scope}
                      </span>
                    ))}
                  </div>
                )}
                {src.capabilities.note && (
                  <div className="text-xs text-text-3 mt-1">{src.capabilities.note}</div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                <button
                  onClick={() => isEditing ? setEditing(null) : openEdit(src)}
                  className="btn btn-g btn-sm"
                >
                  {isEditing ? 'Cancel' : 'Configure'}
                </button>
                <Toggle active={src.isEnabled} onChange={() => handleToggle(src)} />
              </div>
            </div>

            {/* Config panel */}
            {isEditing && (
              <div className="border-t border-border bg-surface-2 px-4 py-4 space-y-4 animate-fade-in">
                {/* Missing config warning */}
                {src.configStatus.missingConfig.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
                    <div className="font-semibold text-warning mb-1">⚠ Missing server configuration</div>
                    <p className="text-text-2 text-xs mb-1.5">
                      Set these environment variables on the backend server to activate this source:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {src.configStatus.missingConfig.map(key => (
                        <code key={key} className="rounded bg-surface border border-warning/30 px-2 py-0.5 text-xs font-mono text-warning">
                          {key}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {/* Credentials status */}
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${src.hasCredentials ? 'bg-success' : 'bg-warning'}`} />
                  <span className="text-text-2">
                    Credentials: <span className={`font-medium ${src.hasCredentials ? 'text-success' : 'text-warning'}`}>
                      {src.hasCredentials ? 'configured' : 'not configured'}
                    </span>
                  </span>
                </div>

                {/* Rate limit status */}
                <div className="grid grid-cols-2 gap-3 text-xs text-text-2">
                  <div>
                    <div className="font-semibold text-text-2 mb-0.5 uppercase tracking-wide text-[10px]">Minute quota</div>
                    <div className="font-mono">{src.rateLimitStatus.minute.used} used / {src.rateLimitStatus.minute.limit ?? '∞'}</div>
                    {src.rateLimitStatus.minute.resetAt && (
                      <div className="text-text-3">resets {fmtDateTime(src.rateLimitStatus.minute.resetAt)}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-text-2 mb-0.5 uppercase tracking-wide text-[10px]">Day quota</div>
                    <div className="font-mono">{src.rateLimitStatus.day.used} used / {src.rateLimitStatus.day.limit ?? '∞'}</div>
                    {src.rateLimitStatus.day.resetAt && (
                      <div className="text-text-3">resets {fmtDateTime(src.rateLimitStatus.day.resetAt)}</div>
                    )}
                  </div>
                  {src.rateLimitStatus.lastRequestAt && (
                    <div className="col-span-2 text-text-3">Last API request: {fmtDateTime(src.rateLimitStatus.lastRequestAt)}</div>
                  )}
                </div>

                {/* Editable config */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">Priority</label>
                    <input
                      type="number"
                      className="inp w-full"
                      value={editForm.priority}
                      onChange={e => setEditForm(p => ({ ...p, priority: Number(e.target.value) }))}
                      min={0}
                      max={99}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Rate limit / min <span className="text-text-3">(blank = no cap)</span></label>
                    <input
                      type="number"
                      className="inp w-full"
                      value={editForm.rateLimitPerMinute}
                      onChange={e => setEditForm(p => ({ ...p, rateLimitPerMinute: e.target.value }))}
                      min={0}
                      placeholder="No cap"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Rate limit / day <span className="text-text-3">(blank = no cap)</span></label>
                    <input
                      type="number"
                      className="inp w-full"
                      value={editForm.rateLimitPerDay}
                      onChange={e => setEditForm(p => ({ ...p, rateLimitPerDay: e.target.value }))}
                      min={0}
                      placeholder="No cap"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleSave(src)} disabled={saving} className="btn btn-p btn-sm">
                    {saving ? 'Saving…' : 'Save configuration'}
                  </button>
                  <button onClick={() => setEditing(null)} className="btn btn-g btn-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {sources.length === 0 && (
        <div className="card p-8 text-center text-text-3 text-sm">No sources configured</div>
      )}
    </div>
  )
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

const JOB_STATUS: Record<string, string> = {
  queued:    'bg-info/10 text-info',
  running:   'bg-primary/10 text-primary',
  completed: 'bg-success/10 text-success',
  failed:    'bg-danger/10 text-danger',
  partial:   'bg-warning/10 text-warning',
}
const SCOPES = ['sports', 'competitions', 'teams', 'events', 'fixtures', 'live']

function JobsTab() {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [sources, setSources] = useState<ImportSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJob, setNewJob] = useState({ sourceCode: '', entityScope: 'events', mode: 'full' as ImportJob['mode'], note: '' })
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([importsApi.listJobs({ limit: 50 }), importsApi.listSources()])
      .then(([j, s]) => { setJobs(j); setSources(s) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleCancel = async (id: string) => {
    const res = await importsApi.cancelJob(id).catch(() => null)
    if (res) setJobs(prev => prev.map(j => j.id === id ? res.job : j))
  }

  const handleRetry = async (id: string) => {
    const res = await importsApi.retryJob(id).catch(() => null)
    if (res) setJobs(prev => prev.map(j => j.id === id ? res.job : j))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newJob.sourceCode) return
    setCreating(true)
    try {
      const res = await importsApi.createJob({
        sourceCode: newJob.sourceCode,
        entityScope: newJob.entityScope,
        mode: newJob.mode,
        note: newJob.note.trim() || undefined,
      })
      setJobs(prev => [res.job, ...prev])
      setShowNewJob(false)
      setNewJob(p => ({ ...p, note: '' }))
    } catch { /* ignore */ } finally { setCreating(false) }
  }

  if (loading) return <div className="card p-8 text-center text-text-3 text-sm animate-pulse">Loading jobs…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNewJob(!showNewJob)} className="btn btn-p btn-sm">+ Run Job</button>
      </div>

      {showNewJob && (
        <div className="card p-4 animate-fade-in">
          <h4 className="font-bold text-sm mb-3">New Import Job</h4>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-muted mb-1">Source</label>
                <select className="inp" value={newJob.sourceCode} onChange={e => setNewJob(p => ({ ...p, sourceCode: e.target.value }))}>
                  <option value="">Select source…</option>
                  {sources.filter(s => s.isEnabled && s.configStatus.canExecute).map(s => (
                    <option key={s.id} value={s.code}>{s.name}</option>
                  ))}
                  {sources.filter(s => !s.isEnabled || !s.configStatus.canExecute).length > 0 && (
                    <optgroup label="Unavailable">
                      {sources.filter(s => !s.isEnabled || !s.configStatus.canExecute).map(s => (
                        <option key={s.id} value={s.code} disabled>{s.name} ({!s.isEnabled ? 'disabled' : s.configStatus.status})</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Scope</label>
                <select className="inp" value={newJob.entityScope} onChange={e => setNewJob(p => ({ ...p, entityScope: e.target.value }))}>
                  {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Mode</label>
                <select className="inp" value={newJob.mode} onChange={e => setNewJob(p => ({ ...p, mode: e.target.value as ImportJob['mode'] }))}>
                  <option value="full">Full</option>
                  <option value="incremental">Incremental</option>
                  <option value="backfill">Backfill</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Operator note <span className="text-text-3">(optional)</span></label>
              <input
                type="text"
                className="inp w-full"
                value={newJob.note}
                onChange={e => setNewJob(p => ({ ...p, note: e.target.value }))}
                placeholder="Why this sync was triggered…"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!newJob.sourceCode || creating} className="btn btn-p btn-sm">
                {creating ? '…' : 'Start job'}
              </button>
              <button type="button" onClick={() => setShowNewJob(false)} className="btn btn-g btn-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card p-8 text-center text-text-3 text-sm">No jobs yet</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted w-8" />
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Scope / Mode</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Records</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Started</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const open = expanded.has(job.id)
                const processed = readJobStat(job, 'recordsProcessed')
                const created   = readJobStat(job, 'recordsCreated')
                const updated   = readJobStat(job, 'recordsUpdated')
                const skipped   = readJobStat(job, 'recordsSkipped')
                const hasStats  = processed > 0 || created > 0 || updated > 0 || skipped > 0
                return (
                  <>
                    <tr
                      key={job.id}
                      className={`border-b border-border/60 hover:bg-surface-2 transition cursor-pointer ${open ? 'bg-surface-2' : ''}`}
                      onClick={() => toggleExpand(job.id)}
                    >
                      <td className="px-4 py-3 text-center">
                        {open
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">{job.source.code}</td>
                      <td className="px-4 py-3 text-muted text-xs font-mono">
                        <span className="uppercase">{job.entityScope}</span>
                        <span className="mx-1 text-text-3">/</span>
                        {job.mode}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold rounded-sm px-1.5 py-0.5 ${JOB_STATUS[job.status] ?? JOB_STATUS.queued}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {hasStats ? processed : (job._count?.records ?? '—')}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{fmtAgo(job.startedAt ?? job.createdAt)}</td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        {(job.status === 'queued' || job.status === 'running') && (
                          <button onClick={() => handleCancel(job.id)} className="btn btn-g btn-sm text-danger">Cancel</button>
                        )}
                        {(job.status === 'failed' || job.status === 'partial') && (
                          <button onClick={() => handleRetry(job.id)} className="btn btn-g btn-sm">Retry</button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${job.id}-detail`} className="border-b border-border/60 bg-surface-2/50">
                        <td colSpan={7} className="px-5 py-3 text-xs space-y-2">
                          {/* Record stats */}
                          {hasStats && (
                            <div className="flex gap-4 font-mono">
                              <span><span className="text-text-2">processed</span> {processed}</span>
                              <span className="text-success"><span className="text-text-2">created</span> {created}</span>
                              <span className="text-primary"><span className="text-text-2">updated</span> {updated}</span>
                              <span className="text-text-3"><span className="text-text-2">skipped</span> {skipped}</span>
                            </div>
                          )}
                          {/* Timing */}
                          <div className="text-text-3">
                            {job.startedAt && <span>Started {fmtDateTime(job.startedAt)}</span>}
                            {job.finishedAt && <span> · Finished {fmtDateTime(job.finishedAt)}</span>}
                          </div>
                          {/* Error log */}
                          {job.errorLog && (
                            <div className="rounded-sm border border-danger/25 bg-danger/10 px-3 py-2 text-danger font-mono whitespace-pre-wrap">
                              {job.errorLog}
                            </div>
                          )}
                          {/* Cursor */}
                          {job.cursor && (
                            <div className="text-text-3">Cursor: <span className="font-mono">{job.cursor}</span></div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Review (Merge Candidates) ─────────────────────────────────────────────────

function ReviewTab() {
  const [candidates, setCandidates] = useState<ImportMergeCandidate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    importsApi.listMergeCandidates({ status: 'pending' })
      .then(setCandidates).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleApprove = async (c: ImportMergeCandidate) => {
    const res = await importsApi.approveMergeCandidate(c.id, c.suggestedEntityId).catch(() => null)
    if (res) setCandidates(prev => prev.filter(x => x.id !== c.id))
  }

  const handleCreateNew = async (id: string) => {
    const res = await importsApi.createMergeCandidateEntity(id).catch(() => null)
    if (res) setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const handleIgnore = async (id: string) => {
    const res = await importsApi.ignoreMergeCandidate(id).catch(() => null)
    if (res) setCandidates(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return <div className="card p-8 text-center text-text-3 text-sm animate-pulse">Loading review queue…</div>

  if (candidates.length === 0) return (
    <div className="card p-10 text-center text-text-3 text-sm">
      <div className="text-3xl mb-2">✅</div>
      Review queue is empty — no pending merge candidates
    </div>
  )

  return (
    <div className="space-y-3">
      {candidates.map(c => (
        <div key={c.id} className="card p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-xs bg-surface-2 border border-border rounded-sm px-1.5 py-0.5 uppercase">{c.entityType}</span>
                <span className="text-xs text-text-2">from <span className="font-mono">{c.importRecord.source.code}</span></span>
                <span className={`text-xs rounded-sm px-1.5 py-0.5 font-semibold ${
                  c.confidence >= 0.8 ? 'bg-success/10 text-success' :
                  c.confidence >= 0.5 ? 'bg-warning/10 text-warning' :
                  'bg-danger/10 text-danger'
                }`}>
                  {Math.round(c.confidence * 100)}% match
                </span>
                {c.suggestedEntityId && (
                  <span className="text-xs text-text-3 font-mono">→ {c.suggestedEntityId}</span>
                )}
              </div>
              <div className="text-sm font-medium text-text truncate mb-1">
                {c.importRecord.normalizedJson
                  ? JSON.stringify(c.importRecord.normalizedJson).slice(0, 120)
                  : c.importRecord.sourceRecordId}
              </div>
              {c.reasonCodes.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {c.reasonCodes.map(r => (
                    <span key={r} className="text-[10px] font-mono uppercase tracking-wide rounded-sm border border-border bg-surface-2 px-1.5 py-0.5">{r}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={() => handleApprove(c)}
                disabled={!c.suggestedEntityId}
                title={!c.suggestedEntityId ? 'No suggested entity to merge with' : undefined}
                className="btn btn-p btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Approve Merge
              </button>
              <button onClick={() => handleCreateNew(c.id)} className="btn btn-g btn-sm">Create New</button>
              <button onClick={() => handleIgnore(c.id)} className="btn btn-g btn-sm">Ignore</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Dead Letters ──────────────────────────────────────────────────────────────

function DeadLettersTab() {
  const [letters, setLetters] = useState<ImportDeadLetter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    importsApi.listDeadLetters({ resolved: 'false' })
      .then(setLetters).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleReplay = async (id: string) => {
    const res = await importsApi.replayDeadLetter(id).catch(() => null)
    if (res) setLetters(prev => prev.filter(l => l.id !== id))
  }

  if (loading) return <div className="card p-8 text-center text-text-3 text-sm animate-pulse">Loading dead letters…</div>

  if (letters.length === 0) return (
    <div className="card p-10 text-center text-text-3 text-sm">
      <div className="text-3xl mb-2">✅</div>
      No unresolved dead letters
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Source</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Error Type</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Message</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Retries</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Last Retry</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {letters.map(l => (
            <tr key={l.id} className="hover:bg-surface-2 transition">
              <td className="px-4 py-3 font-mono text-xs">{l.source.code}</td>
              <td className="px-4 py-3 text-xs font-mono text-danger">{l.errorType}</td>
              <td className="px-4 py-3 text-xs text-text-2 max-w-xs truncate" title={l.errorMessage}>{l.errorMessage}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted text-center">{l.retryCount}</td>
              <td className="px-4 py-3 text-xs text-muted">{fmtAgo(l.lastRetryAt)}</td>
              <td className="px-4 py-3 text-right">
                {!l.resolvedAt && l.job && (
                  <button onClick={() => handleReplay(l.id)} className="btn btn-g btn-sm">Replay</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Aliases ───────────────────────────────────────────────────────────────────

type AliasType = 'team' | 'competition' | 'venue'

function AliasesTab({ sources }: { sources: ImportSource[] }) {
  const [aliasType, setAliasType] = useState<AliasType>('team')
  const [aliases, setAliases] = useState<ImportAliasRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ canonicalId: '', alias: '', sourceId: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAliases = (type: AliasType) => {
    setLoading(true)
    importsApi.listAliases({ type, limit: 50 }).then(setAliases).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadAliases(aliasType) }, [aliasType])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.canonicalId.trim() || !form.alias.trim()) { setError('Canonical ID and alias are required.'); return }
    setCreating(true)
    setError(null)
    try {
      await importsApi.createAlias(aliasType, {
        canonicalId: form.canonicalId.trim(),
        alias: form.alias.trim(),
        sourceId: form.sourceId.trim() || null,
      })
      setForm({ canonicalId: '', alias: '', sourceId: '' })
      loadAliases(aliasType)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alias')
    } finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    await importsApi.deleteAlias(aliasType, id).catch(() => {})
    setAliases(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div className="flex gap-2">
        {(['team', 'competition', 'venue'] as AliasType[]).map(t => (
          <button
            key={t}
            onClick={() => setAliasType(t)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide transition border ${
              aliasType === t ? 'bg-primary text-primary-fg border-primary' : 'border-border text-muted hover:border-primary hover:text-primary'
            }`}
          >
            {t}s
          </button>
        ))}
      </div>

      {/* Create form */}
      <div className="card p-4">
        <h4 className="font-bold text-sm mb-3">Add {aliasType} alias</h4>
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <div className="text-xs text-danger">{error}</div>}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Canonical ID</label>
              <input
                className="inp w-full"
                value={form.canonicalId}
                onChange={e => setForm(p => ({ ...p, canonicalId: e.target.value }))}
                placeholder={`${aliasType} entity ID`}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Alias value</label>
              <input
                className="inp w-full"
                value={form.alias}
                onChange={e => setForm(p => ({ ...p, alias: e.target.value }))}
                placeholder={`External name / alias`}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Source <span className="text-text-3">(optional)</span></label>
              <select className="inp w-full" value={form.sourceId} onChange={e => setForm(p => ({ ...p, sourceId: e.target.value }))}>
                <option value="">All sources</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={creating || !form.canonicalId || !form.alias} className="btn btn-p btn-sm">
            {creating ? 'Adding…' : 'Add alias'}
          </button>
        </form>
      </div>

      {/* Alias list */}
      {loading ? (
        <div className="card p-6 text-center text-text-3 text-sm animate-pulse">Loading aliases…</div>
      ) : aliases.length === 0 ? (
        <div className="card p-6 text-center text-text-3 text-sm">No {aliasType} aliases yet</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Alias</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Canonical</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Source</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {aliases.map(a => {
                const canonical = a.canonicalTeam?.primaryName
                  || a.canonicalCompetition?.primaryName
                  || a.canonicalVenue?.primaryName
                  || '—'
                return (
                  <tr key={a.id} className="hover:bg-surface-2 transition">
                    <td className="px-4 py-3 font-mono text-sm">{a.alias}</td>
                    <td className="px-4 py-3 text-text-2">{canonical}</td>
                    <td className="px-4 py-3 text-text-3 text-xs font-mono">{a.source?.code ?? 'all'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(a.id)} className="btn btn-g btn-sm text-danger">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Provenance ────────────────────────────────────────────────────────────────

function ProvenanceTab() {
  const [entityType, setEntityType] = useState<'event' | 'team' | 'competition'>('event')
  const [entityId, setEntityId] = useState('')
  const [records, setRecords] = useState<FieldProvenanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!entityId.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await importsApi.getProvenance(entityType, entityId.trim())
      setRecords(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provenance')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <h4 className="font-bold text-sm mb-3">Field Provenance Inspector</h4>
        <p className="text-xs text-text-2 mb-3">Look up which import source last wrote each field of an entity.</p>
        <form onSubmit={handleLoad} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-muted mb-1">Entity type</label>
            <select className="inp" value={entityType} onChange={e => setEntityType(e.target.value as typeof entityType)}>
              <option value="event">Event</option>
              <option value="team">Team</option>
              <option value="competition">Competition</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Entity ID</label>
            <input
              className="inp"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <button type="submit" disabled={!entityId.trim() || loading} className="btn btn-p btn-sm">
            {loading ? 'Loading…' : 'Inspect'}
          </button>
        </form>
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      </div>

      {records.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-2 text-xs font-bold uppercase tracking-wider text-muted">
            {records.length} field{records.length !== 1 ? 's' : ''} — {entityType} #{entityId}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Field</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Source</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Source record</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-surface-2 transition">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{r.fieldName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.source?.code ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-3">{r.sourceRecordId}</td>
                  <td className="px-4 py-3 text-xs text-muted">{fmtDateTime(r.importedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && records.length === 0 && entityId && (
        <div className="card p-6 text-center text-text-3 text-sm">No provenance records found</div>
      )}
    </div>
  )
}

// ── ImportView ────────────────────────────────────────────────────────────────

export function ImportView() {
  const [activeTab, setActiveTab] = useState<ImportTab>('sources')
  const [metrics, setMetrics] = useState<ImportMetrics | null>(null)
  const [sources, setSources] = useState<ImportSource[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const loadMetrics = () => {
    importsApi.metrics().then(setMetrics).catch(() => {})
    importsApi.listSources().then(setSources).catch(() => {})
  }

  useEffect(() => { loadMetrics() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    loadMetrics()
    setTimeout(() => setRefreshing(false), 600)
  }

  const tabs: { id: ImportTab; label: string; badge?: number }[] = [
    { id: 'sources',     label: 'Sources',      badge: metrics?.totals.enabledSources },
    { id: 'jobs',        label: 'Jobs',         badge: metrics?.totals.pendingJobs },
    { id: 'review',      label: 'Review',       badge: metrics?.totals.pendingReviews },
    { id: 'dead-letters',label: 'Dead Letters', badge: metrics?.totals.unresolvedDeadLetters },
    { id: 'aliases',     label: 'Aliases' },
    { id: 'provenance',  label: 'Provenance' },
  ]

  return (
    <div className="space-y-5">
      {/* Metrics header */}
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1 animate-fade-in">
          {[
            { label: 'Active Sources',  value: metrics ? `${metrics.totals.enabledSources}/${metrics.totals.sources}` : '—', warn: false },
            { label: 'Completed (24h)', value: metrics?.totals.completedJobs24h ?? '—', warn: false },
            { label: 'Pending Review',  value: metrics?.totals.pendingReviews ?? '—',  warn: (metrics?.totals.pendingReviews ?? 0) > 0 },
            { label: 'Dead Letters',    value: metrics?.totals.unresolvedDeadLetters ?? '—', warn: (metrics?.totals.unresolvedDeadLetters ?? 0) > 0 },
            { label: 'Link Coverage',   value: metrics ? `${metrics.quality.overallLinkCoverage}%` : '—', warn: false },
            { label: 'Dead Letter Rate',value: metrics ? `${metrics.quality.deadLetterRate}%` : '—', warn: (metrics?.quality.deadLetterRate ?? 0) > 0 },
          ].map(m => (
            <div key={m.label} className="card p-3">
              <div className={`text-xl font-bold font-head leading-none ${m.warn ? 'text-warning' : 'text-text'}`}>{m.value}</div>
              <div className="text-[10px] text-muted mt-1 uppercase tracking-wide">{m.label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          className="btn btn-g btn-sm flex-shrink-0 mt-0.5"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border flex-wrap gap-y-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-2 hover:text-text'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`text-xs rounded-full px-1.5 font-mono leading-none ${
                activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-muted'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'sources'      && <SourcesTab metrics={metrics} />}
      {activeTab === 'jobs'         && <JobsTab />}
      {activeTab === 'review'       && <ReviewTab />}
      {activeTab === 'dead-letters' && <DeadLettersTab />}
      {activeTab === 'aliases'      && <AliasesTab sources={sources} />}
      {activeTab === 'provenance'   && <ProvenanceTab />}
    </div>
  )
}
