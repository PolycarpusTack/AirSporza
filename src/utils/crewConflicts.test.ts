/**
 * Characterization tests for crewConflicts (B-3-T1), updated by C-0-T1 (TD-15).
 *
 * TD-15 fix: `event.duration` now flows through dateTime.parseDurationMin, so
 * a duration string means the same MINUTES everywhere in the app (previously
 * parseFloat-as-HOURS with a 3h default). The default window is now the
 * parseDurationMin fallback of 90 minutes — the 3h default was part of the bug.
 *
 * Finding 3 (events with unparseable date/time silently drop their crew
 * assignments) is deliberately NOT fixed here: reporting unverifiable
 * assignments needs a return-shape change, not a one-liner. Still pinned below.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { detectCrewConflicts, groupConflictsByPerson } from './crewConflicts'
import type { Event, TechPlan } from '../data/types'

function makeEvent(overrides: Partial<Event> & { id: number }): Event {
  return {
    sportId: 1,
    competitionId: 10,
    participants: 'Team A vs Team B',
    startDateBE: '2026-06-12',
    startTimeBE: '20:00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    ...overrides,
  } as Event
}

function makePlan(overrides: Partial<TechPlan> & { id: number }): TechPlan {
  return {
    eventId: 1,
    planType: 'standard',
    crew: {},
    isLivestream: false,
    customFields: {},
    ...overrides,
  }
}

describe('detectCrewConflicts', () => {
  it('returns an empty map for empty input', () => {
    expect(detectCrewConflicts([], []).size).toBe(0)
  })

  it('reports no conflict when each person has a single assignment', () => {
    const e1 = makeEvent({ id: 1 })
    const e2 = makeEvent({ id: 2, startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Bob' } }),
    ]
    expect(detectCrewConflicts(plans, [e1, e2]).size).toBe(0)
  })

  it('flags identical start times on different events as a FULL conflict, symmetrically', () => {
    const e1 = makeEvent({ id: 1, participants: 'A vs B' })
    const e2 = makeEvent({ id: 2, participants: 'C vs D' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane Doe' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane Doe' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    expect(conflicts.size).toBe(2)
    const forA = conflicts.get('100:director')
    expect(forA).toHaveLength(1)
    expect(forA![0]).toEqual({
      personName: 'jane doe', // PINNED: lowercased, not the original casing
      fieldId: 'director',
      planId: 101,
      eventId: 2,
      eventName: 'C vs D',
      role: 'director',
      startTime: '2026-06-12 20:00',
      severity: 'full',
    })
    expect(conflicts.get('101:director')![0].eventId).toBe(1)
  })

  it('flags overlapping (non-identical) windows as PARTIAL using the 90-min default duration', () => {
    // TD-15 fix (C-0-T1): default window is now parseDurationMin's 90-min
    // fallback (was a 3h default — part of the unit-confusion bug).
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00' }) // 20:00–21:30
    const e2 = makeEvent({ id: 2, startTimeBE: '21:00' }) // 21:00–22:30
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])
    expect(conflicts.get('100:director')![0].severity).toBe('partial')
  })

  it('uses the 90-minute fallback when duration is missing (no phantom 3h window)', () => {
    // TD-15 fix (C-0-T1): under the old 3h default, the 21:45 event fell
    // inside e1's 20:00–23:00 window and was a false-positive conflict.
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00' }) // 20:00–21:30
    const e2 = makeEvent({ id: 2, startTimeBE: '21:45' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    expect(detectCrewConflicts(plans, [e1, e2]).size).toBe(0)
  })

  it('does NOT flag exact boundary touch (A ends exactly when B starts)', () => {
    // TD-15 fix (C-0-T1): duration '180' = 180 MINUTES (was '3' hours)
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '180' }) // ends 23:00
    const e2 = makeEvent({ id: 2, startTimeBE: '23:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    expect(detectCrewConflicts(plans, [e1, e2]).size).toBe(0)
  })

  it('matches the same person across case and whitespace differences', () => {
    const e1 = makeEvent({ id: 1 })
    const e2 = makeEvent({ id: 2 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: '  JANE DOE  ' } }),
      makePlan({ id: 101, eventId: 2, crew: { camera: 'jane doe' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])
    expect(conflicts.size).toBe(2)
    expect(conflicts.get('100:director')![0].role).toBe('camera')
  })

  it('never flags two plans of the SAME event, even with the same person overlapping', () => {
    const e1 = makeEvent({ id: 1 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 1, crew: { camera: 'Jane' } }),
    ]
    expect(detectCrewConflicts(plans, [e1]).size).toBe(0)
  })

  it('interprets event.duration as MINUTES via parseDurationMin (duration "120" = 2 hours)', () => {
    // TD-15 fix (C-0-T1): was parseFloat-as-HOURS ('2' = 2h); now '120' minutes
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '120' }) // ends 22:00
    const inside = makeEvent({ id: 2, startTimeBE: '21:30' })
    const outside = makeEvent({ id: 3, startTimeBE: '22:30' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(2, 101)], [e1, inside]).size).toBe(2)
    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [e1, outside]).size).toBe(0)
  })

  it('parses "01:30:00" as a true 90-MINUTE window (20:00–21:30)', () => {
    // TD-15 fix (C-0-T1): parseFloat used to truncate '01:30:00' to 1 HOUR
    // (20:00–21:00), so 21:15 was a false negative. With parseDurationMin the
    // window is 20:00–21:30: 21:15 now conflicts; 21:45 still does not.
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '01:30:00' })
    const at2115 = makeEvent({ id: 2, startTimeBE: '21:15' })
    const at2145 = makeEvent({ id: 3, startTimeBE: '21:45' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(2, 101)], [e1, at2115]).size).toBe(2)
    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [e1, at2145]).size).toBe(0)
  })

  it('honors the numeric durationMin field over the deprecated duration string', () => {
    // quality-pass fix (C-quality): unified duration accessor — conflict
    // windows previously ignored durationMin entirely, so migrated events got
    // the wrong window. durationMin 120 → 20:00–22:00 despite duration '30'.
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', durationMin: 120, duration: '30' })
    const inside = makeEvent({ id: 2, startTimeBE: '21:30' })
    const outside = makeEvent({ id: 3, startTimeBE: '22:30' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(2, 101)], [e1, inside]).size).toBe(2)
    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [e1, outside]).size).toBe(0)
  })

  it('applies a conservative 90-min floor to zero-duration events (placeholder feeds still conflict)', () => {
    // quality-pass fix (C-quality): unified duration accessor — a zero-width
    // window can never overlap, so placeholder '00:00:00' / durationMin 0
    // would silently disable conflict detection. The floor keeps it on.
    const zeroStr = makeEvent({ id: 1, startTimeBE: '20:00', duration: '00:00:00' }) // floored: 20:00–21:30
    const zeroMin = makeEvent({ id: 2, startTimeBE: '20:00', durationMin: 0 })       // floored: 20:00–21:30
    const at2030 = makeEvent({ id: 3, startTimeBE: '20:30' })
    const at2145 = makeEvent({ id: 4, startTimeBE: '21:45' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [zeroStr, at2030]).size).toBe(2)
    expect(detectCrewConflicts([planFor(2, 100), planFor(3, 101)], [zeroMin, at2030]).size).toBe(2)
    // the floor is exactly 90 min — 21:45 is outside the floored window
    expect(detectCrewConflicts([planFor(1, 100), planFor(4, 101)], [zeroStr, at2145]).size).toBe(0)
  })

  it('detects multi-day spans (a 30-hour duration conflicts with an event the next day)', () => {
    // TD-15 fix (C-0-T1): 30 hours expressed in minutes ('1800'), not hours ('30')
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12', startTimeBE: '20:00', duration: '1800' }) // ends 2026-06-14 02:00
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-13', startTimeBE: '10:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])
    expect(conflicts.get('100:director')![0].severity).toBe('partial')
    expect(conflicts.get('100:director')![0].startTime).toBe('2026-06-13 10:00')
  })

  it('silently skips assignments whose event time cannot be parsed', () => {
    const broken = makeEvent({ id: 1, startTimeBE: '' }) // no window
    const e2 = makeEvent({ id: 2 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    // PINNED (TD-15 finding 3, deliberately NOT fixed in C-0-T1): the broken
    // event's assignment vanishes, so no conflict is reported. Surfacing
    // unverifiable assignments needs a return-shape change — left on TD-15.
    expect(detectCrewConflicts(plans, [broken, e2]).size).toBe(0)
  })

  it('skips plans whose event is missing and non-string/blank crew values', () => {
    const e2 = makeEvent({ id: 2 })
    const e3 = makeEvent({ id: 3 })
    const plans = [
      makePlan({ id: 100, eventId: 999, crew: { director: 'Jane' } }), // orphan plan
      makePlan({ id: 101, eventId: 2, crew: { director: ['Jane'], camera: 42, sound: '   ' } }),
      makePlan({ id: 102, eventId: 3, crew: { director: 'Jane' } }),
    ]
    expect(detectCrewConflicts(plans, [e2, e3]).size).toBe(0)
  })

  it('reports a conflict entry per assignment key when one person holds two roles', () => {
    const e1 = makeEvent({ id: 1 })
    const e2 = makeEvent({ id: 2 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Sam', camera: 'Sam' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Sam' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])
    expect(conflicts.get('100:director')).toHaveLength(1)
    expect(conflicts.get('100:camera')).toHaveLength(1)
    expect(conflicts.get('101:director')).toHaveLength(2) // conflicts with both of Sam's roles on e1
  })
})

describe('groupConflictsByPerson', () => {
  it('groups by person, capitalizes only the first character, and sorts by conflict count desc', () => {
    // jane doe: events 1,2,3 all at 20:00 -> 3 pairwise conflicts; bob: events 1,2 -> 1
    const events = [makeEvent({ id: 1 }), makeEvent({ id: 2 }), makeEvent({ id: 3 })]
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'jane doe', camera: 'bob' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'jane doe', camera: 'bob' } }),
      makePlan({ id: 102, eventId: 3, crew: { director: 'jane doe' } }),
    ]
    const groups = groupConflictsByPerson(plans, events)

    expect(groups.map(g => g.personName)).toEqual(['Jane doe', 'Bob']) // PINNED: 'Jane doe', not 'Jane Doe'
    expect(groups[0].conflicts).toHaveLength(3)
    expect(groups[1].conflicts).toHaveLength(1)
    expect(groups[0].conflicts[0].severity).toBe('full')
  })

  it('dedupes by event pair: dual roles on the same event pair count once', () => {
    const e1 = makeEvent({ id: 1 })
    const e2 = makeEvent({ id: 2 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Sam', camera: 'Sam' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Sam' } }),
    ]
    const groups = groupConflictsByPerson(plans, [e1, e2])
    expect(groups).toHaveLength(1)
    expect(groups[0].conflicts).toHaveLength(1)
    expect(groups[0].conflicts[0].eventA.role).toBe('director') // first pair encountered wins
  })

  it('returns an empty array when there are no overlaps', () => {
    // TD-15 fix (C-0-T1): duration in minutes ('120' = 2h, was '2' hours)
    const e1 = makeEvent({ id: 1, startTimeBE: '08:00', duration: '120' })
    const e2 = makeEvent({ id: 2, startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    expect(groupConflictsByPerson(plans, [e1, e2])).toEqual([])
  })
})

describe('API-shaped startDateBE (A-3-T1 adversarial review BLOCKER 2 — upstream bugfix)', () => {
  // At runtime Prisma DateTime → res.json() delivers startDateBE as an ISO
  // DATETIME string ("2026-06-12T00:00:00.000Z"). parseEventWindow used to build
  // `new Date('2026-06-12T00:00:00.000ZT20:00:00')` → NaN → every plan skipped →
  // conflict detection silently OFF in production. Pinned here; fixed via
  // getDateKey normalization.
  it('detects a conflict when startDateBE is an ISO datetime string', () => {
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    expect(conflicts.get('100:director')?.[0]?.severity).toBe('full')
    expect(conflicts.get('101:director')?.[0]?.severity).toBe('full')
  })

  it('mixed shapes still conflict: ISO datetime string vs bare date string', () => {
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12', startTimeBE: '21:00', durationMin: 120 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    expect(conflicts.get('100:director')?.[0]?.severity).toBe('partial')
  })

  it('local-midnight Date objects window on the LOCAL day (dateStr, not toISOString)', () => {
    // new Date(2026, 5, 12) is local midnight — toISOString would shift it a day
    // in any TZ ahead of UTC (the documented pitfall in dateTime.ts).
    const e1 = makeEvent({ id: 1, startDateBE: new Date(2026, 5, 12), startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12', startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    expect(conflicts.get('100:director')?.[0]?.severity).toBe('full')
  })
})

describe('display strings for API-shaped startDateBE (A-4-T0 upstream bugfix)', () => {
  // The A-3-T1 fix normalized parseEventWindow, but the DISPLAY strings
  // (CrewConflict.startTime and groupConflictsByPerson time) still built from raw
  // startDateBE: ISO-datetime events rendered "2026-06-12T00:00:00.000Z 20:00",
  // and the Date-object branch used the banned toISOString UTC day-shift.
  it('CrewConflict.startTime renders "YYYY-MM-DD HH:MM" for ISO-datetime events', () => {
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    expect(conflicts.get('100:director')?.[0]?.startTime).toBe('2026-06-12 20:00')
    expect(conflicts.get('101:director')?.[0]?.startTime).toBe('2026-06-12 20:00')
  })

  it('groupConflictsByPerson time strings render "YYYY-MM-DD HH:MM" for ISO-datetime events', () => {
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12T00:00:00.000Z', startTimeBE: '21:00', durationMin: 120 })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const groups = groupConflictsByPerson(plans, [e1, e2])

    expect(groups[0]?.conflicts[0]?.eventA.time).toBe('2026-06-12 20:00')
    expect(groups[0]?.conflicts[0]?.eventB.time).toBe('2026-06-12 21:00')
  })

  it('local-midnight Date objects render their LOCAL day in startTime (no UTC shift)', () => {
    // new Date(2026, 5, 12) = local midnight; toISOString would shift the day in
    // any TZ ahead of UTC — getDateKey keys by local components, TZ-robust.
    const e1 = makeEvent({ id: 1, startDateBE: new Date(2026, 5, 12), startTimeBE: '20:00' })
    const e2 = makeEvent({ id: 2, startDateBE: '2026-06-12', startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])

    // key 101 conflicts WITH plan 100's event (e1, the Date-object one)
    expect(conflicts.get('101:director')?.[0]?.startTime).toBe('2026-06-12 20:00')
  })
})
