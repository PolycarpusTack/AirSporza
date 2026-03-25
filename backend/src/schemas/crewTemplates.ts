import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const createSchema = z.object({
  name: z.string().min(1),
  planType: z.string().nullable().default(null),
  crewData: z.record(z.string(), z.unknown()),
  isShared: z.boolean().default(false),
})

export const updateSchema = z.object({
  name: z.string().optional(),
  crewData: z.record(z.string(), z.unknown()).optional(),
  isShared: z.boolean().optional(),
})
