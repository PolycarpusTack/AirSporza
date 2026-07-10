/**
 * RD-2-T2 — pure overlap predicate (ADR-015; overlap rule recorded in the RD-2
 * backlog block, architect 2026-07-10).
 *
 * Two windows on one contract overlap IFF ALL FOUR hold:
 *   (1) same category
 *   (2) intersecting validity period (half-open [start,end); null=unbounded)
 *   (3) intersecting territory scope (empty [] = unrestricted = intersects all)
 *   (4) intersecting platform scope (empty [] = unrestricted = intersects all)
 * Disjoint on ANY dimension => NOT an overlap (legitimate multi-market windows).
 */
import { describe, it, expect } from 'vitest'
import { windowsOverlap, type WindowLike } from '../src/services/rightsWindows/overlap.js'

const base: WindowLike = {
  category: 'LIVE',
  territory: ['BE'],
  platforms: ['linear'],
  windowStartUtc: '2026-01-01T00:00:00.000Z',
  windowEndUtc: '2026-06-01T00:00:00.000Z',
}
const w = (over: Partial<WindowLike>): WindowLike => ({ ...base, ...over })

describe('windowsOverlap — the decided 4-way rule', () => {
  it('identical windows overlap', () => {
    expect(windowsOverlap(base, w({}))).toBe(true)
  })

  it('different category => NO overlap (even if every other dimension matches)', () => {
    expect(windowsOverlap(base, w({ category: 'HIGHLIGHTS' }))).toBe(false)
  })

  it('disjoint territory (BE vs NL) => NO overlap', () => {
    expect(windowsOverlap(w({ territory: ['BE'] }), w({ territory: ['NL'] }))).toBe(false)
  })

  it('intersecting territory (BE,NL vs NL) => overlap', () => {
    expect(windowsOverlap(w({ territory: ['BE', 'NL'] }), w({ territory: ['NL'] }))).toBe(true)
  })

  it('empty territory ([] = unrestricted) intersects a scoped BE window => overlap', () => {
    expect(windowsOverlap(w({ territory: [] }), w({ territory: ['BE'] }))).toBe(true)
  })

  it('disjoint platforms (linear vs on-demand) => NO overlap', () => {
    expect(windowsOverlap(w({ platforms: ['linear'] }), w({ platforms: ['on-demand'] }))).toBe(false)
  })

  it('empty platforms ([] = unrestricted) intersects a scoped linear window => overlap', () => {
    expect(windowsOverlap(w({ platforms: [] }), w({ platforms: ['linear'] }))).toBe(true)
  })

  it('disjoint validity periods => NO overlap', () => {
    const jan = w({ windowStartUtc: '2026-01-01T00:00:00.000Z', windowEndUtc: '2026-02-01T00:00:00.000Z' })
    const mar = w({ windowStartUtc: '2026-03-01T00:00:00.000Z', windowEndUtc: '2026-04-01T00:00:00.000Z' })
    expect(windowsOverlap(jan, mar)).toBe(false)
  })

  it('overlapping validity periods => overlap', () => {
    const a = w({ windowStartUtc: '2026-01-01T00:00:00.000Z', windowEndUtc: '2026-03-01T00:00:00.000Z' })
    const b = w({ windowStartUtc: '2026-02-01T00:00:00.000Z', windowEndUtc: '2026-04-01T00:00:00.000Z' })
    expect(windowsOverlap(a, b)).toBe(true)
  })

  it('half-open: windows touching exactly at the boundary do NOT overlap', () => {
    const a = w({ windowStartUtc: '2026-01-01T00:00:00.000Z', windowEndUtc: '2026-02-01T00:00:00.000Z' })
    const b = w({ windowStartUtc: '2026-02-01T00:00:00.000Z', windowEndUtc: '2026-03-01T00:00:00.000Z' })
    expect(windowsOverlap(a, b)).toBe(false)
  })

  it('two fully null-bounded windows always period-intersect (=> overlap when other dims match)', () => {
    const a = w({ windowStartUtc: null, windowEndUtc: null })
    const b = w({ windowStartUtc: null, windowEndUtc: null })
    expect(windowsOverlap(a, b)).toBe(true)
  })

  it('null start = unbounded-past intersects a window ending later', () => {
    const openStart = w({ windowStartUtc: null, windowEndUtc: '2026-03-01T00:00:00.000Z' })
    const later = w({ windowStartUtc: '2026-02-01T00:00:00.000Z', windowEndUtc: null })
    expect(windowsOverlap(openStart, later)).toBe(true)
  })

  it('accepts Date objects (DB rows) as well as ISO strings (request bodies)', () => {
    const dbRow = w({ windowStartUtc: new Date('2026-01-15T00:00:00.000Z'), windowEndUtc: new Date('2026-05-01T00:00:00.000Z') })
    expect(windowsOverlap(dbRow, base)).toBe(true)
  })
})
