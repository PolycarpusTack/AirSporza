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

  // --- RD-3-T2 window-aware path (populated ONLY when the RIGHTS_WINDOWS flag is
  //     ON). When `contracts` is present, stage 3 runs checker v2; when absent, the
  //     legacy rightsPolicies + `existingRuns: []` path runs UNCHANGED (byte-identical).
  /** Applicable contracts with their RightsWindow rows (ADR-015 §6). */
  contracts?: Array<import('@prisma/client').Contract & { rightsWindows?: import('@prisma/client').RightsWindow[] }>
  /** Per-(contract, category) CONFIRMED|RECONCILED ledger tally (defect-(b) fix). */
  contractRunTally?: import('./runTally.js').ContractRunTally[]
  /** eventId → the event's CONFIRMED LIVE run `endedAtUtc` (ISO), for holdback resolution (§4 step 1). */
  liveRunEndUtcByEventId?: Record<number, string>
  /** Explicit flag pass-through — the pure checker never reads env. */
  windowsEnabled?: boolean

  // --- RC-1-T3 stage-4 listed-events FTA (populated ONLY when REGULATORY_COMPLIANCE
  //     is ON). Absent → stage 4 runs watershed only (byte-identical).
  /** Normalized listed obligation events for the LISTED_EVENT_FTA check. */
  listedFtaEvents?: import('./listedEventFta.js').ListedFtaEvent[]
  // --- RC-2-T3 stage-4 accessibility lead-time check (populated ONLY when
  //     REGULATORY_COMPLIANCE is ON). Absent → ACCESSIBILITY_UNPLANNED does not run.
  /** Events + their deliverable rows, the injected clock, and an optional lead-time
   *  override (default: `ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS` config). */
  accessibilityUnplanned?: {
    events: import('./accessibilityUnplanned.js').AccessibilityUnplannedEvent[]
    now: Date | string
    leadTimeDays?: number
  }
  regulatoryEnabled?: boolean
}
