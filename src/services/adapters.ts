import { api } from '../utils/api'

export interface AdapterConfig {
  id: string
  tenantId: string
  adapterType: string
  direction: string
  providerName: string
  config: Record<string, unknown>
  isActive: boolean
  lastSuccessAt?: string
  lastFailureAt?: string
  consecutiveFailures: number
}

export const adaptersApi = {
  list: () => api.get<AdapterConfig[]>('/adapters/configs'),
  create: (data: Partial<AdapterConfig>) => api.post<AdapterConfig>('/adapters/configs', data),
  update: (id: string, data: Partial<AdapterConfig>) => api.put<AdapterConfig>(`/adapters/configs/${id}`, data),
  delete: (id: string) => api.delete(`/adapters/configs/${id}`),
}
