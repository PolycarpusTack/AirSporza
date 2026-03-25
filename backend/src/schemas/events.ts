import { z } from 'zod'
import {
  positiveInt,
  optionalPositiveInt,
  eventStatusEnum,
  timeString,
  isoDateString,
  bulkIds,
  idParam,
} from './common.js'

export { idParam }

export const eventSchema = z.object({
  sportId: positiveInt,
  competitionId: positiveInt,
  phase: z.string().optional().default(''),
  category: z.string().optional().default(''),
  participants: z.string().min(1),
  content: z.string().optional().default(''),
  startDateBE: isoDateString,
  startTimeBE: timeString,
  startDateOrigin: z.string().optional().default(''),
  startTimeOrigin: z.string().optional().default(''),
  complex: z.string().optional().default(''),
  livestreamDate: z.string().optional().default(''),
  livestreamTime: z.string().optional().default(''),
  channelId: z.coerce.number().int().min(1).nullable().optional(),
  radioChannelId: z.coerce.number().int().min(1).nullable().optional(),
  onDemandChannelId: z.coerce.number().int().min(1).nullable().optional(),
  linearChannel: z.string().optional().default(''),
  radioChannel: z.string().optional().default(''),
  onDemandChannel: z.string().optional().default(''),
  linearStartTime: z.string().optional().default(''),
  durationMin: z.coerce.number().int().min(1).nullable().optional(),
  isLive: z.boolean().optional(),
  isDelayedLive: z.boolean().optional(),
  videoRef: z.string().optional().default(''),
  winner: z.string().optional().default(''),
  score: z.string().optional().default(''),
  duration: z.string().optional().default(''),
  customFields: z.record(z.string(), z.unknown()).optional(),
  customValues: z
    .array(z.object({ fieldId: z.string().min(1), fieldValue: z.string().min(1) }))
    .default([]),
  status: eventStatusEnum.optional(),
  seriesId: z.string().nullable().optional(),
})

export const statusUpdateSchema = z.object({
  status: eventStatusEnum,
})

export const conflictCheckSchema = z.object({
  id: z.coerce.number().int().min(1).optional(),
  competitionId: z.coerce.number().int().min(1).optional(),
  channelId: z.coerce.number().int().min(1).optional(),
  radioChannelId: z.coerce.number().int().min(1).optional(),
  onDemandChannelId: z.coerce.number().int().min(1).optional(),
  linearChannel: z.string().optional(),
  onDemandChannel: z.string().optional(),
  radioChannel: z.string().optional(),
  startDateBE: isoDateString.optional(),
  startTimeBE: timeString.optional(),
  status: eventStatusEnum.optional(),
})

export const bulkDeleteSchema = z.object({ ids: bulkIds })

export const bulkStatusSchema = z.object({
  ids: bulkIds,
  status: eventStatusEnum,
})

export const bulkRescheduleSchema = z.object({
  ids: bulkIds,
  shiftDays: z.coerce.number().int().min(-365).max(365),
})

export const bulkAssignSchema = z.object({
  ids: bulkIds,
  field: z.enum(['linearChannel', 'channelId', 'sportId', 'competitionId']),
  value: z.union([z.string(), z.number()]),
})

export const bulkConflictSchema = z.object({
  eventIds: z.array(positiveInt).min(1).max(50),
})

export const batchCreateSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
  seriesId: z.string().nullable().optional(),
})

export const competitionIdParam = z.object({
  competitionId: z.coerce.number().int().positive(),
})

export const eventsQuery = z.object({
  sportId: z.coerce.number().int().positive().optional(),
  competitionId: z.coerce.number().int().positive().optional(),
  channel: z.string().optional(),
  channelId: z.coerce.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().max(200).optional(),
})
