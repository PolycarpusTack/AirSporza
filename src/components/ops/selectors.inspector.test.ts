/**
 * Permutation tests for the ops-selectors v2 additions (A-4-T0 — EventInspector).
 * Contract: docs/governance/contracts/ops-selectors.md (v2).
 *
 * Deliberately a SEPARATE file: A-3's selectors.test.ts (55 tests) must stay
 * byte-unchanged — v1 signatures keep being pinned there; this file pins only
 * the additive v2 surface. Fixed clock: FIXTURE_NOW; no React; no Date.now().
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { FieldConfig, TechPlan } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import { detectCrewConflicts, groupConflictsByPerson, type PersonConflictGroup } from '../../utils/crewConflicts'
import {
  FIXTURE_CONFLICTS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_PLANS,
  makeContract,
  makeEvent,
} from './__fixtures__/opsFixtureWeek'
import {
  deriveCrewHealth,
  deriveCrewRoles,
  deriveRightsInfo,
  deriveRightsStatus,
  filterConflictsToEvent,
} from './selectors'

const eventForCompetition = (competitionId: number) => makeEvent({ id: 999, competitionId })
const fixtureEvent = (id: number) => FIXTURE_EVENTS.find((e) => e.id === id)!

describe('deriveRightsInfo — status single-sourcing + validUntil exposure', () => {
  it('status matches deriveRightsStatus for EVERY fixture event (delegation pin, auto-sweeps future fixtures)', () => {
    const mismatches = FIXTURE_EVENTS.map((event) => ({
      eventId: event.id,
      viaInfo: deriveRightsInfo(event, FIXTURE_CONTRACTS, FIXTURE_NOW).status,
      viaStatus: deriveRightsStatus(event, FIXTURE_CONTRACTS, FIXTURE_NOW),
    })).filter((entry) => entry.viaInfo !== entry.viaStatus)

    expect(mismatches).toEqual([]) // failure output names the offending events
  })

  it('MISSING with no contract row → validUntil null, contract null', () => {
    expect(deriveRightsInfo(eventForCompetition(105), FIXTURE_CONTRACTS, FIXTURE_NOW)).toEqual({
      status: 'MISSING',
      validUntil: null,
      contract: null,
    })
  })

  it('MISSING via lapse EXPOSES the past validUntil (informative) and the contract', () => {
    const info = deriveRightsInfo(eventForCompetition(108), FIXTURE_CONTRACTS, FIXTURE_NOW)

    expect(info.status).toBe('MISSING')
    expect(info.validUntil).toBe('2026-02-01')
    expect(info.contract?.competitionId).toBe(108)
  })

  it('NEGOTIATION draft with a date exposes it', () => {
    const info = deriveRightsInfo(eventForCompetition(103), FIXTURE_CONTRACTS, FIXTURE_NOW)

    expect(info.status).toBe('NEGOTIATION')
    expect(info.validUntil).toBe('2028-12-31')
  })

  it("empty-string validUntil → null (comp 104, status 'none')", () => {
    const info = deriveRightsInfo(eventForCompetition(104), FIXTURE_CONTRACTS, FIXTURE_NOW)

    expect(info.status).toBe('MISSING')
    expect(info.validUntil).toBeNull()
    expect(info.contract?.status).toBe('none')
  })

  it('garbage validUntil → null (status still derives)', () => {
    const contracts = [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: 'not-a-date' })]
    const info = deriveRightsInfo(eventForCompetition(9), contracts, FIXTURE_NOW)

    expect(info.status).toBe('VALID')
    expect(info.validUntil).toBeNull()
  })

  it('plain date string exposes as-is (comp 101 → 2027-06-30)', () => {
    expect(deriveRightsInfo(eventForCompetition(101), FIXTURE_CONTRACTS, FIXTURE_NOW).validUntil).toBe('2027-06-30')
  })

  it('API-shaped ISO-datetime validUntil normalizes via getDateKey', () => {
    const contracts = [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: '2027-06-30T00:00:00.000Z' })]

    expect(deriveRightsInfo(eventForCompetition(9), contracts, FIXTURE_NOW).validUntil).toBe('2027-06-30')
  })

  it('Date-object validUntil normalizes on LOCAL components (no UTC shift)', () => {
    const contracts = [makeContract({ id: 1, competitionId: 9, status: 'valid', validUntil: new Date(2027, 5, 30) })]

    expect(deriveRightsInfo(eventForCompetition(9), contracts, FIXTURE_NOW).validUntil).toBe('2027-06-30')
  })

  it('two-contract competition exposes the GOVERNING contract (comp 109 → id 10)', () => {
    const info = deriveRightsInfo(eventForCompetition(109), FIXTURE_CONTRACTS, FIXTURE_NOW)

    expect(info.contract?.id).toBe(10)
    expect(info.validUntil).toBe('2027-08-01')
  })
})

describe('deriveCrewRoles — per-role rows (design: inspector CREW section)', () => {
  const rolesFor = (eventId: number) =>
    deriveCrewRoles(fixtureEvent(eventId), FIXTURE_PLANS, FIXTURE_CONFLICTS, DEFAULT_CREW_FIELDS)

  it('rows = visible non-checkbox crewFields in FieldConfig.order (8 of the 9 defaults)', () => {
    const rows = rolesFor(1)

    expect(rows.map((r) => r.fieldId)).toEqual([
      'encoder',
      'reporter',
      'camera',
      'sound',
      'production',
      'commentary',
      'director',
      'contact',
    ])
    expect(rows.map((r) => r.label)[0]).toBe('Encoder')
  })

  it('filled roles carry the name; blank OPTIONAL roles are ok with name null (pinned)', () => {
    const rows = rolesFor(1) // e1: encoder ENC-01, reporter Rita Mon, rest blank

    expect(rows.find((r) => r.fieldId === 'encoder')).toMatchObject({ name: 'ENC-01', state: 'OK' })
    expect(rows.find((r) => r.fieldId === 'reporter')).toMatchObject({ name: 'Rita Mon', state: 'OK' })
    expect(rows.find((r) => r.fieldId === 'camera')).toMatchObject({ name: null, state: 'OK' })
  })

  it('conflicted role → state conflict with the assigned name (e3 reporter, full severity)', () => {
    const rows = rolesFor(3)

    expect(rows.find((r) => r.fieldId === 'reporter')).toMatchObject({ name: 'Alex Marks', state: 'CONFLICT' })
    expect(rows.find((r) => r.fieldId === 'encoder')).toMatchObject({ name: 'ENC-03', state: 'OK' })
  })

  it('partial-severity conflict also marks the role (e5 sound)', () => {
    expect(rolesFor(5).find((r) => r.fieldId === 'sound')).toMatchObject({ name: 'Sam Overlap', state: 'CONFLICT' })
  })

  it('zero plans → required rows open, optional rows ok, all names null (e7)', () => {
    const rows = rolesFor(7)

    expect(rows.find((r) => r.fieldId === 'encoder')).toMatchObject({ name: null, state: 'OPEN' })
    expect(rows.filter((r) => r.fieldId !== 'encoder').every((r) => r.state === 'OK' && r.name === null)).toBe(true)
  })

  it('blank required role → open (e8 whitespace encoder)', () => {
    const rows = rolesFor(8)

    expect(rows.find((r) => r.fieldId === 'encoder')).toMatchObject({ name: null, state: 'OPEN' })
    expect(rows.find((r) => r.fieldId === 'reporter')).toMatchObject({ name: 'Ann Solo', state: 'OK' })
  })

  it('multi-plan: worst state per field wins, first filled name wins', () => {
    const event = makeEvent({ id: 300 })
    const plans: TechPlan[] = [
      { id: 300, eventId: 300, planType: 'A', crew: { encoder: 'ENC-A' }, isLivestream: false, customFields: [] },
      { id: 301, eventId: 300, planType: 'B', crew: { encoder: '' }, isLivestream: false, customFields: [] },
    ]

    const encoder = deriveCrewRoles(event, plans, new Map(), DEFAULT_CREW_FIELDS).find((r) => r.fieldId === 'encoder')
    expect(encoder).toMatchObject({ name: 'ENC-A', state: 'OPEN' }) // blank in ANY plan → open; first filled name kept
  })

  it('conflict outranks open within a single role', () => {
    const eventA = makeEvent({ id: 310, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const eventB = makeEvent({ id: 311, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const plans: TechPlan[] = [
      // plan 310: encoder conflicted (same person as plan 311) AND blank in a second plan
      { id: 310, eventId: 310, planType: 'A', crew: { encoder: 'Dana Both' }, isLivestream: false, customFields: [] },
      { id: 312, eventId: 310, planType: 'B', crew: { encoder: ' ' }, isLivestream: false, customFields: [] },
      { id: 311, eventId: 311, planType: 'A', crew: { encoder: 'Dana Both' }, isLivestream: false, customFields: [] },
    ]
    const conflicts = detectCrewConflicts(plans, [eventA, eventB])

    const encoder = deriveCrewRoles(eventA, plans, conflicts, DEFAULT_CREW_FIELDS).find((r) => r.fieldId === 'encoder')
    expect(encoder).toMatchObject({ name: 'Dana Both', state: 'CONFLICT' })
  })

  it('row order follows FieldConfig.order, not array order', () => {
    const shuffled: FieldConfig[] = [
      { id: 'b', label: 'B', type: 'text', required: false, visible: true, order: 2 },
      { id: 'a', label: 'A', type: 'text', required: false, visible: true, order: 1 },
    ]
    const event = makeEvent({ id: 320 })
    const plans: TechPlan[] = [
      { id: 320, eventId: 320, planType: 'A', crew: {}, isLivestream: false, customFields: [] },
    ]

    expect(deriveCrewRoles(event, plans, new Map(), shuffled).map((r) => r.fieldId)).toEqual(['a', 'b'])
  })

  it('invisible and checkbox fields are excluded from the rows', () => {
    const fields: FieldConfig[] = [
      { id: 'shown', label: 'Shown', type: 'text', required: false, visible: true, order: 0 },
      { id: 'hidden', label: 'Hidden', type: 'text', required: false, visible: false, order: 1 },
      { id: 'isLivestream', label: 'Livestream', type: 'checkbox', required: false, visible: true, order: 2 },
    ]
    const event = makeEvent({ id: 330 })
    const plans: TechPlan[] = [
      { id: 330, eventId: 330, planType: 'A', crew: {}, isLivestream: false, customFields: [] },
    ]

    expect(deriveCrewRoles(event, plans, new Map(), fields).map((r) => r.fieldId)).toEqual(['shown'])
  })

  it('CONSISTENCY INVARIANT: deriveCrewHealth === worst visible-row state, for every fixture event', () => {
    // Same CrewHealth scale on both sides since the A-4-T0 review → direct worst-of
    // comparison. Exception (pinned separately below): conflicts keyed on hidden/
    // checkbox fields may raise health ABOVE the rows — the fixture has none.
    const worstOf = (rows: { state: string }[]) =>
      rows.some((r) => r.state === 'CONFLICT') ? 'CONFLICT' : rows.some((r) => r.state === 'OPEN') ? 'OPEN' : 'OK'

    const mismatches = FIXTURE_EVENTS.map((event) => ({
      eventId: event.id,
      health: deriveCrewHealth(event, FIXTURE_PLANS, FIXTURE_CONFLICTS, DEFAULT_CREW_FIELDS),
      worstRow: worstOf(deriveCrewRoles(event, FIXTURE_PLANS, FIXTURE_CONFLICTS, DEFAULT_CREW_FIELDS)),
    })).filter((entry) => entry.health !== entry.worstRow)

    expect(mismatches).toEqual([]) // failure output names the offending events
  })

  it('INVARIANT EXCEPTION (decided at review): a conflict on a HIDDEN field raises health above the rows', () => {
    // deriveCrewHealth scans ALL plan.crew keys; deriveCrewRoles only emits
    // visible non-checkbox rows. A hidden-field conflict → health CONFLICT while
    // no visible row is conflicted — CORRECT UX: the event-level word is broader.
    const hiddenField: FieldConfig[] = [
      ...DEFAULT_CREW_FIELDS,
      { id: 'secret', label: 'Secret Role', type: 'text', required: false, visible: false, order: 99 },
    ]
    const eventA = makeEvent({ id: 400, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const eventB = makeEvent({ id: 401, startDateBE: '2026-03-02', startTimeBE: '10:00', durationMin: 120 })
    const plans: TechPlan[] = [
      { id: 400, eventId: 400, planType: 'A', crew: { encoder: 'ENC-400', secret: 'Dana Hidden' }, isLivestream: false, customFields: [] },
      { id: 401, eventId: 401, planType: 'A', crew: { encoder: 'ENC-401', secret: 'Dana Hidden' }, isLivestream: false, customFields: [] },
    ]
    const conflicts = detectCrewConflicts(plans, [eventA, eventB])

    expect(conflicts.has('400:secret')).toBe(true) // precondition: the hidden field IS conflicted
    expect(deriveCrewHealth(eventA, plans, conflicts, hiddenField)).toBe('CONFLICT')
    const rows = deriveCrewRoles(eventA, plans, conflicts, hiddenField)
    expect(rows.some((r) => r.state === 'CONFLICT')).toBe(false) // no visible row carries it
  })
})

describe('filterConflictsToEvent — event-scoped PersonConflictGroup filtering', () => {
  const allGroups = groupConflictsByPerson(FIXTURE_PLANS, FIXTURE_EVENTS)

  it('keeps only groups touching the event, with their conflict rows filtered (e3 → Alex Marks)', () => {
    const scoped = filterConflictsToEvent(fixtureEvent(3), allGroups)

    expect(scoped).toHaveLength(1)
    expect(scoped[0].personName).toBe('Alex marks') // groupConflictsByPerson capitalization pinned upstream
    expect(
      scoped[0].conflicts.every((c) => c.eventA.id === 3 || c.eventB.id === 3),
    ).toBe(true)
  })

  it('event without conflicts → empty array (e1)', () => {
    expect(filterConflictsToEvent(fixtureEvent(1), allGroups)).toEqual([])
  })

  it('filters WITHIN a group: non-touching conflict rows are dropped, emptied groups removed', () => {
    const synthetic: PersonConflictGroup[] = [
      {
        personName: 'Poly Assigned',
        conflicts: [
          { eventA: { id: 3, name: 'A', role: 'reporter', time: 't' }, eventB: { id: 4, name: 'B', role: 'camera', time: 't' }, severity: 'full' },
          { eventA: { id: 5, name: 'C', role: 'sound', time: 't' }, eventB: { id: 6, name: 'D', role: 'reporter', time: 't' }, severity: 'partial' },
        ],
      },
      {
        personName: 'Elsewhere Only',
        conflicts: [
          { eventA: { id: 5, name: 'C', role: 'sound', time: 't' }, eventB: { id: 6, name: 'D', role: 'reporter', time: 't' }, severity: 'partial' },
        ],
      },
    ]

    const scoped = filterConflictsToEvent(fixtureEvent(3), synthetic)

    expect(scoped).toHaveLength(1)
    expect(scoped[0].personName).toBe('Poly Assigned')
    expect(scoped[0].conflicts).toHaveLength(1)
    expect(scoped[0].conflicts[0].severity).toBe('full')
  })

  it('role fields are RAW crew fieldIds — label mapping is the component/crewFields job (pinned)', () => {
    const scoped = filterConflictsToEvent(fixtureEvent(3), allGroups)
    const roles = scoped[0].conflicts.flatMap((c) => [c.eventA.role, c.eventB.role])

    expect(roles).toContain('reporter') // fieldId, NOT the 'Reporter' label
    expect(roles).not.toContain('Reporter')
  })
})
