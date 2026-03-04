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

export const auditApi = {
  list: (entityType: string, entityId: number) =>
    api.get<AuditEntry[]>(`/audit/${entityType}/${entityId}`),
  restore: (logId: string) =>
    api.post<unknown>(`/audit/${logId}/restore`, {}),
}
