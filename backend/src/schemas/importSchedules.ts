import { z } from 'zod'

export const createSchema = z.object({
  sourceId: z.string().min(1),
  cronExpr: z.string().min(1),
  isEnabled: z.boolean().optional(),
})

export const patchSchema = z
  .object({
    cronExpr: z.string().optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' })

export const scheduleIdParam = z.object({
  id: z.string().min(1),
})
