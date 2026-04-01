import { api } from '../utils/api'

export interface RightsPolicy {
  id: string
  tenantId: string
  competitionId: number
  seasonId?: number
  territory: string[]
  platforms: string[]
  coverageType: string
  maxLiveRuns?: number
  maxPickRunsPerRound?: number
  windowStartUtc?: string
  windowEndUtc?: string
  tapeDelayHoursMin?: number
  competition?: { name: string }
}

export const rightsApi = {
  list: (competitionId?: number) => {
    const qs = competitionId ? `?competitionId=${competitionId}` : ''
    return api.get<RightsPolicy[]>(`/rights/policies${qs}`)
  },
  create: (data: Partial<RightsPolicy>) => api.post<RightsPolicy>('/rights/policies', data),
  update: (id: string, data: Partial<RightsPolicy>) => api.put<RightsPolicy>(`/rights/policies/${id}`, data),
  delete: (id: string) => api.delete(`/rights/policies/${id}`),
}
