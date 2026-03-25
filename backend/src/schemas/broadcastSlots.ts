import { z } from 'zod'
import { positiveInt } from './common.js'

const schedulingModeEnum = z.enum(['FIXED', 'FLOATING', 'WINDOW'])
const overrunStrategyEnum = z.enum(['EXTEND', 'TRUNCATE', 'SWITCH'])
const anchorTypeEnum = z.enum([
  'FIXED_TIME',
  'AFTER_PREVIOUS',
  'NOT_BEFORE',
])
const slotStatusEnum = z.enum([
  'PLANNED',
  'LIVE',
  'OVERRUN',
  'SWITCHED_OUT',
  'COMPLETED',
  'VOIDED',
])
const contentSegmentEnum = z.enum([
  'FULL',
  'PRE_MATCH',
  'FIRST_HALF',
  'HALF_TIME',
  'SECOND_HALF',
  'POST_MATCH',
  'HIGHLIGHTS',
])

export const slotCreateSchema = z.object({
  channelId: positiveInt,
  eventId: z.coerce.number().int().positive().nullable().optional(),
  schedulingMode: schedulingModeEnum.default('FIXED'),
  plannedStartUtc: z.string().nullable().optional(),
  plannedEndUtc: z.string().nullable().optional(),
  estimatedStartUtc: z.string().nullable().optional(),
  estimatedEndUtc: z.string().nullable().optional(),
  earliestStartUtc: z.string().nullable().optional(),
  latestStartUtc: z.string().nullable().optional(),
  bufferBeforeMin: z.coerce.number().int().min(0).default(15),
  bufferAfterMin: z.coerce.number().int().min(0).default(25),
  expectedDurationMin: z.coerce.number().int().min(1).nullable().optional(),
  overrunStrategy: overrunStrategyEnum.default('EXTEND'),
  conditionalTriggerUtc: z.string().nullable().optional(),
  conditionalTargetChannelId: z.coerce.number().int().positive().nullable().optional(),
  anchorType: anchorTypeEnum.default('FIXED_TIME'),
  coveragePriority: z.coerce.number().int().min(0).default(1),
  fallbackEventId: z.coerce.number().int().positive().nullable().optional(),
  status: slotStatusEnum.default('PLANNED'),
  contentSegment: contentSegmentEnum.default('FULL'),
  scheduleVersionId: z.string().nullable().optional(),
  sportMetadata: z.record(z.string(), z.unknown()).default({}),
})

export const slotUpdateSchema = slotCreateSchema.partial()

export const slotStatusUpdateSchema = z.object({
  status: slotStatusEnum,
})

export const slotIdParam = z.object({
  id: z.string().min(1),
})

export const slotsQuery = z.object({
  channelId: z.coerce.number().int().positive().optional(),
  eventId: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
})
