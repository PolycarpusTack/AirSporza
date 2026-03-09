import type { ValidationResult } from './types.js'

/**
 * Stage 2: Duration validation
 *
 * Checks timing conflicts between floating and fixed slots,
 * and warns about wide duration ranges.
 */
export function validateDuration(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkSlotOverlapCertain(slots))
  results.push(...checkSlotOverlapProbable(slots))
  results.push(...checkWideDurationRange(slots))
  results.push(...checkKnockoutSlotTooShort(slots))

  return results
}

/**
 * SLOT_OVERLAP_CERTAIN (ERROR)
 * A floating slot's earliestStart overlaps the next fixed item on the same channel.
 * This is a certain overlap — even in the best case, there's a conflict.
 */
function checkSlotOverlapCertain(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  // Group by channel
  const byChannel = new Map<number, any[]>()
  for (const slot of slots) {
    if (!slot.channelId) continue
    const group = byChannel.get(slot.channelId) || []
    group.push(slot)
    byChannel.set(slot.channelId, group)
  }

  for (const [_channelId, channelSlots] of byChannel) {
    const floatingSlots = channelSlots.filter(s => s.schedulingMode === 'FLOATING')
    const fixedSlots = channelSlots
      .filter(s => s.schedulingMode === 'FIXED' && s.plannedStartUtc)
      .sort((a, b) => new Date(a.plannedStartUtc).getTime() - new Date(b.plannedStartUtc).getTime())

    for (const floating of floatingSlots) {
      if (!floating.earliestStartUtc || !floating.expectedDurationMin) continue

      // Calculate the earliest possible end time
      const earliestStart = new Date(floating.earliestStartUtc).getTime()
      const earliestEnd = earliestStart + floating.expectedDurationMin * 60 * 1000

      // Find the next fixed slot after this floating slot's earliest start
      const nextFixed = fixedSlots.find(
        f => new Date(f.plannedStartUtc).getTime() > earliestStart
      )

      if (nextFixed) {
        const fixedStart = new Date(nextFixed.plannedStartUtc).getTime()
        if (earliestEnd > fixedStart) {
          results.push({
            severity: 'ERROR',
            code: 'SLOT_OVERLAP_CERTAIN',
            scope: [floating.id, nextFixed.id],
            message: `Floating slot "${floating.id}" earliest end overlaps fixed slot "${nextFixed.id}" start — conflict is certain.`,
            remediation: 'Move the fixed slot later or shorten the floating slot duration.'
          })
        }
      }
    }
  }

  return results
}

/**
 * SLOT_OVERLAP_PROBABLE (WARNING)
 * A floating slot's estimated end overlaps the next fixed item.
 * Not certain, but probable based on current estimates.
 */
