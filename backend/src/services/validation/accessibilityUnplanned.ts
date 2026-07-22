/**
 * RC-2-T3 — ACCESSIBILITY_UNPLANNED (beheersovereenkomst accessibility deliverables,
 * G11). Pure, no DB, no clock — `now` is injected. An event whose slot starts within
 * N days (configurable lead time, `ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS`) and that
 * has a REQUIRED accessibility deliverable not yet ≥ PLANNED gets one warning per
 * unmet deliverable type.
 *
 * "≥ PLANNED" is DERIVED from the RC-2-T2 state machine (`ACCESSIBILITY_TRANSITIONS`)
 * by reachability from PLANNED — no inline status list, so a new lifecycle status
 * cannot silently fall out of sync with the check. Reachability equals "at or past"
 * ONLY while the machine is forward-only past REQUIRED; a load-time guard below makes
 * that dependency physical (adding an undo edge fails loudly here, not silently).
 *
 * TIMING SIGNAL: `plannedStartUtc ?? estimatedStartUtc` per slot — the same slot-start
 * derivation as the watershed check in this stage. An event is "within lead time" iff
 * ANY of its slots starts at or before `now + N days` (boundary INCLUSIVE — exactly N
 * days out still warns; N days = N×24h of wall-clock ms, not calendar days — a DST
 * shift moves the boundary by an hour, acceptable for a planning horizon). There is
 * deliberately NO lower bound: a slot that already
 * started (or passed) with an unplanned REQUIRED deliverable is still unmet — the
 * obligation does not lapse by being late. Slots/events without a parseable start are
 * skipped (lead time not assessable → no false positive).
 *
 * SEVERITY is a provisional WARNING per AS-2. TODO-ADR-017: ADR-017 (still Proposed)
 * fixes the obligation severity (ERROR vs WARNING vs INFO). The governance token stays
 * in these comments + the `severity` field — NOT in the user-facing message (AS-9).
 */
import type { AccessibilityStatus, AccessibilityType } from '@prisma/client'
import type { ValidationResult } from './types.js'
import { ACCESSIBILITY_TRANSITIONS } from '../accessibility/transitions.js'
import { ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS } from '../../config/accessibility.js'

export interface AccessibilityUnplannedEvent {
  id: number
  /** The event's AccessibilityDeliverable rows (tenant-scoped read at the route). */
  deliverables: Array<{ type: AccessibilityType; status: AccessibilityStatus }>
}

export interface AccessibilityUnplannedSlot {
  eventId?: number | null
  plannedStartUtc?: Date | string | null
  estimatedStartUtc?: Date | string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** All statuses reachable from `start` (inclusive) by walking the state machine. */
function statusesReachableFrom(start: AccessibilityStatus): ReadonlySet<AccessibilityStatus> {
  const seen = new Set<AccessibilityStatus>([start])
  const stack: AccessibilityStatus[] = [start]
  while (stack.length > 0) {
    for (const next of ACCESSIBILITY_TRANSITIONS[stack.pop()!]) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return seen
}

/** "≥ PLANNED" — derived, never listed inline. */
const AT_OR_PAST_PLANNED = statusesReachableFrom('PLANNED')
// Reachability = ordering only while the machine has no undo edges past REQUIRED.
// If that ever changes (contemplated in transitions.ts), this check's semantics need
// an explicit ordered lifecycle source — fail at load, not silently at runtime.
if (AT_OR_PAST_PLANNED.has('REQUIRED') || AT_OR_PAST_PLANNED.has('NOT_REQUIRED')) {
  throw new Error(
    'ACCESSIBILITY_TRANSITIONS gained a backward edge: "reachable from PLANNED" no longer means "≥ PLANNED" — rework AT_OR_PAST_PLANNED before shipping',
  )
}

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export function checkAccessibilityUnplanned(
  events: AccessibilityUnplannedEvent[],
  slots: AccessibilityUnplannedSlot[],
  opts: { now: Date | string; leadTimeDays?: number },
): ValidationResult[] {
  const leadTimeDays = opts.leadTimeDays ?? ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS
  const nowMs = toMs(opts.now)
  if (nowMs == null) return []
  const horizonMs = nowMs + leadTimeDays * DAY_MS

  // Pre-group the earliest parseable slot start per event: O(events + slots).
  const earliestStartByEvent = new Map<number, number>()
  for (const slot of slots) {
    if (slot.eventId == null) continue
    const startMs = toMs(slot.plannedStartUtc ?? slot.estimatedStartUtc)
    if (startMs == null) continue
    const current = earliestStartByEvent.get(slot.eventId)
    if (current == null || startMs < current) earliestStartByEvent.set(slot.eventId, startMs)
  }

  const results: ValidationResult[] = []
  for (const event of events) {
    const earliest = earliestStartByEvent.get(event.id)
    const startsWithinLeadTime = earliest != null && earliest <= horizonMs
    if (!startsWithinLeadTime) continue

    for (const deliverable of event.deliverables) {
      if (deliverable.status === 'NOT_REQUIRED') continue
      if (AT_OR_PAST_PLANNED.has(deliverable.status)) continue
      results.push({
        severity: 'WARNING', // provisional per AS-2 (see header TODO-ADR-017)
        code: 'ACCESSIBILITY_UNPLANNED',
        scope: [`event-${event.id}`],
        message: `Event #${event.id} starts within ${leadTimeDays} days (or has already started) but its required ${deliverable.type} accessibility deliverable is not yet planned (provisional)`,
        remediation: `Transition the ${deliverable.type} deliverable to PLANNED (or mark it not required where the requirement toggle applies)`,
      })
    }
  }
  return results
}
