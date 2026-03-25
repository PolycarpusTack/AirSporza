import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const encoderCreateSchema = z.object({
  name: z.string().min(1),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const encoderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
