import { z } from 'zod'

/** Numeric ID route param (e.g., /events/:id) */
export const idParam = z.object({
  id: z.coerce.number().int().positive(),
})

/** UUID route param (e.g., /adapters/:id, /webhooks/:id) */
export const uuidParam = z.object({
  id: z.string().uuid(),
})

/** Standard pagination query params */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Date range filter */
export const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

/** Sort query params */
export const sortQuery = z.object({
  sortBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

/** Event status enum — used across events, bulk ops, publish */
export const eventStatusEnum = z.enum([
  'draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'
])

/** Positive integer — reusable for FK references */
export const positiveInt = z.coerce.number().int().positive()

/** Optional positive integer (nullable FK) */
export const optionalPositiveInt = z.coerce.number().int().positive().nullable().optional()

/** Time string HH:MM */
export const timeString = z.string().regex(/^\d{2}:\d{2}$/)

/** ISO date string (YYYY-MM-DD) */
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Bulk IDs array (1-100 items) */
export const bulkIds = z.array(positiveInt).min(1).max(100)
