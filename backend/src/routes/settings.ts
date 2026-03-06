import { Router } from 'express'
import { Prisma } from '@prisma/client'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'

const router = Router()

const roleSchema = Joi.string().valid('planner', 'sports', 'contracts', 'admin').required()
const fieldConfigSchema = Joi.array().items(
  Joi.object({
    id: Joi.string().required(),
    label: Joi.string().required(),
    type: Joi.string().valid('text', 'number', 'date', 'time', 'checkbox', 'textarea', 'dropdown').required(),
    options: Joi.string().allow('', null),
    required: Joi.boolean().required(),
    visible: Joi.boolean().required(),
    order: Joi.number().integer().required(),
    isCustom: Joi.boolean().optional(),
  })
).required()

const dashboardWidgetsSchema = Joi.array().items(
  Joi.object({
    id: Joi.string().required(),
    label: Joi.string().required(),
    visible: Joi.boolean().required(),
    order: Joi.number().integer().required(),
  })
).required()

function getCurrentUser(req: Parameters<typeof authenticate>[0]) {
  return req.user as { id: string; email?: string; role: string }
}


async function getSetting(key: string, scopeKind: 'global' | 'role' | 'user' | 'user_role', scopeId: string) {
  const results = await prisma.$queryRaw<Array<{
    id: string
    key: string
    scopeKind: 'global' | 'role' | 'user' | 'user_role'
    scopeId: string
    userId: string | null
    value: Prisma.JsonValue
    createdAt: Date
    updatedAt: Date
  }>>(Prisma.sql`
    SELECT "id", "key", "scopeKind"::text, "scopeId", "userId", "value", "createdAt", "updatedAt"
    FROM "AppSetting"
    WHERE "key" = ${key} AND "scopeKind"::text = ${scopeKind} AND "scopeId" = ${scopeId}
    LIMIT 1
  `)

  return results[0] || null
}

async function upsertSetting(params: {
  key: string
  scopeKind: 'global' | 'role' | 'user' | 'user_role'
  scopeId: string
  userId?: string | null
  value: unknown
}) {
  const { key, scopeKind, scopeId, userId, value } = params
  const rows = await prisma.$queryRaw<Array<{
    id: string
    value: Prisma.JsonValue
  }>>(Prisma.sql`
    INSERT INTO "AppSetting" ("id", "key", "scopeKind", "scopeId", "userId", "value", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${key}, ${scopeKind}::"SettingScopeKind", ${scopeId}, ${userId || null}, ${JSON.stringify(value)}::jsonb, NOW(), NOW())
    ON CONFLICT ("key", "scopeKind", "scopeId")
    DO UPDATE SET
      "userId" = EXCLUDED."userId",
      "value" = EXCLUDED."value",
      "updatedAt" = NOW()
    RETURNING "id", "value"
  `)

  return rows[0]
}

// Admin stats
router.get('/stats', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const [userCount, eventCount, techPlanCount, crewMemberCount, notificationCount] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.techPlan.count(),
      prisma.crewMember.count(),
      prisma.notification.count({ where: { isRead: false } }),
    ])
    res.json({
      users: userCount,
      events: eventCount,
      techPlans: techPlanCount,
      crewMembers: crewMemberCount,
      unreadNotifications: notificationCount,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/app', authenticate, async (req, res, next) => {
  try {
    const role = String(req.query.role || '')
    const { error } = roleSchema.validate(role)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const user = getCurrentUser(req)
    const [eventFields, crewFields, roleDashboard, userDashboard, orgConfig] = await Promise.all([
      getSetting('event_fields', 'global', 'global'),
      getSetting('crew_fields', 'global', 'global'),
      getSetting('dashboard_widgets', 'role', role),
      getSetting('dashboard_widgets', 'user_role', `${user.id}:${role}`),
      getSetting('org_config', 'global', 'global'),
    ])

    res.json({
      scopeRules: {
        eventFields: 'global',
        crewFields: 'global',
        dashboardWidgets: 'user_role_with_role_fallback',
        orgConfig: 'global',
      },
      eventFields: eventFields?.value ?? null,
      crewFields: crewFields?.value ?? null,
      dashboardWidgets: userDashboard?.value ?? roleDashboard?.value ?? null,
      orgConfig: orgConfig?.value ?? null,
      meta: {
        eventFieldsScope: eventFields ? 'global' : null,
        crewFieldsScope: crewFields ? 'global' : null,
        dashboardWidgetsScope: userDashboard ? 'user_role' : roleDashboard ? 'role' : null,
        orgConfigScope: orgConfig ? 'global' : null,
      }
    })
  } catch (error) {
    next(error)
  }
})

const channelConfigItem = Joi.object({
  name: Joi.string().required(),
  color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).required(),
})

const orgConfigSchema = Joi.object({
  channels: Joi.array().items(channelConfigItem).required(),
  onDemandChannels: Joi.array().items(channelConfigItem).required(),
  radioChannels: Joi.array().items(Joi.string()).required(),
  phases: Joi.array().items(Joi.string()).required(),
  categories: Joi.array().items(Joi.string()).required(),
  complexes: Joi.array().items(Joi.string()).required(),
}).required()

router.put('/app/org', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = orgConfigSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const user = getCurrentUser(req)
    const existing = await getSetting('org_config', 'global', 'global')
    const setting = await upsertSetting({
      key: 'org_config',
      scopeKind: 'global',
      scopeId: 'global',
      userId: user.id,
      value,
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.org_config.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: value,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    })

    res.json({ config: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/fields/event', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = fieldConfigSchema.validate(req.body.fields)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const user = getCurrentUser(req)
    const existing = await getSetting('event_fields', 'global', 'global')
    const setting = await upsertSetting({
      key: 'event_fields',
      scopeKind: 'global',
      scopeId: 'global',
      userId: user.id,
      value,
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.event_fields.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: value,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    })

    res.json({ fields: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/fields/crew', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = fieldConfigSchema.validate(req.body.fields)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const user = getCurrentUser(req)
    const existing = await getSetting('crew_fields', 'global', 'global')
    const setting = await upsertSetting({
      key: 'crew_fields',
      scopeKind: 'global',
      scopeId: 'global',
      userId: user.id,
      value,
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.crew_fields.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: value,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    })

    res.json({ fields: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/dashboard/:role', authenticate, async (req, res, next) => {
  try {
    const role = String(req.params.role)
    const { error: roleError } = roleSchema.validate(role)
    if (roleError) {
      return next(createError(400, roleError.details[0].message))
    }

    const { error, value } = dashboardWidgetsSchema.validate(req.body.widgets)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const scope = req.query.scope === 'role' ? 'role' : 'user_role'
    const user = getCurrentUser(req)

    if (scope === 'role' && user.role !== 'admin') {
      return next(createError(403, 'Only admins can update role-level dashboard defaults'))
    }

    const scopeId = scope === 'role' ? role : `${user.id}:${role}`
    const existing = await getSetting('dashboard_widgets', scope, scopeId)
    const setting = await upsertSetting({
      key: 'dashboard_widgets',
      scopeKind: scope,
      scopeId,
      userId: user.id,
      value,
    })

    await writeAuditLog({
      userId: user.id,
      action: scope === 'role' ? 'settings.dashboard.role.update' : 'settings.dashboard.user.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: value,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    })

    res.json({
      widgets: setting.value,
      scope,
      role,
    })
  } catch (error) {
    next(error)
  }
})

export default router
