import { z } from 'zod'

/** :id — ListedEventCategory.id (numeric) */
export const categoryIdParam = z.object({
  id: z.coerce.number().int().positive(),
})

/** :eventId — Event.id (numeric) */
export const eventIdParam = z.object({
  eventId: z.coerce.number().int().positive(),
})

/** Admin category edit (AS-3 editability). All fields optional (partial update). */
export const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  fullLiveRequired: z.boolean().optional(),
  besluitRef: z.string().nullable().optional(),
})

/** Confirm body — the category to bind to the event. */
export const confirmSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
})
