/**
 * Permutation tests for the ops derived-status selectors (A-3-T1, remediated per
 * the adversarial threshold review — BLOCKERS 1-3, MAJOR 4-5 pinned below).
 * Contract: docs/governance/contracts/ops-selectors.md (ops-selectors v1).
 *
 * The FIRST rights rows pin the AS-4 PROVISIONAL standard formulas (architect
 * decision: standard thresholds now, dedicated threshold-formula session later —
 * that session re-reads exactly these rows). Fixed clocks throughout: FIXTURE_NOW
 * (midnight) and FIXTURE_NOW_DAYTIME (10:00Z, end-of-day semantics pins).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { Contract, FieldConfig, TechPlan } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import { detectCrewConflicts } from '../../utils/crewConflicts'
import {
  FIXTURE_CONFLICTS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_NOW_DAYTIME,
  FIXTURE_PLANS,
  FIXTURE_WEEK,
  makeContract,
  makeEvent,
} from './__fixtures__/opsFixtureWeek'
import { deriveCrewHealth, deriveRightsStatus, groupEventsByDay } from './selectors'

const eventForCompetition = (competitionId: number) => makeEvent({ id: 999, competitionId })

describe('deriveRightsStatus — AS-4 provisional precedence (permutation table)', () => {
  // FIXTURE_NOW = 2026-03-04T00:00:00Z; now+90d = 2026-06-02T00:00:00Z exactly.
  it.each<{ row: string; contracts: Contract[]; expected: string }>([
    // ── AS-4 provisional standard formulas — pinned rows 1–4 (precedence order) ──
    { row: '1. no contract row for the competition → MISSING', contracts: [], expected: 'MISSING' },
    { row: "2. status 'none' → MISSING", contracts: [makeContract({ id: 1, competitionId: 9, status: 'none', validUntil: '' })], expected: 'MISSING' },
    { row: "3. status 'draft' → NEGOTIATION", contracts: [makeContract({ id: 1, competitionId: 9, status: 'draft', validUntil: '2028-12-31' })], expected: 'NEGOTIATION' },
    { row: '4. validUntil EXACTLY now+90d → EXPIRING (boundary inclusive)', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-06-02' })], expected: 'EXPIRING' },
    // ── boundary + robustness rows ──
    { row: 'validUntil one day past the window (now+91d) → VALID', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-06-03' })], expected: 'VALID' },
    { row: 'validUntil inside the window (now+42d) → EXPIRING', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-04-15' })], expected: 'EXPIRING' },
    { row: 'validUntil == now (expires today) → EXPIRING, still held', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-03-04' })], expected: 'EXPIRING' },
    { row: 'lapsed: validUntil in the past → MISSING (rights no longer held)', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-02-01' })], expected: 'MISSING' },
    { row: "lapsed 'draft' → NEGOTIATION (draft outranks the lapse rule)", contracts: [makeContract({ id: 1, competitionId: 9, status: 'draft', validUntil: '2026-02-01' })], expected: 'NEGOTIATION' },
    { row: "'none' with a covering/far validUntil is still MISSING (status wins)", contracts: [makeContract({ id: 1, competitionId: 9, status: 'none', validUntil: '2028-01-01' })], expected: 'MISSING' },
    { row: "stored 'expiring' with far validUntil is IGNORED → VALID (derive, don't trust)", contracts: [makeContract({ id: 1, competitionId: 9, status: 'expiring', validUntil: '2028-01-01' })], expected: 'VALID' },
    { row: "stored 'valid' with near validUntil is IGNORED → EXPIRING", contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-03-20' })], expected: 'EXPIRING' },
    { row: "empty-string validUntil with status 'valid' → VALID (absent, not NaN-crash)", contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '' })], expected: 'VALID' },
    { row: 'garbage validUntil → treated as absent → VALID', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: 'not-a-date' })], expected: 'VALID' },
    { row: 'absent validUntil (undefined) → VALID', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid' })], expected: 'VALID' },
    { row: 'validUntil as a Date OBJECT → VALID (Date arm of the parser)', contracts: [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: new Date('2027-06-30T00:00:00Z') })], expected: 'VALID' },
    // ── multiple contracts per competition ──
    {
      row: 'two contracts: lapsed predecessor + covering successor → successor (VALID)',
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2023-01-01', validUntil: '2025-12-31' }),
        makeContract({ id: 2, competitionId: 9, status: 'valid', validFrom: '2025-08-01', validUntil: '2027-08-01' }),
      ],
      expected: 'VALID',
    },
    {
      row: 'two contracts, both lapsed: latest validUntil picked → still MISSING',
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2024-12-31' }),
        makeContract({ id: 2, competitionId: 9, status: 'valid', validUntil: '2025-12-31' }),
      ],
      expected: 'MISSING',
    },
    {
      row: 'two contracts, none covering: latest-validUntil draft wins → NEGOTIATION',
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2020-01-01', validUntil: '2025-06-30' }),
        makeContract({ id: 2, competitionId: 9, status: 'draft', validFrom: '2026-07-01', validUntil: '2028-12-31' }),
      ],
      expected: 'NEGOTIATION',
    },
    {
      row: 'both non-covering with unparseable validUntil → tie keeps INPUT order (first is draft)',
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'draft', validFrom: '2027-01-01', validUntil: '' }),
        makeContract({ id: 2, competitionId: 9, status: 'valid', validFrom: '2027-06-01', validUntil: '' }),
      ],
      expected: 'NEGOTIATION',
    },
    { row: 'contracts of OTHER competitions are invisible → MISSING', contracts: [makeContract({ id: 1, competitionId: 777, status: 'valid', validUntil: '2028-01-01' })], expected: 'MISSING' },
    // ── MAJOR 4: multiple COVERING contracts — status-class preference (PROVISIONAL) ──
    {
      row: "covering 'valid' beats covering 'none' with a LATER validUntil → VALID",
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2027-06-30' }),
        makeContract({ id: 2, competitionId: 9, status: 'none', validFrom: '2024-01-01', validUntil: '2028-01-01' }),
      ],
      expected: 'VALID',
    },
    {
      row: "covering 'valid' (now+30d) beats covering early-signed 'draft' (2030) → EXPIRING",
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2026-04-03' }),
        makeContract({ id: 2, competitionId: 9, status: 'draft', validFrom: '2024-01-01', validUntil: '2030-12-31' }),
      ],
      expected: 'EXPIRING',
    },
    {
      row: "open-ended covering 'valid' (validUntil '') beats dated covering 'none' → VALID",
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'none', validFrom: '2024-01-01', validUntil: '2028-01-01' }),
        makeContract({ id: 2, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '' }),
      ],
      expected: 'VALID',
    },
    {
      row: "covering 'valid' + STALE 'none' sibling → VALID (pick precedes status rules)",
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'none', validFrom: '', validUntil: '' }),
        makeContract({ id: 2, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2027-06-30' }),
      ],
      expected: 'VALID',
    },
    {
      row: "future-validFrom 'draft' is NOT covering: covering valid (now+42d) governs → EXPIRING",
      contracts: [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2026-04-15' }),
        makeContract({ id: 2, competitionId: 9, status: 'draft', validFrom: '2027-01-01', validUntil: '2030-12-31' }),
      ],
      expected: 'EXPIRING',
    },
  ])('$row', ({ contracts, expected }) => {
    expect(deriveRightsStatus(eventForCompetition(9), contracts, FIXTURE_NOW)).toBe(expected)
  })

  it('equal validUntil among same-class covering contracts → order-stable outcome', () => {
    // Same class + same validUntil derive identically by construction; this pins
    // that reordering cannot flip the result. The input-order tie-break itself is
    // observably pinned in the non-covering unparseable row above.
    const a = makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2027-06-30' })
    const b = makeContract({ id: 2, competitionId: 9, status: 'expiring', validFrom: '2024-01-01', validUntil: '2027-06-30' })

    expect(deriveRightsStatus(eventForCompetition(9), [a, b], FIXTURE_NOW)).toBe(
      deriveRightsStatus(eventForCompetition(9), [b, a], FIXTURE_NOW),
    )
  })

  describe('BLOCKER 3 — validUntil is END of its day (real clocks have a time of day)', () => {
    it("expiry day, 10:00Z: validUntil '2026-03-04' + status 'valid' → EXPIRING, not MISSING", () => {
      const contracts = [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-03-04' })]

      expect(deriveRightsStatus(eventForCompetition(9), contracts, FIXTURE_NOW_DAYTIME)).toBe('EXPIRING')
    })

    it('expiry-day contract still COVERS at 10:00Z (beats a dated none sibling)', () => {
      const contracts = [
        makeContract({ id: 1, competitionId: 9, status: 'valid', validFrom: '2024-01-01', validUntil: '2026-03-04' }),
        makeContract({ id: 2, competitionId: 9, status: 'none', validFrom: '2024-01-01', validUntil: '2028-01-01' }),
      ]

      expect(deriveRightsStatus(eventForCompetition(9), contracts, FIXTURE_NOW_DAYTIME)).toBe('EXPIRING')
    })

    it('end-of-day does not over-extend: validUntil yesterday at 10:00Z → MISSING', () => {
      const contracts = [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2026-03-03' })]

      expect(deriveRightsStatus(eventForCompetition(9), contracts, FIXTURE_NOW_DAYTIME)).toBe('MISSING')
    })
  })

  it('fixture-week inventory derives every status exactly as documented', () => {
    const byComp = (competitionId: number) =>
      deriveRightsStatus(eventForCompetition(competitionId), FIXTURE_CONTRACTS, FIXTURE_NOW)

    expect(byComp(101)).toBe('VALID')
    expect(byComp(102)).toBe('EXPIRING')
    expect(byComp(103)).toBe('NEGOTIATION')
    expect(byComp(104)).toBe('MISSING') // status 'none'
    expect(byComp(105)).toBe('MISSING') // no contract row
    expect(byComp(106)).toBe('VALID') // stale stored 'expiring' ignored
    expect(byComp(108)).toBe('MISSING') // lapsed
    expect(byComp(109)).toBe('VALID') // covering contract of the pair
    expect(byComp(110)).toBe('EXPIRING') // inclusive now+90d boundary
  })
})

describe('deriveCrewHealth — precedence permutation table', () => {
  const fixtureEvent = (id: number) => FIXTURE_EVENTS.find((e) => e.id === id)!
  const health = (eventId: number) =>
    deriveCrewHealth(fixtureEvent(eventId), FIXTURE_PLANS, FIXTURE_CONFLICTS, DEFAULT_CREW_FIELDS)

  it('fixture conflict inventory has the documented severities (API-shaped e3 included)', () => {
    expect(FIXTURE_CONFLICTS.get('3:reporter')?.[0]?.severity).toBe('full')
    expect(FIXTURE_CONFLICTS.get('4:camera')?.[0]?.severity).toBe('full')
    expect(FIXTURE_CONFLICTS.get('5:sound')?.[0]?.severity).toBe('partial')
    expect(FIXTURE_CONFLICTS.get('6:reporter')?.[0]?.severity).toBe('partial')
  })

  it('full-severity conflict → CONFLICT (both events of the pair)', () => {
    expect(health(3)).toBe('CONFLICT')
    expect(health(4)).toBe('CONFLICT')
  })

  it('partial-severity conflict → CONFLICT (severity does not soften the verdict)', () => {
    expect(health(5)).toBe('CONFLICT')
    expect(health(6)).toBe('CONFLICT')
  })

  it('zero plans → OPEN (pinned decision)', () => {
    expect(health(7)).toBe('OPEN')
  })

  it('whitespace-only required encoder → OPEN', () => {
    expect(health(8)).toBe('OPEN')
  })

  it('complete crew, no conflicts → OK', () => {
    expect(health(1)).toBe('OK')
    expect(health(2)).toBe('OK')
    expect(health(9)).toBe('OK')
  })

  it('missing required KEY (not just blank value) → OPEN', () => {
    const event = makeEvent({ id: 50 })
    const plans: TechPlan[] = [
      { id: 50, eventId: 50, planType: 'Live', crew: { reporter: 'Only Reporter' }, isLivestream: false, customFields: [] },
    ]
    expect(deriveCrewHealth(event, plans, new Map(), DEFAULT_CREW_FIELDS)).toBe('OPEN')
  })

  it('non-string required value (e.g. 42) counts as blank → OPEN', () => {
    const event = makeEvent({ id: 51 })
    const plans: TechPlan[] = [
      { id: 51, eventId: 51, planType: 'Live', crew: { encoder: 42 }, isLivestream: false, customFields: [] },
    ]
    expect(deriveCrewHealth(event, plans, new Map(), DEFAULT_CREW_FIELDS)).toBe('OPEN')
  })

  it('CONFLICT outranks OPEN when both apply', () => {
    // same person on two overlapping events, AND a blank required encoder on one plan
    const eventA = makeEvent({ id: 60, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const eventB = makeEvent({ id: 61, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const plans: TechPlan[] = [
      { id: 60, eventId: 60, planType: 'Live', crew: { encoder: '', camera: 'Dana Both' }, isLivestream: false, customFields: [] },
      { id: 61, eventId: 61, planType: 'Live', crew: { encoder: 'ENC-61', camera: 'Dana Both' }, isLivestream: false, customFields: [] },
    ]
    const conflicts = detectCrewConflicts(plans, [eventA, eventB])

    expect(deriveCrewHealth(eventA, plans, conflicts, DEFAULT_CREW_FIELDS)).toBe('CONFLICT')
  })

  it('requiredness comes from the crewFields PARAM, never hard-coded', () => {
    const reporterRequired: FieldConfig[] = DEFAULT_CREW_FIELDS.map((f) =>
      f.id === 'reporter' ? { ...f, required: true } : f,
    )
    const event = makeEvent({ id: 70 })
    const plans: TechPlan[] = [
      { id: 70, eventId: 70, planType: 'Live', crew: { encoder: 'ENC-70' }, isLivestream: false, customFields: [] },
    ]
    // encoder filled → OK under defaults, OPEN once reporter is also required
    expect(deriveCrewHealth(event, plans, new Map(), DEFAULT_CREW_FIELDS)).toBe('OK')
    expect(deriveCrewHealth(event, plans, new Map(), reporterRequired)).toBe('OPEN')
  })

  it('required but INVISIBLE fields are ignored (visible gate pinned)', () => {
    const hiddenRequired: FieldConfig[] = DEFAULT_CREW_FIELDS.map((f) =>
      f.id === 'encoder' ? { ...f, visible: false } : f,
    )
    const event = makeEvent({ id: 71 })
    const plans: TechPlan[] = [
      { id: 71, eventId: 71, planType: 'Live', crew: { reporter: 'No Encoder Needed' }, isLivestream: false, customFields: [] },
    ]
    expect(deriveCrewHealth(event, plans, new Map(), hiddenRequired)).toBe('OK')
  })

  it('plan with a null/absent crew object → OPEN, no crash', () => {
    const event = makeEvent({ id: 73 })
    const plans: TechPlan[] = [
      { id: 73, eventId: 73, planType: 'Live', crew: null as unknown as Record<string, unknown>, isLivestream: false, customFields: [] },
    ]
    expect(deriveCrewHealth(event, plans, new Map(), DEFAULT_CREW_FIELDS)).toBe('OPEN')
  })

  it('non-required blanks do not matter → OK', () => {
    const event = makeEvent({ id: 72 })
    const plans: TechPlan[] = [
      { id: 72, eventId: 72, planType: 'Live', crew: { encoder: 'ENC-72', reporter: '' }, isLivestream: false, customFields: [] },
    ]
    expect(deriveCrewHealth(event, plans, new Map(), DEFAULT_CREW_FIELDS)).toBe('OK')
  })

  it("other events' plans are ignored (plans filtered by eventId inside)", () => {
    // e1's health must not change because e8 (blank encoder) exists in the same plans array
    expect(health(1)).toBe('OK')
  })
})

describe('groupEventsByDay — week shape and ordering', () => {
  const groups = groupEventsByDay(FIXTURE_EVENTS, FIXTURE_WEEK)

  it('returns exactly 7 day groups, Monday→Sunday, INCLUDING empty days', () => {
    expect(groups.map((g) => g.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ])
    expect(groups[5].events).toEqual([]) // Saturday empty
    expect(groups[6].events).toEqual([]) // Sunday empty
  })

  it('BLOCKER 1: API-shaped ISO-datetime startDateBE groups on its day, ordered (e2 before e1)', () => {
    const monday = groups[0]
    expect(monday.events.map((e) => e.id)).toEqual([2, 1]) // 14:00 before 20:00; e2 is ISO-datetime
  })

  it('MAJOR 5: LOCAL-midnight Date object lands on the LOCAL day (e9 → Friday)', () => {
    const friday = groups[4]
    expect(friday.events.map((e) => e.id)).toEqual([9])
  })

  it('excludes events outside the week (e10 on the next Monday)', () => {
    const allIds = groups.flatMap((g) => g.events.map((e) => e.id))
    expect(allIds).not.toContain(10)
    expect(allIds).toHaveLength(FIXTURE_EVENTS.length - 1)
  })

  it("single-digit-hour times sort numerically: '9:00' before '20:00'", () => {
    const early = makeEvent({ id: 90, startDateBE: '2026-03-02', startTimeBE: '9:00' })
    const late = makeEvent({ id: 91, startDateBE: '2026-03-02', startTimeBE: '20:00' })
    const grouped = groupEventsByDay([late, early], FIXTURE_WEEK)

    expect(grouped[0].events.map((e) => e.id)).toEqual([90, 91])
  })

  it('equal startTimeBE keeps input order (stable sort)', () => {
    const first = makeEvent({ id: 92, startDateBE: '2026-03-02', startTimeBE: '12:00' })
    const second = makeEvent({ id: 93, startDateBE: '2026-03-02', startTimeBE: '12:00' })
    const grouped = groupEventsByDay([first, second], FIXTURE_WEEK)

    expect(grouped[0].events.map((e) => e.id)).toEqual([92, 93])
  })

  it('event exactly on week.start+6d (Sunday) is included', () => {
    const sundayEvent = makeEvent({ id: 94, startDateBE: '2026-03-08', startTimeBE: '12:00' })
    const grouped = groupEventsByDay([sundayEvent], FIXTURE_WEEK)

    expect(grouped[6].events.map((e) => e.id)).toEqual([94])
  })

  it('INVALID Date object startDateBE is skipped silently, no throw', () => {
    const broken = makeEvent({ id: 95, startDateBE: new Date('garbage') })

    expect(() => groupEventsByDay([broken], FIXTURE_WEEK)).not.toThrow()
    expect(groupEventsByDay([broken], FIXTURE_WEEK).flatMap((g) => g.events)).toEqual([])
  })

  it('unparseable week.start → empty result, no crash (defensive, documented)', () => {
    expect(groupEventsByDay(FIXTURE_EVENTS, { start: 'garbage' })).toEqual([])
  })

  it('event with an absent/empty startDateBE is skipped, no crash', () => {
    const dateless = makeEvent({ id: 80, startDateBE: '' })
    const grouped = groupEventsByDay([dateless], FIXTURE_WEEK)

    expect(grouped.flatMap((g) => g.events)).toEqual([])
  })
})
