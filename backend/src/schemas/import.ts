import { z } from 'zod'

export const sourceUpdateSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    priority: z.coerce.number().int().min(1).max(999).optional(),
    rateLimitPerMinute: z.coerce.number().int().min(1).nullable().optional(),
    rateLimitPerDay: z.coerce.number().int().min(1).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' })

export const createJobSchema = z.object({
  sourceCode: z.string().min(1),
  entityScope: z.enum(['sports', 'competitions', 'teams', 'events', 'fixtures', 'live']),
  mode: z.enum(['full', 'incremental', 'backfill']).default('incremental'),
  entityId: z.union([z.string(), z.number()]).nullable().optional(),
  note: z.string().max(500).optional().default(''),
})

export const mergeDecisionSchema = z.object({
  targetEntityId: z.union([z.string(), z.number()]).nullable().optional(),
})

export const aliasSchema = z.object({
  canonicalId: z.string().min(1),
  alias: z.string().trim().min(2),
  sourceId: z.string().nullable().optional(),
})

export const aliasTypeParam = z.object({
  type: z.enum(['team', 'competition', 'venue']),
})
