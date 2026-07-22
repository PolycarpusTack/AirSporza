/**
 * Stage-4 (validateRegulatory) flag-OFF GOLDEN MASTER.
 * The #1 invariant: with the regulatory flag OFF (or no gated inputs), stage 4 is
 * byte-identical to the frozen baseline below. Both gated checks — LISTED_EVENT_FTA
 * (RC-1-T3) and ACCESSIBILITY_UNPLANNED (RC-2-T3) — must be fully behind the flag.
 *
 * ── DELIBERATE REGENERATION 2026-07-22 (RC-2-T3 / TD-30 supersession) ────────────
 * The previous master (RC-1-T3) pinned the dead `ACCESSIBILITY_MISSING` stub as part
 * of the flag-OFF baseline: `{ code: 'ACCESSIBILITY_MISSING', scope: ['s2'], ... }`
 * for a slot with `hasSubtitles:false, hasAudioDescription:false`. That stub read
 * `sportMetadata` keys NO writer ever set (TD-30) and is removed in RC-2-T3,
 * superseded by the flag-gated ACCESSIBILITY_UNPLANNED check that reads real
 * `AccessibilityDeliverable` rows. So the flag-OFF baseline INTENTIONALLY changes
 * exactly once, here: it loses the ACCESSIBILITY_MISSING entry and is now
 * watershed-only. This is the TD-30 servicing (backlog RC-2-T3: stub removal gated
 * solely on the zero-consumer grep — verified: definition-only), not drift.
 * ─────────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { validateRegulatory } from '../src/services/validation/regulatory.js'

// Watershed: adult content before 21:00 → WATERSHED_VIOLATION (ERROR).
// s2 keeps the old stub-triggering metadata ON PURPOSE: it must now produce NOTHING.
const slots = [
  { id: 's1', plannedStartUtc: '2026-06-01T18:00:00.000Z', sportMetadata: { contentRating: 'adult', hasSubtitles: true }, channel: { timezone: 'Europe/Brussels' } },
  { id: 's2', plannedStartUtc: '2026-06-01T22:00:00.000Z', sportMetadata: { hasSubtitles: false, hasAudioDescription: false } },
]

// A listed obligation event with NO compliant slot — would trigger LISTED_EVENT_FTA
// IF the check ran. It must NOT run on the flag-OFF path.
const obligationEvents = [{ id: 99, isLive: false, startUtc: null, endUtc: null, fullLiveRequired: true }]

// An event whose slot (s3, below) is imminent and whose T888 deliverable is only
// REQUIRED — would trigger ACCESSIBILITY_UNPLANNED IF the check ran. Flag-OFF: never.
const accessibility = {
  events: [{ id: 7, deliverables: [{ type: 'T888' as const, status: 'REQUIRED' as const }] }],
  now: '2026-06-01T00:00:00.000Z',
}
const slotsWithImminentStart = [...slots, { id: 's3', eventId: 7, plannedStartUtc: '2026-06-02T18:00:00.000Z', sportMetadata: {} }]

describe('validateRegulatory — flag-OFF golden master', () => {
  it('no opts → watershed ONLY (frozen baseline — regenerated for TD-30, see header)', () => {
    expect(validateRegulatory(slots)).toEqual([
      { severity: 'ERROR', code: 'WATERSHED_VIOLATION', scope: ['s1'], message: "Slot has 'adult' content rating but starts before 21:00 in Europe/Brussels", remediation: 'Move to after 21:00 or remove content rating' },
    ])
  })

  it('the dead ACCESSIBILITY_MISSING stub is GONE — never emitted on any path (TD-30 settled)', () => {
    const everyPath = [
      ...validateRegulatory(slotsWithImminentStart),
      ...validateRegulatory(slotsWithImminentStart, { events: obligationEvents, accessibilityUnplanned: accessibility, regulatoryEnabled: true }),
    ]
    expect(everyPath.map(r => r.code)).not.toContain('ACCESSIBILITY_MISSING')
  })

  it('regulatoryEnabled:false with gated inputs → identical (neither gated check runs)', () => {
    const out = validateRegulatory(slotsWithImminentStart, { events: obligationEvents, accessibilityUnplanned: accessibility, regulatoryEnabled: false })
    expect(out.map(r => r.code)).not.toContain('LISTED_EVENT_FTA')
    expect(out.map(r => r.code)).not.toContain('ACCESSIBILITY_UNPLANNED')
    expect(out).toEqual(validateRegulatory(slotsWithImminentStart))
  })

  it('regulatoryEnabled:true but NO gated inputs → identical (nothing to check)', () => {
    expect(validateRegulatory(slots, { regulatoryEnabled: true })).toEqual(validateRegulatory(slots))
  })

  it('omitted opts === explicit { regulatoryEnabled: false } for the same slots', () => {
    expect(validateRegulatory(slots)).toEqual(validateRegulatory(slots, { regulatoryEnabled: false }))
  })
})

describe('validateRegulatory — flag-ON adds the gated checks (additive proof)', () => {
  it('regulatoryEnabled:true + obligation events → watershed UNCHANGED, plus LISTED_EVENT_FTA', () => {
    const off = validateRegulatory(slots)
    const on = validateRegulatory(slots, { events: obligationEvents, regulatoryEnabled: true })
    for (const r of off) expect(on).toContainEqual(r)
    expect(on.map(r => r.code)).toContain('LISTED_EVENT_FTA')
    expect(on).toHaveLength(off.length + 1) // strictly additive: exactly the one new emission
  })

  it('regulatoryEnabled:true + accessibility data → watershed UNCHANGED, plus ACCESSIBILITY_UNPLANNED', () => {
    const off = validateRegulatory(slotsWithImminentStart)
    const on = validateRegulatory(slotsWithImminentStart, { accessibilityUnplanned: accessibility, regulatoryEnabled: true })
    for (const r of off) expect(on).toContainEqual(r)
    expect(on.map(r => r.code)).toContain('ACCESSIBILITY_UNPLANNED')
    expect(on).toHaveLength(off.length + 1) // strictly additive: exactly the one new emission
  })
})
