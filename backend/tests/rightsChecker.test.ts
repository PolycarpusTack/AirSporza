import { describe, it, expect } from 'vitest'
import { checkRights } from '../src/services/rightsChecker.js'
import type { Contract } from '@prisma/client'

// Cast a minimal, typed mock contract shape so tests can focus on the fields
// that matter per case. Everything else gets safe defaults.
function mockContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 1,
    competitionId: 1,
    status: 'valid',
    tenantId: '00000000-0000-0000-0000-000000000000',
    validFrom: new Date('2025-01-01'),
    validUntil: new Date('2027-12-31'),
    linearRights: true,
    maxRights: true,
    radioRights: false,
    sublicensing: false,
    seasonId: null,
    territory: ['BE'],
    platforms: ['linear', 'on-demand'],
    coverageType: 'LIVE',
    maxLiveRuns: null,
    maxPickRunsPerRound: null,
    windowStartUtc: null,
    windowEndUtc: null,
    tapeDelayHoursMin: null,
    blackoutPeriods: [],
    geoRestriction: null,
    fee: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Contract
}

describe('checkRights — core paths', () => {
  it('flags NO_VALID_CONTRACT when the contract list is empty', () => {
    const results = checkRights({}, [])
    expect(results).toHaveLength(1)
    expect(results[0].code).toBe('NO_VALID_CONTRACT')
    expect(results[0].severity).toBe('ERROR')
  })

  it('flags NO_VALID_CONTRACT when every contract is status=none/draft', () => {
    const results = checkRights({}, [mockContract({ status: 'none' })])
    expect(results.some(r => r.code === 'NO_VALID_CONTRACT')).toBe(true)
  })

  it('warns CONTRACT_EXPIRING for status=expiring contracts', () => {
    const results = checkRights({}, [mockContract({ status: 'expiring' })])
    expect(results.some(r => r.code === 'CONTRACT_EXPIRING' && r.severity === 'WARNING')).toBe(true)
  })

  it('returns no issues for a clean valid contract with no extra input', () => {
    const results = checkRights({}, [mockContract()])
    expect(results).toHaveLength(0)
  })
})

describe('checkRights — platform coverage', () => {
  it('warns when channel types are not in contract.platforms', () => {
    const results = checkRights(
      { channelId: 1, channelTypes: ['linear', 'ott'] },
      [mockContract({ platforms: ['linear'] })],
    )
    expect(results.some(r => r.code === 'PLATFORM_NOT_COVERED')).toBe(true)
  })

  it('passes when every channel type is covered', () => {
    const results = checkRights(
      { channelId: 1, channelTypes: ['linear'] },
      [mockContract({ platforms: ['linear', 'on-demand'] })],
    )
    expect(results.some(r => r.code === 'PLATFORM_NOT_COVERED')).toBe(false)
  })
})

describe('checkRights — blackout periods', () => {
  const blackoutContract = mockContract({
    blackoutPeriods: [
      { start: '2026-04-20T00:00:00Z', end: '2026-04-20T23:59:59Z', reason: 'Exclusive simulcast' },
    ] as unknown as Contract['blackoutPeriods'],
  })

  it('errors with BLACKOUT_PERIOD when event starts inside a blackout', () => {
    const results = checkRights(
      { startUtc: '2026-04-20T20:00:00Z' },
      [blackoutContract],
    )
    const hit = results.find(r => r.code === 'BLACKOUT_PERIOD')
    expect(hit).toBeDefined()
    expect(hit?.severity).toBe('ERROR')
    expect(hit?.message).toContain('Exclusive simulcast')
  })

  it('passes when event starts just before the blackout', () => {
    const results = checkRights(
      { startUtc: '2026-04-19T23:00:00Z' },
      [blackoutContract],
    )
    expect(results.some(r => r.code === 'BLACKOUT_PERIOD')).toBe(false)
  })

  it('passes when event starts just after the blackout', () => {
    const results = checkRights(
      { startUtc: '2026-04-21T00:01:00Z' },
      [blackoutContract],
    )
    expect(results.some(r => r.code === 'BLACKOUT_PERIOD')).toBe(false)
  })

  it('skips malformed blackout entries without throwing', () => {
    const contract = mockContract({
      blackoutPeriods: [
        { start: 'not-a-date', end: 'also-bad' },
        { start: '2026-04-20T00:00:00Z', end: '2026-04-20T23:59:59Z' },
      ] as unknown as Contract['blackoutPeriods'],
    })
    const results = checkRights({ startUtc: '2026-04-20T12:00:00Z' }, [contract])
    expect(results.some(r => r.code === 'BLACKOUT_PERIOD')).toBe(true)
  })

  it('does not trip when blackoutPeriods is absent / not an array', () => {
    const contract = mockContract({
      blackoutPeriods: null as unknown as Contract['blackoutPeriods'],
    })
    const results = checkRights({ startUtc: '2026-04-20T12:00:00Z' }, [contract])
    expect(results.some(r => r.code === 'BLACKOUT_PERIOD')).toBe(false)
  })
})

