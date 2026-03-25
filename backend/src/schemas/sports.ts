import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const sportCreateSchema = z.object({
  name: z.string().min(1),
  icon: z.string().min(1),
  federation: z.string().nullable().optional(),
})

export const sportUpdateSchema = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  federation: z.string().nullable().optional(),
})
