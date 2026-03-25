import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { verifyHmac } from '../middleware/hmac.js'
import { liveScoreAdapter } from '../adapters/liveScore.js'
import { logger } from '../utils/logger.js'

const router = Router()

// ===========================================================================
// AdapterConfig CRUD
// ===========================================================================

// GET /api/adapters/configs — list configs for tenant
router.get('/configs', authenticate, authorize('admin'), async (req, res, next) => {
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
router.post('/configs', authenticate, authorize('admin'), async (req, res, next) => {
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
router.put('/configs/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)
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
router.delete('/configs/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const id = String(req.params.id)
    await prisma.adapterConfig.delete({ where: { id, tenantId } })
    res.status(204).end()
  } catch (err) { next(err) }
})

// ===========================================================================
// Inbound Webhook Endpoints
// ===========================================================================

// POST /api/adapters/live-score/webhook
router.post('/live-score/webhook', verifyHmac(), async (req, res, next) => {
  try {
    // Look up the adapter config to determine the tenant
    const configId = req.body.configId || req.query.configId
    if (!configId) {
      return res.status(400).json({ error: 'configId is required' })
    }
    const adapterConfig = await prisma.adapterConfig.findUnique({ where: { id: String(configId) } })
    if (!adapterConfig) {
      return res.status(404).json({ error: 'Adapter config not found' })
    }
    const tenantId = adapterConfig.tenantId
    await liveScoreAdapter.processWebhook(req.body, tenantId)
    res.json({ ok: true })
  } catch (err) {
    logger.error('Live score webhook error:', err)
    next(err)
  }
})

// Placeholder endpoints for future adapters
router.post('/oop/webhook', authenticate, async (_req, res) => {
  res.status(501).json({ error: 'OOP adapter not yet implemented' })
})

router.post('/live-timing/webhook', authenticate, async (_req, res) => {
  res.status(501).json({ error: 'Live timing adapter not yet implemented' })
})

router.post('/as-run/webhook', authenticate, async (_req, res) => {
  res.status(501).json({ error: 'As-run adapter not yet implemented' })
})

export default router
