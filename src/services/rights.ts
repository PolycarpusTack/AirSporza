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

/** Matches ValidationResult on the backend (services/validation/types.ts). */
export interface RightsValidationResult {
  code: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  scope: string[]
  message: string
  remediation?: string
}

export interface RightsCheckResult {
  eventId: number
  ok: boolean
  results: RightsValidationResult[]
}

export interface RightsMatrixRow {
  contractId: number
  competitionId: number
  competitionName: string
  seasonId: number | null
  seasonName: string | null
  status: string
  platforms: string[]
  territory: string[]
  coverageType: string
  runsUsed: number
  maxLiveRuns: number | null
  windowStartUtc: string | null
  windowEndUtc: string | null
  validUntil: string | null
  daysUntilExpiry: number | null
  severity: 'ok' | 'warning' | 'error'
  blackoutCount: number
}

export const rightsApi = {
  // Policies (unchanged)
  list: (competitionId?: number) => {
    const qs = competitionId ? `?competitionId=${competitionId}` : ''
    return api.get<RightsPolicy[]>(`/rights/policies${qs}`)
  },
  create: (data: Partial<RightsPolicy>) => api.post<RightsPolicy>('/rights/policies', data),
  update: (id: string, data: Partial<RightsPolicy>) => api.put<RightsPolicy>(`/rights/policies/${id}`, data),
  delete: (id: string) => api.delete(`/rights/policies/${id}`),

  // Validation (phase 1 endpoints)
  check: (eventId: number, territory?: string) => {
    const qs = new URLSearchParams({ eventId: String(eventId) })
    if (territory) qs.set('territory', territory)
    return api.get<RightsCheckResult>(`/rights/check?${qs.toString()}`)
  },
  checkBatch: (eventIds: number[], territory?: string) => {
    if (eventIds.length === 0) return Promise.resolve({} as Record<number, { ok: boolean; results: RightsValidationResult[] }>)
    const qs = new URLSearchParams({ eventIds: eventIds.join(',') })
    if (territory) qs.set('territory', territory)
    return api.get<Record<number, { ok: boolean; results: RightsValidationResult[] }>>(`/rights/check/batch?${qs.toString()}`)
  },
  matrix: () => api.get<RightsMatrixRow[]>('/rights/matrix'),
}
