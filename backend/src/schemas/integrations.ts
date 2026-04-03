import { z } from 'zod'

export const createIntegrationSchema = z.object({
  name: z.string().min(1).max(200),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL']),
  templateCode: z.string().min(1).max(100),
  credentials: z.record(z.string(), z.unknown()).optional(),
  fieldOverrides: z.array(z.object({
    sourceField: z.string(),
    targetField: z.string(),
    transform: z.string().optional(),
    transformConfig: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  rateLimitPerMinute: z.number().int().min(1).nullable().optional(),
  rateLimitPerDay: z.number().int().min(1).nullable().optional(),
})

export const updateIntegrationSchema = createIntegrationSchema.partial().extend({
  credentials: z.record(z.string(), z.unknown()).nullable().optional(), // null = unchanged
})

export const integrationIdParam = z.object({
  id: z.string().uuid(),
})

export const integrationLogsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(['success', 'failed', 'partial']).optional(),
})
