/**
 * RD-3-T1 — GOLDEN MASTER for the legacy scalar path of checkRights.
 *
 * Pins the post-RD-1F baseline: with the windows flag OFF (default), checkRights
 * must produce byte-identical output to today. Any deviation in the legacy branch
 * fails here. Two complementary guards:
 *   (A) explicit baseline: each representative fixture's {code,severity,scope} list.
 *   (B) invariance by self-comparison (catches ANY drift incl. message text):
 *       - omitted opts === { windowsEnabled: false }
 *       - attaching rightsWindows to contracts does NOT change the legacy output.
 */
import { describe, it, expect } from 'vitest'
import { checkRights } from '../src/services/rightsChecker.js'
import type { Contract } from '@prisma/client'

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

const pick = (rs: ReturnType<typeof checkRights>) =>
  rs.map(r => ({ code: r.code, severity: r.severity, scope: r.scope }))

describe('checkRights legacy golden master (flag OFF / default)', () => {
  it('no contracts → NO_VALID_CONTRACT', () => {
    expect(pick(checkRights({}, []))).toEqual([
      { code: 'NO_VALID_CONTRACT', severity: 'ERROR', scope: ['rights'] },
    ])
  })

  it('all none/draft → NO_VALID_CONTRACT', () => {
    expect(pick(checkRights({}, [mockContract({ status: 'none' })]))).toEqual([
      { code: 'NO_VALID_CONTRACT', severity: 'ERROR', scope: ['rights'] },
    ])
  })

  it('clean valid contract, no input → no results', () => {
    expect(checkRights({}, [mockContract()])).toEqual([])
  })

  it('expiring → CONTRACT_EXPIRING', () => {
    expect(pick(checkRights({}, [mockContract({ status: 'expiring' })]))).toEqual([
      { code: 'CONTRACT_EXPIRING', severity: 'WARNING', scope: ['rights', 'expiry'] },
    ])
  })

  it('platform not covered → PLATFORM_NOT_COVERED', () => {
    const out = checkRights(
      { channelId: 3, channelTypes: ['fast'] },
      [mockContract({ platforms: ['linear'] })],
    )
    expect(pick(out)).toEqual([
      { code: 'PLATFORM_NOT_COVERED', severity: 'WARNING', scope: ['rights', 'platform'] },
    ])
  })

  it('start outside contract window → OUTSIDE_RIGHTS_WINDOW', () => {
    const out = checkRights(
      { startUtc: '2026-01-01T00:00:00.000Z' },
      [mockContract({
        windowStartUtc: new Date('2026-06-01T00:00:00.000Z'),
        windowEndUtc: new Date('2026-09-01T00:00:00.000Z'),
      })],
    )
    expect(pick(out)).toEqual([
      { code: 'OUTSIDE_RIGHTS_WINDOW', severity: 'WARNING', scope: ['rights', 'window'] },
    ])
  })

  it('blackout hit → BLACKOUT_PERIOD', () => {
    const out = checkRights(
      { startUtc: '2026-03-15T12:00:00.000Z' },
      [mockContract({
        blackoutPeriods: [{ start: '2026-03-15T00:00:00.000Z', end: '2026-03-16T00:00:00.000Z', reason: 'lockout' }] as never,
      })],
    )
    expect(pick(out)).toEqual([
      { code: 'BLACKOUT_PERIOD', severity: 'ERROR', scope: ['rights', 'blackout'] },
    ])
  })

  it('max runs exceeded → MAX_RUNS_EXCEEDED', () => {
    expect(pick(checkRights({ currentRunCount: 3 }, [mockContract({ maxLiveRuns: 3 })]))).toEqual([
      { code: 'MAX_RUNS_EXCEEDED', severity: 'ERROR', scope: ['rights', 'runs'] },
    ])
  })

  it('one run remaining → MAX_RUNS_NEAR', () => {
    expect(pick(checkRights({ currentRunCount: 2 }, [mockContract({ maxLiveRuns: 3 })]))).toEqual([
      { code: 'MAX_RUNS_NEAR', severity: 'WARNING', scope: ['rights', 'runs'] },
    ])
  })

  it('null maxLiveRuns = no limit (RD-1F — never a false MAX_RUNS_EXCEEDED)', () => {
    expect(checkRights({ currentRunCount: 99 }, [mockContract({ maxLiveRuns: null })])).toEqual([])
  })

  it('territory blocked → TERRITORY_BLOCKED', () => {
    const out = checkRights({ territory: 'NL' }, [mockContract({ territory: ['BE'] })])
    expect(pick(out)).toEqual([
      { code: 'TERRITORY_BLOCKED', severity: 'ERROR', scope: ['rights', 'territory'] },
    ])
  })

  // (B) invariance — the real byte-identity guard (compares full objects incl. messages)
  const fixtures: Array<[string, Parameters<typeof checkRights>[0], Contract[]]> = [
    ['empty', {}, []],
    ['clean', {}, [mockContract()]],
    ['expiring', {}, [mockContract({ status: 'expiring' })]],
    ['platform', { channelId: 3, channelTypes: ['fast'] }, [mockContract({ platforms: ['linear'] })]],
    ['runs', { currentRunCount: 3 }, [mockContract({ maxLiveRuns: 3 })]],
    ['territory', { territory: 'NL' }, [mockContract({ territory: ['BE'] })]],
  ]

  it('omitted opts === { windowsEnabled: false } for every fixture', () => {
    for (const [, input, contracts] of fixtures) {
      expect(checkRights(input, contracts)).toEqual(checkRights(input, contracts, { windowsEnabled: false }))
    }
  })

  it('attaching rightsWindows does NOT change the legacy (flag-OFF) output', () => {
    const window = {
      id: 'w-1', tenantId: 't', contractId: 1, category: 'LIVE', exclusivity: 'NON_EXCLUSIVE',
      territory: [], platforms: [], windowStartUtc: null, windowEndUtc: null,
      maxRuns: 1, holdbackHoursMin: 24, createdAt: new Date(), updatedAt: new Date(),
    }
    for (const [, input, contracts] of fixtures) {
      const withWindows = contracts.map(c => ({ ...c, rightsWindows: [window] })) as unknown as Contract[]
      expect(checkRights(input, withWindows)).toEqual(checkRights(input, contracts))
    }
  })
})

