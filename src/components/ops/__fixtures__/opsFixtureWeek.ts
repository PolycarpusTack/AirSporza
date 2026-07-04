/**
 * Shared ops fixture week (A-3-T1 deliverable — reused by A-4, B-1, A-5).
 * Extends the seed skeleton (src/data/index.ts: 7 events, Mar 3–6 2026) into one
 * deterministic week with every RightsStatus and CrewHealth permutation present.
 *
 * FIXED clock: all derivations in tests use FIXTURE_NOW (or the daytime variant
 * for end-of-day boundary pins) — never Date.now(). The week (Mar 2–8 2026)
 * deliberately avoids DST transitions (Europe switches 2026-03-29): day math
 * bugs can't hide behind clock shifts here.
 *
 * API-SHAPED data on purpose (adversarial review, A-3-T1): Prisma DateTime →
 * res.json() delivers startDateBE as an ISO DATETIME string, and local code may
 * hold local-midnight Date objects. The fixture pins all three shapes:
 *   e2  '2026-03-02T00:00:00.000Z' (API string — Monday)
 *   e3  '2026-03-03T00:00:00.000Z' (API string INSIDE a conflict pair)
 *   e9  new Date(2026, 2, 6)       (LOCAL midnight Date — Friday; toISOString
 *                                   would shift it a day in TZs ahead of UTC)
 *
 * Inventory (see ops-selectors v1 contract for the full table):
 *   Rights: comp 101 VALID · 102 EXPIRING (inside 90d) · 103 NEGOTIATION ('draft')
 *           · 104 MISSING ('none') · 105 MISSING (no contract row)
 *           · 106 stored-status 'expiring' but far validUntil (derives VALID)
 *           · 108 lapsed (derives MISSING) · 109 two contracts (lapsed + covering)
 *           · 110 validUntil exactly now+90d (EXPIRING boundary, inclusive)
 *   Crew:   e3/e4 FULL-severity conflict (same person, same start, two plans)
 *           · e5/e6 PARTIAL conflict (overlapping windows)
 *           · e7 zero plans → OPEN · e8 blank required encoder → OPEN · rest OK
 *   Grouping: Mon has 2 events OUT of array order · 5 days covered · Sat+Sun empty
 *             · e9 has a Date-object startDateBE (dual-type coverage)
 *             · e10 lies outside the week (must be excluded)
 *   Sports: 5 sports, uneven counts (sport 1×3, 2×2, 3×2, 4×1, 5×1).
 */
import type { BroadcastSlot, Channel, Contract, Event, TechPlan } from '../../../data/types'
import { detectCrewConflicts, type ConflictMap } from '../../../utils/crewConflicts'

/**
 * Deep-freeze (A-4-T0 review hardening): fixtures are SHARED pins — any test that
 * mutates one corrupts every other suite. Frozen recursively (incl. nested crew
 * objects and Date instances); mutation attempts throw under ES-module strict mode.
 * EXPORTED (A-4-T1 review): test files freeze their own module-level shared
 * objects with the same helper.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

/** Wednesday 2026-03-04, midnight UTC — chosen so day-precision boundaries are exact. */
export const FIXTURE_NOW = new Date('2026-03-04T00:00:00Z')

/** Same Wednesday at 10:00Z — pins end-of-day validUntil semantics (real clocks have a time of day). */
export const FIXTURE_NOW_DAYTIME = new Date('2026-03-04T10:00:00Z')

/** Monday. Week covers 2026-03-02 (Mon) … 2026-03-08 (Sun). */
export const FIXTURE_WEEK = { start: '2026-03-02' }

/** Minimal valid Event with overridable fields. */
export function makeEvent(overrides: Partial<Event> & { id: number }): Event {
  return {
    sportId: 1,
    competitionId: 101,
    participants: `Fixture event ${overrides.id}`,
    startDateBE: '2026-03-02',
    startTimeBE: '12:00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    ...overrides,
  }
}

const contractDefaults = {
  linearRights: false, // @deprecated legacy booleans — present only to satisfy the type (TD-24)
  maxRights: false,
  radioRights: false,
  sublicensing: false,
  territory: ['Belgium'],
  platforms: ['linear', 'on-demand'],
  coverageType: 'LIVE' as const,
}

