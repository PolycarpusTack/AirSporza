/**
 * Interaction tests for the ops EventInspector (A-4-T1).
 * Design: docs/design_handoff_planza_ops/README.md §1 SCHEDULE inspector spec.
 * Wired contracts: ops-selectors v2 (deriveRightsInfo / deriveCrewRoles /
 * filterConflictsToEvent), ops-tokens v3 (rights/crew word aliases,
 * --status-* Editorial-only, --alert-danger callout).
 *
 * PINNED AC interpretations (task card, A-4-T1):
 * - LIVE/DELAYED badge derives from isLive/isDelayedLive ONLY; both → LIVE wins;
 *   neither → no badge, even when event.status === 'live'.
 * - Crew rows derive from the crewFields prop — never a hard-coded role list.
 * - Conflict-callout roles are raw fieldIds upstream — the component maps them
 *   to labels via crewFields.
 * - deriveRightsInfo.validUntil null → no "until" line; lapsed dates still render.
 *
 * Badge/editorial/channel permutation events are TEST-LOCAL via makeEvent (no
 * fixture event sets isLive / isDelayedLive / status / channel — deep-frozen
 * fixtures are extended additively, never mutated).
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Event, FieldConfig, TechPlan } from '../../data/types'
import { DEFAULT_CREW_FIELDS } from '../../data'
import { groupConflictsByPerson } from '../../utils/crewConflicts'
import {
  deepFreeze,
  FIXTURE_CONFLICTS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW,
  FIXTURE_PLANS,
  makeEvent,
} from './__fixtures__/opsFixtureWeek'
import { EventInspector, type EventInspectorProps } from './EventInspector'

/** ONE grouping pass, exactly as the consuming screen does it (memoized there). */
const FIXTURE_CONFLICT_GROUPS = groupConflictsByPerson(FIXTURE_PLANS, FIXTURE_EVENTS)

const fixtureEvent = (id: number): Event => FIXTURE_EVENTS.find((e) => e.id === id)!

// ── Test-local permutation events (badge / editorial / channel) — deep-frozen
//    like the fixture week: shared module-level objects are pins, never mutable ──
const CANVAS_CHANNEL = deepFreeze({ id: 12, name: 'Canvas', color: '#4C8DF5', types: [] as string[] })

const liveApproved = deepFreeze(
  makeEvent({
    id: 501,
    competitionId: 101,
    startDateBE: '2026-03-04',
    startTimeBE: '21:00',
    durationMin: 150,
    isLive: true,
    status: 'approved',
    channel: CANVAS_CHANNEL,
    participants: 'Live approved on Canvas',
  }),
)
const delayedReady = deepFreeze(
  makeEvent({ id: 502, isDelayedLive: true, status: 'ready', participants: 'Delayed ready' }),
)
const bothLiveFlags = deepFreeze(
  makeEvent({ id: 503, isLive: true, isDelayedLive: true, participants: 'Both flags' }),
)
const statusLiveNoFlags = deepFreeze(
  makeEvent({ id: 504, status: 'live', participants: 'Status live, flags off' }),
)
const draftEvent = deepFreeze(makeEvent({ id: 505, status: 'draft', participants: 'Draft event' }))

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

const baseProps: EventInspectorProps = {
  event: null,
  contracts: FIXTURE_CONTRACTS,
  techPlans: FIXTURE_PLANS,
  conflicts: FIXTURE_CONFLICTS,
  conflictGroups: FIXTURE_CONFLICT_GROUPS,
  crewFields: DEFAULT_CREW_FIELDS,
  now: FIXTURE_NOW,
}

const renderInspector = (overrides: Partial<EventInspectorProps> = {}) =>
  render(
    <MemoryRouter initialEntries={['/ops/schedule']}>
      <EventInspector {...baseProps} {...overrides} />
      <LocationProbe />
    </MemoryRouter>,
  )

const inspector = () => screen.getByTestId('ops-inspector')

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

describe('empty state', () => {
  it('null event renders the quiet mono empty state and no sections', () => {
    renderInspector({ event: null })

    expect(screen.getByTestId('ops-inspector-empty')).toBeTruthy()
    expect(screen.getByText('INSPECTOR')).toBeTruthy()
    expect(screen.queryByText('RIGHTS')).toBeNull()
    expect(screen.queryByText('CREW')).toBeNull()
    expect(screen.queryByText('TECH PLANS')).toBeNull()
  })
})

