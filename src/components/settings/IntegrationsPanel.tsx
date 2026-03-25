import { useEffect, useMemo, useState } from 'react'
import { Badge, Btn } from '../ui'
import { useToast } from '../Toast'
import { handleApiError } from '../../utils/apiError'
import {
  importsApi,
  type FieldProvenanceRecord,
  type ImportAliasRecord,
  type ImportDeadLetter,
  type ImportJob,
  type ImportMergeCandidate,
  type ImportMetrics,
  type ImportSource,
} from '../../services'

type ManualSyncScope = 'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'

interface IntegrationsPanelProps {
  userRole?: string
  defaultScope?: ManualSyncScope
}

const scopeOptions: Array<{ value: ManualSyncScope; label: string }> = [
  { value: 'events', label: 'Events' },
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'live', label: 'Live Updates' },
  { value: 'competitions', label: 'Competitions' },
  { value: 'teams', label: 'Teams' },
  { value: 'sports', label: 'Sports' },
]

const formatDateTime = (value: string | null) => {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-BE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatQuota = (used: number, limit: number | null) => {
  if (limit == null) return `${used} used / no cap`
  return `${used}/${limit} used`
}

const getPreferredSource = (sources: ImportSource[], scope: ManualSyncScope) => {
  const enabled = sources.filter(source => source.isEnabled)
  const candidates = enabled.length > 0 ? enabled : sources
  if (candidates.length === 0) return ''

  if (scope === 'live') {
    return candidates.find(source => source.capabilities.supportedScopes.includes('live'))?.code || candidates[0].code
  }

  if (scope === 'sports') {
    return candidates.find(source => source.capabilities.supportedScopes.includes('sports'))?.code || candidates[0].code
  }

  return candidates.find(source => source.capabilities.supportedScopes.includes(scope))?.code || candidates[0].code
}

const getJobBadge = (status: ImportJob['status']) => {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'partial':
      return 'expiring'
    case 'running':
      return 'live'
    default:
      return 'default'
  }
}

const readJobStat = (job: ImportJob, key: 'recordsProcessed' | 'recordsCreated' | 'recordsUpdated' | 'recordsSkipped') => {
  const value = job.statsJson[key]
  return typeof value === 'number' ? value : 0
}

