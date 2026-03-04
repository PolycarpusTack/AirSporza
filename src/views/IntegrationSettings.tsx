import { useState, useEffect } from 'react'
import { Btn, Card, Badge } from '../components/ui'
import { api } from '../utils/api'

interface ImportSource {
  id: string
  code: string
  name: string
  kind: string
  priority: number
  isEnabled: boolean
  hasCredentials: boolean
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  lastFetchAt: string | null
  stats: {
    jobs: number
    deadLetters: number
    records: number
    sourceLinks: number
  }
}

interface ImportJob {
  id: string
  entityScope: string
  mode: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  statsJson: Record<string, unknown>
  source: { code: string; name: string }
  _count: { records: number; deadLetters: number }
}

interface ImportSchedule {
  id: string
  sourceId: string
  cronExpr: string
  isEnabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  source: { code: string; name: string }
}

interface Metrics {
  totals: {
    sources: number
    enabledSources: number
    pendingJobs: number
    completedJobs24h: number
    pendingReviews: number
    unresolvedDeadLetters: number
    manualSyncs24h: number
  }
  sources: Array<{
    id: string
    code: string
    name: string
    isEnabled: boolean
    priority: number
    lastFetchAt: string | null
    jobs: number
    records: number
    deadLetters: number
  }>
}

