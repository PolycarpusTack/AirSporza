/**
 * FM2-1-T1 — scheduleSuggestions.ts pure-function tests.
 *
 * TDD order per the story: the fixture-parity test (C6) runs FIRST, proving
 * this module's `isUnplacedEvent` agrees with the REAL frontend
 * `fmActionItems.ts` derivation on the SAME fixture week — a regression here
 * means Home's UNPLACED KPI tile and the Schedule board's tray count would
 * silently disagree. The permutation table (clean winner, rights-excluded,
 * crew-excluded, tie-break-by-channelId, zero-candidates) follows.
 */
import { describe, it, expect } from 'vitest'
import {
  computeScheduleSuggestions,
  isUnplacedEvent,
  isEventRightsBad,
  computeCrewConflictEventIds,
  rankCandidates,
  type SuggestionEventInput,
  type SuggestionContractInput,
  type SuggestionChannelInput,
  type SuggestionTechPlanInput,
  type SuggestionSlotInput,
} from '../src/services/scheduleSuggestions.js'

// Frontend reference (read-only) — the REAL code path, not a re-copy.
import { deriveActionItems } from '../../src/components/fm/fmActionItems'
import { groupEventsByDay } from '../../src/components/ops/selectors'
import {
  FIXTURE_EVENTS,
  FIXTURE_UNPLACED_EVENT,
  FIXTURE_SLOTS,
  FIXTURE_WEEK,
  FIXTURE_NOW,
} from '../../src/components/ops/__fixtures__/opsFixtureWeek'

// ─────────────────────────────────────────────────────────────────────────
// Fixture-parity (C6) — TDD FIRST
// ─────────────────────────────────────────────────────────────────────────