/** Minimal valid Contract with overridable fields (shared by permutation tests). */
export function makeContract(
  overrides: Partial<Contract> & { id: number; competitionId: number; status: Contract['status'] },
): Contract {
  return { ...contractDefaults, ...overrides }
}

export const FIXTURE_CONTRACTS: Contract[] = deepFreeze([
  // 101 VALID: far validUntil (> now+90d)
  { id: 1, competitionId: 101, status: 'valid', validFrom: '2024-07-01', validUntil: '2027-06-30', ...contractDefaults },
  // 102 EXPIRING: inside the 90-day window (now+42d)
  { id: 2, competitionId: 102, status: 'valid', validFrom: '2024-07-01', validUntil: '2026-04-15', ...contractDefaults },
  // 103 NEGOTIATION: only 'draft' carries this meaning
  { id: 3, competitionId: 103, status: 'draft', validFrom: '2026-01-01', validUntil: '2028-12-31', ...contractDefaults },
  // 104 MISSING via status 'none' — mirrors seed contract 6 incl. empty-string dates
  { id: 4, competitionId: 104, status: 'none', validFrom: '', validUntil: '', ...contractDefaults },
  // 105 MISSING via NO contract row: intentionally absent from this array
  // 106 stored status 'expiring' is STALE — far validUntil must derive VALID
  { id: 6, competitionId: 106, status: 'expiring', validFrom: '2024-01-01', validUntil: '2028-01-01', ...contractDefaults },
  // 108 lapsed: validUntil in the past → MISSING
  { id: 8, competitionId: 108, status: 'valid', validFrom: '2020-01-01', validUntil: '2026-02-01', ...contractDefaults },
  // 109 two contracts: lapsed predecessor + covering successor → successor wins
  { id: 9, competitionId: 109, status: 'valid', validFrom: '2023-01-01', validUntil: '2025-12-31', ...contractDefaults },
  { id: 10, competitionId: 109, status: 'valid', validFrom: '2025-08-01', validUntil: '2027-08-01', ...contractDefaults },
  // 110 EXPIRING boundary: validUntil is EXACTLY FIXTURE_NOW + 90 days (inclusive)
  { id: 11, competitionId: 110, status: 'valid', validFrom: '2024-01-01', validUntil: '2026-06-02', ...contractDefaults },
])

/**
 * Week events. Mon 03-02 deliberately declares the 20:00 event BEFORE the 14:00
 * one (grouping must sort). e9 uses a Date object; everything else strings.
 */
export const FIXTURE_EVENTS: Event[] = deepFreeze([
  // Monday — out of time order on purpose
  makeEvent({ id: 1, sportId: 1, competitionId: 101, startDateBE: '2026-03-02', startTimeBE: '20:00', durationMin: 120, participants: 'Mon late (VALID, crew OK)' }),
  makeEvent({ id: 2, sportId: 2, competitionId: 102, startDateBE: '2026-03-02T00:00:00.000Z', startTimeBE: '14:00', durationMin: 120, participants: 'Mon early (EXPIRING, crew OK, API-shaped ISO datetime)' }),
  // Tuesday — FULL conflict pair: same person, identical start times
  makeEvent({ id: 3, sportId: 1, competitionId: 103, startDateBE: '2026-03-03T00:00:00.000Z', startTimeBE: '18:00', durationMin: 120, participants: 'Tue full-conflict A (NEGOTIATION, API-shaped ISO datetime)' }),
  makeEvent({ id: 4, sportId: 3, competitionId: 104, startDateBE: '2026-03-03', startTimeBE: '18:00', durationMin: 120, participants: 'Tue full-conflict B (MISSING none)' }),
  // Wednesday — PARTIAL conflict pair: overlapping but different starts
  makeEvent({ id: 5, sportId: 2, competitionId: 106, startDateBE: '2026-03-04', startTimeBE: '12:00', durationMin: 120, participants: 'Wed partial-conflict A' }),
  makeEvent({ id: 6, sportId: 3, competitionId: 109, startDateBE: '2026-03-04', startTimeBE: '13:00', durationMin: 120, participants: 'Wed partial-conflict B' }),
  // Thursday
  makeEvent({ id: 7, sportId: 4, competitionId: 105, startDateBE: '2026-03-05', startTimeBE: '15:00', durationMin: 90, participants: 'Thu zero plans (MISSING no row, OPEN)' }),
  makeEvent({ id: 8, sportId: 5, competitionId: 110, startDateBE: '2026-03-05', startTimeBE: '19:30', durationMin: 90, participants: 'Thu blank encoder (EXPIRING boundary, OPEN)' }),
  // Friday — LOCAL-midnight Date object (the toISOString UTC-shift pitfall)
  makeEvent({ id: 9, sportId: 1, competitionId: 108, startDateBE: new Date(2026, 2, 6), startTimeBE: '10:00', durationMin: 60, participants: 'Fri local-midnight Date (lapsed → MISSING, crew OK)' }),
  // Saturday 03-07 + Sunday 03-08: EMPTY on purpose (empty-weekday coverage)
  // Outside the week — excluded by grouping
  makeEvent({ id: 10, sportId: 1, competitionId: 101, startDateBE: '2026-03-09', startTimeBE: '12:00', durationMin: 60, participants: 'Next Monday (outside week)' }),
])

