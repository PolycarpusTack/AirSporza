import { z } from 'zod'

export const switchCreateSchema = z.object({
  fromSlotId: z.string().min(1),
  toChannelId: z.coerce.number().int().positive(),
  toSlotId: z.string().nullable().optional(),
  triggerType: z.string().min(1),
  switchAtUtc: z.string().nullable().optional(),
  reasonCode: z.string().min(1),
  reasonText: z.string().nullable().optional(),
})

export const switchIdParam = z.object({
  id: z.string().min(1),
})

export const switchesQuery = z.object({
  fromSlotId: z.string().optional(),
  executionStatus: z.string().optional(),
})
