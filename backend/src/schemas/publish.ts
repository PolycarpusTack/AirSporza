import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const publishEventsQuery = z.object({
  channel: z.string().optional(),
  sport: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  rights: z.enum(['linear', 'max', 'radio']).optional(),
  cursor: z.string().optional(),
  format: z.enum(['json', 'ical']).default('json'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const webhookCreateSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(1),
  events: z.array(z.string()).min(1),
})

export const webhookIdParam = z.object({
  id: z.string().min(1),
})

export const deliveriesQuery = z.object({
  webhookId: z.string().optional(),
  status: z.enum(['failed', 'delivered']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const webhookLogQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
