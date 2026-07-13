/**
 * RC-1-T3 — LISTED_EVENT_FTA (evenementen van aanzienlijk belang, besluit 28 May 2004).
 * Pure, no DB. A confirmed listed event whose category `fullLiveRequired` must be
 * broadcast LIVE + FULL-segment on a free-to-air channel spanning the event window.
 *
 * "LIVE" MAPPING (documented, like RD-3's runIntent): BroadcastSlot has no planned
 * live flag — `BroadcastSlot.status` is a RUNTIME state (PLANNED at validation time),
 * not a planned-live signal. So "live" is taken from the EVENT (`Event.isLive`), which
 * is the only clean model of "this broadcast is live (vs delayed)". The FULL-segment
 * (`contentSegment === 'FULL'`), FTA (`channel.isFreeToAir`), and window-spanning
 * signals are slot-level. If richer per-slot live modelling lands, this maps to it.
 *
 * SEVERITY is a provisional WARNING per AS-2. TODO-ADR-017: ADR-017 fixes the
 * obligation severity (ERROR vs WARNING vs INFO). The governance token stays in these
 * comments + the `severity` field — it is NOT leaked into the user-facing message (AS-9).
 */
import type { ValidationResult } from './types.js'

export interface ListedFtaEvent {
  id: number
  /** Event.isLive — the "live broadcast" signal (see header). */
  isLive?: boolean | null
  /** Event scheduled window (UTC). When absent, the spanning check is skipped. */
  startUtc?: Date | string | null
  endUtc?: Date | string | null
  /** Resolved from the confirmed ListedEventCategory. Only `true` is checked. */
  fullLiveRequired: boolean
}

export interface ListedFtaSlot {
  id: string
  eventId?: number | null
  contentSegment?: string | null
  plannedStartUtc?: Date | string | null
  plannedEndUtc?: Date | string | null
  channel?: { isFreeToAir?: boolean | null } | null
}

type MissingCondition = 'no-slot' | 'continuation-only' | 'not-fta' | 'not-live' | 'partial'

/** One place for the reason phrase + remediation of each unmet condition. */
const VARIANT: Record<MissingCondition, { reason: string; remediation: string }> = {
  'no-slot': {
    reason: 'it has no scheduled slot',
    remediation: 'Schedule a live, full-segment broadcast on a free-to-air channel spanning the event.',
  },
  'continuation-only': {
    reason: 'it has only CONTINUATION segments (no full-segment broadcast)',
    remediation: 'Add a full-segment (not CONTINUATION-only) live free-to-air broadcast.',
  },
  'not-fta': {
    reason: 'its full-segment broadcast is not on a free-to-air channel',
    remediation: 'Move the full-segment live broadcast to a free-to-air channel.',
  },
  'not-live': {
    reason: 'it is not scheduled as a live broadcast',
    remediation: 'Broadcast the event live (not delayed).',
  },
  'partial': {
    reason: 'the free-to-air live broadcast does not span the full event',
    remediation: 'Extend the free-to-air live broadcast to span the full event window.',
  },
}

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/** The FIRST unmet compliance condition for an obligation event, or null if compliant. */
function firstMissingCondition(event: ListedFtaEvent, eventSlots: ListedFtaSlot[]): MissingCondition | null {
  if (eventSlots.length === 0) return 'no-slot'

  const fullSlots = eventSlots.filter(s => s.contentSegment === 'FULL')
  if (fullSlots.length === 0) return 'continuation-only'

  const ftaFullSlots = fullSlots.filter(s => s.channel?.isFreeToAir === true)
  if (ftaFullSlots.length === 0) return 'not-fta'

  if (event.isLive !== true) return 'not-live'

  // Spanning is only checkable when the event window is known; otherwise skip (no
  // false 'partial').
  const eventStart = toMs(event.startUtc)
  const eventEnd = toMs(event.endUtc)
  if (eventStart != null && eventEnd != null) {
    const spanning = ftaFullSlots.some(s => {
      const ss = toMs(s.plannedStartUtc)
      const se = toMs(s.plannedEndUtc)
      return ss != null && se != null && ss <= eventStart && se >= eventEnd
    })
    if (!spanning) return 'partial'
  }

  return null
}

export function checkListedEventFta(
  events: ListedFtaEvent[],
  slots: ListedFtaSlot[],
): ValidationResult[] {
  // Pre-group once: O(events + slots) rather than a per-event filter.
  const slotsByEvent = new Map<number, ListedFtaSlot[]>()
  for (const slot of slots) {
    if (slot.eventId == null) continue
    const bucket = slotsByEvent.get(slot.eventId)
    if (bucket) bucket.push(slot)
    else slotsByEvent.set(slot.eventId, [slot])
  }

  const results: ValidationResult[] = []
  for (const event of events) {
    if (!event.fullLiveRequired) continue
    const missing = firstMissingCondition(event, slotsByEvent.get(event.id) ?? [])
    if (missing) {
      const variant = VARIANT[missing]
      results.push({
        severity: 'WARNING', // provisional per AS-2 (see header TODO-ADR-017)
        code: 'LISTED_EVENT_FTA',
        scope: [`event-${event.id}`],
        message: `Listed event #${event.id} requires a full live free-to-air broadcast but ${variant.reason} (provisional)`,
        remediation: variant.remediation,
      })
    }
  }
  return results
}
