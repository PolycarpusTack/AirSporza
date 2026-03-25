import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

export const competitionCreateSchema = z.object({
  sportId: positiveInt,
  name: z.string().min(1),
  matches: z.coerce.number().int().min(0).default(0),
  season: z.string().min(1),
})
