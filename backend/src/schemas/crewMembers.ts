import { z } from 'zod'
import { idParam, positiveInt } from './common.js'

export { idParam }

export const crewMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  roles: z.array(z.string().trim()).default([]),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
})

export const crewMemberUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  roles: z.array(z.string().trim()).optional(),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

export const mergeSchema = z.object({
  sourceId: positiveInt,
  targetId: positiveInt,
})
