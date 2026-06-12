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

/**
 * Variant for endpoints where `limit` predates the envelope (import listings):
 * legacy consumers pass limit and expect plain arrays, so the envelope keys on
 * the NEW `offset` param only. Lenient parsing: invalid offset = legacy mode.
 */
export function getOffsetPagination(offsetRaw: unknown, limit?: number): Pagination | null {
  if (offsetRaw == null) return null
  const offset = Number(offsetRaw)
  if (Number.isNaN(offset) || offset < 0 || !Number.isInteger(offset)) return null
  return { limit, offset }
}

export type PaginationEnvelope<T> = {
  data: T[]
  pagination: { total: number; limit: number | null; offset: number }
}

export function paginationEnvelope<T>(data: T[], total: number, p: Pagination): PaginationEnvelope<T> {
  return { data, pagination: { total, limit: p.limit ?? null, offset: p.offset } }
}
