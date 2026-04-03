import { useState, useEffect } from 'react'
import { Btn, Card, Badge } from '../components/ui'
import { importsApi } from '../services'
import type { ImportSource, ImportJob, ImportMetrics } from '../services'

export function IntegrationSettings() {
  const [sources, setSources] = useState<ImportSource[]>([])
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [metrics, setMetrics] = useState<ImportMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sources' | 'jobs' | 'metrics'>('sources')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sourcesData, jobsData, metricsData] = await Promise.all([
        importsApi.listSources(),
        importsApi.listJobs({ limit: 20 }),
        importsApi.metrics(),
      ])
      setSources(sourcesData)
      setJobs(jobsData)
      setMetrics(metricsData)
    } catch (error) {
      console.error('Failed to fetch import data:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSource = async (id: string, isEnabled: boolean) => {
    try {
      await importsApi.updateSource(id, { isEnabled })
      setSources(prev => prev.map(s => s.id === id ? { ...s, isEnabled } : s))
    } catch (error) {
      console.error('Failed to toggle source:', error)
    }
  }

  const triggerSync = async (sourceCode: string, entityScope: string) => {
    setSyncing(sourceCode)
    try {
      await importsApi.createJob({ sourceCode, entityScope, mode: 'incremental' })
      await fetchData()
    } catch (error) {
      console.error('Failed to trigger sync:', error)
    } finally {
      setSyncing(null)
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
        {(['sources', 'jobs', 'metrics'] as const).map(tab => (
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
                  <td className="px-4 py-3">{job._count?.records ?? 0}</td>
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
    </div>
  )
}