/** Crew plans. Conflict people appear ONLY in their pair; all other names unique. */
export const FIXTURE_PLANS: TechPlan[] = deepFreeze([
  { id: 1, eventId: 1, planType: 'Live', crew: { encoder: 'ENC-01', reporter: 'Rita Mon' }, isLivestream: true, customFields: [] },
  { id: 2, eventId: 2, planType: 'Live', crew: { encoder: 'ENC-02', reporter: 'Milo Mon' }, isLivestream: true, customFields: [] },
  // FULL conflict: Alex Marks on both Tuesday 18:00 events
  { id: 3, eventId: 3, planType: 'Live', crew: { encoder: 'ENC-03', reporter: 'Alex Marks' }, isLivestream: true, customFields: [] },
  { id: 4, eventId: 4, planType: 'Live', crew: { encoder: 'ENC-04', camera: 'Alex Marks' }, isLivestream: true, customFields: [] },
  // PARTIAL conflict: Sam Overlap on Wed 12:00–14:00 and Wed 13:00–15:00
  { id: 5, eventId: 5, planType: 'Live', crew: { encoder: 'ENC-05', sound: 'Sam Overlap' }, isLivestream: true, customFields: [] },
  { id: 6, eventId: 6, planType: 'Live', crew: { encoder: 'ENC-06', reporter: 'Sam Overlap' }, isLivestream: true, customFields: [] },
  // e7 has NO plan (zero-plans → OPEN)
  // e8: required encoder blank (whitespace only) → OPEN
  { id: 8, eventId: 8, planType: 'Live', crew: { encoder: '   ', reporter: 'Ann Solo' }, isLivestream: false, customFields: [] },
  { id: 9, eventId: 9, planType: 'Live', crew: { encoder: 'ENC-09', reporter: 'Fred Fri' }, isLivestream: true, customFields: [] },
])

/** Precomputed once, exactly as screens will do it (one detect pass per screen). */
export const FIXTURE_CONFLICTS: ConflictMap = detectCrewConflicts(FIXTURE_PLANS, FIXTURE_EVENTS)

/* ────────────────────────────────────────────────────────────────────────────
 * B-1-T1 ADDITIVE extension (Story B-1 pin 8): Rundown channels + broadcast
 * slots. All pre-existing EXPORTS are byte-stable — A-3/A-4/A-5 pins depend
 * on them (the type-import line at the top gained two names, nothing else).
 *
 * Slot inventory (see rundown-layout v1 contract):
 *   s-e2  Mon · Canvas · SLOT-VS-EVENT DIVERGENCE (event 14:00, slot 15:00 — slot wins)
 *   s-e1  Mon · Eén    · CLAMPED cross-24:00 ([1380,1530] → [1380,1440]; 80-min floor YIELDS at the boundary, width 60)
 *   s-e3  Tue · Eén    · SAME-LANE OVERLAP pair with s-e4 (no sub-lanes — pin 5 paint order)
 *   s-e4  Tue · Eén    ·   ″
 *   s-e9  Fri · Eén    · FULLY OFF-AXIS (02:00–04:00, ends before 05:00 → floored sliver at the left edge, flagged)
 *   s-e7  Thu · id 99  · DANGLING channelId (99 is NOT in FIXTURE_CHANNELS) → UNASSIGNED (data-quality
 *                        signal); slot window 16:00–17:30 deliberately DIVERGES from e7's 15:00 event
 *                        window so a settled render is distinguishable from the pre-fetch fallback paint
 *                        (B-1-T2 review — screens gate on '16:00 · 90 min')
 *   e8    Thu           · UNRESOLVABLE by omission: NO slot and NO event.channel relation → UNASSIGNED lane
 * Channel ids are deliberately NOT aligned with service order (Eén id 2 /
 * sortOrder 0, Canvas id 1 / sortOrder 1) so lane ordering is pinned to
 * sortOrder, never id. VRT MAX (id 3) carries ZERO slots — a channel without
 * events on a day must never produce a lane (pin 6).
 * ──────────────────────────────────────────────────────────────────────── */

