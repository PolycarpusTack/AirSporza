import type { ValidationResult } from './types.js'

/**
 * Stage 4: Regulatory validation
 *
 * Checks for watershed violations, accessibility requirements, etc.
 * Currently all stubs — to be implemented when regulatory rules are defined.
 */
export function validateRegulatory(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkWatershedViolation(slots))
  results.push(...checkAccessibilityMissing(slots))

  return results
}

/** WATERSHED_VIOLATION (ERROR) — placeholder */
function checkWatershedViolation(_slots: any[]): ValidationResult[] {
  return []
}

/** ACCESSIBILITY_MISSING (WARNING) — placeholder */
function checkAccessibilityMissing(_slots: any[]): ValidationResult[] {
  return []
}
