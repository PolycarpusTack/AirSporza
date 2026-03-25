import { z } from 'zod'
import { uuidParam } from './common.js'

export { uuidParam }

export const updateRoleSchema = z.object({
  role: z.enum(['planner', 'sports', 'contracts', 'admin']),
})

export const userIdParam = z.object({
  id: z.string().min(1),
})
