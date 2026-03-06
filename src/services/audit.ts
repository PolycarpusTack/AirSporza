import { api } from '../utils/api'

export interface AuditEntry {
  id: string
  userId?: string
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
  createdAt: string
}

export interface AuditFilters {
  action?: string
  userId?: string
  entityType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export const auditApi = {
  listAll: (filters?: AuditFilters): Promise<{ logs: AuditEntry[]; total: number }> => {
    const params = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v))
      })
    }
    const query = params.toString()
    return api.get(`/audit${query ? `?${query}` : ''}`)
  },
  list: (entityType: string, entityId: number) =>
    api.get<AuditEntry[]>(`/audit/${entityType}/${entityId}`),
  restore: (logId: string) =>
    api.post<unknown>(`/audit/${logId}/restore`, {}),
}