describe('checkRights — run limits', () => {
  const cappedContract = mockContract({ maxLiveRuns: 3 })

  it('warns MAX_RUNS_NEAR when one away from the cap', () => {
    const results = checkRights({ currentRunCount: 2 }, [cappedContract])
    expect(results.some(r => r.code === 'MAX_RUNS_NEAR' && r.severity === 'WARNING')).toBe(true)
  })

  it('errors MAX_RUNS_EXCEEDED when at or past the cap', () => {
    const results = checkRights({ currentRunCount: 3 }, [cappedContract])
    const hit = results.find(r => r.code === 'MAX_RUNS_EXCEEDED')
    expect(hit).toBeDefined()
    expect(hit?.severity).toBe('ERROR')
  })

  it('does not warn when maxLiveRuns is null', () => {
    const results = checkRights({ currentRunCount: 50 }, [mockContract({ maxLiveRuns: null })])
    expect(results.some(r => r.code?.startsWith('MAX_RUNS_'))).toBe(false)
  })
})

describe('checkRights — territory', () => {
  it('errors TERRITORY_BLOCKED when target territory is not in the contract list', () => {
    const results = checkRights(
      { territory: 'NL' },
      [mockContract({ territory: ['BE', 'LU'] })],
    )
    expect(results.some(r => r.code === 'TERRITORY_BLOCKED' && r.severity === 'ERROR')).toBe(true)
  })

  it('passes when territory matches', () => {
    const results = checkRights(
      { territory: 'BE' },
      [mockContract({ territory: ['BE', 'LU'] })],
    )
    expect(results.some(r => r.code === 'TERRITORY_BLOCKED')).toBe(false)
  })

  it('ignores territory check when contract territory list is empty', () => {
    const results = checkRights(
      { territory: 'NL' },
      [mockContract({ territory: [] })],
    )
    expect(results.some(r => r.code === 'TERRITORY_BLOCKED')).toBe(false)
  })
})

describe('checkRights — rights window', () => {
  const windowedContract = mockContract({
    windowStartUtc: new Date('2026-04-01T00:00:00Z'),
    windowEndUtc: new Date('2026-04-30T23:59:59Z'),
  })

  it('warns OUTSIDE_RIGHTS_WINDOW when start is before the window', () => {
    const results = checkRights({ startUtc: '2026-03-31T23:00:00Z' }, [windowedContract])
    expect(results.some(r => r.code === 'OUTSIDE_RIGHTS_WINDOW')).toBe(true)
  })

  it('warns OUTSIDE_RIGHTS_WINDOW when start is after the window', () => {
    const results = checkRights({ startUtc: '2026-05-01T00:01:00Z' }, [windowedContract])
    expect(results.some(r => r.code === 'OUTSIDE_RIGHTS_WINDOW')).toBe(true)
  })

  it('passes when start is inside the window', () => {
    const results = checkRights({ startUtc: '2026-04-15T12:00:00Z' }, [windowedContract])
    expect(results.some(r => r.code === 'OUTSIDE_RIGHTS_WINDOW')).toBe(false)
  })
})
