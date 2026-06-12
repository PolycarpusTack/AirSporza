/**
 * Smoke tests for computeReadiness — pure function, no mocks needed.
 * First test through the frontend Vitest harness (A-1-T2).
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
})
