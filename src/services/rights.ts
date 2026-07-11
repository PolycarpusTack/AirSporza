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

/** One slot's rights check (RD-4 GET /rights/check-slots). Parallels RightsCheckResult. */
export interface SlotRightsCheckResult {
  slotId: string
  ok: boolean
  results: RightsValidationResult[]
}

/** Paginated channel-day response (ADR-009 cursor). */
export interface SlotRightsCheckResponse {
  slots: SlotRightsCheckResult[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Severity rollup of a slot's rights results — DISTINCT from the ops
 * `RightsStatus` (VALID|EXPIRING|…) contract-lifecycle enum; do not conflate.
 */
export type SlotRightsStatus = 'CLEAR' | 'WARNING' | 'VIOLATION'

/**
 * Pure severity rollup for a slot's rights results (RD-4). Domain selector — lives
 * in the rights service, NOT in ops components (anti-smart-ui; ops screens adopt it
 * via their own backlog). Precedence: any ERROR → VIOLATION; else any WARNING →
 * WARNING; else (only INFO, or empty) → CLEAR.
 */
export function deriveSlotRightsStatus(results: RightsValidationResult[]): SlotRightsStatus {
  if (results.some(r => r.severity === 'ERROR')) return 'VIOLATION'
  if (results.some(r => r.severity === 'WARNING')) return 'WARNING'
  return 'CLEAR'
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

  /** RD-4: channel-day slot rights check (paginated). `cursor` continues a page. */
  checkSlots: (channelId: number, date: string, opts?: { territory?: string; limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams({ channelId: String(channelId), date })
    if (opts?.territory) qs.set('territory', opts.territory)
    if (opts?.limit != null) qs.set('limit', String(opts.limit))
    if (opts?.cursor) qs.set('cursor', opts.cursor)
    return api.get<SlotRightsCheckResponse>(`/rights/check-slots?${qs.toString()}`)
  },
}
