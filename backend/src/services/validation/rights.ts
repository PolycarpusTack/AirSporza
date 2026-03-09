import type { ValidationResult, ValidationContext, RightsPolicy } from './types.js'
import type { Contract } from '@prisma/client'
import { checkRights } from '../rightsChecker.js'

/**
 * Stage 3: Rights validation
 *
 * Checks broadcast rights using the unified rightsChecker.
 * Converts RightsPolicy context → Contract shape for the checker,
 * and also counts run limits per event across the draft schedule.
 */
export function validateRights(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (!context.rightsPolicies || context.rightsPolicies.length === 0) {
    return results
  }

  // Count FULL-segment runs per event in the current draft
  const draftRunCounts = new Map<number, string[]>()
  for (const slot of slots) {
    if (!slot.eventId) continue
    if (slot.contentSegment && slot.contentSegment !== 'FULL') continue
    const existing = draftRunCounts.get(slot.eventId) || []
    existing.push(slot.id)
    draftRunCounts.set(slot.eventId, existing)
  }

  // Build existing run count map
  const existingRunMap = new Map<number, number>()
  if (context.existingRuns) {
    for (const run of context.existingRuns) {
      existingRunMap.set(run.eventId, run.count)
    }
  }

  // Check each slot against its applicable rights policies
  for (const slot of slots) {
    if (!slot.eventId || !slot.channelId) continue

    const applicablePolicies = context.rightsPolicies.filter(
      (p: RightsPolicy) => p.eventId === slot.eventId || p.competitionId === slot.event?.competitionId
    )

    if (applicablePolicies.length === 0) continue

    // Convert policies to Contract-shaped objects for the unified checker
    const contractLike = applicablePolicies.map(policyToContractShape)

    // Calculate total runs for this event
    const draftSlots = draftRunCounts.get(slot.eventId) || []
    const existingCount = existingRunMap.get(slot.eventId) || 0
    const totalRuns = existingCount + draftSlots.length

    const channelTypes = slot.channel?.types || []

    const slotResults = checkRights(
      {
        channelId: slot.channelId,
        channelTypes,
        startUtc: slot.plannedStartUtc || slot.estimatedStartUtc,
        territory: slot.channel?.territory,
        currentRunCount: totalRuns,
      },
      contractLike as unknown as Contract[],
    )

    // Add slot scope to results
    for (const r of slotResults) {
      results.push({
        ...r,
        scope: [slot.id, ...(r.scope || [])],
      })
    }
  }

  return deduplicateResults(results)
}

/** Convert a RightsPolicy to a Contract-like shape for the unified checker */
function policyToContractShape(p: RightsPolicy): Partial<Contract> {
  return {
    id: 0,
    status: 'valid' as const,
    platforms: [],
    territory: p.territory ? [p.territory] : [],
    maxLiveRuns: p.maxLiveRuns ?? null,
    windowStartUtc: p.windowStart ? new Date(p.windowStart) : null,
    windowEndUtc: p.windowEnd ? new Date(p.windowEnd) : null,
    linearRights: false,
    maxRights: false,
    radioRights: false,
  }
}

/** Remove duplicate results (same code + same first scope slot) */
function deduplicateResults(results: ValidationResult[]): ValidationResult[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const key = `${r.code}:${r.scope[0] ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
