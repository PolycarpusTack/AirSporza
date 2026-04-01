import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { writeOutboxEvent } from '../services/outbox.js'
import * as s from '../schemas/settings.js'

const router = Router()

function getCurrentUser(req: Parameters<typeof authenticate>[0]) {
  return req.user as { id: string; email?: string; role: string }
}


type DbClient = Prisma.TransactionClient | typeof prisma

async function getSetting(key: string, scopeKind: 'global' | 'role' | 'user' | 'user_role', scopeId: string, tenantId?: string, db: DbClient = prisma) {
  const tid = tenantId ?? null
  const results = await db.$queryRaw<Array<{
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
      AND (${tid}::uuid IS NULL OR "tenantId" = ${tid}::uuid)
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
  tenantId?: string
}, db: DbClient = prisma) {
  const { key, scopeKind, scopeId, userId, value, tenantId } = params
  const rows = await db.$queryRaw<Array<{
    id: string
    value: Prisma.JsonValue
  }>>(Prisma.sql`
    INSERT INTO "AppSetting" ("id", "key", "scopeKind", "scopeId", "userId", "tenantId", "value", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${key}, ${scopeKind}::"SettingScopeKind", ${scopeId}, ${userId || null}, ${tenantId ?? null}::uuid, ${JSON.stringify(value)}::jsonb, NOW(), NOW())
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
router.get('/stats', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const tid = { tenantId: req.tenantId }
    const [userCount, eventCount, techPlanCount, crewMemberCount, notificationCount] = await Promise.all([
      prisma.user.count({ where: tid }),
      prisma.event.count({ where: tid }),
      prisma.techPlan.count({ where: tid }),
      prisma.crewMember.count({ where: tid }),
      prisma.notification.count({ where: { ...tid, isRead: false } }),
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

// Get auto-fill rules
router.get('/autofill', authenticate, async (req, res, next) => {
  try {
    const setting = await getSetting('autofill_rules', 'global', 'global', req.tenantId)
    res.json(setting?.value ?? { rules: [] })
  } catch (error) {
    next(error)
  }
})

// Update auto-fill rules
router.put('/autofill', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { rules } = req.body
    const user = getCurrentUser(req)

    const setting = await prisma.$transaction(async (tx) => {
      const result = await upsertSetting({
        key: 'autofill_rules',
        scopeKind: 'global',
        scopeId: 'global',
        userId: user.id,
        value: { rules },
        tenantId: req.tenantId,
      }, tx)

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'setting.updated',
        aggregateType: 'AppSetting',
        aggregateId: result.id,
        payload: { key: 'autofill_rules', value: result.value },
      })

      return result
    })

    res.json(setting?.value ?? { rules })
  } catch (error) {
    next(error)
  }
})

router.get('/app', authenticate, validate({ query: s.roleQuery }), async (req, res, next) => {
  try {
    const role = String(req.query.role || '')

    const user = getCurrentUser(req)
    const tid = req.tenantId
    const [eventFields, crewFields, roleDashboard, userDashboard, orgConfig] = await Promise.all([
      getSetting('event_fields', 'global', 'global', tid),
      getSetting('crew_fields', 'global', 'global', tid),
      getSetting('dashboard_widgets', 'role', role, tid),
      getSetting('dashboard_widgets', 'user_role', `${user.id}:${role}`, tid),
      getSetting('org_config', 'global', 'global', tid),
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

router.put('/app/org', authenticate, authorize('admin'), validate({ body: s.orgConfigSchema }), async (req, res, next) => {
  try {
    const user = getCurrentUser(req)
    const existing = await getSetting('org_config', 'global', 'global', req.tenantId)

    const setting = await prisma.$transaction(async (tx) => {
      const result = await upsertSetting({
        key: 'org_config',
        scopeKind: 'global',
        scopeId: 'global',
        userId: user.id,
        value: req.body,
        tenantId: req.tenantId,
      }, tx)

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'setting.updated',
        aggregateType: 'AppSetting',
        aggregateId: result.id,
        payload: { key: 'org_config', value: result.value },
      })

      return result
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.org_config.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      tenantId: req.tenantId,
    })

    res.json({ config: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/fields/event', authenticate, authorize('admin'), validate({ body: s.fieldsBodySchema }), async (req, res, next) => {
  try {
    const user = getCurrentUser(req)
    const existing = await getSetting('event_fields', 'global', 'global', req.tenantId)

    const setting = await prisma.$transaction(async (tx) => {
      const result = await upsertSetting({
        key: 'event_fields',
        scopeKind: 'global',
        scopeId: 'global',
        userId: user.id,
        value: req.body.fields,
        tenantId: req.tenantId,
      }, tx)

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'setting.updated',
        aggregateType: 'AppSetting',
        aggregateId: result.id,
        payload: { key: 'event_fields', value: result.value },
      })

      return result
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.event_fields.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: req.body.fields,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      tenantId: req.tenantId,
    })

    res.json({ fields: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/fields/crew', authenticate, authorize('admin'), validate({ body: s.fieldsBodySchema }), async (req, res, next) => {
  try {
    const user = getCurrentUser(req)
    const existing = await getSetting('crew_fields', 'global', 'global', req.tenantId)

    const setting = await prisma.$transaction(async (tx) => {
      const result = await upsertSetting({
        key: 'crew_fields',
        scopeKind: 'global',
        scopeId: 'global',
        userId: user.id,
        value: req.body.fields,
        tenantId: req.tenantId,
      }, tx)

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'setting.updated',
        aggregateType: 'AppSetting',
        aggregateId: result.id,
        payload: { key: 'crew_fields', value: result.value },
      })

      return result
    })

    await writeAuditLog({
      userId: user.id,
      action: 'settings.crew_fields.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: req.body.fields,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      tenantId: req.tenantId,
    })

    res.json({ fields: setting.value })
  } catch (error) {
    next(error)
  }
})

router.put('/app/dashboard/:role', authenticate, validate({ params: s.roleParam, body: s.dashboardBodySchema, query: s.dashboardScopeQuery }), async (req, res, next) => {
  try {
    const role = String(req.params.role)

    const scope = req.query.scope === 'role' ? 'role' : 'user_role'
    const user = getCurrentUser(req)

    if (scope === 'role' && user.role !== 'admin') {
      return next(createError(403, 'Only admins can update role-level dashboard defaults'))
    }

    const scopeId = scope === 'role' ? role : `${user.id}:${role}`
    const existing = await getSetting('dashboard_widgets', scope, scopeId, req.tenantId)

    const setting = await prisma.$transaction(async (tx) => {
      const result = await upsertSetting({
        key: 'dashboard_widgets',
        scopeKind: scope,
        scopeId,
        userId: user.id,
        value: req.body.widgets,
        tenantId: req.tenantId,
      }, tx)

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'setting.updated',
        aggregateType: 'AppSetting',
        aggregateId: result.id,
        payload: { key: 'dashboard_widgets', scope, role, value: result.value },
      })

      return result
    })

    await writeAuditLog({
      userId: user.id,
      action: scope === 'role' ? 'settings.dashboard.role.update' : 'settings.dashboard.user.update',
      entityType: 'app_setting',
      entityId: setting.id,
      oldValue: existing?.value,
      newValue: req.body.widgets,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      tenantId: req.tenantId,
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
