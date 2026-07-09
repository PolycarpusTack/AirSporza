/**
 * Permutation tests for the ops-selectors v3 additions (B-3-T1 — Rights
 * tiles/matrix). Contract: docs/governance/contracts/ops-selectors.md (v3).
 *
 * Deliberately a SEPARATE file (house pattern since A-4-T0): A-3's
 * selectors.test.ts and A-4's selectors.inspector.test.ts stay byte-unchanged —
 * they are the BEHAVIOR PIN for the pin-3 deriveCompetitionRightsInfo
 * extraction (deriveRightsInfo now delegates; its output must not move).
 *
 * Written to Story B-3's pinned decisions (re-gate 2026-07-04):
 *   pin 1 — platform mapping linear→LINEAR, on-demand→MAX, radio→RADIO;
 *           ON-DEM reserved false (AS-8); unknown values light NO column and
 *           warn once per value.
 *   pin 2 — row universe = competitions with ≥1 contract ∪ ≥1 event (ALL
 *           events); one row per competition = governing contract; dangling
 *           competitionId → 'COMPETITION #<id>' fallback, never dropped.
 *   pin 4 — validity pct formula + full null/clamp edge table; text variants.
 *   pin 5 — severity-first order (MISSING, EXPIRING, NEGOTIATION, VALID),
 *           then name asc.
 * Fixed clock FIXTURE_NOW; no React; no Date.now().
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_COMPETITIONS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  makeCompetition,
  makeContract,
  makeEvent,
} from './__fixtures__/opsFixtureWeek'
import {
  deriveCompetitionRightsInfo,
  deriveRightsInfo,
  deriveRightsMatrix,
  deriveRightsStatus,
  deriveRightsTiles,
  deriveValidityBand,
  deriveValidityProgress,
} from './selectors'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const matrix = () => deriveRightsMatrix(FIXTURE_CONTRACTS, FIXTURE_COMPETITIONS, FIXTURE_EVENTS, FIXTURE_NOW)
const rowFor = (competitionId: number) => {
  const row = matrix().find((r) => r.competitionId === competitionId)
  expect(row).toBeDefined() // universe regressions fail HERE, diagnostically
  return row!
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deriveCompetitionRightsInfo — pin-3 extraction (deriveRightsInfo delegates)', () => {
  it('delegation identity: deriveRightsInfo(event) === deriveCompetitionRightsInfo(event.competitionId) for EVERY fixture event', () => {
    const mismatches = FIXTURE_EVENTS.map((event) => ({
      eventId: event.id,
      viaEvent: deriveRightsInfo(event, FIXTURE_CONTRACTS, FIXTURE_NOW),
      viaCompetition: deriveCompetitionRightsInfo(event.competitionId, FIXTURE_CONTRACTS, FIXTURE_NOW),
    })).filter((entry) => JSON.stringify(entry.viaEvent) !== JSON.stringify(entry.viaCompetition))

    expect(mismatches).toEqual([]) // failure output names the offending events
  })

  it('no contract row for the competition → MISSING with null contract (same shape as v2)', () => {
    expect(deriveCompetitionRightsInfo(105, FIXTURE_CONTRACTS, FIXTURE_NOW)).toEqual({
      status: 'MISSING',
      validUntil: null,
      contract: null,
    })
  })
})

describe('deriveValidityProgress — pin-4 formula + edge table', () => {
  /**
   * ms-exact construction: a contract whose validity term ENDS exactly
   * `remainingHours` after FIXTURE_NOW with a total term of `termHours`.
   * validUntilEndOfDayMs widens day-precision dates by +DAY_MS−1, so the
   * stored validUntil is backed off by exactly that amount.
   */
  const contractAt = (remainingHours: number, termHours: number) => {
    const untilEndMs = FIXTURE_NOW.getTime() + remainingHours * HOUR_MS
    return makeContract({
      id: 900,
      competitionId: 900,
      status: 'valid',
      validUntil: new Date(untilEndMs - DAY_MS + 1),
      validFrom: new Date(untilEndMs - termHours * HOUR_MS),
    })
  }

  it('returns the UNROUNDED fraction of the term remaining', () => {
    expect(deriveValidityProgress(contractAt(15, 100), FIXTURE_NOW)).toBeCloseTo(0.15, 12)
    expect(deriveValidityProgress(contractAt(50, 100), FIXTURE_NOW)).toBeCloseTo(0.5, 12)
    expect(deriveValidityProgress(contractAt(72, 100), FIXTURE_NOW)).toBeCloseTo(0.72, 12)
  })

  it('lapsed contract → 0 exactly (bar disappears when the word flips — fixture comp 108)', () => {
    const lapsed = FIXTURE_CONTRACTS.find((c) => c.competitionId === 108)!
    expect(deriveValidityProgress(lapsed, FIXTURE_NOW)).toBe(0)
  })

  it('future validFrom clamps to 1 (term has not started)', () => {
    const future = makeContract({
      id: 901,
      competitionId: 901,
      status: 'valid',
      validFrom: new Date(FIXTURE_NOW.getTime() + 10 * DAY_MS),
      validUntil: new Date(FIXTURE_NOW.getTime() + 100 * DAY_MS),
    })
    expect(deriveValidityProgress(future, FIXTURE_NOW)).toBe(1)
  })

  it('null table: absent/empty/garbage validFrom or validUntil, degenerate validFrom ≥ validUntil', () => {
    const base = { id: 902, competitionId: 902, status: 'valid' as const }
    expect(deriveValidityProgress(makeContract({ ...base, validFrom: '', validUntil: '2027-01-01' }), FIXTURE_NOW)).toBeNull()
    expect(deriveValidityProgress(makeContract({ ...base, validUntil: '2027-01-01' }), FIXTURE_NOW)).toBeNull() // validFrom truly absent
    expect(deriveValidityProgress(makeContract({ ...base, validFrom: '2024-01-01' }), FIXTURE_NOW)).toBeNull() // no validUntil
    expect(deriveValidityProgress(makeContract({ ...base, validFrom: 'garbage', validUntil: '2027-01-01' }), FIXTURE_NOW)).toBeNull()
    expect(deriveValidityProgress(makeContract({ ...base, validFrom: '2024-01-01', validUntil: 'garbage' }), FIXTURE_NOW)).toBeNull()
    expect(deriveValidityProgress(makeContract({ ...base, validFrom: '2027-01-02', validUntil: '2027-01-01' }), FIXTURE_NOW)).toBeNull()
    // exact degenerate boundary: validFrom at the END-of-day instant of validUntil
    const untilEndMs = Date.parse('2027-01-01') + DAY_MS - 1
    expect(
      deriveValidityProgress(makeContract({ ...base, validFrom: new Date(untilEndMs), validUntil: '2027-01-01' }), FIXTURE_NOW),
    ).toBeNull()
  })

  it('ONE-DAY term (validFrom === validUntil) is NOT degenerate — end-of-day widening keeps a real window (mutation pin)', () => {
    // A raw-validUntil degenerate guard would see until ≤ from and return null;
    // the pinned end-of-day comparison sees a full-day window. FIXTURE_NOW is
    // the UTC midnight OF that day → progress is exactly 1 (whole day remains).
    const oneDay = makeContract({
      id: 911,
      competitionId: 911,
      status: 'valid',
      validFrom: '2026-03-04',
      validUntil: '2026-03-04',
    })
    expect(deriveValidityProgress(oneDay, FIXTURE_NOW)).toBe(1)
  })
})

