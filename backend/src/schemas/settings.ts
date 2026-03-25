import { z } from 'zod'

const roleEnum = z.enum(['planner', 'sports', 'contracts', 'admin'])

const fieldConfigItem = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    'text',
    'number',
    'date',
    'time',
    'checkbox',
    'textarea',
    'dropdown',
  ]),
  options: z.string().nullable().optional(),
  required: z.boolean(),
  visible: z.boolean(),
  order: z.coerce.number().int(),
  isCustom: z.boolean().optional(),
})

const dashboardWidget = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  visible: z.boolean(),
  order: z.coerce.number().int(),
})

const channelConfigItem = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const roleParam = z.object({
  role: roleEnum,
})

export const roleQuery = z.object({
  role: roleEnum,
})

export const fieldConfigSchema = z.array(fieldConfigItem)

export const dashboardWidgetsSchema = z.array(dashboardWidget)

export const orgConfigSchema = z.object({
  channels: z.array(channelConfigItem),
  onDemandChannels: z.array(channelConfigItem),
  radioChannels: z.array(z.string()),
  phases: z.array(z.string()),
  categories: z.array(z.string()),
  complexes: z.array(z.string()),
})

export const fieldsBodySchema = z.object({
  fields: fieldConfigSchema,
})

export const dashboardBodySchema = z.object({
  widgets: dashboardWidgetsSchema,
})

export const dashboardScopeQuery = z.object({
  scope: z.enum(['role', 'user_role']).optional(),
})
