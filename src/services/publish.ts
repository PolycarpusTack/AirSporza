import { api, API_URL } from '../utils/api'

export type PublishEventType =
  | 'event.created'
  | 'event.updated'
  | 'event.deleted'
  | 'event.live.started'
  | 'event.live.ended'
  | 'event.*'
  | 'techPlan.created'
  | 'techPlan.updated'
  | 'techPlan.*'
  | 'contract.expiring'

export interface WebhookEndpoint {
  id: string
  url: string
  secret: string
  events: PublishEventType[]
  isActive: boolean
  createdAt: string
  createdById: string | null
  deliveryCount?: number
  failedCount?: number
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventType: string
  payload: Record<string, unknown>
  statusCode: number | null
  attempts: number
  deliveredAt: string | null
  error: string | null
  createdAt: string
  webhook?: { url: string }
}

export interface PublishedEvent {
  id: number
  sport: { id: number; name: string; icon: string }
  competition: { id: number; name: string; season: string } | null
  participants: string
  startDateBE: string
  startTimeBE: string
  linearChannel: string | null
  linearStartTime: string | null
  radioChannel: string | null
  isLive: boolean
  isDelayedLive: boolean
  videoRef: string | null
  winner: string | null
  score: string | null
  duration: string | null
  rights: {
    linear: boolean
    max: boolean
    radio: boolean
    geo: string | null
    sublicensing: boolean
  } | null
}

export interface PublishFeedResponse {
  events: PublishedEvent[]
  nextCursor: string | null
  total: number
}

export interface PublishScheduleResponse {
  date: string
  channels: Record<string, PublishedEvent[]>
}

export const publishApi = {
  // Webhooks
  listWebhooks: () =>
    api.get<WebhookEndpoint[]>('/publish/webhooks'),

  createWebhook: (data: { url: string; secret: string; events: string[] }) =>
    api.post<WebhookEndpoint>('/publish/webhooks', data),

  deleteWebhook: (id: string) =>
    api.delete<{ message: string }>(`/publish/webhooks/${id}`),

  getLog: (id: string, cursor?: string) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return api.get<{ deliveries: WebhookDelivery[]; nextCursor: string | null }>(`/publish/webhooks/${id}/log${qs}`)
  },

  // Deliveries
  listDeliveries: (filters?: { webhookId?: string; status?: 'failed' | 'delivered' }) => {
    const params = new URLSearchParams()
    if (filters?.webhookId) params.set('webhookId', filters.webhookId)
    if (filters?.status) params.set('status', filters.status)
    const qs = params.toString() ? `?${params}` : ''
    return api.get<WebhookDelivery[]>(`/publish/deliveries${qs}`)
  },

  retryDelivery: (id: string) =>
    api.post<{ message: string }>(`/publish/deliveries/${id}/retry`),

  // Feed URL builder (for copy/open links — no auth needed)
  getFeedUrl: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return `${API_URL}/publish/events?${qs}`
  },

  getScheduleUrl: () => `${API_URL}/publish/schedule`,
  getLiveUrl: () => `${API_URL}/publish/live`,
}
