/**
 * RD-3-T2 — per-CATEGORY RunLedger tally (ADR-015 §2). Pure mapping + aggregation.
 * RunType→category: LIVE→LIVE, TAPE_DELAY→DELAYED, HIGHLIGHTS→HIGHLIGHTS, CLIP→CLIP,
 * CONTINUATION excluded (counts with parent), ARCHIVE has no RunType source.
 */
import { describe, it, expect, vi } from 'vitest'
import { runTypeToCategory, aggregateRunTally, loadContractRunTally } from '../src/services/validation/runTally.js'

describe('runTypeToCategory (ADR-015 §2 mapping)', () => {
  it('maps the four counted run types', () => {
    expect(runTypeToCategory('LIVE')).toBe('LIVE')
    expect(runTypeToCategory('TAPE_DELAY')).toBe('DELAYED')
    expect(runTypeToCategory('HIGHLIGHTS')).toBe('HIGHLIGHTS')
    expect(runTypeToCategory('CLIP')).toBe('CLIP')
  })
  it('CONTINUATION is excluded (counts with its parent)', () => {
    expect(runTypeToCategory('CONTINUATION')).toBeNull()
  })
  it('unknown run type → null (no tally source, e.g. ARCHIVE)', () => {
    expect(runTypeToCategory('ARCHIVE')).toBeNull()
    expect(runTypeToCategory('WHATEVER')).toBeNull()
  })
})

describe('aggregateRunTally', () => {
  it('groups per (contractId, category), summing counts and mapping run types', () => {
    const rows = [
      { contractId: 1, runType: 'LIVE', _count: { _all: 2 } },
      { contractId: 1, runType: 'TAPE_DELAY', _count: { _all: 3 } },
      { contractId: 2, runType: 'LIVE', _count: { _all: 1 } },
    ]
    const out = aggregateRunTally(rows)
    expect(out).toContainEqual({ contractId: 1, category: 'LIVE', count: 2 })
    expect(out).toContainEqual({ contractId: 1, category: 'DELAYED', count: 3 })
    expect(out).toContainEqual({ contractId: 2, category: 'LIVE', count: 1 })
  })

  it('a DELAYED (TAPE_DELAY) run does NOT count against the LIVE category (per-category isolation)', () => {
    const out = aggregateRunTally([{ contractId: 1, runType: 'TAPE_DELAY', _count: { _all: 5 } }])
    expect(out.find(t => t.contractId === 1 && t.category === 'LIVE')).toBeUndefined()
    expect(out).toContainEqual({ contractId: 1, category: 'DELAYED', count: 5 })
  })

  it('excludes CONTINUATION and null-contract rows', () => {
    const out = aggregateRunTally([
      { contractId: 1, runType: 'CONTINUATION', _count: { _all: 9 } },
      { contractId: null, runType: 'LIVE', _count: { _all: 4 } },
    ])
    expect(out).toEqual([])
  })
})

describe('loadContractRunTally', () => {
  it('queries only CONFIRMED|RECONCILED and returns [] for no contract ids (no query)', async () => {
    const groupBy = vi.fn().mockResolvedValue([{ contractId: 1, runType: 'LIVE', _count: { _all: 2 } }])
    const db = { runLedger: { groupBy } } as never

    expect(await loadContractRunTally(db, 't1', [])).toEqual([])
    expect(groupBy).not.toHaveBeenCalled()

    const out = await loadContractRunTally(db, 't1', [1])
    expect(out).toContainEqual({ contractId: 1, category: 'LIVE', count: 2 })
    const where = groupBy.mock.calls[0][0].where
    expect(where.status).toEqual({ in: ['CONFIRMED', 'RECONCILED'] })
    expect(where.tenantId).toBe('t1')
    expect(where.contractId).toEqual({ in: [1] })
  })
})
