/**
 * RD-2-T3 — getRightsMatrix additive `windows[]` exposure (ADR-015).
 *
 * Uses the injectable `opts.db` seam (no vi.mock) to feed a fake Prisma: one
 * db.contract.findMany + one db.runLedger.groupBy, mirroring the service's own
 * no-N+1 shape. Proves (1) additive-only — every pre-existing row key is present
 * and unchanged, and (2) windows map 1:1 (2 windows → 2 entries; 0 → []).
 */
import { describe, it, expect, vi } from 'vitest'
import { getRightsMatrix } from '../src/services/rightsChecker.js'

const TENANT = '00000000-0000-0000-0000-000000000000'

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    competitionId: 10,
    status: 'valid',
    tenantId: TENANT,
    seasonId: null,
    territory: ['BE'],
    platforms: ['linear'],
    coverageType: 'LIVE',
    maxLiveRuns: null,
    linearRights: false,
    maxRights: false,
    radioRights: false,
    windowStartUtc: null,
    windowEndUtc: null,
    validUntil: null,
    blackoutPeriods: [],
    competition: { name: 'Pro League' },
    season: null,
    rightsWindows: [],
    ...over,
  }
}

function windowRow(over: Record<string, unknown> = {}) {
  return {
    id: 'w-1',
    tenantId: TENANT,
    contractId: 1,
    category: 'LIVE',
    exclusivity: 'NON_EXCLUSIVE',
    territory: ['BE'],
    platforms: ['linear'],
    windowStartUtc: null,
    windowEndUtc: null,
    maxRuns: null,
    holdbackHoursMin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function fakeDb(contracts: unknown[]) {
  return {
    contract: { findMany: vi.fn().mockResolvedValue(contracts) },
    runLedger: { groupBy: vi.fn().mockResolvedValue([]) },
  } as never
}

const PRE_EXISTING_KEYS = [
  'contractId', 'competitionId', 'competitionName', 'seasonId', 'seasonName',
  'status', 'platforms', 'territory', 'coverageType', 'runsUsed', 'maxLiveRuns',
  'windowStartUtc', 'windowEndUtc', 'validUntil', 'daysUntilExpiry', 'severity',
  'blackoutCount',
]

describe('getRightsMatrix — additive windows[] (RD-2-T3)', () => {
  it('additive-only: every pre-existing row key is present and unchanged', async () => {
    const db = fakeDb([contractRow()])
    const [row] = await getRightsMatrix(TENANT, { db })

    for (const key of PRE_EXISTING_KEYS) {
      expect(row).toHaveProperty(key)
    }
    // Spot-check the values are the same rollups as before the additive change.
    expect(row.contractId).toBe(1)
    expect(row.competitionName).toBe('Pro League')
    expect(row.platforms).toEqual(['linear'])
    expect(row.coverageType).toBe('LIVE')
    expect(row.runsUsed).toBe(0)
    expect(row.blackoutCount).toBe(0)
    expect(row.severity).toBe('ok')
  })

  it('a contract with 0 windows yields windows: []', async () => {
    const db = fakeDb([contractRow({ rightsWindows: [] })])
    const [row] = await getRightsMatrix(TENANT, { db })
    expect(row.windows).toEqual([])
  })

  it('a contract with 2 windows yields 2 mapped entries (ISO bounds, full field set)', async () => {
    const db = fakeDb([
      contractRow({
        rightsWindows: [
          windowRow({
            id: 'w-1', category: 'LIVE', exclusivity: 'EXCLUSIVE',
            territory: ['BE'], platforms: ['linear'],
            windowStartUtc: new Date('2026-01-01T00:00:00.000Z'),
            windowEndUtc: new Date('2026-06-01T00:00:00.000Z'),
            maxRuns: 3, holdbackHoursMin: 24,
          }),
          windowRow({
            id: 'w-2', category: 'HIGHLIGHTS', exclusivity: 'NON_EXCLUSIVE',
            territory: [], platforms: [], maxRuns: null, holdbackHoursMin: null,
          }),
        ],
      }),
    ])
    const [row] = await getRightsMatrix(TENANT, { db })

    expect(row.windows).toHaveLength(2)
    expect(row.windows[0]).toEqual({
      id: 'w-1',
      category: 'LIVE',
      exclusivity: 'EXCLUSIVE',
      territory: ['BE'],
      platforms: ['linear'],
      windowStartUtc: '2026-01-01T00:00:00.000Z',
      windowEndUtc: '2026-06-01T00:00:00.000Z',
      maxRuns: 3,
      holdbackHoursMin: 24,
    })
    expect(row.windows[1]).toEqual({
      id: 'w-2',
      category: 'HIGHLIGHTS',
      exclusivity: 'NON_EXCLUSIVE',
      territory: [],
      platforms: [],
      windowStartUtc: null,
      windowEndUtc: null,
      maxRuns: null,
      holdbackHoursMin: null,
    })
  })

  it('includes rightsWindows in the single findMany (no N+1)', async () => {
    const db = fakeDb([contractRow()])
    await getRightsMatrix(TENANT, { db })
    const call = (db as unknown as { contract: { findMany: { mock: { calls: unknown[][] } } } }).contract.findMany.mock.calls[0][0] as { include: Record<string, unknown> }
    expect(call.include).toHaveProperty('rightsWindows')
  })
})
