import { z } from 'zod'
import { coverageTypeEnum, exclusivityTierEnum } from './common.js'

/** :contractId (numeric, matches Contract.id) */
export const contractIdParam = z.object({
  contractId: z.coerce.number().int().positive(),
})

/** :contractId + :windowId (RightsWindow.id is a uuid) */
export const windowIdParam = z.object({
  contractId: z.coerce.number().int().positive(),
  windowId: z.string().uuid(),
})

/**
 * Create body. `id` is client-suppliable for idempotent retry (ADR-015 §1).
 * `platforms` is the lowercase channel-type vocabulary matched against
 * Channel.types (ADR-015 §1) — NOT the orphaned UPPERCASE Platform enum, so it is
 * an open string[] here rather than an enum.
 */
export const rightsWindowCreateSchema = z.object({
  id: z.string().uuid().optional(),
  category: coverageTypeEnum,
  exclusivity: exclusivityTierEnum.default('NON_EXCLUSIVE'),
  territory: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  windowStartUtc: z.string().datetime().nullable().optional(),
  windowEndUtc: z.string().datetime().nullable().optional(),
  maxRuns: z.coerce.number().int().min(0).nullable().optional(),
  holdbackHoursMin: z.coerce.number().int().min(0).nullable().optional(),
})

/**
 * PUT is a full replace; the id is the PATH param, so a body `id` is not accepted
 * (omitted rather than silently dropped — the create/update shapes are distinct).
 */
export const rightsWindowUpdateSchema = rightsWindowCreateSchema.omit({ id: true })

export type RightsWindowCreateInput = z.infer<typeof rightsWindowCreateSchema>
export type RightsWindowUpdateInput = z.infer<typeof rightsWindowUpdateSchema>
