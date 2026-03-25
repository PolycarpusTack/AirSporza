import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

const contractStatusValues = ['valid', 'expiring', 'expired', 'draft', 'terminated'] as const

export const contractSchema = z.object({
  competitionId: positiveInt,
  status: z.enum(contractStatusValues),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  // Legacy boolean rights
  linearRights: z.boolean().optional(),
  maxRights: z.boolean().optional(),
  radioRights: z.boolean().optional(),
  sublicensing: z.boolean().optional(),
  // Enriched rights fields
  seasonId: z.coerce.number().int().min(1).nullable().optional(),
  territory: z.array(z.string()).optional(),
  platforms: z
    .array(z.enum(['linear', 'on-demand', 'radio', 'fast', 'pop-up']))
    .optional(),
  coverageType: z.enum(['LIVE', 'DELAYED', 'HIGHLIGHTS']).optional(),
  maxLiveRuns: z.coerce.number().int().min(0).nullable().optional(),
  maxPickRunsPerRound: z.coerce.number().int().min(0).nullable().optional(),
  windowStartUtc: z.string().nullable().optional(),
  windowEndUtc: z.string().nullable().optional(),
  tapeDelayHoursMin: z.coerce.number().int().min(0).nullable().optional(),
  geoRestriction: z.string().nullable().optional(),
  fee: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