describe('scheduleSuggestions — fixture parity with fmActionItems.ts (C6)', () => {
  // Same composition the fixture file's own header documents FM-suite consumers use.
  const allEvents = [...FIXTURE_EVENTS, FIXTURE_UNPLACED_EVENT]
  const weekEvents = groupEventsByDay(allEvents, FIXTURE_WEEK).flatMap((g) => g.events)

  function frontendUnplacedIds(): Set<number> {
    // contracts/techPlans/conflicts/rippleProposals/crewFields are irrelevant to
    // the UNPLACED predicate — passed empty so this exercises ONLY that branch.
    const items = deriveActionItems(weekEvents, [], [], new Map(), [], FIXTURE_NOW, [], FIXTURE_SLOTS)
    return new Set(items.filter((i) => i.kind === 'UNPLACED').map((i) => Number(i.key.split(':')[2])))
  }

  function backendEvents(): SuggestionEventInput[] {
    return weekEvents.map((e) => ({
      id: e.id,
      channelId: e.channelId ?? null,
      competitionId: e.competitionId,
      startDateBE: e.startDateBE,
      startTimeBE: e.startTimeBE,
      durationMin: e.durationMin ?? null,
    }))
  }

  it('isUnplacedEvent agrees with the frontend on the exact same unplaced event-id set', () => {
    const expected = frontendUnplacedIds()
    const actual = new Set(backendEvents().filter((e) => isUnplacedEvent(e, FIXTURE_SLOTS)).map((e) => e.id))

    // Sanity: the fixture must actually exercise more than a trivial empty case.
    expect(expected.size).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('computeScheduleSuggestions exposes the same unplaced event-id set at the contract boundary', () => {
    const expected = frontendUnplacedIds()
    const result = computeScheduleSuggestions({
      week: FIXTURE_WEEK.start,
      now: FIXTURE_NOW,
      events: backendEvents(),
      slotsForEvents: FIXTURE_SLOTS,
      techPlans: [],
      contracts: [],
      channels: [],
      channelLoad: new Map(),
    })

    expect(new Set(result.unplaced.map((u) => u.eventId))).toEqual(expected)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// isUnplacedEvent — unit
// ─────────────────────────────────────────────────────────────────────────

describe('isUnplacedEvent', () => {
  it('false when channelId is set, even with no slot', () => {
    expect(isUnplacedEvent({ id: 1, channelId: 5 }, [])).toBe(false)
  })

  it('false when channelId is null but a slot exists for that eventId', () => {
    const slots: SuggestionSlotInput[] = [{ eventId: 1 }]
    expect(isUnplacedEvent({ id: 1, channelId: null }, slots)).toBe(false)
  })

  it('true when channelId is null and no slot references this eventId', () => {
    expect(isUnplacedEvent({ id: 1, channelId: null }, [])).toBe(true)
  })

  it('true when a slot exists but for a DIFFERENT eventId', () => {
    const slots: SuggestionSlotInput[] = [{ eventId: 2 }]
    expect(isUnplacedEvent({ id: 1, channelId: null }, slots)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// isEventRightsBad — unit (MISSING/NEGOTIATION precedence mirror)
// ─────────────────────────────────────────────────────────────────────────

describe('isEventRightsBad', () => {
  const now = new Date('2026-03-04T00:00:00Z')

  it('MISSING: no contract row for the competition', () => {
    expect(isEventRightsBad(101, [], now)).toBe(true)
  })

  it("MISSING: governing contract status is 'none'", () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 101, status: 'none', validFrom: null, validUntil: null },
    ]
    expect(isEventRightsBad(101, contracts, now)).toBe(true)
  })

  it("NEGOTIATION: governing contract status is 'draft'", () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 101, status: 'draft', validFrom: '2026-01-01', validUntil: '2028-01-01' },
    ]
    expect(isEventRightsBad(101, contracts, now)).toBe(true)
  })

  it('MISSING: an otherwise valid-status contract whose validUntil has LAPSED (date-based, not status-based)', () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 101, status: 'valid', validFrom: '2020-01-01', validUntil: '2026-02-01' },
    ]
    expect(isEventRightsBad(101, contracts, now)).toBe(true)
  })

  it('passes (false): VALID — far validUntil', () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 101, status: 'valid', validFrom: '2024-07-01', validUntil: '2027-06-30' },
    ]
    expect(isEventRightsBad(101, contracts, now)).toBe(false)
  })

  it('passes (false): EXPIRING is NOT a bad-rights gate trigger (only MISSING/NEGOTIATION exclude)', () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 101, status: 'expiring', validFrom: '2024-07-01', validUntil: '2026-04-15' },
    ]
    expect(isEventRightsBad(101, contracts, now)).toBe(false)
  })

  it('picks the COVERING contract over a lapsed predecessor (multi-contract precedence)', () => {
    const contracts: SuggestionContractInput[] = [
      { id: 1, competitionId: 109, status: 'valid', validFrom: '2023-01-01', validUntil: '2025-12-31' }, // lapsed
      { id: 2, competitionId: 109, status: 'valid', validFrom: '2025-08-01', validUntil: '2027-08-01' }, // covering
    ]
    expect(isEventRightsBad(109, contracts, now)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// computeCrewConflictEventIds — unit
// ─────────────────────────────────────────────────────────────────────────

describe('computeCrewConflictEventIds', () => {
  const eventA: SuggestionEventInput = {
    id: 1, channelId: null, competitionId: 101, startDateBE: '2026-03-03', startTimeBE: '18:00', durationMin: 120,
  }
  const eventB: SuggestionEventInput = {
    id: 2, channelId: null, competitionId: 101, startDateBE: '2026-03-03', startTimeBE: '18:00', durationMin: 120,
  }
  const eventC: SuggestionEventInput = {
    id: 3, channelId: null, competitionId: 101, startDateBE: '2026-03-03', startTimeBE: '23:00', durationMin: 60,
  }

  it('flags BOTH events when the same person (case/whitespace-insensitive) is double-booked at overlapping times', () => {
    const plans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 1, crew: { reporter: '  Alex Marks ' } },
      { id: 2, eventId: 2, crew: { camera: 'alex marks' } },
    ]
    const conflicts = computeCrewConflictEventIds(plans, [eventA, eventB])
    expect(conflicts).toEqual(new Set([1, 2]))
  })

  it('does not flag the same person across NON-overlapping windows', () => {
    const plans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 1, crew: { reporter: 'Alex Marks' } },
      { id: 3, eventId: 3, crew: { camera: 'Alex Marks' } },
    ]
    const conflicts = computeCrewConflictEventIds(plans, [eventA, eventC])
    expect(conflicts.size).toBe(0)
  })

  it('does not flag two assignments on the SAME event', () => {
    const plans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 1, crew: { reporter: 'Alex Marks', camera: 'Alex Marks' } },
    ]
    const conflicts = computeCrewConflictEventIds(plans, [eventA])
    expect(conflicts.size).toBe(0)
  })

  it('ignores blank/whitespace-only crew values', () => {
    const plans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 1, crew: { reporter: '   ' } },
      { id: 2, eventId: 2, crew: { camera: '' } },
    ]
    const conflicts = computeCrewConflictEventIds(plans, [eventA, eventB])
    expect(conflicts.size).toBe(0)
  })

  it('applies the 90-min floor for an explicit zero durationMin so it can still overlap', () => {
    const zeroDur: SuggestionEventInput = { ...eventA, id: 4, startTimeBE: '18:00', durationMin: 0 }
    const other: SuggestionEventInput = { ...eventB, id: 5, startTimeBE: '19:00', durationMin: 30 } // inside the floored 18:00-19:30 window
    const plans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 4, crew: { reporter: 'Sam Overlap' } },
      { id: 2, eventId: 5, crew: { reporter: 'Sam Overlap' } },
    ]
    const conflicts = computeCrewConflictEventIds(plans, [zeroDur, other])
    expect(conflicts).toEqual(new Set([4, 5]))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// rankCandidates — unit
// ─────────────────────────────────────────────────────────────────────────