export function IntegrationSettings() {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [schedules, setSchedules] = useState<ImportSchedule[]>([])
  const [newSchedule, setNewSchedule] = useState({ sourceId: '', cronExpr: '' })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'sources' | 'jobs' | 'metrics' | 'schedules'>('sources')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sourcesData, jobsData, metricsData, schedulesData] = await Promise.all([
        api.get<ImportSource[]>('/import/sources'),
        api.get<ImportJob[]>('/import/jobs?limit=20'),
        api.get<Metrics>('/import/metrics'),
        api.get<ImportSchedule[]>('/import/schedules').catch(() => [] as ImportSchedule[]),
      ])
      setSources(sourcesData)
      setJobs(jobsData)
      setMetrics(metricsData)
      setSchedules(schedulesData)
    } catch (error) {
      console.error('Failed to fetch import data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSource = async (id: string, isEnabled: boolean) => {
    try {
      await api.patch(`/import/sources/${id}`, { isEnabled })
      setSources(prev => prev.map(s => s.id === id ? { ...s, isEnabled } : s))
    } catch (error) {
      console.error('Failed to toggle source:', error)
    }
  }

  const triggerSync = async (sourceCode: string, entityScope: string) => {
    setSyncing(sourceCode)
    try {
      await api.post(`/import/jobs`, { sourceCode, entityScope, mode: 'incremental' })
      await fetchData()
    } catch (error) {
      console.error('Failed to trigger sync:', error)
    } finally {
      setSyncing(null)
    }
  }

  const toggleSchedule = async (id: string, isEnabled: boolean) => {
    try {
      await api.patch(`/import/schedules/${id}`, { isEnabled })
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, isEnabled } : s))
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
    }
  }

  const createSchedule = async () => {
    if (!newSchedule.sourceId || !newSchedule.cronExpr) return
    setScheduleSaving(true)
    try {
      const created = await api.post<ImportSchedule>('/import/schedules', {
        sourceId: newSchedule.sourceId,
        cronExpr: newSchedule.cronExpr,
        isEnabled: true,
      })
      setSchedules(prev => [...prev, created])
      setNewSchedule({ sourceId: '', cronExpr: '' })
    } catch (error) {
      console.error('Failed to create schedule:', error)
      alert('Failed to create schedule. Check that the cron expression is valid.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const statusColors: Record<string, string> = {
    completed: 'success',
    failed: 'danger',
    running: 'live',
    queued: 'default',
    partial: 'warning',
  }

  if (loading) {
    return <div className="p-8 text-center text-muted">Loading integrations...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Integrations & Data Sources</h2>
        <Btn variant="secondary" size="sm" onClick={fetchData}>
          Refresh
        </Btn>
      </div>

      {/* Metrics Summary */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold">{metrics.totals.enabledSources}/{metrics.totals.sources}</div>
            <div className="text-xs text-muted">Sources Active</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-warning">{metrics.totals.pendingJobs}</div>
            <div className="text-xs text-muted">Pending Jobs</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-success">{metrics.totals.completedJobs24h}</div>
            <div className="text-xs text-muted">Jobs (24h)</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold">{metrics.totals.manualSyncs24h}</div>
            <div className="text-xs text-muted">Manual Syncs</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{metrics.totals.pendingReviews}</div>
            <div className="text-xs text-muted">Pending Reviews</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-danger">{metrics.totals.unresolvedDeadLetters}</div>
            <div className="text-xs text-muted">Failed Records</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {(['sources', 'jobs', 'metrics', 'schedules'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Sources Tab */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          {sources.map(source => (
            <Card key={source.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold">{source.name}</h3>
                    <Badge variant={source.isEnabled ? 'success' : 'default'}>
                      {source.isEnabled ? 'Active' : 'Disabled'}
                    </Badge>
                    {!source.hasCredentials && source.isEnabled && (
                      <Badge variant="warning">No Credentials</Badge>
                    )}
                  </div>
                  <div className="meta mt-1">
                    {source.code} • {source.kind} • Priority: {source.priority}
                  </div>
                  {(source.rateLimitPerMinute || source.rateLimitPerDay) && (
                    <div className="text-xs text-muted-2 mt-1">
                      Rate limits: {source.rateLimitPerMinute || '∞'}/min • {source.rateLimitPerDay || '∞'}/day
                    </div>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-muted">
                    <span>{source.stats.records} records</span>
                    <span>{source.stats.jobs} jobs</span>
                    {source.stats.deadLetters > 0 && (
                      <span className="text-danger">{source.stats.deadLetters} failed</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSource(source.id, !source.isEnabled)}
                    className={`toggle-track ${source.isEnabled ? 'active' : ''}`}
                  >
                    <div className="toggle-thumb" />
                  </button>
                  
                  {source.isEnabled && source.hasCredentials && (
                    <Btn
                      variant="secondary"
                      size="xs"
                      onClick={() => triggerSync(source.code, 'fixtures')}
                      disabled={syncing === source.code}
                    >
                      {syncing === source.code ? 'Syncing...' : 'Sync Now'}
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === 'jobs' && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Source</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Scope</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Records</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">{job.source.name}</td>
                  <td className="px-4 py-3 capitalize">{job.entityScope}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusColors[job.status] as 'success' | 'danger' | 'warning' | 'live' | 'default'}>
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{job._count.records}</td>
                  <td className="px-4 py-3 text-muted">
                    {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && metrics && (
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.sources.map(source => (
            <Card key={source.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold">{source.name}</h4>
                <Badge variant={source.isEnabled ? 'success' : 'default'}>
                  {source.isEnabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold">{source.jobs}</div>
                  <div className="text-xs text-muted">Jobs</div>
                </div>
                <div>
                  <div className="text-lg font-bold">{source.records}</div>
                  <div className="text-xs text-muted">Records</div>
                </div>
                <div>
                  <div className={`text-lg font-bold ${source.deadLetters > 0 ? 'text-danger' : ''}`}>
                    {source.deadLetters}
                  </div>
                  <div className="text-xs text-muted">Failed</div>
                </div>
              </div>
              {source.lastFetchAt && (
                <div className="text-xs text-muted mt-3">
                  Last fetch: {new Date(source.lastFetchAt).toLocaleString()}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        <div className="space-y-6">
          {/* Add Schedule Form */}
          <Card className="p-4">
            <h3 className="font-bold mb-3">Add Import Schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Source</label>
                <select
                  className="inp w-full"
                  value={newSchedule.sourceId}
                  onChange={e => setNewSchedule(prev => ({ ...prev, sourceId: e.target.value }))}
                >
                  <option value="">Select source...</option>
                  {sources.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Cron Expression</label>
                <input
                  type="text"
                  className="inp w-full"
                  placeholder="0 6 * * * (daily at 06:00)"
                  value={newSchedule.cronExpr}
                  onChange={e => setNewSchedule(prev => ({ ...prev, cronExpr: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={createSchedule}
                  disabled={scheduleSaving || !newSchedule.sourceId || !newSchedule.cronExpr}
                >
                  {scheduleSaving ? 'Saving...' : 'Add Schedule'}
                </Btn>
              </div>
            </div>
            <p className="text-xs text-muted mt-2">
              Examples: <code>0 6 * * *</code> (daily 06:00) • <code>0 */4 * * *</code> (every 4h) • <code>30 8,20 * * *</code> (8:30 and 20:30)
            </p>
          </Card>

          {/* Schedule List */}
          {schedules.length === 0 ? (
            <div className="text-center py-8 text-muted">No schedules configured yet.</div>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Source</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Cron</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Last Run</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-muted uppercase">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {schedules.map(schedule => (
                    <tr key={schedule.id} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 font-medium">{schedule.source.name}</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-surface-2 px-2 py-1 rounded">{schedule.cronExpr}</code>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSchedule(schedule.id, !schedule.isEnabled)}
                          className={`toggle-track ${schedule.isEnabled ? 'active' : ''}`}
                        >
                          <div className="toggle-thumb" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
