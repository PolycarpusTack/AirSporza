export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface ValidationResult {
  severity: ValidationSeverity
  code: string
  scope: string[]
  message: string
  remediation?: string
}

export interface RightsPolicy {
  eventId?: number
  competitionId?: number
  territory?: string
  /** null = no limit set (run-limit check is skipped); 0 = explicit limit of zero (RD-1F / ADR-015) */
  maxLiveRuns: number | null
  windowStart?: string  // ISO date
  windowEnd?: string    // ISO date
}

export interface ValidationContext {
  rightsPolicies: RightsPolicy[]
  existingRuns?: Array<{ eventId: number; count: number }>
  events: any[]
}