describe('header (badge + editorial word + title)', () => {
  it('renders the event title at 15px/600', () => {
    renderInspector({ event: liveApproved })

    const title = screen.getByTestId('ops-inspector-title')
    expect(title.textContent).toBe('Live approved on Canvas')
    expect(title.style.fontSize).toBe('15px')
    expect(title.style.fontWeight).toBe('600')
  })

  it('isLive → bordered LIVE badge in --alert-danger', () => {
    renderInspector({ event: liveApproved })

    const badge = screen.getByTestId('ops-inspector-badge')
    expect(badge.textContent).toBe('LIVE')
    expect(badge.style.color).toBe('var(--alert-danger)')
    expect(badge.style.borderColor).toBe('var(--alert-danger)')
  })

  it('isDelayedLive → DELAYED badge in --alert-warning', () => {
    renderInspector({ event: delayedReady })

    const badge = screen.getByTestId('ops-inspector-badge')
    expect(badge.textContent).toBe('DELAYED')
    expect(badge.style.color).toBe('var(--alert-warning)')
  })

  it('both flags true → LIVE wins (pinned)', () => {
    renderInspector({ event: bothLiveFlags })

    expect(screen.getByTestId('ops-inspector-badge').textContent).toBe('LIVE')
  })

  it('neither flag → NO badge, even when event.status is "live" (pinned: badge is not status-derived)', () => {
    renderInspector({ event: statusLiveNoFlags })

    expect(screen.queryByTestId('ops-inspector-badge')).toBeNull()
  })

  // Editorial words use the --status-* family (Editorial-only, ops-tokens guard);
  // non-editorial or absent statuses render — (ScheduleScreen precedent).
  it.each([
    ['approved', () => liveApproved, 'APPROVED', 'var(--status-approved)'],
    ['ready', () => delayedReady, 'READY', 'var(--status-ready)'],
    ['draft', () => draftEvent, 'DRAFT', 'var(--status-draft)'],
    ['live (not an editorial word)', () => statusLiveNoFlags, '—', null],
    ['absent status', () => fixtureEvent(1), '—', null],
  ] as const)('editorial word: %s → renders correctly', (_label, getEvent, word, color) => {
    renderInspector({ event: getEvent() })

    const status = screen.getByTestId('ops-inspector-status')
    expect(status.textContent).toBe(word)
    if (color) expect(status.style.color).toBe(color)
  })
})

describe('mono meta lines', () => {
  it('renders the competition name line when provided', () => {
    renderInspector({ event: liveApproved, competitionName: 'League A' })

    expect(screen.getByTestId('ops-inspector-competition').textContent).toBe('League A')
  })

  it('meta line: WED 4 MAR · 21:00 · 150 min · Canvas (duration via effectiveDurationMin)', () => {
    renderInspector({ event: liveApproved })

    expect(screen.getByTestId('ops-inspector-meta').textContent).toBe('WED 4 MAR · 21:00 · 150 min · Canvas')
  })

  it('absent channel renders a trailing — (e1)', () => {
    renderInspector({ event: fixtureEvent(1) })

    expect(screen.getByTestId('ops-inspector-meta').textContent).toBe('MON 2 MAR · 20:00 · 120 min · —')
  })

  it('Date-object startDateBE keys on LOCAL components (e9 → FRI 6 MAR, no UTC shift)', () => {
    renderInspector({ event: fixtureEvent(9) })

    expect(screen.getByTestId('ops-inspector-meta').textContent).toBe('FRI 6 MAR · 10:00 · 60 min · —')
  })

  it('API ISO-datetime startDateBE normalizes (e2 → MON 2 MAR)', () => {
    renderInspector({ event: fixtureEvent(2) })

    expect(screen.getByTestId('ops-inspector-meta').textContent).toBe('MON 2 MAR · 14:00 · 120 min · —')
  })
})

