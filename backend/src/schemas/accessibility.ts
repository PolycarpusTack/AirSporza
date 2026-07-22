import { z } from 'zod'
import { idParam, eventIdParam } from './common.js'

const accessibilityType = z.enum(['T888', 'AUDIO_DESCRIPTION', 'VGT'])
const accessibilityStatus = z.enum(['NOT_REQUIRED', 'REQUIRED', 'PLANNED', 'CONFIRMED', 'DELIVERED'])

/** :eventId — canonical param from common.ts (3rd consumer; older local copies in
 * listedEvents.ts/rights.ts migrate on their next REFACTORING touch). */
export { eventIdParam }

/** :id — AccessibilityDeliverable.id (canonical numeric id param). */
export const deliverableIdParam = idParam

/** setRequirement body — the type to toggle and the desired requirement. */
export const setRequirementSchema = z.object({
  type: accessibilityType,
  required: z.boolean(),
})

/**
 * transition body — target status + the MANDATORY optimistic guard: the status the
 * caller believes the row is in. Mismatch → 409 (retry-safe idempotency).
 */
export const transitionSchema = z.object({
  status: accessibilityStatus,
  expectedStatus: accessibilityStatus,
})

/** KPI period — from/to (inclusive), from must not be after to. */
export const kpiQuery = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine(q => q.from.getTime() <= q.to.getTime(), { message: 'from must not be after to' })
