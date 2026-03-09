import type { ValidationResult, ValidationContext } from './types.js'

/**
 * Stage 5: Business rule validation
 *
 * Checks business-level scheduling concerns like simultaneous coverage,
 * prime-time placement, and DST ambiguity.
 * Currently all stubs — to be implemented per business requirements.
 */
export function validateBusiness(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkSimultaneousOverrunRisk(slots, context))
  results.push(...checkPrimeMatchLate(slots, context))
  results.push(...checkDstKickoffAmbiguous(slots))

  return results
}

/** SIMULTANEOUS_OVERRUN_RISK (WARNING) — placeholder */
function checkSimultaneousOverrunRisk(
  _slots: any[],
  _context: ValidationContext
): ValidationResult[] {
  return []
}

/** PRIME_MATCH_LATE (WARNING) — placeholder */
function checkPrimeMatchLate(
  _slots: any[],
  _context: ValidationContext
): ValidationResult[] {
  return []
}

/** DST_KICKOFF_AMBIGUOUS (WARNING) — placeholder */
function checkDstKickoffAmbiguous(_slots: any[]): ValidationResult[] {
  return []
}
