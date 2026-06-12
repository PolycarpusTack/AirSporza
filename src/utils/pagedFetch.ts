/**
 * Incremental list loading (B-4-T3, flag INCREMENTAL_LOADING).
 * Pulls a paginated endpoint page-by-page: the first page lands via onPage
 * immediately (render fast), remaining pages stream in the background.
 */

export interface PageEnvelope<T> {
  data: T[]
  pagination: { total: number; limit: number | null; offset: number }
}

export interface PagedFetchOptions<T> {
  pageSize: number
  /** Called per page, in order. `first` is true exactly once. */
  onPage: (items: T[], info: { offset: number; total: number; first: boolean }) => void
}

export function isIncrementalLoadingEnabled(): boolean {
  return import.meta.env.VITE_INCREMENTAL_LOADING === 'true'
}

export async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<PageEnvelope<T>>,
  { pageSize, onPage }: PagedFetchOptions<T>
): Promise<number> {
  let offset = 0
  let total = Infinity
  let first = true

  while (offset < total) {
    const page = await fetchPage(pageSize, offset)
    total = page.pagination.total
    onPage(page.data, { offset, total, first })
    first = false
    if (page.data.length === 0) break // defensive: server returned short page
    offset += page.data.length
  }
  return total === Infinity ? 0 : total
}

/** Merge newly fetched items into existing state without clobbering rows that
 *  arrived via socket while pages were streaming (existing id wins). */
export function mergeById<T extends { id: number | string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map(item => item.id))
  const fresh = incoming.filter(item => !seen.has(item.id))
  return fresh.length === 0 ? existing : [...existing, ...fresh]
}
