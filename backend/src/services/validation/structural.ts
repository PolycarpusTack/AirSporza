import type { ValidationResult } from './types.js'

/**
 * Stage 1: Structural validation
 *
 * Checks the fundamental structure of the schedule — overlaps between fixed slots,
 * duplicate broadcasts, missing required fields, and floating slot configuration.
 */
export function validateStructural(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkOverlapFixedSlots(slots))
  results.push(...checkDuplicateBroadcast(slots))
  results.push(...checkMissingChannel(slots))
  results.push(...checkFloatingNoTrigger(slots))
  results.push(...checkNoOverflowAvailable(slots))
  // Placeholders — return empty for now
  results.push(...checkTbdParticipantBlock(slots))
  results.push(...checkHandoffChainBroken(slots))

  return results
}

/**
 * OVERLAP_FIXED_SLOTS (ERROR)
 * Two FIXED slots on the same channel have overlapping time windows.
 */
function checkOverlapFixedSlots(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []
  const fixedSlots = slots
    .filter(s => s.schedulingMode === 'FIXED' && s.plannedStartUtc && s.plannedEndUtc)
    .sort((a, b) => new Date(a.plannedStartUtc).getTime() - new Date(b.plannedStartUtc).getTime())

  // Group by channel
  const byChannel = new Map<number, any[]>()
  for (const slot of fixedSlots) {
    const group = byChannel.get(slot.channelId) || []
    group.push(slot)
    byChannel.set(slot.channelId, group)
  }

  for (const [channelId, channelSlots] of byChannel) {
    for (let i = 0; i < channelSlots.length; i++) {
      for (let j = i + 1; j < channelSlots.length; j++) {
        const a = channelSlots[i]
        const b = channelSlots[j]

        const aStart = new Date(a.plannedStartUtc).getTime()
        const aEnd = new Date(a.plannedEndUtc).getTime()
        const bStart = new Date(b.plannedStartUtc).getTime()
        const bEnd = new Date(b.plannedEndUtc).getTime()

        if (aStart < bEnd && bStart < aEnd) {
          results.push({
            severity: 'ERROR',
            code: 'OVERLAP_FIXED_SLOTS',
            scope: [a.id, b.id],
            message: `Fixed slots overlap on channel ${channelId}: "${a.id}" and "${b.id}"`,
            remediation: 'Adjust the start/end times so the slots do not overlap.'
          })
        }
      }
    }
  }

  return results
}

/**
 * DUPLICATE_BROADCAST (ERROR)
 * Same eventId appears on two slots without a CONTINUATION marking.
 */
function checkDuplicateBroadcast(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []
  const eventSlots = new Map<number, any[]>()

  for (const slot of slots) {
    if (!slot.eventId) continue
    const group = eventSlots.get(slot.eventId) || []
    group.push(slot)
    eventSlots.set(slot.eventId, group)
  }

  for (const [eventId, group] of eventSlots) {
    // Filter to only FULL segments — CONTINUATION is allowed for multi-part broadcasts
    const fullSegments = group.filter(s => s.contentSegment === 'FULL')
    if (fullSegments.length > 1) {
      results.push({
        severity: 'ERROR',
        code: 'DUPLICATE_BROADCAST',
        scope: fullSegments.map((s: any) => s.id),
        message: `Event ${eventId} is scheduled as FULL on ${fullSegments.length} slots without CONTINUATION marking.`,
        remediation: 'Mark additional slots as CONTINUATION or remove the duplicate.'
      })
    }
  }

  return results
}

/**
 * MISSING_CHANNEL (ERROR)
 * A slot has no channelId set.
 */
function checkMissingChannel(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    if (!slot.channelId) {
      results.push({
        severity: 'ERROR',
        code: 'MISSING_CHANNEL',
        scope: [slot.id],
        message: `Broadcast slot "${slot.id}" has no channel assigned.`,
        remediation: 'Assign a channel to this broadcast slot.'
      })
    }
  }

  return results
}

/**
 * FLOATING_NO_TRIGGER (WARNING)
 * A floating slot has no conditionalTriggerUtc and could overlap the next fixed item.
 */
function checkFloatingNoTrigger(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  const floatingSlots = slots.filter(s => s.schedulingMode === 'FLOATING')
  for (const slot of floatingSlots) {
    if (!slot.conditionalTriggerUtc) {
      // Check if there's a subsequent fixed slot on the same channel that could be affected
      const hasSubsequentFixed = slots.some(
        s =>
          s.schedulingMode === 'FIXED' &&
          s.channelId === slot.channelId &&
          s.plannedStartUtc &&
          slot.estimatedEndUtc &&
          new Date(s.plannedStartUtc).getTime() > new Date(slot.estimatedStartUtc || slot.earliestStartUtc || 0).getTime()
      )

      if (hasSubsequentFixed) {
        results.push({
          severity: 'WARNING',
          code: 'FLOATING_NO_TRIGGER',
          scope: [slot.id],
          message: `Floating slot "${slot.id}" has no conditional trigger and may overlap subsequent fixed items.`,
          remediation: 'Set a conditionalTriggerUtc to define when an overrun switch should fire.'
        })
      }
    }
  }

  return results
}

/**
 * NO_OVERFLOW_AVAILABLE (WARNING)
 * A slot has CONDITIONAL_SWITCH overrun strategy armed but no target channel configured.
 */
function checkNoOverflowAvailable(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    if (slot.overrunStrategy === 'CONDITIONAL_SWITCH' && !slot.conditionalTargetChannelId) {
      results.push({
        severity: 'WARNING',
        code: 'NO_OVERFLOW_AVAILABLE',
        scope: [slot.id],
        message: `Slot "${slot.id}" has CONDITIONAL_SWITCH armed but no target channel configured.`,
        remediation: 'Set conditionalTargetChannelId to define where overflow should be routed.'
      })
    }
  }

  return results
}

/** TBD_PARTICIPANT_BLOCK (ERROR) — placeholder */
function checkTbdParticipantBlock(_slots: any[]): ValidationResult[] {
  return []
}

/** HANDOFF_CHAIN_BROKEN (ERROR) — placeholder */
function checkHandoffChainBroken(_slots: any[]): ValidationResult[] {
  return []
}