describe('deriveValidityBand — threshold boundary sides (single source for T2)', () => {
  it("AC 'red <15%, amber <50%, green else' — EXACT boundaries fall on the higher band", () => {
    expect(deriveValidityBand(0)).toBe('red')
    expect(deriveValidityBand(0.1499999)).toBe('red')
    expect(deriveValidityBand(0.15)).toBe('amber') // exactly 15% is NOT red (pinned side)
    expect(deriveValidityBand(0.4999999)).toBe('amber')
    expect(deriveValidityBand(0.5)).toBe('green') // exactly 50% is NOT amber (pinned side)
    expect(deriveValidityBand(1)).toBe('green')
  })
})

describe('deriveRightsMatrix — row universe + order (pins 2 + 5)', () => {
  it('universe = contracts ∪ event-bearing competitions, severity-first then name asc', () => {
    expect(matrix().map((row) => row.competitionId)).toEqual([
      // MISSING (name asc): GP E (105, event-only), Series H (108, lapsed), Tour D (104, 'none')
      105, 108, 104,
      // EXPIRING: Champs J (110), Open B (102)
      110, 102,
      // NEGOTIATION: Cup C (103)
      103,
      // VALID: Classic I (109), League A (101), Masters F (106)
      109, 101, 106,
    ])
  })

  it('a competition with NEITHER contracts NOR events is excluded (fixture comp 107)', () => {
    expect(FIXTURE_COMPETITIONS.some((c) => c.id === 107)).toBe(true) // precondition: exists in the inventory
    expect(matrix().some((row) => row.competitionId === 107)).toBe(false)
  })

  it('event-only competition (105) → MISSING row: no contract, no bar, "No agreement in place"', () => {
    const row = rowFor(105)

    expect(row.competitionName).toBe('GP E')
    expect(row.status).toBe('MISSING')
    expect(row.contract).toBeNull()
    expect(row.validityProgress).toBeNull()
    expect(row.validityLabel).toBe('No agreement in place')
    expect(row.platformColumns).toEqual({ LINEAR: false, MAX: false, RADIO: false, ONDEM: false })
    expect(row.note).toBeNull()
  })

  it("status 'none' contract (104) → MISSING with 'No agreement in place' (derived word, stored status ignored)", () => {
    const row = rowFor(104)

    expect(row.status).toBe('MISSING')
    expect(row.validityLabel).toBe('No agreement in place')
    expect(row.validityProgress).toBeNull() // empty-string dates
  })

  it("lapsed contract (108) → MISSING but the past date still shows: 'Until 1 Feb 2026', pct 0", () => {
    const row = rowFor(108)

    expect(row.status).toBe('MISSING')
    expect(row.validityLabel).toBe('Until 1 Feb 2026')
    expect(row.validityProgress).toBe(0)
  })

  it("NEGOTIATION (103) → 'In negotiation' (variant overrides the date)", () => {
    const row = rowFor(103)

    expect(row.status).toBe('NEGOTIATION')
    expect(row.validityLabel).toBe('In negotiation')
  })

  it("open-ended VALID (no validUntil) → 'Until —', no bar", () => {
    const contracts = [makeContract({ id: 903, competitionId: 903, status: 'valid' })]
    const competitions = [makeCompetition({ id: 903, name: 'Open Ended' })]

    const [row] = deriveRightsMatrix(contracts, competitions, [], FIXTURE_NOW)
    expect(row.status).toBe('VALID')
    expect(row.validityLabel).toBe('Until —')
    expect(row.validityProgress).toBeNull()
  })

  it('two-contract competition (109) renders the GOVERNING successor (id 10, Until 1 Aug 2027)', () => {
    const row = rowFor(109)

    expect(row.contract?.id).toBe(10)
    expect(row.status).toBe('VALID')
    expect(row.validityLabel).toBe('Until 1 Aug 2027')
  })

  it('matrix validityProgress is WIRED to the governing contract (mutation pins: comp 101 ≈0.4420, comp 109 successor ≈0.7059)', () => {
    // comp 101 (contract 1: 2024-07-01 → 2027-06-30, now 2026-03-04):
    // 484 of 1095 term-days remain (end-of-day widened) → ≈ 484/1095.
    expect(rowFor(101).validityProgress).toBeCloseTo(0.4420091324, 6)
    // comp 109 must use the SUCCESSOR's dates (id 10: 2025-08-01 → 2027-08-01):
    // 516 of 731 term-days remain → ≈ 12/17. The lapsed predecessor (id 9)
    // would give 0 — a wrong-contract or zeroed-progress mutant dies here.
    expect(rowFor(109).validityProgress).toBeCloseTo(0.7058823529, 6)
  })

  it("AC edge: contract WITHOUT validFrom → date shown AND bar suppressed together ('Until <date>', null progress)", () => {
    const contracts = [makeContract({ id: 910, competitionId: 910, status: 'valid', validUntil: '2027-03-04' })]

    const [row] = deriveRightsMatrix(contracts, [], [], FIXTURE_NOW)
    expect(row.validityLabel).toBe('Until 4 Mar 2027')
    expect(row.validityProgress).toBeNull()
  })

  it("dangling competitionId → fallback label 'COMPETITION #<id>', never dropped", () => {
    const contracts = [makeContract({ id: 904, competitionId: 999, status: 'valid', validUntil: '2027-01-01' })]

    const [row] = deriveRightsMatrix(contracts, [], [], FIXTURE_NOW)
    expect(row.competitionId).toBe(999)
    expect(row.competitionName).toBe('COMPETITION #999')
    expect(row.competition).toBeNull()
  })

  it('platform mapping (pin 1): linear→LINEAR, on-demand→MAX, radio→RADIO; ON-DEM reserved false (AS-8)', () => {
    // every fixture contract carries ['linear','on-demand'] via makeContract defaults
    expect(rowFor(101).platformColumns).toEqual({ LINEAR: true, MAX: true, RADIO: false, ONDEM: false })

    const radioOnly = [
      makeContract({ id: 905, competitionId: 905, status: 'valid', platforms: ['radio'], validUntil: '2027-01-01' }),
    ]
    const [row] = deriveRightsMatrix(radioOnly, [], [], FIXTURE_NOW)
    expect(row.platformColumns).toEqual({ LINEAR: false, MAX: false, RADIO: true, ONDEM: false })
  })

  it('unknown platform values light NO column and warn ONCE per value (pin 1)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const contracts = [
      makeContract({ id: 906, competitionId: 906, status: 'valid', platforms: ['linear', 'betamax-b3'], validUntil: '2027-01-01' }),
    ]

    const [row] = deriveRightsMatrix(contracts, [], [], FIXTURE_NOW)
    expect(row.platformColumns).toEqual({ LINEAR: true, MAX: false, RADIO: false, ONDEM: false })
    deriveRightsMatrix(contracts, [], [], FIXTURE_NOW) // second pass — same unknown value
    const betamaxWarnings = warnSpy.mock.calls.filter((call) => String(call[0]).includes('betamax-b3'))
    expect(betamaxWarnings).toHaveLength(1) // once per value, not per call
  })

  it("row note = governing contract's notes; whitespace-only/absent → null (pin 5)", () => {
    const contracts = [
      makeContract({ id: 907, competitionId: 907, status: 'valid', notes: 'Renewal talks ongoing', validUntil: '2027-01-01' }),
      makeContract({ id: 908, competitionId: 908, status: 'valid', notes: '   ', validUntil: '2027-01-01' }),
    ]

    const rows = deriveRightsMatrix(contracts, [], [], FIXTURE_NOW)
    expect(rows.find((r) => r.competitionId === 907)?.note).toBe('Renewal talks ongoing')
    expect(rows.find((r) => r.competitionId === 908)?.note).toBeNull()
  })
})

