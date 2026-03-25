import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

export const courtCreateSchema = z.object({
  venueId: positiveInt,
  name: z.string().min(1),
  capacity: z.coerce.number().int().min(0).nullable().optional(),
  hasRoof: z.boolean().default(false),
  isShowCourt: z.boolean().default(false),
  broadcastPriority: z.coerce.number().int().default(0),
})

export const courtUpdateSchema = z.object({
  name: z.string().optional(),
  capacity: z.coerce.number().int().min(0).nullable().optional(),
  hasRoof: z.boolean().optional(),
  isShowCourt: z.boolean().optional(),
  broadcastPriority: z.coerce.number().int().optional(),
})
