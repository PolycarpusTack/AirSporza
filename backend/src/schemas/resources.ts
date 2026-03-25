import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

export const resourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    'ob_van',
    'camera_unit',
    'commentary_team',
    'production_staff',
    'other',
  ]),
  capacity: z.coerce.number().int().min(1).default(1),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export const assignSchema = z.object({
  techPlanId: positiveInt,
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  notes: z.string().nullable().optional(),
})

export const resourceIdParam = z.object({
  id: z.coerce.number().int().positive(),
})

export const assignDeleteParams = z.object({
  id: z.coerce.number().int().positive(),
  techPlanId: z.coerce.number().int().positive(),
})
