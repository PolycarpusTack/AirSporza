/**
 * Permutation tests for fmActionItems (FM1-3-T1, core-domain rigor — one row per
 * kind, the two-kinds-same-event AC example, and the empty-week AC example).
 * Contract target: `fmActionItems v1` (see the module header for the resolved
 * Pull Gate drift — `crewFields`/`broadcastSlots` are ADDED params beyond the
 * backlog's literal 6-arg signature; both are load-bearing for the
 * ops-selectors v3 functions this module composes, not optional).
 *
 * Most rows below use small, self-contained fixtures built via the SHARED
 * `make*` builders (Rule of Three: these builders already serve 4+ ops test
 * files; reusing them here is cheap and keeps event/contract/plan shapes
 * identical to production payloads). The `full-fixture integration` describe
 * block at the bottom is the "2nd consumer of opsFixtureWeek outside ops/"
 * the story calls for — it composes the two ADDITIVE standalone exports
 * (FIXTURE_UNPLACED_EVENT, FIXTURE_RIPPLE_PROPOSAL_PENDING) against the full
 * shared week rather than mutating FIXTURE_EVENTS itself (see that file's
 * FM1-3-T1 comment block for why: every day in FIXTURE_EVENTS is pinned to an
 * EXACT event count by RundownScreen.test.tsx and rundownLayout.test.ts).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { Contract, TechPlan } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import { detectCrewConflicts } from '../../utils/crewConflicts'
import { groupEventsByDay } from '../ops/selectors'
import {
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_PLANS,
  FIXTURE_RIPPLE_PROPOSAL_PENDING,
  FIXTURE_SLOTS,
  FIXTURE_UNPLACED_EVENT,
  FIXTURE_UNPLACED_EVENT_PLAN,
  FIXTURE_WEEK,
  makeContract,
  makeEvent,
  makeSlot,
} from '../ops/__fixtures__/opsFixtureWeek'
import { deriveActionItems, type RippleProposal } from './fmActionItems'

describe('deriveActionItems — CONFLICT', () => {
  it('derives one CONFLICT item per event in a full-severity crew clash', () => {
    const eventA = makeEvent({ id: 201, competitionId: 900, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 60, participants: 'Conflict A' })
    const eventB = makeEvent({ id: 202, competitionId: 900, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 60, participants: 'Conflict B' })
    const planA: TechPlan = { id: 301, eventId: 201, planType: 'Live', crew: { encoder: 'Casey' }, isLivestream: true, customFields: [] }
    const planB: TechPlan = { id: 302, eventId: 202, planType: 'Live', crew: { encoder: 'Casey' }, isLivestream: true, customFields: [] }
    const conflicts = detectCrewConflicts([planA, planB], [eventA, eventB])
    const contracts = [makeContract({ id: 401, competitionId: 900, status: 'valid', validUntil: '2030-01-01' })]

    const items = deriveActionItems(
      [eventA, eventB],
      contracts,
      [planA, planB],
      conflicts,
      [],
      FIXTURE_NOW,
      DEFAULT_CREW_FIELDS,
      [],
    )

    expect(items.filter((i) => i.kind === 'CONFLICT')).toEqual([
      {
        kind: 'CONFLICT',
        key: 'CONFLICT:event:201',
        title: 'Crew conflict — Conflict A',
        sub: 'Casey double-booked this week',
        targetRoute: '/ops/schedule',
        targetParams: { event: '201' },
      },
      {
        kind: 'CONFLICT',
        key: 'CONFLICT:event:202',
        title: 'Crew conflict — Conflict B',
        sub: 'Casey double-booked this week',
        targetRoute: '/ops/schedule',
        targetParams: { event: '202' },
      },
    ])
  })

  it('derives no CONFLICT item for an event with no crew clash', () => {
    const event = makeEvent({ id: 203, competitionId: 900, participants: 'No clash' })
    const plan: TechPlan = { id: 303, eventId: 203, planType: 'Live', crew: { encoder: 'Solo' }, isLivestream: true, customFields: [] }
    const items = deriveActionItems([event], [], [plan], new Map(), [], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])
    expect(items.filter((i) => i.kind === 'CONFLICT')).toEqual([])
  })
})

describe('deriveActionItems — RIGHTS (reuses deriveRightsStatus verbatim)', () => {
  it('derives one RIGHTS item per affected competition for EXPIRING/MISSING, dedups multi-event competitions, and skips VALID/NEGOTIATION', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const eventExpiring1 = makeEvent({ id: 210, competitionId: 910, participants: 'Expiring comp event 1' })
    const eventExpiring2 = makeEvent({ id: 211, competitionId: 910, participants: 'Expiring comp event 2' })
    const eventMissing = makeEvent({ id: 212, competitionId: 911, participants: 'Missing comp event' })
    const eventValid = makeEvent({ id: 213, competitionId: 912, participants: 'Valid comp event' })
    const eventNegotiation = makeEvent({ id: 214, competitionId: 913, participants: 'Negotiation comp event' })

    const contracts: Contract[] = [
      makeContract({ id: 410, competitionId: 910, status: 'valid', validUntil: '2026-02-01' }), // within 90d of `now`
      // 911 MISSING — no contract row at all
      makeContract({ id: 412, competitionId: 912, status: 'valid', validUntil: '2030-01-01' }), // VALID
      makeContract({ id: 413, competitionId: 913, status: 'draft', validUntil: '2030-01-01' }), // NEGOTIATION
    ]

    const items = deriveActionItems(
      [eventExpiring1, eventExpiring2, eventMissing, eventValid, eventNegotiation],
      contracts,
      [],
      new Map(),
      [],
      now,
      DEFAULT_CREW_FIELDS,
      [],
    )

    const rightsItems = items.filter((i) => i.kind === 'RIGHTS')
    expect(rightsItems.map((i) => i.key).sort()).toEqual(['RIGHTS:competition:910', 'RIGHTS:competition:911'])

    expect(rightsItems.find((i) => i.key === 'RIGHTS:competition:910')).toEqual({
      kind: 'RIGHTS',
      key: 'RIGHTS:competition:910',
      title: 'Rights expiring: COMPETITION #910',
      sub: '2 events this week',
      targetRoute: '/ops/rights',
      targetParams: { record: 'competition:910' },
    })
    expect(rightsItems.find((i) => i.key === 'RIGHTS:competition:911')).toEqual({
      kind: 'RIGHTS',
      key: 'RIGHTS:competition:911',
      title: 'Rights missing: COMPETITION #911',
      sub: '1 event this week',
      targetRoute: '/ops/rights',
      targetParams: { record: 'competition:911' },
    })
  })
})

describe('deriveActionItems — UNPLACED (the one genuinely new predicate)', () => {
  it('derives UNPLACED only when BOTH channelId and a linked BroadcastSlot are absent — a channelId-only event is NOT unplaced, a slot-only event is NOT unplaced', () => {
    const noChannelNoSlot = makeEvent({ id: 220, competitionId: 920, channelId: null, participants: 'No channel no slot' })
    const channelOnlyNoSlot = makeEvent({ id: 221, competitionId: 920, channelId: 5, participants: 'Channel only, no slot' })
    const slotOnlyNoChannel = makeEvent({ id: 222, competitionId: 920, channelId: null, participants: 'Slot only, no channel' })
    const slotForSlotOnly = makeSlot({ id: 's-222', channelId: 5, eventId: 222 })

    const items = deriveActionItems(
      [noChannelNoSlot, channelOnlyNoSlot, slotOnlyNoChannel],
      [],
      [],
      new Map(),
      [],
      FIXTURE_NOW,
      DEFAULT_CREW_FIELDS,
      [slotForSlotOnly],
    )

    expect(items.filter((i) => i.kind === 'UNPLACED').map((i) => i.key)).toEqual(['UNPLACED:event:220'])
    expect(items.find((i) => i.key === 'UNPLACED:event:220')).toEqual({
      kind: 'UNPLACED',
      key: 'UNPLACED:event:220',
      title: 'Unplaced: No channel no slot',
      sub: 'No channel or broadcast slot assigned',
      targetRoute: '/ops/planner',
      targetParams: { event: '220' },
    })
  })
})

describe('deriveActionItems — CREW (reuses deriveCrewRoles verbatim)', () => {
  it('derives one CREW item per OPEN required-and-visible role', () => {
    const event = makeEvent({ id: 230, competitionId: 930, participants: 'Open roles event' })
    // Zero plans → deriveCrewRoles reports OPEN for every REQUIRED field (only `encoder` by default).
    const items = deriveActionItems([event], [], [], new Map(), [], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])

    expect(items.filter((i) => i.kind === 'CREW')).toEqual([
      {
        kind: 'CREW',
        key: 'CREW:event:230:role:encoder',
        title: 'Open role: Encoder',
        sub: 'Open roles event',
        targetRoute: '/ops/schedule',
        targetParams: { event: '230' },
      },
    ])
  })

  it('derives no CREW item when every required role is filled', () => {
    const event = makeEvent({ id: 231, competitionId: 931, participants: 'Filled roles event' })
    const plan: TechPlan = { id: 331, eventId: 231, planType: 'Live', crew: { encoder: 'Jamie' }, isLivestream: true, customFields: [] }
    const items = deriveActionItems([event], [], [plan], new Map(), [], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])
    expect(items.filter((i) => i.kind === 'CREW')).toEqual([])
  })
})

describe('deriveActionItems — FEED (read-only in FM-1: no accept/reject surface)', () => {
  const baseProposal: RippleProposal = {
    id: 'rp-1',
    tenantId: 'tenant-1',
    eventId: 240,
    source: 'the_sports_db',
    sourceChangeId: 'chg-1',
    status: 'PENDING',
    beforeSlots: [],
    preview: {},
    confidence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    decidedAt: null,
    decidedBy: null,
    rationale: null,
  }

  it('derives a FEED item per pending proposal for an event in the given list', () => {
    const event = makeEvent({ id: 240, competitionId: 940, participants: 'Feed event' })
    const items = deriveActionItems([event], [], [], new Map(), [baseProposal], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])

    expect(items.filter((i) => i.kind === 'FEED')).toEqual([
      {
        kind: 'FEED',
        key: 'FEED:proposal:rp-1',
        title: 'Feed change proposed',
        sub: 'Feed event',
        targetRoute: '/ops/schedule',
        targetParams: { event: '240' },
      },
    ])
  })

  it('omits a FEED item when the proposal targets an event outside the given list', () => {
    const event = makeEvent({ id: 241, competitionId: 941, participants: 'In week' })
    const proposal: RippleProposal = { ...baseProposal, id: 'rp-2', eventId: 999 }
    const items = deriveActionItems([event], [], [], new Map(), [proposal], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])
    expect(items.filter((i) => i.kind === 'FEED')).toEqual([])
  })

  it('tolerates an undefined rippleProposals array without throwing — fetch-failure handling is the CALLER concern (FM1-4)', () => {
    const event = makeEvent({ id: 242, competitionId: 942, participants: 'No feed' })
    expect(() =>
      deriveActionItems([event], [], [], new Map(), undefined, FIXTURE_NOW, DEFAULT_CREW_FIELDS, []),
    ).not.toThrow()
    const items = deriveActionItems([event], [], [], new Map(), undefined, FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])
    expect(items.filter((i) => i.kind === 'FEED')).toEqual([])
  })
})

describe('deriveActionItems — kind independence and the ALL CLEAR empty state', () => {
  it('derives BOTH items when one event independently qualifies for two kinds (CONFLICT + UNPLACED, the AC example) — no merging', () => {
    const eventA = makeEvent({ id: 250, competitionId: 950, startDateBE: '2026-03-02', startTimeBE: '09:00', durationMin: 60, channelId: null, participants: 'Two-kind A' })
    const eventB = makeEvent({ id: 251, competitionId: 950, startDateBE: '2026-03-02', startTimeBE: '09:00', durationMin: 60, channelId: 5, participants: 'Two-kind B' })
    const slotForB = makeSlot({ id: 's-251', channelId: 5, eventId: 251 })
    const planA: TechPlan = { id: 350, eventId: 250, planType: 'Live', crew: { encoder: 'Rowan' }, isLivestream: true, customFields: [] }
    const planB: TechPlan = { id: 351, eventId: 251, planType: 'Live', crew: { encoder: 'Rowan' }, isLivestream: true, customFields: [] }
    const conflicts = detectCrewConflicts([planA, planB], [eventA, eventB])
    const contracts = [makeContract({ id: 450, competitionId: 950, status: 'valid', validUntil: '2030-01-01' })]

    const items = deriveActionItems(
      [eventA, eventB],
      contracts,
      [planA, planB],
      conflicts,
      [],
      FIXTURE_NOW,
      DEFAULT_CREW_FIELDS,
      [slotForB],
    )

    expect(items.filter((i) => i.key.endsWith('event:250')).map((i) => i.kind).sort()).toEqual(['CONFLICT', 'UNPLACED'])
    // eventB is placed (has a slot) so it must NOT pick up UNPLACED, even though
    // it shares the CONFLICT (crew clashes are bidirectional by construction).
    expect(items.filter((i) => i.key.includes('event:251')).map((i) => i.kind)).toEqual(['CONFLICT'])
  })

  it('returns an empty list when no risk conditions exist this week (Home ALL CLEAR)', () => {
    const event = makeEvent({ id: 260, competitionId: 960, channelId: 7, participants: 'Clean event' })
    const plan: TechPlan = { id: 360, eventId: 260, planType: 'Live', crew: { encoder: 'Drew' }, isLivestream: true, customFields: [] }
    const contracts = [makeContract({ id: 460, competitionId: 960, status: 'valid', validUntil: '2030-01-01' })]
    const slot = makeSlot({ id: 's-260', channelId: 7, eventId: 260 })

    const items = deriveActionItems([event], contracts, [plan], new Map(), [], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [slot])
    expect(items).toEqual([])
  })

  it('returns an empty list for an entirely empty week', () => {
    expect(deriveActionItems([], [], [], new Map(), [], FIXTURE_NOW, DEFAULT_CREW_FIELDS, [])).toEqual([])
  })
})

describe('deriveActionItems — full-fixture integration (2nd consumer of opsFixtureWeek outside ops/)', () => {
  it('composes the additive UNPLACED + pending-ripple fixtures alongside the full shared week without touching FIXTURE_EVENTS', () => {
    const weekEvents = [
      ...groupEventsByDay(FIXTURE_EVENTS, FIXTURE_WEEK).flatMap((day) => day.events),
      FIXTURE_UNPLACED_EVENT,
    ]
    const plans = [...FIXTURE_PLANS, FIXTURE_UNPLACED_EVENT_PLAN]
    const conflicts = detectCrewConflicts(plans, weekEvents)

    const items = deriveActionItems(
      weekEvents,
      FIXTURE_CONTRACTS,
      plans,
      conflicts,
      [FIXTURE_RIPPLE_PROPOSAL_PENDING],
      FIXTURE_NOW,
      DEFAULT_CREW_FIELDS,
      FIXTURE_SLOTS,
    )

    // FIXTURE_UNPLACED_EVENT (id 11) is deliberately clean apart from being
    // unplaced and having a pending proposal — proves kind-independence
    // against real shared data, not just the ad hoc CONFLICT+UNPLACED row above.
    // (FEED items key on the proposal id, not the event id, so match on
    // targetParams.event rather than the key string.)
    expect(items.filter((i) => i.targetParams.event === '11').map((i) => i.kind).sort()).toEqual(['FEED', 'UNPLACED'])

    // Regression guard: the pre-existing week still yields its known CONFLICT
    // events (e3/e4 full, e5/e6 partial) — proves composing the new fixture
    // event did not disturb detectCrewConflicts over the shared plans/events.
    expect(items.filter((i) => i.kind === 'CONFLICT').map((i) => i.key).sort()).toEqual([
      'CONFLICT:event:3',
      'CONFLICT:event:4',
      'CONFLICT:event:5',
      'CONFLICT:event:6',
    ])
  })
})
