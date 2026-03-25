import { z } from 'zod'

export const savedViewSchema = z.object({
  name: z.string().max(80).min(1),
  context: z.enum(['planner', 'contracts', 'sports']),
  filterState: z.record(z.string(), z.unknown()),
})

export const savedViewIdParam = z.object({
  id: z.string().min(1),
})