describe('deriveRightsTiles — fold over the matrix (identity by construction)', () => {
  it('fixture week tiles: 3 MISSING · 2 EXPIRING · 1 NEGOTIATION · 3 VALID', () => {
    expect(deriveRightsTiles(FIXTURE_CONTRACTS, FIXTURE_COMPETITIONS, FIXTURE_EVENTS, FIXTURE_NOW)).toEqual({
      VALID: 3,
      EXPIRING: 2,
      NEGOTIATION: 1,
      MISSING: 3,
    })
  })

  it('tiles === manual fold of the matrix rows (reconciliation identity)', () => {
    const folded = { VALID: 0, EXPIRING: 0, NEGOTIATION: 0, MISSING: 0 }
    for (const row of matrix()) folded[row.status]++

    expect(deriveRightsTiles(FIXTURE_CONTRACTS, FIXTURE_COMPETITIONS, FIXTURE_EVENTS, FIXTURE_NOW)).toEqual(folded)
  })
})

describe('property: ∀ fixture events, deriveRightsStatus === its competition row status (AC reconciliation)', () => {
  it('holds for every fixture event (incl. e10 outside the week — universe has no date scoping, pin 2)', () => {
    const rows = matrix()
    const mismatches = FIXTURE_EVENTS.map((event) => ({
      eventId: event.id,
      viaEvent: deriveRightsStatus(event, FIXTURE_CONTRACTS, FIXTURE_NOW),
      viaRow: rows.find((row) => row.competitionId === event.competitionId)?.status,
    })).filter((entry) => entry.viaEvent !== entry.viaRow)

    expect(mismatches).toEqual([])
  })

  it('sanity: a synthetic event on a dangling competition also reconciles', () => {
    const event = makeEvent({ id: 950, competitionId: 999 })
    const contracts = [...FIXTURE_CONTRACTS, makeContract({ id: 909, competitionId: 999, status: 'draft' })]

    const rows = deriveRightsMatrix(contracts, FIXTURE_COMPETITIONS, [event], FIXTURE_NOW)
    expect(rows.find((row) => row.competitionId === 999)?.status).toBe(deriveRightsStatus(event, contracts, FIXTURE_NOW))
  })
})
