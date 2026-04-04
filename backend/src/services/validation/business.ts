import type { ValidationResult, ValidationContext } from './types.js'

/**
 * Stage 5: Business rule validation
 *
 * Checks business-level scheduling concerns like simultaneous coverage,
 * prime-time placement, and DST ambiguity.
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

/** SIMULTANEOUS_OVERRUN_RISK (WARNING) — 3+ FLOATING/WINDOW slots on different channels overlap */
function checkSimultaneousOverrunRisk(
  slots: any[],
  _context: ValidationContext
): ValidationResult[] {
  const flexSlots = slots.filter(
    (s) => s.schedulingMode === 'FLOATING' || s.schedulingMode === 'WINDOW'
  )

  if (flexSlots.length < 3) return []

  // Build time windows from estimated start/end
  const windowed = flexSlots
    .filter((s) => s.estimatedStartUtc && s.estimatedEndUtc)
    .map((s) => ({
      id: s.id,
      channelId: s.channelId ?? s.channel?.id,
      start: new Date(s.estimatedStartUtc).getTime(),
      end: new Date(s.estimatedEndUtc).getTime(),
    }))

  // Check each slot against all others to find an overlap group of 3+
  for (let i = 0; i < windowed.length; i++) {
    const overlapping = [windowed[i]]

    for (let j = 0; j < windowed.length; j++) {
      if (i === j) continue
      // Must be on a different channel
      if (windowed[j].channelId === windowed[i].channelId) continue

      // Check overlap with the anchor slot
      if (
        windowed[i].start < windowed[j].end &&
        windowed[j].start < windowed[i].end
      ) {
        overlapping.push(windowed[j])
      }
    }

    if (overlapping.length >= 3) {
      // Deduplicate channel constraint: ensure at least 3 different channels
      const uniqueChannels = new Set(overlapping.map((s) => s.channelId))
      if (uniqueChannels.size >= 3) {
        return [
          {
            severity: 'WARNING',
            code: 'SIMULTANEOUS_OVERRUN_RISK',
            scope: overlapping.map((s) => s.id),
            message: `${overlapping.length} flexible slots on different channels have overlapping time windows — overrun risk`,
          },
        ]
      }
    }
  }

  return []
}

/** PRIME_MATCH_LATE (WARNING) — premium content starting after 21:30 UTC */
function checkPrimeMatchLate(
  slots: any[],
  _context: ValidationContext
): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    if (!slot.sportMetadata?.isPremium) continue

    const startUtc = slot.plannedStartUtc ?? slot.estimatedStartUtc
    if (!startUtc) continue

    const date = new Date(startUtc)
    const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60

    if (utcHour > 21.5) {
      results.push({
        severity: 'WARNING',
        code: 'PRIME_MATCH_LATE',
        scope: [slot.id],
        message: 'Premium content starts after 21:30 UTC — may miss prime-time audience',
      })
    }
  }

  return results
}

/** DST_KICKOFF_AMBIGUOUS (INFO) — start falls on EU DST transition (last Sunday of March/October), hour 0-3 UTC */
function checkDstKickoffAmbiguous(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    const startUtc = slot.plannedStartUtc ?? slot.estimatedStartUtc
    if (!startUtc) continue

    const date = new Date(startUtc)
    const utcHour = date.getUTCHours()

    if (utcHour > 3) continue

    if (isLastSundayOfMarchOrOctober(date)) {
      results.push({
        severity: 'INFO',
        code: 'DST_KICKOFF_AMBIGUOUS',
        scope: [slot.id],
        message: 'Kick-off falls on an EU DST transition day between 00:00-03:00 UTC — local times may be ambiguous',
      })
    }
  }

  return results
}

/** Check if a UTC date falls on the last Sunday of March or October */
function isLastSundayOfMarchOrOctober(date: Date): boolean {
  const month = date.getUTCMonth() // 0-indexed: March=2, October=9
  if (month !== 2 && month !== 9) return false

  const day = date.getUTCDay() // 0=Sunday
  if (day !== 0) return false

  // Last Sunday: no later Sunday exists in the month
  const dateOfMonth = date.getUTCDate()
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), month + 1, 0)
  ).getUTCDate()

  // It's the last Sunday if adding 7 days would exceed the month
  return dateOfMonth + 7 > daysInMonth
}
