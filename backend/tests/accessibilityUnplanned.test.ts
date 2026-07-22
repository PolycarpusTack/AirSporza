/**
 * RC-2-T3 — pure ACCESSIBILITY_UNPLANNED check permutation table (no DB).
 * An event whose slot starts within N days (configurable lead time) and that has a
 * REQUIRED accessibility deliverable not yet ≥ PLANNED → WARNING.
 *
 * Lead time N is ops-tunable CONFIG (`ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS`) — these
 * tests assert the MECHANISM (an injected N is respected; the default comes from the
 * config constant), never that a specific number of days is operationally correct.
 * "≥ PLANNED" is DERIVED from the RC-2-T2 state machine (reachability from PLANNED),
 * not an inline status list — the table below is the behavioral pin for that.
 *
 * Fixtures are anonymised (numeric ids only — no real event/crew/person names).
 */
import { describe, it, expect } from 'vitest'
import {
  checkAccessibilityUnplanned,
  type AccessibilityUnplannedEvent,
  type AccessibilityUnplannedSlot,
} from '../src/services/validation/accessibilityUnplanned.js'
import { ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS } from '../src/config/accessibility.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = '2026-06-10T12:00:00.000Z'
const INJECTED_LEAD_TIME_DAYS = 10 // injected lead time for these tests — NOT the config value on purpose

/** ISO timestamp `days` days (+ optional ms nudge) after NOW. */
function fromNow(days: number, nudgeMs = 0): string {
  return new Date(new Date(NOW).getTime() + days * DAY_MS + nudgeMs).toISOString()
}

function event(over: Partial<AccessibilityUnplannedEvent> = {}): AccessibilityUnplannedEvent {
  return { id: 1, deliverables: [{ type: 'T888', status: 'REQUIRED' }], ...over }
}
function slot(over: Partial<AccessibilityUnplannedSlot> = {}): AccessibilityUnplannedSlot {
  return { eventId: 1, plannedStartUtc: fromNow(5), ...over }
}
const run = (
  events: AccessibilityUnplannedEvent[],
  slots: AccessibilityUnplannedSlot[],
  leadTimeDays: number | undefined = INJECTED_LEAD_TIME_DAYS,
) => checkAccessibilityUnplanned(events, slots, { now: NOW, leadTimeDays })
const only = (rs: ReturnType<typeof checkAccessibilityUnplanned>) => {
  expect(rs).toHaveLength(1)
  return rs[0]
}

describe('checkAccessibilityUnplanned — emission shape', () => {
  it('REQUIRED deliverable + slot within N days → ACCESSIBILITY_UNPLANNED', () => {
    expect(only(run([event()], [slot()])).code).toBe('ACCESSIBILITY_UNPLANNED')
  })

  it('severity is provisional WARNING (AS-2, pending ADR-017)', () => {
    expect(only(run([event()], [slot()])).severity).toBe('WARNING')
  })

  it('scope is the event', () => {
    expect(only(run([event()], [slot()])).scope).toEqual(['event-1'])
  })

  it('message names the deliverable type and says "(provisional)" but leaks NO governance token (AS-9)', () => {
    const r = only(run([event()], [slot()]))
    expect(r.message).toContain('T888')
    expect(r.message).toContain('(provisional)')
    expect(r.message).not.toContain('TODO')
    expect(r.message).not.toContain('ADR')
    expect(r.remediation).toMatch(/PLANNED/)
  })
})

