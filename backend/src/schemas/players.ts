import { z } from 'zod'
import { idParam, isoDateString } from './common.js'
import { paginationQueryFields } from '../utils/pagination.js'

export { idParam }

// GET /api/players — filters stay strings (route parses them); pagination coerced.
export const playersListQuery = z.object({
  search: z.string().optional(),
  sportId: z.string().optional(),
  teamId: z.string().optional(),
  managed: z.string().optional(),
  ...paginationQueryFields,
})

export const playerCreateSchema = z.object({
  fullName: z.string().min(1),
  sportId: z.number().int(),
  shortName: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  jerseyNumber: z.number().int().nullable().optional(),
  birthDate: isoDateString.nullable().optional(),
  photoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  status: z.enum(['active', 'injured', 'loaned', 'retired']).optional(),
  notes: z.string().nullable().optional(),
  isManaged: z.boolean().optional(),
  externalRefs: z.record(z.string(), z.unknown()).default({}),
})

export const playerUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  sportId: z.number().int().optional(),
  shortName: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  jerseyNumber: z.number().int().nullable().optional(),
  birthDate: isoDateString.nullable().optional(),
  photoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  status: z.enum(['active', 'injured', 'loaned', 'retired']).optional(),
  notes: z.string().nullable().optional(),
  isManaged: z.boolean().optional(),
  externalRefs: z.record(z.string(), z.unknown()).optional(),
})

// Remarks-only update — editable by sports planners, not just admins.
export const playerNotesSchema = z.object({
  notes: z.string().nullable(),
})

// Attach a player to a team roster (or to a competition startlist for
// individual sports — at least one of the two is required).
export const playerTeamCreateSchema = z.object({
  teamId: z.number().int().nullable().optional(),
  competitionId: z.number().int().nullable().optional(),
  seasonId: z.number().int().nullable().optional(),
  fromDate: isoDateString.nullable().optional(),
  toDate: isoDateString.nullable().optional(),
  isCurrent: z.boolean().optional(),
}).refine((data) => data.teamId != null || data.competitionId != null, {
  message: 'Either teamId or competitionId is required',
})
