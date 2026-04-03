import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { encryptCredentials, decryptCredentials, maskCredentials } from '../services/credentialService.js'
import { getTemplate, listTemplates } from '../integrations/templates/index.js'
import { writeAuditLog } from '../utils/audit.js'
import * as s from '../schemas/integrations.js'
import integrationScheduleRoutes from './integrationSchedules.js'

const router = Router()

// All routes require admin
router.use(authorize('admin'))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskIntegrationCredentials(integration: any) {
  if (integration.credentials) {
    try {
      const decrypted = decryptCredentials(integration.credentials)
      return { ...integration, credentials: maskCredentials(decrypted) }
    } catch {
      return { ...integration, credentials: { _error: 'unable to decrypt' } }
    }
  }
  return { ...integration, credentials: null }
}

function enrichWithTemplate(integration: any) {
  const template = getTemplate(integration.templateCode)
  return {
    ...integration,
    templateName: template?.name ?? null,
    templateDirection: template?.direction ?? null,
  }
}

// ---------------------------------------------------------------------------
// GET /templates — list all available templates (MUST be before /:id)
// ---------------------------------------------------------------------------
router.get('/templates', async (req, res, next) => {
  try {
    const direction = req.query.direction as string | undefined
    const all = listTemplates()
    const filtered = direction ? all.filter(t => t.direction === direction) : all
    const templates = filtered.map(t => ({
      code: t.code,
      name: t.name,
      direction: t.direction,
      description: t.description,
      defaultFieldMappings: t.defaultFieldMappings,
      ...(t.direction === 'INBOUND' ? { auth: (t as any).auth, baseUrl: (t as any).baseUrl, endpoints: (t as any).endpoints, sampleResponse: (t as any).sampleResponse, rateLimitDefaults: (t as any).rateLimitDefaults } : {}),
      ...(t.direction === 'OUTBOUND' ? { contentType: (t as any).contentType, payloadTemplate: (t as any).payloadTemplate, samplePayload: (t as any).samplePayload } : {}),
    }))
    res.json(templates)
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// GET / — list integrations for tenant
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const integrations = await prisma.integration.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    const result = integrations.map(i => enrichWithTemplate(maskIntegrationCredentials(i)))
    res.json(result)
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// GET /:id — single integration
// ---------------------------------------------------------------------------
router.get('/:id', validate({ params: s.integrationIdParam }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)
    const integration = await prisma.integration.findFirst({
      where: { id, tenantId },
    })
    if (!integration) throw createError(404, 'Integration not found')
    res.json(enrichWithTemplate(maskIntegrationCredentials(integration)))
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// POST / — create integration
// ---------------------------------------------------------------------------
router.post('/', validate({ body: s.createIntegrationSchema }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { name, direction, templateCode, credentials, fieldOverrides, config, triggerConfig, isActive, rateLimitPerMinute, rateLimitPerDay } = req.body

    // Validate templateCode exists
    const template = getTemplate(templateCode)
    if (!template) throw createError(400, `Unknown integration template: ${templateCode}`)

    const encryptedCreds = credentials ? encryptCredentials(credentials) : null

    const created = await prisma.integration.create({
      data: {
        tenantId,
        name,
        direction,
        templateCode,
        credentials: encryptedCreds,
        fieldOverrides: fieldOverrides ?? [],
        config: config ?? {},
        triggerConfig: triggerConfig ?? {},
        isActive: isActive ?? true,
        rateLimitPerMinute: rateLimitPerMinute ?? null,
        rateLimitPerDay: rateLimitPerDay ?? null,
      },
    })

    await writeAuditLog({
      userId: (req as any).userId ?? null,
      action: 'integration.create',
      entityType: 'Integration',
      entityId: created.id,
      newValue: { name, direction, templateCode },
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      tenantId,
    })

    res.status(201).json(enrichWithTemplate(maskIntegrationCredentials(created)))
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// PUT /:id — update integration
// ---------------------------------------------------------------------------
router.put('/:id', validate({ params: s.integrationIdParam, body: s.updateIntegrationSchema }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)
    const { credentials, templateCode, ...rest } = req.body

    // Verify ownership
    const existing = await prisma.integration.findFirst({ where: { id, tenantId } })
    if (!existing) throw createError(404, 'Integration not found')

    // Validate templateCode if changing
    if (templateCode !== undefined) {
      const template = getTemplate(templateCode)
      if (!template) throw createError(400, `Unknown integration template: ${templateCode}`)
    }

    // Handle credentials: null = keep existing, object = re-encrypt, undefined = no change
    let encryptedCreds: string | null | undefined = undefined
    if (credentials === null) {
      // Explicitly null — keep existing encrypted value (no change)
      encryptedCreds = undefined
    } else if (credentials && typeof credentials === 'object') {
      encryptedCreds = encryptCredentials(credentials)
    }

    const data: Record<string, unknown> = { ...rest }
    if (templateCode !== undefined) data.templateCode = templateCode
    if (encryptedCreds !== undefined) data.credentials = encryptedCreds

    const updated = await prisma.integration.update({
      where: { id },
      data,
    })

    await writeAuditLog({
      userId: (req as any).userId ?? null,
      action: 'integration.update',
      entityType: 'Integration',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: { ...rest, ...(templateCode !== undefined && { templateCode }) },
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      tenantId,
    })

    res.json(enrichWithTemplate(maskIntegrationCredentials(updated)))
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete integration (cascade deletes schedules + logs)
// ---------------------------------------------------------------------------
router.delete('/:id', validate({ params: s.integrationIdParam }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)

    const existing = await prisma.integration.findFirst({ where: { id, tenantId } })
    if (!existing) throw createError(404, 'Integration not found')

    await prisma.integration.delete({ where: { id } })

    await writeAuditLog({
      userId: (req as any).userId ?? null,
      action: 'integration.delete',
      entityType: 'Integration',
      entityId: id,
      oldValue: { name: existing.name, templateCode: existing.templateCode },
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      tenantId,
    })

    res.status(204).end()
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// POST /:id/test — test connection (placeholder)
// ---------------------------------------------------------------------------
router.post('/:id/test', validate({ params: s.integrationIdParam }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)

    const integration = await prisma.integration.findFirst({ where: { id, tenantId } })
    if (!integration) throw createError(404, 'Integration not found')

    res.status(501).json({ error: 'Connection testing not yet implemented' })
  } catch (err) { next(err) }
})

// ---------------------------------------------------------------------------
// GET /:id/logs — paginated activity logs
// ---------------------------------------------------------------------------
router.get('/:id/logs', validate({ params: s.integrationIdParam, query: s.integrationLogsQuery }), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)
    const { limit, cursor, status } = req.query as unknown as { limit: number; cursor?: string; status?: string }

    // Verify the integration belongs to this tenant
    const integration = await prisma.integration.findFirst({ where: { id, tenantId } })
    if (!integration) throw createError(404, 'Integration not found')

    const where: Record<string, unknown> = { integrationId: id }
    if (status) where.status = status
    if (cursor) where.createdAt = { lt: new Date(cursor) }

    const logs = await prisma.integrationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const nextCursor = logs.length === limit ? logs[logs.length - 1].createdAt.toISOString() : null

    res.json({ data: logs, nextCursor })
  } catch (err) { next(err) }
})

// Schedule sub-routes
router.use('/:id/schedules', integrationScheduleRoutes)

export default router
