/**
 * Tests for incremental page fetching + socket-safe merge (B-4-T3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllPages, mergeById, isIncrementalLoadingEnabled, type PageEnvelope } from './pagedFetch'

type Item = { id: number; name: string }

function makeServer(totalItems: number) {
  const all: Item[] = Array.from({ length: totalItems }, (_, i) => ({ id: i + 1, name: `item-${i + 1}` }))
  const fetchPage = vi.fn(async (limit: number, offset: number): Promise<PageEnvelope<Item>> => ({
    data: all.slice(offset, offset + limit),
    pagination: { total: totalItems, limit, offset },
  }))
  return { all, fetchPage }
}

afterEach(() => vi.unstubAllEnvs())

describe('fetchAllPages', () => {
  it('delivers the first page with first=true, then streams the rest in order', async () => {
    const { fetchPage } = makeServer(5)
    const pages: Array<{ count: number; first: boolean; offset: number }> = []

    const total = await fetchAllPages(fetchPage, {
      pageSize: 2,
      onPage: (items, info) => pages.push({ count: items.length, first: info.first, offset: info.offset }),
    })

    expect(total).toBe(5)
    expect(pages).toEqual([
      { count: 2, first: true, offset: 0 },
      { count: 2, first: false, offset: 2 },
      { count: 1, first: false, offset: 4 },
    ])
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('accumulated items match the full set exactly once', async () => {
    const { all, fetchPage } = makeServer(7)
    let acc: Item[] = []
    await fetchAllPages(fetchPage, { pageSize: 3, onPage: items => { acc = mergeById(acc, items) } })
    expect(acc).toEqual(all)
  })

  it('handles an empty resource (single empty page, total 0)', async () => {
    const { fetchPage } = makeServer(0)
    const onPage = vi.fn()
    const total = await fetchAllPages(fetchPage, { pageSize: 50, onPage })
    expect(total).toBe(0)
    expect(onPage).toHaveBeenCalledTimes(1)
  })

  it('stops on a defensive short page instead of looping forever', async () => {
    const fetchPage = vi.fn(async (): Promise<PageEnvelope<Item>> => ({
      data: [],
      pagination: { total: 100, limit: 10, offset: 0 },
    }))
    await fetchAllPages(fetchPage, { pageSize: 10, onPage: () => {} })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})

describe('mergeById', () => {
  it('appends only unseen ids — a socket-inserted row is not duplicated by a later page', async () => {
    const socketInserted = { id: 3, name: 'socket-version' }
    const state = [{ id: 1, name: 'a' }, socketInserted]
    const page = [{ id: 2, name: 'b' }, { id: 3, name: 'stale-page-version' }]

    const merged = mergeById(state, page)
    expect(merged.map(i => i.id).sort()).toEqual([1, 2, 3])
    expect(merged.find(i => i.id === 3)).toBe(socketInserted) // existing (newer) wins
  })

  it('returns the same reference when nothing is new (no spurious re-render)', () => {
    const state = [{ id: 1, name: 'a' }]
    expect(mergeById(state, [{ id: 1, name: 'a-again' }])).toBe(state)
  })
})

describe('isIncrementalLoadingEnabled', () => {
  it('defaults off; on only for the string "true"', () => {
    expect(isIncrementalLoadingEnabled()).toBe(false)
    vi.stubEnv('VITE_INCREMENTAL_LOADING', 'true')
    expect(isIncrementalLoadingEnabled()).toBe(true)
  })
})
