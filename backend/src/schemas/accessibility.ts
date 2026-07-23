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

/** RC-5-T2: a per-type KPI target — percent 0–100, or null = "no target defined". */
const kpiTargetPct = z.number().min(0).max(100).nullable()

/**
 * RC-5-T2 — PUT /config body (per-tenant override, REPLACE semantics — hence the
 * name: a plain `update` would falsely suggest partial patch): every field
 * optional/nullable — omitted or null clears the override so that field falls
 * back to its global constant default. BOTH objects are `.strict()`: an unknown
 * deliverable-type key OR any stray top-level key (e.g. a client-supplied
 * tenantId — the tenant comes from the auth context ONLY, TD-31 lesson) → 400
 * with field-level detail. `kpiTargetPctByType` is partial: present keys
 * override per type key, absent keys keep their constants (the loader's pinned
 * merge semantics).
 */
export const replaceConfigSchema = z
  .object({
    t888ExcludedSportIds: z.array(z.number().int().positive()).nullable().optional(),
    kpiTargetPctByType: z
      .object({ T888: kpiTargetPct, AUDIO_DESCRIPTION: kpiTargetPct, VGT: kpiTargetPct })
      .partial()
      .strict()
      .nullable()
      .optional(),
    unplannedLeadTimeDays: z.number().int().min(0).nullable().optional(),
  })
  .strict()
