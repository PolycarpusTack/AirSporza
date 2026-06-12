import { z } from 'zod'
import { idParam } from './common.js'
import { paginationQueryFields } from '../utils/pagination.js'

export { idParam }

// GET /api/teams — filters stay strings (route parses them); pagination coerced.
export const teamsListQuery = z.object({
  search: z.string().optional(),
  sportId: z.string().optional(),
  competitionId: z.string().optional(),
  managed: z.string().optional(),
  ...paginationQueryFields,
})

export const teamCreateSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  sportId: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isManaged: z.boolean().optional(),
  externalRefs: z.record(z.string(), z.unknown()).default({}),
})

export const teamUpdateSchema = z.object({
  name: z.string().optional(),
  shortName: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  sportId: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isManaged: z.boolean().optional(),
  externalRefs: z.record(z.string(), z.unknown()).optional(),
})

// Remarks-only update — editable by sports planners, not just admins.
export const teamNotesSchema = z.object({
  notes: z.string().nullable(),
})

// Assign a team to a competition (optionally scoped to a season).
export const teamCompetitionCreateSchema = z.object({
  competitionId: z.number().int(),
  seasonId: z.number().int().nullable().optional(),
})