describe('checkAccessibilityUnplanned — lead-time boundaries (injected N respected)', () => {
  it('slot exactly at N days → fires (boundary is INSIDE the lead window)', () => {
    expect(run([event()], [slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS) })])).toHaveLength(1)
  })

  it('slot just inside N days (N days − 1 min) → fires', () => {
    expect(run([event()], [slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS, -60_000) })])).toHaveLength(1)
  })

  it('slot just outside N days (N days + 1 min) → silent', () => {
    expect(run([event()], [slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS, 60_000) })])).toEqual([])
  })

  it('slot already started / in the past → still fires (lead time only bounds the future side)', () => {
    expect(run([event()], [slot({ plannedStartUtc: fromNow(-2) })])).toHaveLength(1)
  })

  it('MECHANISM: the injected N is what decides — same slot fires with N=10, silent with N=1', () => {
    const fixture = [slot({ plannedStartUtc: fromNow(5) })]
    expect(run([event()], fixture, 10)).toHaveLength(1)
    expect(run([event()], fixture, 1)).toEqual([])
  })

  it('MECHANISM: omitted leadTimeDays falls back to the CONFIG default (whatever stands there)', () => {
    const atConfigBoundary = [slot({ plannedStartUtc: fromNow(ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS) })]
    const justOutsideConfig = [slot({ plannedStartUtc: fromNow(ACCESSIBILITY_UNPLANNED_LEAD_TIME_DAYS, 60_000) })]
    expect(checkAccessibilityUnplanned([event()], atConfigBoundary, { now: NOW })).toHaveLength(1)
    expect(checkAccessibilityUnplanned([event()], justOutsideConfig, { now: NOW })).toEqual([])
  })
})

describe('checkAccessibilityUnplanned — deliverable status table (≥ PLANNED derived from the state machine)', () => {
  it('status REQUIRED → fires', () => {
    expect(run([event({ deliverables: [{ type: 'T888', status: 'REQUIRED' }] })], [slot()])).toHaveLength(1)
  })

  it.each(['PLANNED', 'CONFIRMED', 'DELIVERED'] as const)('status %s (≥ PLANNED) → silent', status => {
    expect(run([event({ deliverables: [{ type: 'T888', status }] })], [slot()])).toEqual([])
  })

  it('NOT_REQUIRED only → silent (no obligation)', () => {
    expect(run([event({ deliverables: [{ type: 'AUDIO_DESCRIPTION', status: 'NOT_REQUIRED' }] })], [slot()])).toEqual([])
  })

  it('no deliverable rows at all → silent (nothing REQUIRED)', () => {
    expect(run([event({ deliverables: [] })], [slot()])).toEqual([])
  })

  it('one result PER unmet REQUIRED type (T888 + VGT required, AD delivered)', () => {
    const e = event({
      deliverables: [
        { type: 'T888', status: 'REQUIRED' },
        { type: 'AUDIO_DESCRIPTION', status: 'DELIVERED' },
        { type: 'VGT', status: 'REQUIRED' },
      ],
    })
    const out = run([e], [slot()])
    expect(out).toHaveLength(2)
    expect(out.map(r => r.message).join(' ')).toContain('T888')
    expect(out.map(r => r.message).join(' ')).toContain('VGT')
  })
})

describe('checkAccessibilityUnplanned — slot timing signals', () => {
  it('event with NO slots → silent (lead time not assessable; no false positive)', () => {
    expect(run([event()], [])).toEqual([])
  })

  it('slot without any start time → silent (lead time not assessable)', () => {
    expect(run([event()], [slot({ plannedStartUtc: null })])).toEqual([])
  })

  it('falls back to estimatedStartUtc when plannedStartUtc is absent (same signal as watershed)', () => {
    expect(run([event()], [slot({ plannedStartUtc: null, estimatedStartUtc: fromNow(5) })])).toHaveLength(1)
  })

  it('plannedStartUtc WINS over a disagreeing estimatedStartUtc (?? precedence, not "whichever fires")', () => {
    const outside = slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS + 30), estimatedStartUtc: fromNow(5) })
    expect(run([event()], [outside])).toEqual([])
  })

  it('unparseable start strings are skipped like missing ones (no false positive, no throw)', () => {
    expect(run([event()], [slot({ plannedStartUtc: 'not-a-date' })])).toEqual([])
  })

  it('ANY slot within the window is enough (one inside + one outside → fires once per unmet type)', () => {
    const slots = [slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS + 30) }), slot({ plannedStartUtc: fromNow(3) })]
    expect(run([event()], slots)).toHaveLength(1)
  })

  it('all slots outside the window → silent', () => {
    expect(run([event()], [slot({ plannedStartUtc: fromNow(INJECTED_LEAD_TIME_DAYS + 30) })])).toEqual([])
  })

  it('slots of OTHER events do not leak in (per-event grouping)', () => {
    const e2 = event({ id: 2 })
    const out = run([event(), e2], [slot({ eventId: 2 })]) // only event 2 has a near slot
    expect(only(out).scope).toEqual(['event-2'])
  })
})
