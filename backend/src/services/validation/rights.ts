import type { ValidationResult, ValidationContext, RightsPolicy } from './types.js'
import type { Contract } from '@prisma/client'
import { checkRights } from '../rightsChecker.js'
import type { CoverageCategory } from './runTally.js'

const MS_PER_MINUTE = 60_000

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
  // RD-3-T2: window-aware path ONLY when the flag wired `contracts` into the
  // context. Otherwise the legacy scalar path below runs UNCHANGED (byte-identical
  // to the RD-1F golden master — including `existingRuns: []`).
  if (context.windowsEnabled && context.contracts) {
    return validateRightsWindows(slots, context)
  }

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

/**
 * RD-3-T2 window-aware stage 3 (flag ON). Passes real contracts + windows into
 * checker v2 with a per-CATEGORY run tally (defect-(b): `existingRuns` from the
 * ledger, never `[]`). The legacy `policyToContractShape` path is left intact for
 * flag OFF (TD-29 adapter preserved).
 */
function validateRightsWindows(
  slots: any[],
  context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []
  const contracts = context.contracts ?? []

  // Draft FULL-segment runs per event (mirrors the legacy draft-run tally).
  const draftRunCounts = new Map<number, number>()
  for (const slot of slots) {
    if (!slot.eventId) continue
    if (slot.contentSegment && slot.contentSegment !== 'FULL') continue
    draftRunCounts.set(slot.eventId, (draftRunCounts.get(slot.eventId) ?? 0) + 1)
  }

  // Per-(contract, category) CONFIRMED|RECONCILED ledger tally.
  const tally = new Map<string, number>()
  for (const t of context.contractRunTally ?? []) {
    tally.set(`${t.contractId}:${t.category}`, t.count)
  }

  for (const slot of slots) {
    if (!slot.eventId || !slot.channelId) continue

    const competitionId = slot.event?.competitionId
    const applicable = contracts.filter(c => c.competitionId === competitionId)
    if (applicable.length === 0) continue

    const runIntent = deriveRunIntent(slot)
    const ledgerCount = applicable.reduce(
      (sum, c) => sum + (tally.get(`${c.id}:${runIntent}`) ?? 0), 0,
    )
    const draftCount = draftRunCounts.get(slot.eventId) ?? 0
    const currentRunCount = ledgerCount + draftCount

    const start = slot.plannedStartUtc || slot.estimatedStartUtc
    const durationMin = slot.expectedDurationMin ?? slot.event?.durationMin
    const scheduledEndUtc = start != null && durationMin != null
      ? new Date(new Date(start).getTime() + durationMin * MS_PER_MINUTE).toISOString()
      : undefined

    const slotResults = checkRights(
      {
        channelId: slot.channelId,
        channelTypes: slot.channel?.types || [],
        startUtc: start,
        territory: slot.channel?.territory,
        currentRunCount,
        runIntent,
        // Holdback (non-LIVE): live-end resolves ledger-actual first, then scheduled.
        liveRunEndedAtUtc: context.liveRunEndUtcByEventId?.[slot.eventId],
        scheduledEndUtc,
      },
      applicable,
      { windowsEnabled: true },
    )

    for (const r of slotResults) {
      results.push({ ...r, scope: [slot.id, ...(r.scope || [])] })
    }
  }

  return deduplicateResults(results)
}

/**
 * Derive the CoverageType category a slot represents. BroadcastSlot has no coverage
 * column yet (only `contentSegment` FULL|CONTINUATION), so a slot is a LIVE
 * exploitation unless it explicitly carries a run intent. Slot-level DELAYED/
 * HIGHLIGHTS intent — like slot-level territory (ADR-015 Acceptance record §3) — is
 * an RD-retro refinement; reading an optional field keeps the checker reachable for
 * it without inventing a schema column now.
 */
function deriveRunIntent(slot: any): CoverageCategory {
  return slot.runIntent ?? slot.coverageType ?? 'LIVE'
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
