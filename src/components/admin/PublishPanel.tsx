import { useState, useEffect, useCallback } from 'react'
import { Webhook, Link2, Send, Trash2, RefreshCw, Copy, ExternalLink, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { publishApi } from '../../services/publish'
import type { WebhookEndpoint, WebhookDelivery, PublishEventType } from '../../services/publish'
import { useToast } from '../Toast'

type SubTab = 'webhooks' | 'feeds' | 'deliveries'

const ALL_EVENT_TYPES: { value: PublishEventType; label: string }[] = [
  { value: 'event.*', label: 'All event changes' },
  { value: 'event.created', label: 'Event created' },
  { value: 'event.updated', label: 'Event updated' },
  { value: 'event.deleted', label: 'Event deleted' },
  { value: 'event.live.started', label: 'Event went live' },
  { value: 'event.live.ended', label: 'Event no longer live' },
  { value: 'techPlan.*', label: 'All tech plan changes' },
  { value: 'techPlan.created', label: 'Tech plan created' },
  { value: 'techPlan.updated', label: 'Tech plan updated' },
  { value: 'contract.expiring', label: 'Contract expiring' },
]

// ─── Webhooks sub-tab ────────────────────────────────────────────────────────

function WebhooksTab() {
  const toast = useToast()
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [logData, setLogData] = useState<Record<string, WebhookDelivery[]>>({})

  // Create form state
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(['event.*']))
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await publishApi.listWebhooks()
      setWebhooks(data)
    } catch {
      toast.error('Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const handleCreate = async () => {
    if (!url.trim() || !secret.trim() || selectedEvents.size === 0) return
    setCreating(true)
    try {
      await publishApi.createWebhook({ url: url.trim(), secret: secret.trim(), events: [...selectedEvents] })
      toast.success('Webhook registered')
      setUrl(''); setSecret(''); setShowCreate(false)
      void load()
    } catch {
      toast.error('Failed to register webhook')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook? All delivery history will be lost.')) return
    try {
      await publishApi.deleteWebhook(id)
      toast.success('Webhook deleted')
      void load()
    } catch {
      toast.error('Failed to delete webhook')
    }
  }

  const toggleLog = async (id: string) => {
    if (expandedLog === id) { setExpandedLog(null); return }
    setExpandedLog(id)
    if (!logData[id]) {
      try {
        const res = await publishApi.getLog(id)
        setLogData(prev => ({ ...prev, [id]: res.deliveries }))
      } catch {
        toast.error('Failed to load delivery log')
      }
    }
  }

  const toggleEvent = (ev: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev)
      if (next.has(ev)) next.delete(ev); else next.add(ev)
      return next
    })
  }

  if (loading) {
    return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-surface-2 rounded-lg animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-2">{webhooks.length} registered endpoint{webhooks.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          <Webhook className="w-3.5 h-3.5" />
          {showCreate ? 'Cancel' : 'Register Webhook'}
        </button>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-surface-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3">New Webhook</p>
          <div>
            <label className="field-label">Endpoint URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-system.example.com/webhook"
              className="field-input border-border"
            />
          </div>
          <div>
            <label className="field-label">Secret (for HMAC-SHA256 signature)</label>
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="At least 16 characters"
              className="field-input border-border"
            />
            <p className="mt-0.5 text-[11px] text-text-3">The <code className="font-mono text-[10px] bg-surface px-1 rounded">X-Planza-Signature</code> header will be signed with this secret.</p>
          </div>
          <div>
            <label className="field-label">Event types to subscribe</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {ALL_EVENT_TYPES.map(et => (
                <label key={et.value} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.has(et.value)}
                    onChange={() => toggleEvent(et.value)}
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                  />
                  <span className="text-text-2">{et.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="btn text-xs px-3 py-1.5">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={creating || !url || !secret || selectedEvents.size === 0}
              className="btn btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {creating ? 'Registering…' : 'Register'}
            </button>
          </div>
        </div>
      )}

      {webhooks.length === 0 && !showCreate && (
        <div className="text-center py-10 text-text-3 text-sm">
          <Webhook className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No webhooks registered yet.
        </div>
      )}

      <div className="space-y-2">
        {webhooks.map(wh => (
          <div key={wh.id} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3">
              <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${wh.isActive ? 'bg-success' : 'bg-surface-3'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium truncate">{wh.url}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-text-3">{wh.events.join(', ')}</span>
                  {wh.failedCount ? (
                    <span className="badge badge-danger text-[10px]">{wh.failedCount} failed</span>
                  ) : (
                    <span className="text-xs text-text-3">{wh.deliveryCount ?? 0} deliveries</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleLog(wh.id)}
                  className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text transition-colors"
                  title="View delivery log"
                >
                  {expandedLog === wh.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(wh.id)}
                  className="p-1.5 rounded hover:bg-danger/10 text-text-3 hover:text-danger transition-colors"
                  title="Delete webhook"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {expandedLog === wh.id && (
              <div className="border-t border-border bg-surface-2 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">Delivery Log</p>
                {!logData[wh.id] ? (
                  <p className="text-xs text-text-3">Loading…</p>
                ) : logData[wh.id].length === 0 ? (
                  <p className="text-xs text-text-3">No deliveries yet.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {logData[wh.id].map(d => (
                      <div key={d.id} className="flex items-center gap-2 text-xs">
                        {d.deliveredAt ? (
                          <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-danger flex-shrink-0" />
                        )}
                        <span className="font-mono text-text-3 flex-shrink-0 w-10">
                          {d.statusCode ?? '—'}
                        </span>
                        <span className="text-text-2 flex-1">{d.eventType}</span>
                        <span className="text-text-3 flex-shrink-0">
                          {new Date(d.createdAt).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        {d.attempts > 1 && (
                          <span className="text-text-3 flex-shrink-0">{d.attempts}×</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Feeds sub-tab ───────────────────────────────────────────────────────────

function FeedsTab() {
  const toast = useToast()

  const feeds = [
    { label: 'JSON Event Feed', url: publishApi.getFeedUrl({ format: 'json' }), description: 'All events as JSON — for VRT.be, custom integrations' },
    { label: 'iCal Calendar Feed', url: publishApi.getFeedUrl({ format: 'ical' }), description: 'RFC 5545 feed for Outlook / Teams / Google Calendar' },
    { label: 'Linear TV feed (VRT 1 only)', url: publishApi.getFeedUrl({ format: 'json', channel: 'VRT 1', rights: 'linear' }), description: 'Rights-filtered: VRT 1 events with linear rights' },
    { label: 'VRT MAX feed', url: publishApi.getFeedUrl({ format: 'json', rights: 'max' }), description: 'Rights-filtered: events with MAX streaming rights' },
    { label: 'Daily Schedule', url: publishApi.getScheduleUrl(), description: 'Today\'s schedule grouped by channel' },
    { label: 'Live Now', url: publishApi.getLiveUrl(), description: 'Currently live events — suitable for polling' },
  ]

  const copy = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => toast.success('URL copied'))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-3">These feeds are publicly accessible (no authentication required). Share with partner systems or subscribe in a feed reader.</p>
      <div className="space-y-2">
        {feeds.map(f => (
          <div key={f.url} className="border border-border rounded-lg px-4 py-3 flex items-start gap-3">
            <Link2 className="w-4 h-4 text-text-3 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{f.label}</p>
              <p className="text-xs text-text-3 mt-0.5">{f.description}</p>
              <p className="text-xs font-mono text-text-2 mt-1 truncate">{f.url}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => copy(f.url)}
                className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text transition-colors"
                title="Copy URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Deliveries sub-tab ──────────────────────────────────────────────────────

function DeliveriesTab() {
  const toast = useToast()
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'failed' | 'delivered'>('all')
  const [retrying, setRetrying] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await publishApi.listDeliveries(
        statusFilter !== 'all' ? { status: statusFilter } : undefined
      )
      setDeliveries(data)
    } catch {
      toast.error('Failed to load deliveries')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => { void load() }, [load])

  const handleRetry = async (id: string) => {
    setRetrying(prev => new Set(prev).add(id))
    try {
      await publishApi.retryDelivery(id)
      toast.success('Retry queued')
      void load()
    } catch {
      toast.error('Retry failed')
    } finally {
      setRetrying(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const failedIds = deliveries.filter(d => !d.deliveredAt).map(d => d.id)

  const handleBulkRetry = async () => {
    for (const id of failedIds) {
      try { await publishApi.retryDelivery(id) } catch { /* intentional: continue batch on individual failure */ }
    }
    toast.success(`${failedIds.length} retries queued`)
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(['all', 'failed', 'delivered'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                statusFilter === s ? 'bg-primary text-white' : 'text-text-2 hover:text-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => load()} className="p-1.5 rounded hover:bg-surface-2 text-text-3 hover:text-text">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        {failedIds.length > 0 && (
          <button
            onClick={handleBulkRetry}
            className="ml-auto btn text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            Retry all failed ({failedIds.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-surface-2 rounded animate-pulse" />)}</div>
      ) : deliveries.length === 0 ? (
        <p className="text-center py-8 text-sm text-text-3">No deliveries found.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[24px_80px_1fr_140px_80px_48px] gap-3 px-4 py-2 bg-surface-2 text-xs font-semibold text-text-3 uppercase tracking-wider">
            <span />
            <span>Status</span>
            <span>Event type / Webhook</span>
            <span>Timestamp</span>
            <span>Attempts</span>
            <span />
          </div>
          {deliveries.map(d => (
            <div key={d.id} className="grid grid-cols-[24px_80px_1fr_140px_80px_48px] gap-3 px-4 py-2.5 text-xs items-center hover:bg-surface-2">
              <span>
                {d.deliveredAt
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  : <AlertCircle className="w-3.5 h-3.5 text-danger" />
                }
              </span>
              <span className={`font-mono font-medium ${d.statusCode && d.statusCode < 300 ? 'text-success' : 'text-danger'}`}>
                {d.statusCode ?? 'timeout'}
              </span>
              <div className="min-w-0">
                <p className="font-medium truncate">{d.eventType}</p>
                {d.webhook?.url && <p className="text-text-3 truncate font-mono">{d.webhook.url}</p>}
                {d.error && <p className="text-danger truncate">{d.error}</p>}
              </div>
              <span className="text-text-3">
                {new Date(d.createdAt).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="text-text-3 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {d.attempts}
              </span>
              <span>
                {!d.deliveredAt && (
                  <button
                    onClick={() => handleRetry(d.id)}
                    disabled={retrying.has(d.id)}
                    className="p-1 rounded hover:bg-primary/10 text-text-3 hover:text-primary disabled:opacity-40"
                    title="Retry delivery"
                  >
                    <RefreshCw className={`w-3 h-3 ${retrying.has(d.id) ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Root PublishPanel ────────────────────────────────────────────────────────

export function PublishPanel() {
  const [subTab, setSubTab] = useState<SubTab>('webhooks')

  const tabs: { id: SubTab; label: string; icon: typeof Webhook }[] = [
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    { id: 'feeds', label: 'Feed URLs', icon: Link2 },
    { id: 'deliveries', label: 'Deliveries', icon: Send },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Outbound Publishing</h2>
        <p className="text-sm text-text-3 mt-0.5">Push event data to external systems via webhooks or pull feeds.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-2 hover:text-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      <div>
        {subTab === 'webhooks' && <WebhooksTab />}
        {subTab === 'feeds' && <FeedsTab />}
        {subTab === 'deliveries' && <DeliveriesTab />}
      </div>
    </div>
  )
}
