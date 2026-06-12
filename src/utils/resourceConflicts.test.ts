/**
 * Desired-semantics tests for resourceConflicts.
 * quality-pass fix (C-quality): unified duration accessor — resource conflict
 * windows previously used PRE-TD-15 logic (parseFloat-as-HOURS + 3h default),
 * so '120' meant 120 HOURS and '01:30:00' truncated to 1 hour. Durations are
 * MINUTES app-wide via the shared effectiveDurationMin accessor, with a
 * conservative 90-min floor for zero durations (a zero-width window can never
 * overlap, which would silently disable conflict detection).
 */
import { describe, it, expect } from 'vitest'
import { detectResourceConflicts } from './resourceConflicts'
import type { Event } from '../data/types'
import type { Resource, ResourceAssignment } from '../services/resources'

let nextEventId = 1
let nextAssignmentId = 1

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

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 1,
    name: 'OB Van 1',
    type: 'ob_van',
    capacity: 1,
    isActive: true,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Resource
}

function makeAssignment(resourceId: number, eventId: number, overrides: Partial<ResourceAssignment> = {}): ResourceAssignment {
  const id = nextAssignmentId++
  return {
    id,
    resourceId,
    techPlanId: id + 1000,
    quantity: 1,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    techPlan: { id: id + 1000, planType: 'standard', eventId },
    ...overrides,
  }
}

/** One capacity-1 resource with one assignment per event — any window overlap is a conflict. */
function conflictsFor(events: Event[]) {
  const resource = makeResource()
  const assignments = { [resource.id]: events.map(e => makeAssignment(resource.id, e.id)) }
  return detectResourceConflicts([resource], assignments, events)
}

describe('detectResourceConflicts — duration semantics', () => {
  it('interprets duration "120" as 120 MINUTES (2h window), not 120 hours', () => {
    const e1 = makeEvent({ startTimeBE: '20:00', duration: '120' }) // 20:00–22:00
    const inside = makeEvent({ startTimeBE: '21:30' })
    const outside = makeEvent({ startTimeBE: '22:30' }) // old hours logic: still inside the 120h window

    expect(conflictsFor([e1, inside])).toHaveLength(1)
    expect(conflictsFor([e1, outside])).toHaveLength(0)
  })

  it('parses "01:30:00" as a true 90-minute window (not parseFloat-truncated to 1 hour)', () => {
    const e1 = makeEvent({ startTimeBE: '20:00', duration: '01:30:00' }) // 20:00–21:30
    const at2115 = makeEvent({ startTimeBE: '21:15' }) // old logic: outside the 1h window — false negative
    const at2145 = makeEvent({ startTimeBE: '21:45' })

    expect(conflictsFor([e1, at2115])).toHaveLength(1)
    expect(conflictsFor([e1, at2145])).toHaveLength(0)
  })

  it('prefers the numeric durationMin field over the deprecated duration string', () => {
    const short = makeEvent({ startTimeBE: '10:00', durationMin: 30, duration: '600' }) // 10:00–10:30
    const later = makeEvent({ startTimeBE: '11:00' })
    expect(conflictsFor([short, later])).toHaveLength(0)

    const long = makeEvent({ startTimeBE: '10:00', durationMin: 600, duration: '30' }) // 10:00–20:00
    const inside = makeEvent({ startTimeBE: '19:00' })
    expect(conflictsFor([long, inside])).toHaveLength(1)
  })

  it('applies a conservative 90-min floor to zero durations so placeholder feeds still get detection', () => {
    const zeroStr = makeEvent({ startTimeBE: '20:00', duration: '00:00:00' }) // floored: 20:00–21:30
    const zeroMin = makeEvent({ startTimeBE: '20:00', durationMin: 0 })       // floored: 20:00–21:30
    const at2030 = makeEvent({ startTimeBE: '20:30' })
    const at2145 = makeEvent({ startTimeBE: '21:45' })

    expect(conflictsFor([zeroStr, at2030])).toHaveLength(1)
    expect(conflictsFor([zeroMin, at2030])).toHaveLength(1)
    expect(conflictsFor([zeroStr, at2145])).toHaveLength(0) // the floor is exactly 90 min
  })

  it('uses the 90-minute default window when duration is missing (no phantom 3h window)', () => {
    const e1 = makeEvent({ startTimeBE: '20:00' }) // 20:00–21:30
    const at2145 = makeEvent({ startTimeBE: '21:45' }) // old 3h default: false-positive conflict
    const at2100 = makeEvent({ startTimeBE: '21:00' })

    expect(conflictsFor([e1, at2145])).toHaveLength(0)
    expect(conflictsFor([e1, at2100])).toHaveLength(1)
  })
})

describe('detectResourceConflicts — capacity', () => {
  it('only conflicts when concurrent quantity exceeds capacity', () => {
    const e1 = makeEvent({ startTimeBE: '20:00', duration: '120' })
    const e2 = makeEvent({ startTimeBE: '21:00', duration: '120' })

    const roomy = makeResource({ id: 1, capacity: 2 })
    const roomyAssignments = { 1: [makeAssignment(1, e1.id), makeAssignment(1, e2.id)] }
    expect(detectResourceConflicts([roomy], roomyAssignments, [e1, e2])).toHaveLength(0)

    const tight = makeResource({ id: 2, capacity: 2 })
    const tightAssignments = { 2: [makeAssignment(2, e1.id, { quantity: 2 }), makeAssignment(2, e2.id)] }
    const conflicts = detectResourceConflicts([tight], tightAssignments, [e1, e2])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].concurrentCount).toBe(3)
    expect(conflicts[0].capacity).toBe(2)
    expect(conflicts[0].overlappingEvents).toHaveLength(2)
  })
})
