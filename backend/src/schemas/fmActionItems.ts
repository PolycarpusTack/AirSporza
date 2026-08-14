import { z } from 'zod'

/**
 * FM1-4-T1 — resolve body: the opaque fmActionItems v1 key format
 * "<KIND>:<scope>:<id>[:<subscope>]" (e.g. "CONFLICT:event:42"). Validated
 * only for shape (non-empty, bounded length) — the route does not parse or
 * enforce the KIND vocabulary; that stays fmActionItems.ts's concern.
 */
export const resolveActionItemSchema = z.object({
  itemKey: z.string().min(1).max(500),
})
