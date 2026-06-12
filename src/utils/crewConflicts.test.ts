/**
 * Characterization tests for crewConflicts (B-3-T1).
 * Pins CURRENT behavior — surprising results are documented in the task
 * findings list, not fixed here.
 *
 * Key pinned semantics: `event.duration` is parsed with parseFloat and
 * interpreted as HOURS here (default 3h), unlike dateTime.parseDurationMin
 * which interprets durations as MINUTES.
 */
import { describe, it, expect } from 'vitest'
import { detectCrewConflicts, groupConflictsByPerson } from './crewConflicts'
import type { Event, TechPlan } from '../data/types'

let nextEventId = 1
let nextPlanId = 100

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: nextEventId++,
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

function makePlan(overrides: Partial<TechPlan> = {}): TechPlan {
  return {
    id: nextPlanId++,
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

  it('flags overlapping (non-identical) windows as PARTIAL using the 3h default duration', () => {
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00' }) // 20:00–23:00
    const e2 = makeEvent({ id: 2, startTimeBE: '21:00' }) // 21:00–00:00
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    const conflicts = detectCrewConflicts(plans, [e1, e2])
    expect(conflicts.get('100:director')![0].severity).toBe('partial')
  })

  it('does NOT flag exact boundary touch (A ends exactly when B starts)', () => {
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '3' }) // ends 23:00
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

  it('interprets event.duration as HOURS via parseFloat (duration "2" = 2 hours)', () => {
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '2' }) // ends 22:00
    const inside = makeEvent({ id: 2, startTimeBE: '21:30' })
    const outside = makeEvent({ id: 3, startTimeBE: '22:30' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(2, 101)], [e1, inside]).size).toBe(2)
    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [e1, outside]).size).toBe(0)
  })

  it('parseFloats "01:30:00" to 1 — a 90-minute timecode becomes a 1-HOUR window', () => {
    // PINNED: inconsistent with parseDurationMin (which would treat durations as minutes).
    // e1 window is 20:00–21:00, so an event at 20:45 conflicts but 21:15 does not —
    // even though a true 90-minute reading (20:00–21:30) would conflict at 21:15.
    const e1 = makeEvent({ id: 1, startTimeBE: '20:00', duration: '01:30:00' })
    const at2045 = makeEvent({ id: 2, startTimeBE: '20:45' })
    const at2115 = makeEvent({ id: 3, startTimeBE: '21:15' })
    const planFor = (eventId: number, id: number) => makePlan({ id, eventId, crew: { director: 'Jane' } })

    expect(detectCrewConflicts([planFor(1, 100), planFor(2, 101)], [e1, at2045]).size).toBe(2)
    expect(detectCrewConflicts([planFor(1, 100), planFor(3, 101)], [e1, at2115]).size).toBe(0)
  })

  it('detects multi-day spans (30h duration conflicts with an event the next day)', () => {
    const e1 = makeEvent({ id: 1, startDateBE: '2026-06-12', startTimeBE: '20:00', duration: '30' }) // ends 2026-06-14 02:00
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
    // PINNED: the broken event's assignment vanishes, so no conflict is reported
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
    const e1 = makeEvent({ id: 1, startTimeBE: '08:00', duration: '2' })
    const e2 = makeEvent({ id: 2, startTimeBE: '20:00' })
    const plans = [
      makePlan({ id: 100, eventId: 1, crew: { director: 'Jane' } }),
      makePlan({ id: 101, eventId: 2, crew: { director: 'Jane' } }),
    ]
    expect(groupConflictsByPerson(plans, [e1, e2])).toEqual([])
  })
})
