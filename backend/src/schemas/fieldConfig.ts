import { z } from 'zod'
import { positiveInt } from './common.js'

const fieldTypeEnum = z.enum([
  'text',
  'number',
  'date',
  'time',
  'dropdown',
  'checkbox',
  'textarea',
])
const sectionEnum = z.enum(['event', 'crew', 'contract'])
const roleEnum = z.enum(['admin', 'planner', 'sports', 'contracts'])

export const fieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  fieldType: fieldTypeEnum,
  section: sectionEnum,
  required: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
  options: z.array(z.string()).default([]),
  dropdownSourceId: z.string().nullable().default(null),
  defaultValue: z.string().nullable().default(null),
  conditionalRules: z.array(z.unknown()).default([]),
  visibleByRoles: z.array(roleEnum).default([]),
  visible: z.boolean().default(true),
})

export const fieldUpdateSchema = z.object({
  label: z.string().optional(),
  required: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  visible: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  conditionalRules: z.array(z.unknown()).optional(),
  visibleByRoles: z.array(z.string()).optional(),
})

export const fieldOrderSchema = z.array(
  z.object({ id: z.string().min(1), sortOrder: z.coerce.number().int() })
)

export const dropdownCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  managedBy: roleEnum.default('admin'),
})

export const dropdownOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  parentId: z.string().nullable().default(null),
  sortOrder: z.coerce.number().int().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export const mandatoryFieldSchema = z.object({
  fieldIds: z.array(z.string()),
  conditionalRequired: z.array(z.unknown()).default([]),
})

export const sportIdParam = z.object({
  sportId: z.coerce.number().int().positive(),
})
