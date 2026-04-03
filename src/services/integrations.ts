import { api } from '../utils/api'

export type IntegrationDirection = 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL'

export interface Integration {
  id: string
  tenantId: string
  name: string
  direction: IntegrationDirection
  templateCode: string
  credentials: Record<string, unknown> | null  // masked on read
  fieldOverrides: FieldOverride[]
  config: Record<string, unknown>
  triggerConfig: Record<string, unknown>
  isActive: boolean
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  consecutiveFailures: number
  createdAt: string
  updatedAt: string
  templateName?: string
}

export interface FieldOverride {
  sourceField: string
  targetField: string
  transform?: string
  transformConfig?: Record<string, unknown>
}

export interface IntegrationTemplate {
  code: string
  name: string
  description: string
  direction: 'INBOUND' | 'OUTBOUND'
  auth?: { scheme: string; headerName?: string; queryParam?: string }
  baseUrl?: string
  endpoints?: Record<string, string>
  defaultFieldMappings: Array<{
    sourceField: string
    targetField: string
    transform?: string
    transformConfig?: Record<string, unknown>
    required?: boolean
  }>
  contentType?: string
  payloadTemplate?: string
  sampleResponse?: Record<string, unknown>
  samplePayload?: string
  rateLimitDefaults?: { requestsPerMinute: number; requestsPerDay: number }
}

export interface IntegrationLog {
  id: string
  integrationId: string
  direction: IntegrationDirection
  status: 'success' | 'failed' | 'partial'
  requestMeta: Record<string, unknown>
  responseMeta: Record<string, unknown>
  recordCount: number
  errorMessage: string | null
  durationMs: number | null
  createdAt: string
}

export interface TestConnectionResult {
  status: 'success' | 'error'
  httpStatus?: number
  raw?: unknown
  mapped?: Record<string, unknown>
  durationMs: number
  error?: string
  truncated?: boolean
}

export interface IntegrationSchedule {
  id: string
  integrationId: string
  cronExpression: string
  jobType: string
  jobConfig: Record<string, unknown>
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
}

export const integrationsApi = {
  // Integrations CRUD
  list: () =>
    api.get<Integration[]>('/integrations'),
  get: (id: string) =>
    api.get<Integration>(`/integrations/${id}`),
  create: (data: {
    name: string
    direction: IntegrationDirection
    templateCode: string
    credentials?: Record<string, unknown>
    fieldOverrides?: FieldOverride[]
    config?: Record<string, unknown>
    triggerConfig?: Record<string, unknown>
    isActive?: boolean
    rateLimitPerMinute?: number | null
    rateLimitPerDay?: number | null
  }) => api.post<Integration>('/integrations', data),
  update: (id: string, data: {
    name?: string
    direction?: IntegrationDirection
    templateCode?: string
    credentials?: Record<string, unknown> | null // null = unchanged
    fieldOverrides?: FieldOverride[]
    config?: Record<string, unknown>
    triggerConfig?: Record<string, unknown>
    isActive?: boolean
    rateLimitPerMinute?: number | null
    rateLimitPerDay?: number | null
  }) => api.put<Integration>(`/integrations/${id}`, data),
  delete: (id: string) =>
    api.delete(`/integrations/${id}`),

  // Templates
  listTemplates: (direction?: IntegrationDirection) => {
    const qs = direction ? `?direction=${direction}` : ''
    return api.get<IntegrationTemplate[]>(`/integrations/templates${qs}`)
  },

  // Test Connection
  testConnection: (id: string) =>
    api.post<TestConnectionResult>(`/integrations/${id}/test`, {}),

  // Logs
  listLogs: (id: string, params?: { limit?: number; cursor?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return api.get<IntegrationLog[]>(`/integrations/${id}/logs${q ? `?${q}` : ''}`)
  },

  // Schedules
  listSchedules: (integrationId: string) =>
    api.get<IntegrationSchedule[]>(`/integrations/${integrationId}/schedules`),
  createSchedule: (integrationId: string, data: { cronExpression: string; jobType: string; jobConfig?: Record<string, unknown> }) =>
    api.post<IntegrationSchedule>(`/integrations/${integrationId}/schedules`, data),
  updateSchedule: (integrationId: string, scheduleId: string, data: Partial<IntegrationSchedule>) =>
    api.patch<IntegrationSchedule>(`/integrations/${integrationId}/schedules/${scheduleId}`, data),
  deleteSchedule: (integrationId: string, scheduleId: string) =>
    api.delete(`/integrations/${integrationId}/schedules/${scheduleId}`),
}
