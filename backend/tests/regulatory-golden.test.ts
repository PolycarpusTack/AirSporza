/**
 * RC-1-T3 — stage-4 (validateRegulatory) flag-OFF GOLDEN MASTER.
 * The #1 invariant: with the regulatory flag OFF (or no events), stage 4 is
 * byte-identical to today — watershed + accessibility ONLY. The new
 * LISTED_EVENT_FTA check must be fully gated.
 */
import { describe, it, expect } from 'vitest'
import { validateRegulatory } from '../src/services/validation/regulatory.js'

// Watershed: adult content before 21:00 → WATERSHED_VIOLATION (ERROR).
// Accessibility: no subtitles/audio-description → ACCESSIBILITY_MISSING (WARNING).
const slots = [
  { id: 's1', plannedStartUtc: '2026-06-01T18:00:00.000Z', sportMetadata: { contentRating: 'adult', hasSubtitles: true }, channel: { timezone: 'Europe/Brussels' } },
  { id: 's2', plannedStartUtc: '2026-06-01T22:00:00.000Z', sportMetadata: { hasSubtitles: false, hasAudioDescription: false } },
]

// A listed obligation event with NO compliant slot — would trigger LISTED_EVENT_FTA
// IF the check ran. It must NOT run on the flag-OFF path.
const obligationEvents = [{ id: 99, isLive: false, startUtc: null, endUtc: null, fullLiveRequired: true }]

describe('validateRegulatory — flag-OFF golden master', () => {
  it('no opts → watershed + accessibility only (frozen baseline)', () => {
    expect(validateRegulatory(slots)).toEqual([
      { severity: 'ERROR', code: 'WATERSHED_VIOLATION', scope: ['s1'], message: "Slot has 'adult' content rating but starts before 21:00 in Europe/Brussels", remediation: 'Move to after 21:00 or remove content rating' },
      { severity: 'WARNING', code: 'ACCESSIBILITY_MISSING', scope: ['s2'], message: 'Slot has no subtitles and no audio description' },
    ])
  })

  it('regulatoryEnabled:false with events → identical (LISTED_EVENT_FTA does NOT run)', () => {
    const out = validateRegulatory(slots, { events: obligationEvents, regulatoryEnabled: false })
    expect(out.map(r => r.code)).not.toContain('LISTED_EVENT_FTA')
    expect(out).toEqual(validateRegulatory(slots))
  })

  it('regulatoryEnabled:true but NO events → identical (nothing to check)', () => {
    expect(validateRegulatory(slots, { regulatoryEnabled: true })).toEqual(validateRegulatory(slots))
  })

  it('omitted opts === explicit { regulatoryEnabled: false } for the same slots', () => {
    expect(validateRegulatory(slots)).toEqual(validateRegulatory(slots, { regulatoryEnabled: false }))
  })
})

describe('validateRegulatory — flag-ON adds LISTED_EVENT_FTA (additive proof)', () => {
  it('regulatoryEnabled:true + obligation events → watershed + accessibility UNCHANGED, plus the new code', () => {
    const off = validateRegulatory(slots)
    const on = validateRegulatory(slots, { events: obligationEvents, regulatoryEnabled: true })
    // every flag-OFF result is still present and unchanged
    for (const r of off) expect(on).toContainEqual(r)
    // plus the additive listed-event code
    expect(on.map(r => r.code)).toContain('LISTED_EVENT_FTA')
  })
})
