import { z } from 'zod'

export const adapterConfigCreateSchema = z.object({
  adapterType: z.string().min(1),
  direction: z.string().min(1),
  providerName: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
})

export const adapterConfigUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  providerName: z.string().optional(),
})

export const adapterConfigIdParam = z.object({
  id: z.string().min(1),
})