function checkSlotOverlapProbable(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  const byChannel = new Map<number, any[]>()
  for (const slot of slots) {
    if (!slot.channelId) continue
    const group = byChannel.get(slot.channelId) || []
    group.push(slot)
    byChannel.set(slot.channelId, group)
  }

  for (const [_channelId, channelSlots] of byChannel) {
    const floatingSlots = channelSlots.filter(
      s => s.schedulingMode === 'FLOATING' && s.estimatedEndUtc
    )
    const fixedSlots = channelSlots
      .filter(s => s.schedulingMode === 'FIXED' && s.plannedStartUtc)
      .sort((a, b) => new Date(a.plannedStartUtc).getTime() - new Date(b.plannedStartUtc).getTime())

    for (const floating of floatingSlots) {
      const estimatedEnd = new Date(floating.estimatedEndUtc).getTime()
      const estimatedStart = floating.estimatedStartUtc
        ? new Date(floating.estimatedStartUtc).getTime()
        : floating.earliestStartUtc
          ? new Date(floating.earliestStartUtc).getTime()
          : 0

      if (!estimatedStart) continue

      // Skip if already caught by SLOT_OVERLAP_CERTAIN
      if (floating.earliestStartUtc && floating.expectedDurationMin) {
        const earliestEnd = new Date(floating.earliestStartUtc).getTime() + floating.expectedDurationMin * 60 * 1000
        const nextFixed = fixedSlots.find(
          f => new Date(f.plannedStartUtc).getTime() > new Date(floating.earliestStartUtc).getTime()
        )
        if (nextFixed && earliestEnd > new Date(nextFixed.plannedStartUtc).getTime()) {
          continue // Already caught by CERTAIN check
        }
      }

      const nextFixed = fixedSlots.find(
        f => new Date(f.plannedStartUtc).getTime() > estimatedStart
      )

      if (nextFixed) {
        const fixedStart = new Date(nextFixed.plannedStartUtc).getTime()
        if (estimatedEnd > fixedStart) {
          results.push({
            severity: 'WARNING',
            code: 'SLOT_OVERLAP_PROBABLE',
            scope: [floating.id, nextFixed.id],
            message: `Floating slot "${floating.id}" estimated end overlaps fixed slot "${nextFixed.id}" — overlap is probable.`,
            remediation: 'Consider adding buffer time or configuring an overrun strategy.'
          })
        }
      }
    }
  }

  return results
}

/**
 * WIDE_DURATION_RANGE (WARNING)
 * A floating slot's latest minus earliest start exceeds 150 minutes.
 */
function checkWideDurationRange(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    if (!slot.earliestStartUtc || !slot.latestStartUtc) continue

    const earliest = new Date(slot.earliestStartUtc).getTime()
    const latest = new Date(slot.latestStartUtc).getTime()
    const rangeMin = (latest - earliest) / (60 * 1000)

    if (rangeMin > 150) {
      results.push({
        severity: 'WARNING',
        code: 'WIDE_DURATION_RANGE',
        scope: [slot.id],
        message: `Slot "${slot.id}" has a ${Math.round(rangeMin)}-minute start time range (earliest to latest), exceeding 150-minute threshold.`,
        remediation: 'Narrow the start time window or add intermediate anchor points.'
      })
    }
  }

  return results
}

/**
 * KNOCKOUT_SLOT_TOO_SHORT (ERROR)
 * A slot for a knockout-stage event has less than the minimum expected duration.
 * Knockout matches can go to extra time / penalties, so slots need adequate padding.
 *
 * Minimum durations by sport metadata:
 * - Football knockout: 150 min (90 + 30 extra + 30 buffer)
 * - Tennis knockout (best of 5): 300 min
 * - Default knockout: 180 min
 */
function checkKnockoutSlotTooShort(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    if (!slot.expectedDurationMin) continue

    // Check if this is a knockout match via sport metadata
    const metadata = slot.sportMetadata || slot.event?.sportMetadata || {}
    const stageType = metadata.stageType || metadata.stage_type
    if (!stageType || !['KNOCKOUT', 'PLAYOFF', 'FINAL'].includes(stageType)) continue

    // Determine minimum duration based on sport
    const sportName = metadata.sport?.toLowerCase?.() || ''
    let minDuration = 180 // default knockout minimum
    if (sportName.includes('football') || sportName.includes('soccer')) {
      minDuration = 150
    } else if (sportName.includes('tennis')) {
      const format = metadata.format || ''
      minDuration = format.includes('best_of_5') ? 300 : 210
    }

    if (slot.expectedDurationMin < minDuration) {
      results.push({
        severity: 'ERROR',
        code: 'KNOCKOUT_SLOT_TOO_SHORT',
        scope: [slot.id],
        message: `Knockout slot "${slot.id}" has ${slot.expectedDurationMin}min allocated but needs at least ${minDuration}min for ${stageType} stage.`,
        remediation: `Increase slot duration to at least ${minDuration} minutes to accommodate extra time / penalties.`,
      })
    }
  }

  return results
}