describe('conflict callout', () => {
  it('conflicted event (e3) shows the red callout with person, mapped role labels and the other event detail', () => {
    renderInspector({ event: fixtureEvent(3) })

    const callout = screen.getByTestId('ops-inspector-conflict')
    expect(callout.style.borderColor).toBe('var(--alert-danger)')
    const text = callout.textContent ?? ''
    expect(text).toContain('Alex marks') // groupConflictsByPerson capitalization pinned upstream
    expect(text).toContain('Reporter') // own role: fieldId 'reporter' mapped via crewFields
    expect(text).toContain('Camera Operator') // other role: fieldId 'camera' mapped via crewFields
    expect(text).not.toContain('camera') // raw fieldIds never leak
    expect(text).toContain('Tue full-conflict B (MISSING none)')
    expect(text).toContain('2026-03-03 18:00')
  })

  it('event without conflicts (e1) → no callout', () => {
    renderInspector({ event: fixtureEvent(1) })

    expect(screen.queryByTestId('ops-inspector-conflict')).toBeNull()
  })

  it('empty conflict-groups array → no callout, no crash (even for an otherwise-conflicted event)', () => {
    renderInspector({ event: fixtureEvent(3), conflictGroups: [] })

    expect(screen.queryByTestId('ops-inspector-conflict')).toBeNull()
    expect(screen.getByTestId('ops-inspector-title')).toBeTruthy() // rest of the inspector intact
  })
})

describe('RIGHTS section', () => {
  it('VALID with until line (e1 → until 30 Jun 2027), alias-colored word and dot', () => {
    renderInspector({ event: fixtureEvent(1) })

    const word = screen.getByTestId('ops-inspector-rights-word')
    expect(word.textContent).toBe('VALID')
    expect(word.style.color).toBe('var(--rights-valid)')
    expect(screen.getByTestId('ops-inspector-rights-dot').style.backgroundColor).toBe('var(--rights-valid)')
    expect(screen.getByTestId('ops-inspector-rights-until').textContent).toBe('until 30 Jun 2027')
  })

  it('no contract row (e7) → MISSING with NO until line (validUntil null pin)', () => {
    renderInspector({ event: fixtureEvent(7) })

    expect(screen.getByTestId('ops-inspector-rights-word').textContent).toBe('MISSING')
    expect(screen.queryByTestId('ops-inspector-rights-until')).toBeNull()
  })

  it('lapsed contract (e9) → MISSING but the past date still renders (informative pin)', () => {
    renderInspector({ event: fixtureEvent(9) })

    expect(screen.getByTestId('ops-inspector-rights-word').textContent).toBe('MISSING')
    expect(screen.getByTestId('ops-inspector-rights-until').textContent).toBe('until 1 Feb 2026')
  })

  it('NEGOTIATION (e3) with its draft-contract date', () => {
    renderInspector({ event: fixtureEvent(3) })

    const word = screen.getByTestId('ops-inspector-rights-word')
    expect(word.textContent).toBe('NEGOTIATION')
    expect(word.style.color).toBe('var(--rights-negotiation)')
    expect(screen.getByTestId('ops-inspector-rights-until').textContent).toBe('until 31 Dec 2028')
  })
})

