import { z } from 'zod'

/**
 * Shared pagination convention (B-4, ADR-009).
 *
 * Opt-in: when neither `limit` nor `offset` is present, list endpoints keep
 * their legacy full-array response. When either is present the response is
 * the envelope { data, pagination: { total, limit, offset } }.
 * Stable ordering: paginated queries append an `id` tiebreak.
 */

export const MAX_PAGE_LIMIT = 200

/** Spread into a route's Zod query schema. */
export const paginationQueryFields = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}

export type Pagination = { limit?: number; offset: number }

/** null = legacy mode (no pagination params supplied). */
export function getPagination(query: { limit?: number; offset?: number }): Pagination | null {
  if (query.limit == null && query.offset == null) return null
  return { limit: query.limit, offset: query.offset ?? 0 }
}

export type PaginationEnvelope<T> = {
  data: T[]
  pagination: { total: number; limit: number | null; offset: number }
}

export function paginationEnvelope<T>(data: T[], total: number, p: Pagination): PaginationEnvelope<T> {
  return { data, pagination: { total, limit: p.limit ?? null, offset: p.offset } }
}