describe('rankCandidates', () => {
  const channels: SuggestionChannelInput[] = [
    { id: 2, name: 'Eén' },
    { id: 1, name: 'Canvas' },
    { id: 3, name: 'VRT MAX' },
  ]

  it('orders by ascending load', () => {
    const load = new Map([[1, 3], [2, 1], [3, 2]])
    expect(rankCandidates(channels, load).map((c) => c.channelId)).toEqual([2, 3, 1])
  })

  it('ties break by channelId ascending', () => {
    const load = new Map([[1, 1], [2, 1], [3, 1]])
    expect(rankCandidates(channels, load).map((c) => c.channelId)).toEqual([1, 2, 3])
  })

  it('defaults a channel with no load-map entry to 0', () => {
    const load = new Map([[1, 5]])
    const result = rankCandidates(channels, load)
    expect(result.find((c) => c.channelId === 2)?.channelLoad).toBe(0)
    expect(result[0].channelId).toBe(2) // 0 < 5, and channel 3 also defaults to 0 but loses the id tie-break to 2
  })
})

// ─────────────────────────────────────────────────────────────────────────
// computeScheduleSuggestions — permutation table
// ─────────────────────────────────────────────────────────────────────────

describe('computeScheduleSuggestions — permutation table', () => {
  const now = new Date('2026-03-04T00:00:00Z')
  const validContract: SuggestionContractInput = {
    id: 1, competitionId: 101, status: 'valid', validFrom: '2024-01-01', validUntil: '2027-01-01',
  }
  const channels: SuggestionChannelInput[] = [
    { id: 2, name: 'Eén' },
    { id: 1, name: 'Canvas' },
  ]

  it('clean winner: an unplaced event with clean rights/crew ranks channels by ascending load', () => {
    const event: SuggestionEventInput = {
      id: 1, channelId: null, competitionId: 101, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [validContract],
      channels,
      channelLoad: new Map([[1, 3], [2, 1]]),
    })

    expect(result).toEqual({
      week: '2026-03-02',
      unplaced: [
        { eventId: 1, candidates: [
          { channelId: 2, channelName: 'Eén', channelLoad: 1 },
          { channelId: 1, channelName: 'Canvas', channelLoad: 3 },
        ] },
      ],
    })
  })

  it('rights-excluded: MISSING rights on the event\'s own competition zeroes its candidates', () => {
    const event: SuggestionEventInput = {
      id: 2, channelId: null, competitionId: 104, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [], // no contract row for competition 104 → MISSING
      channels,
      channelLoad: new Map([[1, 0], [2, 0]]),
    })

    expect(result.unplaced).toEqual([{ eventId: 2, candidates: [] }])
  })

  it('crew-excluded: a CONFLICT on the event\'s own crew zeroes its candidates', () => {
    const eventUnplaced: SuggestionEventInput = {
      id: 3, channelId: null, competitionId: 101, startDateBE: '2026-03-03', startTimeBE: '18:00', durationMin: 120,
    }
    const eventOther: SuggestionEventInput = {
      id: 4, channelId: 1, competitionId: 101, startDateBE: '2026-03-03', startTimeBE: '18:00', durationMin: 120,
    }
    const techPlans: SuggestionTechPlanInput[] = [
      { id: 1, eventId: 3, crew: { reporter: 'Alex Marks' } },
      { id: 2, eventId: 4, crew: { camera: 'Alex Marks' } },
    ]
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [eventUnplaced, eventOther],
      slotsForEvents: [{ eventId: 4 }], // eventOther is placed (has a slot) — not in `unplaced`, but still contributes to conflict detection
      techPlans,
      contracts: [validContract],
      channels,
      channelLoad: new Map(),
    })

    expect(result.unplaced).toEqual([{ eventId: 3, candidates: [] }])
  })

  it('tie-break-by-channelId: two channels with equal load order by channelId ascending', () => {
    const event: SuggestionEventInput = {
      id: 5, channelId: null, competitionId: 101, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [validContract],
      channels,
      channelLoad: new Map([[1, 2], [2, 2]]),
    })

    expect(result.unplaced[0].candidates.map((c) => c.channelId)).toEqual([1, 2])
  })

  it('zero-candidates edge case: clears both gates but no channels exist at all', () => {
    const event: SuggestionEventInput = {
      id: 6, channelId: null, competitionId: 101, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [validContract],
      channels: [], // genuinely no channels exist
      channelLoad: new Map(),
    })

    expect(result.unplaced).toEqual([{ eventId: 6, candidates: [] }])
  })

  it('a placed event (channelId set) never appears in `unplaced`', () => {
    const event: SuggestionEventInput = {
      id: 7, channelId: 1, competitionId: 101, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [validContract],
      channels,
      channelLoad: new Map(),
    })

    expect(result.unplaced).toEqual([])
  })

  it('accepts channelLoad as a plain Record (not just a Map)', () => {
    const event: SuggestionEventInput = {
      id: 8, channelId: null, competitionId: 101, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90,
    }
    const result = computeScheduleSuggestions({
      week: '2026-03-02',
      now,
      events: [event],
      slotsForEvents: [],
      techPlans: [],
      contracts: [validContract],
      channels,
      channelLoad: { 1: 3, 2: 1 },
    })

    expect(result.unplaced[0].candidates.map((c) => c.channelId)).toEqual([2, 1])
  })
})
