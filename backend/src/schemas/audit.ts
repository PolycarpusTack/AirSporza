import { z } from 'zod'

export const auditQuery = z.object({
  action: z.string().optional(),
  userId: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const auditEntityParams = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
})

export const restoreParams = z.object({
  logId: z.string().min(1),
})
