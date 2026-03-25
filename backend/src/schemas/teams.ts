import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const teamCreateSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  externalRefs: z.record(z.string(), z.unknown()).default({}),
})

export const teamUpdateSchema = z.object({
  name: z.string().optional(),
  shortName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  externalRefs: z.record(z.string(), z.unknown()).optional(),
})