describe('CREW section', () => {
  const crewRow = (fieldId: string) => screen.getByTestId(`ops-inspector-crew-${fieldId}`)

  it('renders one row per visible non-checkbox crewField, in order (8 of the 9 defaults)', () => {
    renderInspector({ event: fixtureEvent(1) })

    const rows = screen.getAllByTestId(/^ops-inspector-crew-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'ops-inspector-crew-encoder',
      'ops-inspector-crew-reporter',
      'ops-inspector-crew-camera',
      'ops-inspector-crew-sound',
      'ops-inspector-crew-production',
      'ops-inspector-crew-commentary',
      'ops-inspector-crew-director',
      'ops-inspector-crew-contact',
    ])
  })

  it('filled role renders name, label and alias-colored OK word + dot (e1 encoder)', () => {
    renderInspector({ event: fixtureEvent(1) })

    const encoder = crewRow('encoder')
    expect(within(encoder).getByTestId('ops-crew-name').textContent).toBe('ENC-01')
    expect(within(encoder).getByTestId('ops-crew-role').textContent).toBe('Encoder')
    const word = within(encoder).getByTestId('ops-crew-state')
    expect(word.textContent).toBe('OK')
    expect(word.style.color).toBe('var(--crew-ok)')
    expect(within(encoder).getByTestId('ops-crew-dot').style.backgroundColor).toBe('var(--crew-ok)')
  })

  it('blank optional role renders — as the name (e1 camera)', () => {
    renderInspector({ event: fixtureEvent(1) })

    expect(within(crewRow('camera')).getByTestId('ops-crew-name').textContent).toBe('—')
  })

  it('conflicted role row (e3 reporter → Alex Marks, CONFLICT)', () => {
    renderInspector({ event: fixtureEvent(3) })

    const reporter = crewRow('reporter')
    expect(within(reporter).getByTestId('ops-crew-name').textContent).toBe('Alex Marks')
    const word = within(reporter).getByTestId('ops-crew-state')
    expect(word.textContent).toBe('CONFLICT')
    expect(word.style.color).toBe('var(--crew-conflict)')
  })

  it('zero plans (e7) → required encoder row OPEN with — name', () => {
    renderInspector({ event: fixtureEvent(7) })

    const encoder = crewRow('encoder')
    expect(within(encoder).getByTestId('ops-crew-name').textContent).toBe('—')
    const word = within(encoder).getByTestId('ops-crew-state')
    expect(word.textContent).toBe('OPEN')
    expect(word.style.color).toBe('var(--crew-open)')
  })

  it('rows follow the crewFields prop — never a hard-coded role list (pinned)', () => {
    const customFields: FieldConfig[] = [
      { id: 'pilot', label: 'Drone Pilot', type: 'text', required: false, visible: true, order: 0 },
      { id: 'spotter', label: 'Spotter', type: 'text', required: false, visible: true, order: 1 },
    ]
    renderInspector({ event: fixtureEvent(1), crewFields: customFields })

    const rows = screen.getAllByTestId(/^ops-inspector-crew-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'ops-inspector-crew-pilot',
      'ops-inspector-crew-spotter',
    ])
    expect(screen.getByText('Drone Pilot')).toBeTruthy()
  })
})

describe('TECH PLANS section', () => {
  it('renders one chip per event plan (planType label)', () => {
    const plans: TechPlan[] = [
      ...FIXTURE_PLANS,
      { id: 900, eventId: 501, planType: 'Multi-cam live', crew: {}, isLivestream: true, customFields: [] },
      { id: 901, eventId: 501, planType: 'Radio commentary', crew: {}, isLivestream: false, customFields: [] },
    ]
    renderInspector({ event: liveApproved, techPlans: plans })

    const chips = screen.getAllByTestId('ops-inspector-plan-chip')
    expect(chips.map((c) => c.textContent)).toEqual(['Multi-cam live', 'Radio commentary'])
  })

  it('zero plans (e7) → no chips, ghost button still present', () => {
    renderInspector({ event: fixtureEvent(7) })

    expect(screen.queryAllByTestId('ops-inspector-plan-chip')).toEqual([])
    expect(screen.getByRole('button', { name: '+ PLAN' })).toBeTruthy()
  })

  it('+ PLAN is a dashed ghost button that navigates to /sports (plain absolute — leaves /ops)', async () => {
    const user = userEvent.setup()
    renderInspector({ event: fixtureEvent(1) })

    const button = screen.getByRole('button', { name: '+ PLAN' })
    expect(button.style.borderStyle).toBe('dashed')
    await user.click(button)

    expect(screen.getByTestId('location').textContent).toBe('/sports')
  })
})

describe('panel chrome (README §Layout constants)', () => {
  it('panel is 320px on --surface-shell with a 1px left border', () => {
    renderInspector({ event: fixtureEvent(1) })

    const panel = inspector()
    expect(panel.style.width).toBe('320px')
    expect(panel.style.backgroundColor).toBe('var(--surface-shell)')
    expect(panel.getAttribute('style')).toContain('var(--border-shell)')
  })

  it('sections RIGHTS / CREW / TECH PLANS render their labels', () => {
    renderInspector({ event: fixtureEvent(1) })

    for (const label of ['RIGHTS', 'CREW', 'TECH PLANS']) {
      expect(within(inspector()).getByText(label)).toBeTruthy()
    }
  })
})
