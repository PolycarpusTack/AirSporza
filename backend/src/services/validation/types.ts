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
  maxLiveRuns: number
  windowStart?: string  // ISO date
  windowEnd?: string    // ISO date
}

export interface ValidationContext {
  rightsPolicies: RightsPolicy[]
  existingRuns?: Array<{ eventId: number; count: number }>
  events: any[]
}