export function IntegrationsPanel({ userRole, defaultScope = 'events' }: IntegrationsPanelProps) {
  const toast = useToast()
  const [sources, setSources] = useState<ImportSource[]>([])
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [mergeCandidates, setMergeCandidates] = useState<ImportMergeCandidate[]>([])
  const [deadLetters, setDeadLetters] = useState<ImportDeadLetter[]>([])
  const [aliases, setAliases] = useState<ImportAliasRecord[]>([])
  const [provenance, setProvenance] = useState<FieldProvenanceRecord[]>([])
  const [metrics, setMetrics] = useState<ImportMetrics | null>(null)
  const [selectedSource, setSelectedSource] = useState('')
  const [selectedScope, setSelectedScope] = useState<ManualSyncScope>(defaultScope)
  const [selectedMode, setSelectedMode] = useState<'full' | 'incremental' | 'backfill'>('incremental')
  const [aliasType, setAliasType] = useState<'team' | 'competition' | 'venue'>('team')
  const [aliasCanonicalId, setAliasCanonicalId] = useState('')
  const [aliasValue, setAliasValue] = useState('')
  const [aliasSourceId, setAliasSourceId] = useState('')
  const [provenanceType, setProvenanceType] = useState<'event' | 'team' | 'competition'>('event')
  const [provenanceEntityId, setProvenanceEntityId] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = userRole === 'admin'
  const enabledSources = sources.filter(source => source.isEnabled)
  const selectableSources = enabledSources.length > 0 ? enabledSources : sources
  const selectedSourceDetails = sources.find(source => source.code === selectedSource) || null
  const selectedAdapterCaps = selectedSourceDetails?.capabilities || null

  const availableScopes = selectedAdapterCaps?.supportedScopes.length 
    ? scopeOptions.filter(opt => selectedAdapterCaps.supportedScopes.includes(opt.value))
    : scopeOptions

  const canRunSync = selectedSourceDetails?.isEnabled && selectedSourceDetails?.configStatus.canExecute

  const refresh = async () => {
    try {
      setLoading(true)
      setError(null)
      const [sourcesData, jobsData, mergeCandidatesData, deadLettersData, aliasesData, metricsData] = await Promise.all([
        importsApi.listSources(),
        importsApi.listJobs({ limit: 8 }),
        importsApi.listMergeCandidates({ limit: 5, status: 'pending', entityType: 'event' }),
        importsApi.listDeadLetters({ limit: 5 }),
        importsApi.listAliases({ type: aliasType, limit: 5 }),
        importsApi.metrics(),
      ])
      setSources(sourcesData)
      setJobs(jobsData)
      setMergeCandidates(mergeCandidatesData)
      setDeadLetters(deadLettersData)
      setAliases(aliasesData)
      setMetrics(metricsData)
      setSelectedSource(prev => prev || getPreferredSource(sourcesData, selectedScope))
    } catch (err) {
      handleApiError(err, 'Failed to load integrations', toast)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [aliasType])

  useEffect(() => {
    setSelectedScope(defaultScope)
  }, [defaultScope])

  useEffect(() => {
    if (!sources.some(source => source.code === selectedSource)) {
      setSelectedSource(getPreferredSource(sources, selectedScope))
      return
    }

    if (!selectedSource) {
      setSelectedSource(getPreferredSource(sources, selectedScope))
    }
  }, [sources, selectedScope, selectedSource])

  const nextStepItems = useMemo(() => ([
    'Phase 4 should persist field configuration and dashboard state server-side for real multi-user editing.',
    'Phase 5 should add live worker/job updates so this panel no longer depends on manual refresh.',
    'Phase 6 should add integration tests around retries, replay, and cross-source matching thresholds.',
    'If you scale past one worker host, move from DB polling to a dedicated distributed queue.',
  ]), [])

  const handleToggleSource = async (source: ImportSource) => {
    try {
      setError(null)
      const updated = await importsApi.updateSource(source.id, { isEnabled: !source.isEnabled })
      setSources(prev => prev.map(item => item.id === source.id ? updated : item))
    } catch (err) {
      handleApiError(err, 'Failed to update source', toast)
    }
  }

  const handleManualSync = async () => {
    if (!selectedSource) {
      setError('Select a source before running a sync.')
      return
    }

    if (selectedSourceDetails && !selectedSourceDetails.isEnabled) {
      setError(`"${selectedSourceDetails.name}" is disabled. Enable it before running a sync.`)
      return
    }

    if (selectedSourceDetails && !selectedSourceDetails.configStatus.canExecute) {
      setError(
        `"${selectedSourceDetails.name}" is not ready: ${selectedSourceDetails.configStatus.missingConfig.join(', ') || selectedSourceDetails.configStatus.status}`
      )
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const response = await importsApi.createJob({
        sourceCode: selectedSource,
        entityScope: selectedScope,
        mode: selectedMode,
        note: note.trim() || undefined,
      })
      setMessage(response.message)
      setNote('')
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to run manual sync', toast)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelJob = async (jobId: string) => {
    try {
      setError(null)
      const response = await importsApi.cancelJob(jobId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to cancel import job', toast)
    }
  }

  const handleRetryJob = async (jobId: string) => {
    try {
      setError(null)
      const response = await importsApi.retryJob(jobId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to retry import job', toast)
    }
  }

  const handleReplayDeadLetter = async (deadLetterId: string) => {
    try {
      setError(null)
      const response = await importsApi.replayDeadLetter(deadLetterId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to replay dead letter', toast)
    }
  }

  const handleApproveMerge = async (candidate: ImportMergeCandidate) => {
    try {
      setError(null)
      const response = await importsApi.approveMergeCandidate(candidate.id, candidate.suggestedEntityId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to approve merge candidate', toast)
    }
  }

  const handleCreateMergeEntity = async (candidateId: string) => {
    try {
      setError(null)
      const response = await importsApi.createMergeCandidateEntity(candidateId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to create entity from merge candidate', toast)
    }
  }

  const handleIgnoreMerge = async (candidateId: string) => {
    try {
      setError(null)
      const response = await importsApi.ignoreMergeCandidate(candidateId)
      setMessage(response.message)
      await refresh()
    } catch (err) {
      handleApiError(err, 'Failed to ignore merge candidate', toast)
    }
  }

  const handleCreateAlias = async () => {
    if (!aliasCanonicalId.trim() || !aliasValue.trim()) {
      setError('Alias type, canonical id, and alias are required.')
      return
    }

    try {
      setError(null)
      await importsApi.createAlias(aliasType, {
        canonicalId: aliasCanonicalId.trim(),
        alias: aliasValue.trim(),
        sourceId: aliasSourceId.trim() || null,
      })
      setMessage('Alias created successfully.')
      setAliasCanonicalId('')
      setAliasValue('')
      setAliasSourceId('')
      setAliases(await importsApi.listAliases({ type: aliasType, limit: 5 }))
    } catch (err) {
      handleApiError(err, 'Failed to create alias', toast)
    }
  }

  const handleDeleteAlias = async (aliasId: string) => {
    try {
      setError(null)
      await importsApi.deleteAlias(aliasType, aliasId)
      setMessage('Alias deleted successfully.')
      setAliases(await importsApi.listAliases({ type: aliasType, limit: 5 }))
    } catch (err) {
      handleApiError(err, 'Failed to delete alias', toast)
    }
  }

  const handleLoadProvenance = async () => {
    if (!provenanceEntityId.trim()) {
      setError('Enter an entity id to inspect provenance.')
      return
    }

    try {
      setError(null)
      const records = await importsApi.getProvenance(provenanceType, provenanceEntityId.trim())
      setProvenance(records)
      setMessage(`Loaded ${records.length} provenance records.`)
    } catch (err) {
      handleApiError(err, 'Failed to load provenance', toast)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted">Loading integrations...</div>
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="card p-4">
          <div className="meta">Enabled Sources</div>
          <div className="score mt-2">{metrics?.totals.enabledSources ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="meta">Pending Jobs</div>
          <div className="score mt-2">{metrics?.totals.pendingJobs ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="meta">Pending Reviews</div>
          <div className="score mt-2">{metrics?.totals.pendingReviews ?? 0}</div>
        </div>
        <div className="card p-4">
          <div className="meta">Link Coverage</div>
          <div className="score mt-2">{metrics?.quality.overallLinkCoverage ?? 0}%</div>
        </div>
        <div className="card p-4">
          <div className="meta">Review Rate</div>
          <div className="score mt-2">{metrics?.quality.reviewRate ?? 0}%</div>
        </div>
        <div className="card p-4">
          <div className="meta">Dead Letter Rate</div>
          <div className="score mt-2">{metrics?.quality.deadLetterRate ?? 0}%</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="section-title">Manual Sync</h4>
            <p className="meta mt-1">Use this to queue an import job for the worker. Recent jobs, retries, cancellations, and dead-letter replay are all handled from here.</p>
          </div>
          <Btn variant="ghost" size="xs" onClick={() => void refresh()}>Refresh</Btn>
        </div>

        {sources.length === 0 && (
          <div className="mt-4 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
            No import sources are available yet. Run `npx prisma db push` and `npm run db:seed` in `backend`.
          </div>
        )}

        {sources.length > 0 && enabledSources.length === 0 && (
          <div className="mt-4 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
            No sources are currently enabled. {isAdmin ? 'Enable one below after adding credentials.' : 'Ask an admin to enable and configure a source.'}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="meta">Source</span>
            <select
              value={selectedSource}
              onChange={event => setSelectedSource(event.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              disabled={sources.length === 0}
            >
              {selectableSources.length === 0 && (
                <option value="">No sources available</option>
              )}
              {selectableSources.map(source => (
                <option key={source.id} value={source.code}>
                  {source.name}{source.isEnabled ? '' : ' (Disabled)'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="meta">Scope</span>
            <select
              value={selectedScope}
              onChange={event => setSelectedScope(event.target.value as ManualSyncScope)}
              className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              disabled={availableScopes.length === 0}
            >
              {availableScopes.length === 0 && (
                <option value="">No supported scopes</option>
              )}
              {availableScopes.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectedAdapterCaps && !selectedAdapterCaps.hasAdapter && (
              <span className="mt-1 block text-xs text-warning">Adapter not implemented for this source</span>
            )}
          </label>

          <label className="block">
            <span className="meta">Mode</span>
            <select
              value={selectedMode}
              onChange={event => setSelectedMode(event.target.value as 'full' | 'incremental' | 'backfill')}
              className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="incremental">Incremental</option>
              <option value="full">Full</option>
              <option value="backfill">Backfill</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="meta">Operator Note</span>
          <textarea
            value={note}
            onChange={event => setNote(event.target.value)}
            rows={3}
            placeholder="Optional context for why this sync was run."
            className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <Btn onClick={() => void handleManualSync()} disabled={submitting || !canRunSync}>
            {submitting ? 'Running…' : 'Run Manual Sync'}
          </Btn>
          {selectedSourceDetails && !selectedSourceDetails.configStatus.canExecute && (
            <span className="text-xs text-warning">
              {selectedSourceDetails.configStatus.status === 'no_adapter'
                ? 'Adapter pending'
                : `Missing config: ${selectedSourceDetails.configStatus.missingConfig.join(', ')}`}
            </span>
          )}
          {message && <span className="text-sm text-success">{message}</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="card p-5">
          <h4 className="section-title">Sources</h4>
          <div className="mt-4 space-y-3">
            {sources.map(source => {
              const adapterCaps = source.capabilities
              return (
                <div key={source.id} className="rounded-md border border-border bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{source.name}</span>
                        <Badge variant={source.isEnabled ? 'success' : 'default'}>
                          {source.isEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        {!adapterCaps.hasAdapter && (
                          <Badge variant='warning'>No Adapter</Badge>
                        )}
                        {source.configStatus.status === 'missing_config' && (
                          <Badge variant='warning'>Config Missing</Badge>
                        )}
                        {source.configStatus.status === 'ready' && source.isEnabled && (
                          <Badge variant='success'>Ready</Badge>
                        )}
                      </div>
                      <div className="meta mt-1">{source.code} · priority {source.priority} · last sync {formatDateTime(source.lastFetchAt)}</div>
                      {adapterCaps.note && <div className="text-xs text-text-3 mt-1">{adapterCaps.note}</div>}
                    </div>
                    {isAdmin && (
                      <Btn variant="secondary" size="xs" onClick={() => void handleToggleSource(source)}>
                        {source.isEnabled ? 'Disable' : 'Enable'}
                      </Btn>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
                    <div>Rate limit: {source.rateLimitPerMinute ?? '—'}/min · {source.rateLimitPerDay ?? '—'}/day</div>
                    <div>Quota use: {formatQuota(source.rateLimitStatus.minute.used, source.rateLimitStatus.minute.limit)} · {formatQuota(source.rateLimitStatus.day.used, source.rateLimitStatus.day.limit)}</div>
                    <div>Resets: {formatDateTime(source.rateLimitStatus.minute.resetAt)} · {formatDateTime(source.rateLimitStatus.day.resetAt)}</div>
                    <div>Last API request: {formatDateTime(source.rateLimitStatus.lastRequestAt)}</div>
                    <div>Link coverage: {metrics?.sources.find(item => item.id === source.id)?.quality.linkCoverage ?? 0}%</div>
                    <div>Dead letter rate: {metrics?.sources.find(item => item.id === source.id)?.quality.deadLetterRate ?? 0}%</div>
                    <div>Credentials: {source.hasCredentials ? 'configured' : 'missing'}</div>
                    {source.configStatus.missingConfig.length > 0 && (
                      <div>Missing config: {source.configStatus.missingConfig.join(', ')}</div>
                    )}
                    <div>Jobs: {source.stats.jobs}</div>
                    <div>Dead letters: {source.stats.deadLetters}</div>
                    {adapterCaps.supportedScopes.length > 0 && (
                      <div className="sm:col-span-2">Scopes: {adapterCaps.supportedScopes.join(', ')}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="section-title">Recent Jobs</h4>
            <div className="mt-4 space-y-3">
              {jobs.length === 0 && <div className="text-sm text-muted">No import jobs yet.</div>}
              {jobs.map(job => (
                <div key={job.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{job.source.name}</div>
                    <Badge variant={getJobBadge(job.status)}>{job.status}</Badge>
                  </div>
                  <div className="meta mt-1">{job.entityScope} · {job.mode}</div>
                  <div className="meta mt-1">
                    {readJobStat(job, 'recordsProcessed')} processed · {readJobStat(job, 'recordsCreated')} created · {readJobStat(job, 'recordsUpdated')} updated · {readJobStat(job, 'recordsSkipped')} skipped
                  </div>
                  {job.errorLog && (
                    <div className="mt-2 rounded-sm border border-danger/20 bg-danger/10 px-2 py-1 text-xs text-danger">
                      {job.errorLog}
                    </div>
                  )}
                  <div className="meta mt-2">
                    Created {formatDateTime(job.createdAt)}
                    {job.finishedAt ? ` · finished ${formatDateTime(job.finishedAt)}` : ''}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['queued', 'running'].includes(job.status) && (
                      <Btn variant="secondary" size="xs" onClick={() => void handleCancelJob(job.id)}>
                        Cancel
                      </Btn>
                    )}
                    {['failed', 'partial'].includes(job.status) && (
                      <Btn variant="secondary" size="xs" onClick={() => void handleRetryJob(job.id)}>
                        Retry
                      </Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="section-title">Dead Letters</h4>
            <div className="mt-4 space-y-3">
              {deadLetters.length === 0 && <div className="text-sm text-muted">No unresolved dead letters.</div>}
              {deadLetters.map(deadLetter => (
                <div key={deadLetter.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{deadLetter.source.name}</div>
                    <Badge variant={deadLetter.resolvedAt ? 'success' : 'warning'}>
                      {deadLetter.resolvedAt ? 'Resolved' : 'Pending'}
                    </Badge>
                  </div>
                  <div className="meta mt-1">
                    {deadLetter.job?.entityScope || deadLetter.errorType} · retries {deadLetter.retryCount}
                  </div>
                  <div className="mt-2 rounded-sm border border-warning/20 bg-warning/10 px-2 py-1 text-xs text-foreground">
                    {deadLetter.errorMessage}
                  </div>
                  <div className="meta mt-2">
                    Created {formatDateTime(deadLetter.createdAt)}
                    {deadLetter.lastRetryAt ? ` · last retry ${formatDateTime(deadLetter.lastRetryAt)}` : ''}
                  </div>
                  {!deadLetter.resolvedAt && deadLetter.job && (
                    <div className="mt-3">
                      <Btn variant="secondary" size="xs" onClick={() => void handleReplayDeadLetter(deadLetter.id)}>
                        Replay
                      </Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="section-title">Merge Review</h4>
            <div className="mt-4 space-y-3">
              {mergeCandidates.length === 0 && <div className="text-sm text-muted">No pending merge candidates.</div>}
              {mergeCandidates.map(candidate => (
                <div key={candidate.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{candidate.importRecord.source.name}</div>
                    <Badge variant="warning">{candidate.confidence}%</Badge>
                  </div>
                  <div className="meta mt-1">
                    {candidate.entityType} · suggested {candidate.suggestedEntityId || 'none'}
                  </div>
                  <div className="meta mt-1">
                    Reasons: {candidate.reasonCodes.join(', ') || 'n/a'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn
                      variant="secondary"
                      size="xs"
                      disabled={!candidate.suggestedEntityId}
                      onClick={() => void handleApproveMerge(candidate)}
                    >
                      Approve Merge
                    </Btn>
                    <Btn variant="secondary" size="xs" onClick={() => void handleCreateMergeEntity(candidate.id)}>
                      Create New
                    </Btn>
                    <Btn variant="ghost" size="xs" onClick={() => void handleIgnoreMerge(candidate.id)}>
                      Ignore
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="section-title">Aliases</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="meta">Type</span>
                <select
                  value={aliasType}
                  onChange={event => setAliasType(event.target.value as 'team' | 'competition' | 'venue')}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="team">Team</option>
                  <option value="competition">Competition</option>
                  <option value="venue">Venue</option>
                </select>
              </label>
              <label className="block">
                <span className="meta">Canonical Id</span>
                <input
                  value={aliasCanonicalId}
                  onChange={event => setAliasCanonicalId(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="Canonical entity id"
                />
              </label>
              <label className="block">
                <span className="meta">Alias</span>
                <input
                  value={aliasValue}
                  onChange={event => setAliasValue(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="Alias value"
                />
              </label>
              <label className="block">
                <span className="meta">Source Id</span>
                <input
                  value={aliasSourceId}
                  onChange={event => setAliasSourceId(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="Optional source id"
                />
              </label>
            </div>
            <div className="mt-3">
              <Btn variant="secondary" size="xs" onClick={() => void handleCreateAlias()}>
                Add Alias
              </Btn>
            </div>
            <div className="mt-4 space-y-2">
              {aliases.length === 0 && <div className="text-sm text-muted">No aliases loaded for this type.</div>}
              {aliases.map(alias => {
                const canonicalName = alias.canonicalTeam?.primaryName
                  || alias.canonicalCompetition?.primaryName
                  || alias.canonicalVenue?.primaryName
                  || 'Unknown'
                return (
                  <div key={alias.id} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{alias.alias}</div>
                      <Btn variant="ghost" size="xs" onClick={() => void handleDeleteAlias(alias.id)}>
                        Delete
                      </Btn>
                    </div>
                    <div className="meta mt-1">{canonicalName} · {alias.source?.name || 'All sources'}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="section-title">Field Provenance</h4>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="meta">Entity Type</span>
                <select
                  value={provenanceType}
                  onChange={event => setProvenanceType(event.target.value as 'event' | 'team' | 'competition')}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="event">Event</option>
                  <option value="team">Team</option>
                  <option value="competition">Competition</option>
                </select>
              </label>
              <label className="block">
                <span className="meta">Entity Id</span>
                <input
                  value={provenanceEntityId}
                  onChange={event => setProvenanceEntityId(event.target.value)}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  placeholder="e.g. 42"
                />
              </label>
            </div>
            <div className="mt-3">
              <Btn variant="secondary" size="xs" onClick={() => void handleLoadProvenance()}>
                Load Provenance
              </Btn>
            </div>
            <div className="mt-4 space-y-2">
              {provenance.length === 0 && <div className="text-sm text-muted">No provenance loaded.</div>}
              {provenance.map(record => (
                <div key={record.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{record.fieldName}</div>
                    <Badge variant="default">{record.source?.code || 'unknown'}</Badge>
                  </div>
                  <div className="meta mt-1">
                    source record {record.sourceRecordId} · imported {formatDateTime(record.importedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="section-title">To Reach 9/10</h4>
            <div className="mt-3 space-y-2 text-sm text-muted">
              {nextStepItems.map(item => (
                <div key={item} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
