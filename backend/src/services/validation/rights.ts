import type { ValidationResult, ValidationContext, RightsPolicy } from './types.js'

/**
 * Stage 3: Rights validation
 *
 * Checks broadcast rights windows and run limits.
 * Works with any array of policy objects passed in context — no Prisma dependency.
 */
export function validateRights(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkRightsWindowExpired(slots, context))
  results.push(...checkRightsRunExceeded(slots, context))
  // Placeholder
  results.push(...checkTerritoryBlocked(slots, context))

  return results
}

/**
 * RIGHTS_WINDOW_EXPIRED (ERROR)
 * A broadcast slot falls outside the rights window defined in the policy.
 */
function checkRightsWindowExpired(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (!context.rightsPolicies || context.rightsPolicies.length === 0) {
    return results
  }

  for (const slot of slots) {
    if (!slot.eventId || !slot.plannedStartUtc) continue

    // Find applicable policies for this event
    const applicablePolicies = context.rightsPolicies.filter(
      (p: RightsPolicy) => p.eventId === slot.eventId || p.competitionId === slot.event?.competitionId
    )

    for (const policy of applicablePolicies) {
      if (!policy.windowStart || !policy.windowEnd) continue

      const slotStart = new Date(slot.plannedStartUtc).getTime()
      const windowStart = new Date(policy.windowStart).getTime()
      const windowEnd = new Date(policy.windowEnd).getTime()

      if (slotStart < windowStart || slotStart > windowEnd) {
        results.push({
          severity: 'ERROR',
          code: 'RIGHTS_WINDOW_EXPIRED',
          scope: [slot.id],
          message: `Slot "${slot.id}" (event ${slot.eventId}) is scheduled outside the rights window (${policy.windowStart} to ${policy.windowEnd}).`,
          remediation: 'Reschedule within the rights window or acquire extended rights.'
        })
      }
    }
  }

  return results
}

/**
 * RIGHTS_RUN_EXCEEDED (ERROR)
 * The number of live broadcast runs for an event exceeds the maxLiveRuns in the policy.
 */
function checkRightsRunExceeded(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (!context.rightsPolicies || context.rightsPolicies.length === 0) {
    return results
  }

  // Count runs per event in the current schedule
  const runCounts = new Map<number, string[]>()
  for (const slot of slots) {
    if (!slot.eventId) continue
    // Only count FULL segments as separate runs
    if (slot.contentSegment && slot.contentSegment !== 'FULL') continue
    const existing = runCounts.get(slot.eventId) || []
    existing.push(slot.id)
    runCounts.set(slot.eventId, existing)
  }

  // Add existing runs from context (already published schedules)
  const existingRunMap = new Map<number, number>()
  if (context.existingRuns) {
    for (const run of context.existingRuns) {
      existingRunMap.set(run.eventId, run.count)
    }
  }

  for (const [eventId, slotIds] of runCounts) {
    const applicablePolicies = context.rightsPolicies.filter(
      (p: RightsPolicy) => p.eventId === eventId
    )

    for (const policy of applicablePolicies) {
      if (!policy.maxLiveRuns) continue

      const existingCount = existingRunMap.get(eventId) || 0
      const totalRuns = existingCount + slotIds.length

      if (totalRuns > policy.maxLiveRuns) {
        results.push({
          severity: 'ERROR',
          code: 'RIGHTS_RUN_EXCEEDED',
          scope: slotIds,
          message: `Event ${eventId} has ${totalRuns} live runs (${existingCount} existing + ${slotIds.length} in draft), exceeding limit of ${policy.maxLiveRuns}.`,
          remediation: `Remove ${totalRuns - policy.maxLiveRuns} broadcast(s) or acquire additional run rights.`
        })
      }
    }
  }

  return results
}

/** TERRITORY_BLOCKED (ERROR) — placeholder */
function checkTerritoryBlocked(
  _slots: any[],
  _context: ValidationContext
): ValidationResult[] {
  return []
}
