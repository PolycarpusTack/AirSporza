import { z } from 'zod'
import { positiveInt } from './common.js'

export const draftCreateSchema = z.object({
  channelId: positiveInt,
  dateRangeStart: z.string().min(1),
  dateRangeEnd: z.string().min(1),
})

export const draftPatchSchema = z.object({
  version: z.coerce.number().int(),
  operations: z.array(z.record(z.string(), z.unknown())),
})

export const draftPublishSchema = z.object({
  acknowledgeWarnings: z.boolean().optional(),
  isEmergency: z.boolean().optional(),
  reasonCode: z.string().nullable().optional(),
})

export const draftIdParam = z.object({
  id: z.string().min(1),
})

export const draftsQuery = z.object({
  channelId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
})

export const versionsQuery = z.object({
  channelId: z.coerce.number().int().positive().optional(),
  draftId: z.string().optional(),
})