/**
 * FROZEN LEGACY MESSAGE BASELINE — the real byte-identity guard. Each literal below
 * was cross-checked char-identical against the pre-RD-3 original via
 * `git show main:backend/src/services/rightsChecker.ts` (before the
 * checkBlackout/checkExpiry/checkContractLegacy extraction). A drift in ANY legacy
 * message string fails here. Note: en-dash (–) in the window range and em-dash (—)
 * in the run-limit message are the frozen originals.
 */
describe('checkRights legacy FROZEN message baseline (flag OFF)', () => {
  it('NO_VALID_CONTRACT — empty contracts', () => {
    expect(checkRights({}, [])).toEqual([
      { code: 'NO_VALID_CONTRACT', severity: 'ERROR', scope: ['rights'], message: 'No contract found for this competition' },
    ])
  })

  it('NO_VALID_CONTRACT — none-only', () => {
    expect(checkRights({}, [mockContract({ status: 'none' })])).toEqual([
      { code: 'NO_VALID_CONTRACT', severity: 'ERROR', scope: ['rights'], message: 'No valid or expiring contract found for this competition' },
    ])
  })

  it('CONTRACT_EXPIRING', () => {
    expect(checkRights({}, [mockContract({ status: 'expiring' })])).toEqual([
      { code: 'CONTRACT_EXPIRING', severity: 'WARNING', scope: ['rights', 'expiry'], message: 'Contract #1 is expiring (until 2027-12-31)' },
    ])
  })

  it('PLATFORM_NOT_COVERED', () => {
    expect(checkRights({ channelId: 3, channelTypes: ['fast'] }, [mockContract({ platforms: ['linear'] })])).toEqual([
      { code: 'PLATFORM_NOT_COVERED', severity: 'WARNING', scope: ['rights', 'platform'], message: 'Channel type(s) [fast] not covered by contract #1' },
    ])
  })

  it('OUTSIDE_RIGHTS_WINDOW (en-dash range)', () => {
    expect(checkRights({ startUtc: '2026-01-01T00:00:00.000Z' }, [mockContract({
      windowStartUtc: new Date('2026-06-01T00:00:00.000Z'),
      windowEndUtc: new Date('2026-09-01T00:00:00.000Z'),
    })])).toEqual([
      { code: 'OUTSIDE_RIGHTS_WINDOW', severity: 'WARNING', scope: ['rights', 'window'], message: 'Event start is outside the rights window (2026-06-01T00:00:00.000Z – 2026-09-01T00:00:00.000Z)' },
    ])
  })

  it('BLACKOUT_PERIOD (with reason)', () => {
    expect(checkRights({ startUtc: '2026-03-15T12:00:00.000Z' }, [mockContract({
      blackoutPeriods: [{ start: '2026-03-15T00:00:00.000Z', end: '2026-03-16T00:00:00.000Z', reason: 'lockout' }] as never,
    })])).toEqual([
      { code: 'BLACKOUT_PERIOD', severity: 'ERROR', scope: ['rights', 'blackout'], message: 'Event falls inside blackout period (lockout) on contract #1' },
    ])
  })

  it('MAX_RUNS_EXCEEDED (em-dash)', () => {
    expect(checkRights({ currentRunCount: 3 }, [mockContract({ maxLiveRuns: 3 })])).toEqual([
      { code: 'MAX_RUNS_EXCEEDED', severity: 'ERROR', scope: ['rights', 'runs'], message: 'Maximum live runs (3) exceeded — currently 3 used' },
    ])
  })

  it('MAX_RUNS_NEAR', () => {
    expect(checkRights({ currentRunCount: 2 }, [mockContract({ maxLiveRuns: 3 })])).toEqual([
      { code: 'MAX_RUNS_NEAR', severity: 'WARNING', scope: ['rights', 'runs'], message: 'Approaching maximum live runs: 2/3' },
    ])
  })

  it('TERRITORY_BLOCKED', () => {
    expect(checkRights({ territory: 'NL' }, [mockContract({ territory: ['BE'] })])).toEqual([
      { code: 'TERRITORY_BLOCKED', severity: 'ERROR', scope: ['rights', 'territory'], message: 'Territory "NL" is not covered by contract #1 (allowed: BE)' },
    ])
  })
})
