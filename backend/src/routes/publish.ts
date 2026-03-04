import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { publishService } from '../services/publishService.js'

const router = Router()

// ── Webhook endpoints CRUD ────────────────────────────────────────────────────

router.get('/webhooks', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const webhooks = await prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
    })
    res.json(webhooks)
  } catch (err) {
    next(err)
  }
})

router.post('/webhooks', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { url, secret, events } = req.body as { url: string; secret: string; events: string[] }
    if (!url || !secret || !Array.isArray(events)) {
      return next(createError(400, 'url, secret, and events are required'))
    }
    const user = req.user as { id: string }
    const webhook = await prisma.webhookEndpoint.create({
      data: { url, secret, events, createdById: user.id },
    })
    res.status(201).json(webhook)
  } catch (err) {
    next(err)
  }
})

router.put('/webhooks/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { url, secret, events, isActive } = req.body as {
      url?: string; secret?: string; events?: string[]; isActive?: boolean
    }
    const webhook = await prisma.webhookEndpoint.update({
      where: { id: String(req.params.id) },
      data: { url, secret, events, isActive },
    })
    res.json(webhook)
  } catch (err) {
    next(err)
  }
})

router.delete('/webhooks/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await prisma.webhookEndpoint.delete({ where: { id: String(req.params.id) } })
    res.json({ message: 'Webhook deleted' })
  } catch (err) {
    next(err)
  }
})

// ── Delivery log ──────────────────────────────────────────────────────────────

router.get('/deliveries', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { webhookId, limit = '50' } = req.query as { webhookId?: string; limit?: string }
    const deliveries = await prisma.webhookDelivery.findMany({
      where: webhookId ? { webhookId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      include: { webhook: { select: { url: true } } },
    })
    res.json(deliveries)
  } catch (err) {
    next(err)
  }
})

router.post('/deliveries/:id/retry', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: String(req.params.id) },
      include: { webhook: true },
    })
    if (!delivery) return next(createError(404, 'Delivery not found'))
    await publishService.retryDelivery(delivery)
    res.json({ message: 'Retry dispatched' })
  } catch (err) {
    next(err)
  }
})

// ── Pull feeds (JSON + iCal stubs) ────────────────────────────────────────────

router.get('/feed/json', async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      where: { status: { in: ['published', 'live'] } },
      include: { sport: true, competition: true },
      orderBy: { startDateBE: 'asc' },
    })
    res.json({ generated: new Date().toISOString(), events })
  } catch (err) {
    next(err)
  }
})

router.get('/feed/ical', async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      where: { status: { in: ['published', 'live'] } },
      orderBy: { startDateBE: 'asc' },
    })
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Planza//EN',
    ]
    for (const ev of events) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:planza-event-${ev.id}@planza`,
        `SUMMARY:${ev.participants}`,
        `DTSTART:${new Date(ev.startDateBE).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.send(lines.join('\r\n'))
  } catch (err) {
    next(err)
  }
})

export default router