/** Minimal valid Channel with overridable fields (mirrors makeEvent/makeContract). */
export function makeChannel(overrides: Partial<Channel> & { id: number }): Channel {
  return {
    tenantId: 'fixture-tenant',
    parentId: null,
    name: `Channel ${overrides.id}`,
    types: ['linear'],
    timezone: 'Europe/Brussels',
    broadcastDayStartLocal: '06:00',
    platformConfig: {},
    epgConfig: {},
    color: '#888888', // data value (Channel.color is DATA — A-3 precedent), not a component literal
    sortOrder: overrides.id,
    ...overrides,
  }
}

/** Minimal valid BroadcastSlot with overridable fields. UTC datetimes are API-shaped strings. */
export function makeSlot(overrides: Partial<BroadcastSlot> & { id: string; channelId: number }): BroadcastSlot {
  return {
    tenantId: 'fixture-tenant',
    schedulingMode: 'FIXED',
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    overrunStrategy: 'EXTEND',
    anchorType: 'FIXED_TIME',
    coveragePriority: 0,
    status: 'PLANNED',
    contentSegment: 'FULL',
    sportMetadata: {},
    ...overrides,
  }
}

export const FIXTURE_CHANNELS: Channel[] = deepFreeze([
  makeChannel({ id: 2, name: 'Eén', color: '#E4572E', sortOrder: 0 }),
  makeChannel({ id: 1, name: 'Canvas', color: '#4C8DF5', sortOrder: 1 }),
  makeChannel({ id: 3, name: 'VRT MAX', color: '#2BB673', sortOrder: 2 }), // zero slots on purpose
])

export const FIXTURE_SLOTS: BroadcastSlot[] = deepFreeze([
  // Mon — DIVERGENCE: slot window wins over the event window (pin 2).
  makeSlot({
    id: 's-e2-canvas',
    eventId: 2,
    channelId: 1,
    plannedStartUtc: '2026-03-02T15:00:00.000Z',
    plannedEndUtc: '2026-03-02T17:00:00.000Z',
  }),
  // Mon — CLAMPED: crosses 24:00; floor yields at the boundary (pin 1).
  makeSlot({
    id: 's-e1-een',
    eventId: 1,
    channelId: 2,
    plannedStartUtc: '2026-03-02T23:00:00.000Z',
    plannedEndUtc: '2026-03-03T01:30:00.000Z',
  }),
  // Tue — SAME-LANE OVERLAP pair on Eén (pin 5).
  makeSlot({
    id: 's-e3-een',
    eventId: 3,
    channelId: 2,
    plannedStartUtc: '2026-03-03T18:00:00.000Z',
    plannedEndUtc: '2026-03-03T20:00:00.000Z',
  }),
  makeSlot({
    id: 's-e4-een',
    eventId: 4,
    channelId: 2,
    plannedStartUtc: '2026-03-03T18:30:00.000Z',
    plannedEndUtc: '2026-03-03T20:00:00.000Z',
  }),
  // Fri — FULLY OFF-AXIS (pin 1 sliver rule).
  makeSlot({
    id: 's-e9-een',
    eventId: 9,
    channelId: 2,
    plannedStartUtc: '2026-03-06T02:00:00.000Z',
    plannedEndUtc: '2026-03-06T04:00:00.000Z',
  }),
  // Thu — DANGLING channelId (99 not in FIXTURE_CHANNELS) → UNASSIGNED; window
  // diverges from e7's 15:00 event window so settled renders are recognizable
  // (ADDITIVE, B-1-T2 review). e8 (Thu) stays slot-less AND relation-less.
  makeSlot({
    id: 's-e7-dangling',
    eventId: 7,
    channelId: 99,
    plannedStartUtc: '2026-03-05T16:00:00.000Z',
    plannedEndUtc: '2026-03-05T17:30:00.000Z',
  }),
])
