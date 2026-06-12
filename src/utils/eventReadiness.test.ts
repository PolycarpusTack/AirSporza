/**
 * Smoke tests for computeReadiness — pure function, no mocks needed.
 * First test through the frontend Vitest harness (A-1-T2).
 * Extended in B-3-T1 with characterization cases; pinned behaviors marked PINNED.
 */
import { describe, it, expect } from 'vitest'
import { computeReadiness } from './eventReadiness'
import type { Event, TechPlan, Contract, FieldConfig } from '../data/types'

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 1,
    sportId: 1,
    competitionId: 10,
    participants: 'Team A vs Team B',
    startDateBE: '2026-06-12',
    startTimeBE: '20:00',
    isLive: false,
    isDelayedLive: false,
    customFields: {},
    status: 'draft',
    linearChannel: 'VRT 1',
    duration: '01:30:00',
    ...overrides,
  } as Event
}

function makePlan(overrides: Partial<TechPlan> = {}): TechPlan {
  return {
    id: 100,
    eventId: 1,
    planType: 'standard',
    crew: {},
    isLivestream: false,
    customFields: {},
    ...overrides,
  }
}

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 50,
    competitionId: 10,
    status: 'valid',
    linearRights: true,
    maxRights: false,
    radioRights: false,
    sublicensing: false,
    territory: [],
    platforms: [],
    coverageType: 'full',
    ...overrides,
  } as Contract
}

const requiredCrewField: FieldConfig = {
  id: 'director',
  label: 'Director',
  type: 'text',
  required: true,
  visible: true,
  order: 1,
}

describe('computeReadiness', () => {
  it('marks a fully-prepared event as ready', () => {
    const event = makeEvent()
    const result = computeReadiness(event, [makePlan()], [makeContract()], [])

    expect(result.ready).toBe(true)
    expect(result.score).toBe(result.total)
    expect(result.checks.find(c => c.key === 'techPlan')?.status).toBe('pass')
  })

  it('fails techPlan and marks crew n/a when no plan exists', () => {
    const result = computeReadiness(makeEvent(), [], [makeContract()], [requiredCrewField])

    expect(result.ready).toBe(false)
    expect(result.checks.find(c => c.key === 'techPlan')?.status).toBe('fail')
    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('na')
  })

  it('fails crew when a required crew field is empty in any plan', () => {
    const plans = [makePlan({ crew: { director: 'Jane' } }), makePlan({ id: 101, crew: {} })]
    const result = computeReadiness(makeEvent(), plans, [makeContract()], [requiredCrewField])

    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('fail')
    expect(result.ready).toBe(false)
  })

  it('excludes n/a checks from the total (missing contract is not a failure)', () => {
    const result = computeReadiness(makeEvent(), [makePlan()], [], [])

    const contractCheck = result.checks.find(c => c.key === 'contract')
    expect(contractCheck?.status).toBe('na')
    expect(result.total).toBe(result.checks.length - 1)
    expect(result.ready).toBe(true)
  })

  it('fails channel and duration when neither is set', () => {
    const event = makeEvent({ linearChannel: undefined, onDemandChannel: undefined, radioChannel: undefined, duration: undefined })
    const result = computeReadiness(event, [makePlan()], [makeContract()], [])

    expect(result.checks.find(c => c.key === 'channel')?.status).toBe('fail')
    expect(result.checks.find(c => c.key === 'duration')?.status).toBe('fail')
    expect(result.ready).toBe(false)
  })

  // ── B-3-T1 characterization cases ──────────────────────────────────────────

  it('ignores plans that belong to other events', () => {
    const result = computeReadiness(makeEvent({ id: 1 }), [makePlan({ eventId: 2 })], [makeContract()], [requiredCrewField])

    expect(result.checks.find(c => c.key === 'techPlan')?.status).toBe('fail')
    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('na')
  })

  it('passes crew when the only required field is invisible (required && visible filter)', () => {
    const hiddenRequired = { ...requiredCrewField, visible: false }
    const result = computeReadiness(makeEvent(), [makePlan({ crew: {} })], [makeContract()], [hiddenRequired])

    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('pass')
  })

  it('treats a whitespace-only crew value as filled', () => {
    // PINNED: only null/undefined/'' fail the check — '  ' passes
    const result = computeReadiness(makeEvent(), [makePlan({ crew: { director: '  ' } })], [makeContract()], [requiredCrewField])

    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('pass')
  })

  it('treats non-string crew values (0, false) as filled', () => {
    // PINNED: the check is `val != null && val !== ''`, so 0 and false count as assigned
    const result = computeReadiness(
      makeEvent(),
      [makePlan({ crew: { director: 0, camera: false } })],
      [makeContract()],
      [requiredCrewField, { ...requiredCrewField, id: 'camera', label: 'Camera' }]
    )

    expect(result.checks.find(c => c.key === 'crew')?.status).toBe('pass')
  })

  it('fails contract when its status is "none" (unlike a missing contract, which is n/a)', () => {
    const result = computeReadiness(makeEvent(), [makePlan()], [makeContract({ status: 'none' })], [])

    expect(result.checks.find(c => c.key === 'contract')?.status).toBe('fail')
    expect(result.ready).toBe(false)
  })

  it('only considers the FIRST contract found for the competition', () => {
    // PINNED: a later valid contract for the same competition is ignored
    const contracts = [makeContract({ status: 'none' }), makeContract({ id: 51, status: 'valid' })]
    const result = computeReadiness(makeEvent(), [makePlan()], contracts, [])

    expect(result.checks.find(c => c.key === 'contract')?.status).toBe('fail')
  })

  it('passes channel when only the radio channel is set', () => {
    const event = makeEvent({ linearChannel: undefined, onDemandChannel: undefined, radioChannel: 'Radio 1' })
    const result = computeReadiness(event, [makePlan()], [makeContract()], [])

    expect(result.checks.find(c => c.key === 'channel')?.status).toBe('pass')
  })

  it('accepts a numeric channelId as satisfying the channel check', () => {
    // TD-17 fix (C-0-T3): events migrated to channelId (no legacy strings)
    // previously FAILED the channel check; the numeric id now passes.
    const event = makeEvent({ linearChannel: undefined, channelId: 5 })
    const result = computeReadiness(event, [makePlan()], [makeContract()], [])

    expect(result.checks.find(c => c.key === 'channel')?.status).toBe('pass')
  })

  it('accepts radioChannelId / onDemandChannelId too (same migration as channelId)', () => {
    // TD-17 fix (C-0-T3): the register cites "channelId etc." — all three
    // numeric id fields replace their deprecated string counterparts.
    const base = { linearChannel: undefined, onDemandChannel: undefined, radioChannel: undefined } as const

    const radio = computeReadiness(makeEvent({ ...base, radioChannelId: 3 }), [makePlan()], [makeContract()], [])
    expect(radio.checks.find(c => c.key === 'channel')?.status).toBe('pass')

    const onDemand = computeReadiness(makeEvent({ ...base, onDemandChannelId: 9 }), [makePlan()], [makeContract()], [])
    expect(onDemand.checks.find(c => c.key === 'channel')?.status).toBe('pass')
  })

  it('still fails the channel check when ids are null and no string field is set', () => {
    // TD-17 fix (C-0-T3): null ids are "unset", not a pass
    const event = makeEvent({
      linearChannel: undefined, onDemandChannel: undefined, radioChannel: undefined,
      channelId: null, radioChannelId: null, onDemandChannelId: null,
    })
    const result = computeReadiness(event, [makePlan()], [makeContract()], [])

    expect(result.checks.find(c => c.key === 'channel')?.status).toBe('fail')
  })
})
