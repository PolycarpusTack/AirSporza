import type { ValidationResult } from './types.js'
import { checkListedEventFta, type ListedFtaEvent } from './listedEventFta.js'
import {
  checkAccessibilityUnplanned,
  type AccessibilityUnplannedEvent,
} from './accessibilityUnplanned.js'

/**
 * Stage 4: Regulatory validation — watershed, plus the flag-gated listed-events FTA
 * (RC-1-T3) and accessibility lead-time (RC-2-T3) checks.
 *
 * @param opts.regulatoryEnabled  When falsy/absent, runs ONLY watershed — byte-identical
 *   to the flag-OFF baseline (golden master). Existing callers passing just
 *   `slots` are unchanged. When true, ALSO runs — per provided input —
 *   `checkListedEventFta` (`opts.events` → LISTED_EVENT_FTA) and
 *   `checkAccessibilityUnplanned` (`opts.accessibilityUnplanned` → ACCESSIBILITY_UNPLANNED).
 *   The flag is read at the route boundary and threaded here; this fn never reads env.
 */
export function validateRegulatory(
  slots: any[],
  opts: {
    events?: ListedFtaEvent[]
    /** RC-2-T3: events+deliverables, injected clock, optional lead-time override. */
    accessibilityUnplanned?: { events: AccessibilityUnplannedEvent[]; now: Date | string; leadTimeDays?: number }
    regulatoryEnabled?: boolean
  } = {},
): ValidationResult[] {
  const results: ValidationResult[] = []

  results.push(...checkWatershedViolation(slots))

  if (opts.regulatoryEnabled && opts.events) {
    results.push(...checkListedEventFta(opts.events, slots))
  }
  if (opts.regulatoryEnabled && opts.accessibilityUnplanned) {
    results.push(...checkAccessibilityUnplanned(opts.accessibilityUnplanned.events, slots, {
      now: opts.accessibilityUnplanned.now,
      leadTimeDays: opts.accessibilityUnplanned.leadTimeDays,
    }))
  }

  return results
}

/** WATERSHED_VIOLATION (ERROR) — adult/mature content before 21:00 local time */
function checkWatershedViolation(slots: any[]): ValidationResult[] {
  const results: ValidationResult[] = []

  for (const slot of slots) {
    const contentRating = slot.sportMetadata?.contentRating
    if (contentRating !== 'adult' && contentRating !== 'mature') continue

    const startUtc = slot.plannedStartUtc ?? slot.estimatedStartUtc
    if (!startUtc) continue

    const tz = slot.channel?.timezone ?? 'UTC'
    const localHour = getLocalHour(new Date(startUtc), tz)

    if (localHour < 21) {
      results.push({
        severity: 'ERROR',
        code: 'WATERSHED_VIOLATION',
        scope: [slot.id],
        message: `Slot has '${contentRating}' content rating but starts before 21:00 in ${tz}`,
        remediation: 'Move to after 21:00 or remove content rating',
      })
    }
  }

  return results
}

/** Convert a UTC Date to local hour (0-23) in the given IANA timezone */
function getLocalHour(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })
  return Number(formatter.format(date))
}
