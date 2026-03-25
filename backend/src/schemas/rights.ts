import { z } from 'zod'
import { positiveInt } from './common.js'

export const policyCreateSchema = z.object({
  competitionId: positiveInt,
  seasonId: z.coerce.number().int().positive().nullable().optional(),
  territory: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  coverageType: z.enum(['LIVE', 'DELAYED', 'HIGHLIGHTS']).default('LIVE'),
  maxLiveRuns: z.coerce.number().int().min(0).nullable().optional(),
  maxPickRunsPerRound: z.coerce.number().int().min(0).nullable().optional(),
  windowStartUtc: z.string().nullable().optional(),
  windowEndUtc: z.string().nullable().optional(),
  tapeDelayHoursMin: z.coerce.number().int().min(0).nullable().optional(),
})

export const policyUpdateSchema = z.object({
  competitionId: z.coerce.number().int().positive().optional(),
  seasonId: z.coerce.number().int().positive().nullable().optional(),
  territory: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  coverageType: z.enum(['LIVE', 'DELAYED', 'HIGHLIGHTS']).optional(),
  maxLiveRuns: z.coerce.number().int().min(0).nullable().optional(),
  maxPickRunsPerRound: z.coerce.number().int().min(0).nullable().optional(),
  windowStartUtc: z.string().nullable().optional(),
  windowEndUtc: z.string().nullable().optional(),
  tapeDelayHoursMin: z.coerce.number().int().min(0).nullable().optional(),
})

export const policyIdParam = z.object({
  id: z.string().min(1),
})

export const runLedgerCreateSchema = z.object({
  broadcastSlotId: z.string().min(1),
  eventId: positiveInt,
  channelId: positiveInt,
  runType: z.enum(['LIVE', 'TAPE_DELAY', 'HIGHLIGHTS', 'CLIP', 'CONTINUATION']).default('LIVE'),
  parentRunId: z.string().nullable().optional(),
  startedAtUtc: z.string().nullable().optional(),
  endedAtUtc: z.string().nullable().optional(),
  durationMin: z.coerce.number().int().min(0).nullable().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED']).default('PENDING'),
})

export const runLedgerQuery = z.object({
  eventId: z.coerce.number().int().positive().optional(),
  channelId: z.coerce.number().int().positive().optional(),
  broadcastSlotId: z.string().optional(),
  status: z.string().optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
})

export const eventIdParam = z.object({
  eventId: z.coerce.number().int().positive(),
})
