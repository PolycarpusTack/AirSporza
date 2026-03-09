import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { liveScoreAdapter } from '../adapters/liveScore.js'
import { logger } from '../utils/logger.js'

const router = Router()

// ===========================================================================
// AdapterConfig CRUD
// ===========================================================================

// GET /api/adapters/configs — list configs for tenant
router.get('/configs', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const configs = await prisma.adapterConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(configs)
  } catch (err) { next(err) }
})

// POST /api/adapters/configs — create config (admin)
router.post('/configs', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { adapterType, direction, providerName, config, isActive } = req.body
    const created = await prisma.adapterConfig.create({
      data: {
        tenantId,
        adapterType,
        direction,
        providerName,
        config: config || {},
        isActive: isActive ?? true,
      },
    })
    res.status(201).json(created)
  } catch (err) { next(err) }
})

// PUT /api/adapters/configs/:id — update
router.put('/configs/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { id } = req.params
    const { config, isActive, providerName } = req.body
    const updated = await prisma.adapterConfig.update({
      where: { id, tenantId },
      data: {
        ...(config !== undefined && { config }),
        ...(isActive !== undefined && { isActive }),
        ...(providerName !== undefined && { providerName }),
      },
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// DELETE /api/adapters/configs/:id — delete
router.delete('/configs/:id', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { id } = req.params
    await prisma.adapterConfig.delete({ where: { id, tenantId } })
    res.status(204).end()
  } catch (err) { next(err) }
})

// ===========================================================================
// Inbound Webhook Endpoints
// ===========================================================================

// POST /api/adapters/live-score/webhook
router.post('/live-score/webhook', async (req, res, next) => {
  try {
    // Webhook endpoints use a tenant header or API key for identification
    const tenantId = req.headers['x-tenant-id'] as string || req.tenantId!
    await liveScoreAdapter.processWebhook(req.body, tenantId)
    res.json({ ok: true })
  } catch (err) {
    logger.error('Live score webhook error:', err)
    next(err)
  }
})

// Placeholder endpoints for future adapters
router.post('/oop/webhook', async (_req, res) => {
  res.status(501).json({ error: 'OOP adapter not yet implemented' })
})

router.post('/live-timing/webhook', async (_req, res) => {
  res.status(501).json({ error: 'Live timing adapter not yet implemented' })
})

router.post('/as-run/webhook', async (_req, res) => {
  res.status(501).json({ error: 'As-run adapter not yet implemented' })
})

export default router
