import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const venueCreateSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default('Europe/Brussels'),
  country: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  capacity: z.coerce.number().int().min(0).nullable().optional(),
})

export const venueUpdateSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),
  country: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  capacity: z.coerce.number().int().min(0).nullable().optional(),
})
