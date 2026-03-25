import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

export const techPlanSchema = z.object({
  eventId: positiveInt,
  planType: z.string().min(1),
  crew: z.record(z.string(), z.unknown()),
  isLivestream: z.boolean().optional(),
  customFields: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
})

export const encoderPatchSchema = z.object({
  encoder: z.string().min(1),
})
