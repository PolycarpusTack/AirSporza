import { z } from 'zod'
import { idParam } from './common.js'

export { idParam }

export const channelCreateSchema = z.object({
  name: z.string().min(1),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  types: z.array(z.string()).default(['linear']),
  timezone: z.string().default('Europe/Brussels'),
  broadcastDayStartLocal: z.string().default('06:00'),
  platformConfig: z.record(z.string(), z.unknown()).default({}),
  epgConfig: z.record(z.string(), z.unknown()).default({}),
  color: z.string().default('#3B82F6'),
  sortOrder: z.coerce.number().int().default(0),
})

export const channelUpdateSchema = z.object({
  name: z.string().optional(),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  types: z.array(z.string()).optional(),
  timezone: z.string().optional(),
  broadcastDayStartLocal: z.string().optional(),
  platformConfig: z.record(z.string(), z.unknown()).optional(),
  epgConfig: z.record(z.string(), z.unknown()).optional(),
  color: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
})
