/**
 * RD-3-T2 — stage 3 (validateRights) dual-path: flag-OFF parity + flag-ON window
 * enforcement, incl. the non-skippable defect-(b) negative proof (existingRuns from
 * the ledger tally, not `[]`). Pure (no DB) — the tally is injected via context, so
 * the wiring logic is proven deterministically. The DB-backed CONFIRMED-insert proof
 * is in rightsWindow-pipeline.test.ts (gated).
 */
import { describe, it, expect } from 'vitest'
import { validateRights } from '../src/services/validation/rights.js'
import type { ValidationContext } from '../src/services/validation/types.js'

function contract(over: Record<string, unknown> = {}): any {
  return {
    id: 1, competitionId: 100, status: 'valid', tenantId: 't',
    validFrom: new Date('2025-01-01'), validUntil: new Date('2027-12-31'),
    linearRights: false, maxRights: false, radioRights: false, sublicensing: false,
    seasonId: null, territory: [], platforms: [], coverageType: 'LIVE',
    maxLiveRuns: null, maxPickRunsPerRound: null, windowStartUtc: null, windowEndUtc: null,
    tapeDelayHoursMin: null, blackoutPeriods: [], geoRestriction: null, fee: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(), rightsWindows: [], ...over,
  }
}
function win(over: Record<string, unknown> = {}): any {
  return {
    id: 'w-1', tenantId: 't', contractId: 1, category: 'LIVE', exclusivity: 'NON_EXCLUSIVE',
    territory: [], platforms: [], windowStartUtc: null, windowEndUtc: null,
    maxRuns: null, holdbackHoursMin: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}
function slot(over: Record<string, unknown> = {}): any {
  return {
    id: 's1', eventId: 10, channelId: 3, contentSegment: 'FULL',
    plannedStartUtc: new Date('2026-03-01T12:00:00.000Z'),
    channel: { id: 3, types: ['linear'] },
    event: { id: 10, competitionId: 100, durationMin: 90 },
    ...over,
  }
}
const codes = (rs: ReturnType<typeof validateRights>) => rs.map(r => r.code)

describe('validateRights — flag OFF parity (legacy path unchanged)', () => {
  it('with no `contracts`/`windowsEnabled`, runs the legacy rightsPolicies path', () => {
    // legacy path: a policy with maxLiveRuns:0 (explicit) + existingRuns → MAX_RUNS_EXCEEDED
    const ctx: ValidationContext = {
      rightsPolicies: [{ competitionId: 100, maxLiveRuns: 0 }],
      existingRuns: [{ eventId: 10, count: 0 }],
      events: [],
    }
    const out = validateRights([slot()], ctx)
    expect(codes(out)).toContain('MAX_RUNS_EXCEEDED')
  })

  it('does NOT take the v2 path when `contracts` present but `windowsEnabled` absent', () => {
    const ctx: ValidationContext = {
      rightsPolicies: [], events: [],
      contracts: [contract({ rightsWindows: [win({ maxRuns: 0 })] })],
      contractRunTally: [{ contractId: 1, category: 'LIVE', count: 5 }],
      // windowsEnabled intentionally omitted → legacy path → empty rightsPolicies → []
    }
    expect(validateRights([slot()], ctx)).toEqual([])
  })
})

describe('validateRights — flag ON window enforcement', () => {
  const base: ValidationContext = {
    rightsPolicies: [], events: [], windowsEnabled: true,
  }

  it('per-category MAX_RUNS_EXCEEDED reaches the result (window maxRuns:2 + ledger tally 2)', () => {
    const out = validateRights([slot()], {
      ...base,
      contracts: [contract({ rightsWindows: [win({ maxRuns: 2, platforms: ['linear'] })] })],
      contractRunTally: [{ contractId: 1, category: 'LIVE', count: 2 }],
    })
    expect(codes(out)).toContain('MAX_RUNS_EXCEEDED')
  })

  it('HOLDBACK_VIOLATION reaches the result for a DELAYED slot before liveEnd+holdback', () => {
    const out = validateRights([slot({ runIntent: 'DELAYED', plannedStartUtc: new Date('2026-03-01T12:00:00.000Z') })], {
      ...base,
      contracts: [contract({ rightsWindows: [win({ category: 'DELAYED', holdbackHoursMin: 24, platforms: ['linear'] })] })],
      contractRunTally: [],
      liveRunEndUtcByEventId: { 10: '2026-03-01T10:00:00.000Z' }, // live ended 10:00 → earliest 2026-03-02 10:00
    })
    expect(codes(out)).toContain('HOLDBACK_VIOLATION')
  })

  it('PINNING (production boundary): a real slot with NO runIntent resolves to LIVE and does NOT trigger DELAYED/holdback enforcement', () => {
    // BroadcastSlot has no coverage-category column yet, so real slots are LIVE.
    // A contract with ONLY a DELAYED holdback window → the slot resolves LIVE →
    // WINDOW_CATEGORY_MISSING (no LIVE window), and NEVER a HOLDBACK_VIOLATION.
    const out = validateRights([slot(/* no runIntent */)], {
      rightsPolicies: [], events: [], windowsEnabled: true,
      contracts: [contract({ rightsWindows: [win({ category: 'DELAYED', holdbackHoursMin: 24, platforms: ['linear'] })] })],
      contractRunTally: [],
      liveRunEndUtcByEventId: { 10: '2020-01-01T00:00:00.000Z' },
    })
    expect(codes(out)).not.toContain('HOLDBACK_VIOLATION')
    expect(codes(out)).not.toContain('HOLDBACK_LIVE_END_UNKNOWN')
    expect(codes(out)).toContain('WINDOW_CATEGORY_MISSING') // resolved LIVE, no LIVE window
  })

  it('channel-include proof: PLATFORM_NOT_COVERED flows when slot.channel.types is present', () => {
    const out = validateRights([slot({ channel: { id: 3, types: ['fast'] } })], {
      ...base,
      contracts: [contract({ rightsWindows: [win({ platforms: ['linear'] })] })],
      contractRunTally: [],
    })
    expect(codes(out)).toContain('PLATFORM_NOT_COVERED')
  })
})

describe('validateRights — defect-(b) NEGATIVE PROOF (existingRuns from ledger, not [])', () => {
  const contracts = [contract({ rightsWindows: [win({ maxRuns: 2, platforms: ['linear'] })] })]

  it('WITH ledger tally present → MAX_RUNS_EXCEEDED fires', () => {
    const out = validateRights([slot()], {
      rightsPolicies: [], events: [], windowsEnabled: true,
      contracts, contractRunTally: [{ contractId: 1, category: 'LIVE', count: 2 }],
    })
    expect(codes(out)).toContain('MAX_RUNS_EXCEEDED')
  })

  it('with the tally FORCED EMPTY → MAX_RUNS_EXCEEDED does NOT fire; only NEAR (regression to [] fails the suite)', () => {
    const out = validateRights([slot()], {
      rightsPolicies: [], events: [], windowsEnabled: true,
      contracts, contractRunTally: [], // the "hardcoded []" regression
    })
    // tally 0 + 1 draft FULL run = 1 vs maxRuns 2 → NEAR, not EXCEEDED (pins the
    // >= boundary: a `>`→`>=` mutant on the EXCEEDED arm would wrongly fire here).
    expect(codes(out)).not.toContain('MAX_RUNS_EXCEEDED')
    expect(codes(out)).toContain('MAX_RUNS_NEAR')
  })
})
