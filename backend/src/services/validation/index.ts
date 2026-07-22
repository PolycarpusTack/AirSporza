export type { ValidationSeverity, ValidationResult, RightsPolicy, ValidationContext } from './types.js'
import type { ValidationResult, ValidationContext } from './types.js'
import { validateStructural } from './structural.js'
import { validateDuration } from './duration.js'
import { validateRights } from './rights.js'
import { validateRegulatory } from './regulatory.js'
import { validateBusiness } from './business.js'

/**
 * Runs the full 5-stage validation pipeline against a set of broadcast slots.
 *
 * Stage 1: Structural — overlaps, duplicates, missing fields
 * Stage 2: Duration — slot timing conflicts, range warnings
 * Stage 3: Rights — window/run limits, territory blocks
 * Stage 4: Regulatory — watershed, and the flag-gated listed-events FTA
 *          (LISTED_EVENT_FTA, RC-1-T3) + accessibility lead-time
 *          (ACCESSIBILITY_UNPLANNED, RC-2-T3) checks
 * Stage 5: Business — simultaneous coverage, prime scheduling (stubs)
 *
 * All stages are pure functions — no database access.
 */
export function validateSchedule(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  return [
    ...validateStructural(slots),
    ...validateDuration(slots),
    ...validateRights(slots, context),
    ...validateRegulatory(slots, {
      events: context.listedFtaEvents,
      accessibilityUnplanned: context.accessibilityUnplanned,
      regulatoryEnabled: context.regulatoryEnabled,
    }),
    ...validateBusiness(slots, context),
  ]
}
