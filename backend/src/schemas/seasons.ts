import { z } from 'zod'
import { idParam, positiveInt, isoDateString } from './common.js'

export { idParam }

const stageSchema = z.object({
  name: z.string().min(1),
  stageType: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
  advancementRules: z.record(z.string(), z.unknown()).default({}),
  sportMetadata: z.record(z.string(), z.unknown()).default({}),
})

export const seasonCreateSchema = z.object({
  competitionId: positiveInt,
  name: z.string().min(1),
  startDate: isoDateString,
  endDate: isoDateString,
  sportMetadata: z.record(z.string(), z.unknown()).default({}),
  stages: z.array(stageSchema).optional(),
})

export const seasonUpdateSchema = z.object({
  name: z.string().optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  sportMetadata: z.record(z.string(), z.unknown()).optional(),
})

export const stageCreateSchema = z.object({
  name: z.string().min(1),
  stageType: z.string().min(1),
  sortOrder: z.coerce.number().int().default(0),
  advancementRules: z.record(z.string(), z.unknown()).default({}),
  sportMetadata: z.record(z.string(), z.unknown()).default({}),
})

export const roundCreateSchema = z.object({
  name: z.string().min(1),
  roundNumber: z.coerce.number().int(),
  scheduledDateStart: isoDateString.nullable().optional(),
  scheduledDateEnd: isoDateString.nullable().optional(),
})

export const stageIdParam = z.object({
  stageId: z.coerce.number().int().positive(),
})
