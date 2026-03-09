import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { logger } from '../utils/logger.js'

const router = Router()

/** Format an event for outbound publication (strips fee/notes from embedded contract) */
function formatEventForPublish(event: Record<string, unknown>) {
  const competition = event.competition as Record<string, unknown> | null | undefined
  // Competition has a one-to-many contracts relation; pick the first valid/expiring one
  const contracts = competition?.contracts as Record<string, unknown>[] | undefined
  const contract = contracts?.find(c => c.status === 'valid' || c.status === 'expiring') ?? contracts?.[0]

  const rights = contract
    ? {
        linear: contract.linearRights,
        max: contract.maxRights,
        radio: contract.radioRights,
        geo: contract.geoRestriction,
        sublicensing: contract.sublicensing,
      }
    : null

  // Resolve channel names from FK relations (backwards compat: fallback to legacy string fields)
  const channel = event.channel as Record<string, unknown> | null | undefined
  const radioChannelRef = event.radioChannelRef as Record<string, unknown> | null | undefined
  const onDemandChannelRef = event.onDemandChannelRef as Record<string, unknown> | null | undefined

  return {
    id: event.id,
    sport: event.sport,
    competition: competition
      ? { id: competition.id, name: competition.name, season: competition.season }
      : null,
    phase: event.phase,
    category: event.category,
    participants: event.participants,
    content: event.content,
    startDateBE: event.startDateBE,
    startTimeBE: event.startTimeBE,
    startDateOrigin: event.startDateOrigin,
    startTimeOrigin: event.startTimeOrigin,
    complex: event.complex,
    livestreamDate: event.livestreamDate,
    livestreamTime: event.livestreamTime,
    // Backwards compat: resolve FK → name, fallback to legacy string
    linearChannel: (channel?.name as string) ?? event.linearChannel,
    linearStartTime: event.linearStartTime,
    radioChannel: (radioChannelRef?.name as string) ?? event.radioChannel,
    onDemandChannel: (onDemandChannelRef?.name as string) ?? event.onDemandChannel,
    // New FK-based fields for modern consumers
    channelId: event.channelId,
    radioChannelId: event.radioChannelId,
    onDemandChannelId: event.onDemandChannelId,
    isLive: event.isLive,
    isDelayedLive: event.isDelayedLive,
    videoRef: event.videoRef,
    winner: event.winner,
    score: event.score,
    duration: event.duration,
    durationMin: event.durationMin,
    rights,
  }
}

/** Build iCal RFC 5545 string from an array of formatted events */
function buildIcal(events: ReturnType<typeof formatEventForPublish>[], baseUrl: string): string {
  const escape = (s: unknown) =>
    String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  const toDateTime = (date: unknown, time: unknown): string => {
    let d: string
    if (date instanceof Date) {
      d = date.toISOString().slice(0, 10).replace(/-/g, '')
    } else {
      d = String(date ?? '').replace(/-/g, '')
    }
    const t = String(time ?? '00:00').replace(':', '') + '00'
    return `${d}T${t}00`
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportzaPlanner//VRT//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:SportzaPlanner`,
    `X-WR-TIMEZONE:Europe/Brussels`,
  ]

  for (const ev of events) {
    const dtStart = toDateTime(ev.startDateBE, ev.startTimeBE)
    const summary = escape(`${ev.participants} — ${ev.linearChannel ?? ''}`)
    const description = escape(ev.content ?? '')
    const location = escape(ev.complex ?? '')
    const uid = `event-${ev.id}@sporzaplanner.vrt.be`
    const url = `${baseUrl}/planner?event=${ev.id}`

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTART:${dtStart}`)
    lines.push(`SUMMARY:${summary}`)
    if (description) lines.push(`DESCRIPTION:${description}`)
    if (location) lines.push(`LOCATION:${location}`)
    lines.push(`URL:${url}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// ─── Pull Feeds (no auth — public API) ──────────────────────────────────────

router.get('/events', async (req, res, next) => {
  try {
    const { channel, sport, from, to, rights, cursor, format, limit: limitStr } = req.query

    const limit = Math.min(parseInt(String(limitStr ?? '100')), 500)

    const where: Record<string, unknown> = { tenantId: req.tenantId }

    // Support both channelId (number) and channel name (string) query params
    if (channel) {
      const chId = Number(channel)
      if (!isNaN(chId) && chId > 0) {
        where.channelId = chId
      } else {
        where.linearChannel = channel
      }
    }
    if (sport) where.sportId = Number(sport)

    if (from || to) {
      where.startDateBE = {}
      if (from) (where.startDateBE as Record<string, string>).gte = String(from)
      if (to) (where.startDateBE as Record<string, string>).lte = String(to)
    }

    if (cursor) {
      const decoded = Buffer.from(String(cursor), 'base64url').toString()
      where.startDateBE = { ...(where.startDateBE as object || {}), gte: decoded }
    }

    // Rights filter: event's competition must have a matching contract
    if (rights) {
      const rightField: Record<string, string> = {
        linear: 'linearRights',
        max: 'maxRights',
        radio: 'radioRights',
      }
      const field = rightField[String(rights)]
      if (field) {
        where.competition = {
          contracts: {
            some: {
              [field]: true,
              status: { in: ['valid', 'expiring'] },
            },
          },
        }
      }
    }

    const events = await prisma.event.findMany({
      where,
      orderBy: [{ startDateBE: 'asc' }, { startTimeBE: 'asc' }],
      take: limit + 1,
      include: {
        sport: true,
        channel: { select: { id: true, name: true, color: true } },
        radioChannelRef: { select: { id: true, name: true } },
        onDemandChannelRef: { select: { id: true, name: true } },
        competition: {
          include: {
            contracts: {
              select: {
                linearRights: true,
                maxRights: true,
                radioRights: true,
                geoRestriction: true,
                sublicensing: true,
                status: true,
              },
            },
          },
        },
      },
    })

    const hasMore = events.length > limit
    if (hasMore) events.pop()

    const formatted = events.map(e => formatEventForPublish(e as unknown as Record<string, unknown>))

    const nextCursor = hasMore && events.length > 0
      ? Buffer.from(String((events[events.length - 1] as Record<string, unknown>).startDateBE)).toString('base64url')
      : null

    const fmt = String(format ?? 'json')

    if (fmt === 'ical') {
      const baseUrl = `${req.protocol}://${req.get('host')}`
      const ical = buildIcal(formatted, baseUrl)
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="sporza-planner.ics"')
      return res.send(ical)
    }

    res.json({ events: formatted, nextCursor, total: formatted.length })
  } catch (err) {
    next(err)
  }
})

router.get('/events/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return next(createError(400, 'Invalid event id'))

    const event = await prisma.event.findFirst({
      where: { id, tenantId: req.tenantId },
      include: {
        sport: true,
        channel: { select: { id: true, name: true, color: true } },
        radioChannelRef: { select: { id: true, name: true } },
        onDemandChannelRef: { select: { id: true, name: true } },
        competition: {
          include: {
            contracts: {
              select: {
                linearRights: true,
                maxRights: true,
                radioRights: true,
                geoRestriction: true,
                sublicensing: true,
                status: true,
              },
            },
          },
        },
      },
    })
    if (!event) return next(createError(404, 'Event not found'))

    res.json(formatEventForPublish(event as unknown as Record<string, unknown>))
  } catch (err) {
    next(err)
  }
})

router.get('/live', async (req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      where: { tenantId: req.tenantId, isLive: true },
      orderBy: { startTimeBE: 'asc' },
      include: {
        sport: true, competition: true,
        channel: { select: { id: true, name: true, color: true } },
        radioChannelRef: { select: { id: true, name: true } },
        onDemandChannelRef: { select: { id: true, name: true } },
      },
    })
    res.json(events.map(e => formatEventForPublish(e as unknown as Record<string, unknown>)))
  } catch (err) {
    next(err)
  }
})

router.get('/schedule', async (req, res, next) => {
  try {
    const { date } = req.query
    const targetDate = String(date ?? new Date().toISOString().slice(0, 10))

    const events = await prisma.event.findMany({
      where: { tenantId: req.tenantId, startDateBE: targetDate },
      orderBy: [{ channelId: 'asc' }, { linearStartTime: 'asc' }],
      include: {
        sport: true, competition: true,
        channel: { select: { id: true, name: true, color: true } },
        radioChannelRef: { select: { id: true, name: true } },
        onDemandChannelRef: { select: { id: true, name: true } },
      },
    })

    // Group by channel (resolved from FK, fallback to legacy string)
    const formatted = events.map(e => formatEventForPublish(e as unknown as Record<string, unknown>))
    const byChannel: Record<string, ReturnType<typeof formatEventForPublish>[]> = {}
    for (const ev of formatted) {
      const channel = String(ev.linearChannel ?? 'Unknown')
      if (!byChannel[channel]) byChannel[channel] = []
      byChannel[channel].push(ev)
    }

    res.json({ date: targetDate, channels: byChannel })
  } catch (err) {
    next(err)
  }
})

// ─── Webhook CRUD (admin only) ───────────────────────────────────────────────

router.get('/webhooks', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true } },
      },
    })

    // Count failed deliveries per webhook
    const webhooksWithStats = await Promise.all(
      webhooks.map(async (wh) => {
        const failed = await prisma.webhookDelivery.count({
          where: { webhookId: wh.id, deliveredAt: null },
        })
        return {
          ...wh,
          secret: '••••••••',
          deliveryCount: wh._count.deliveries,
          failedCount: failed,
        }
      })
    )

    res.json(webhooksWithStats)
  } catch (err) {
    next(err)
  }
})

router.post('/webhooks', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { url, secret, events: eventTypes } = req.body
    if (!url || !secret || !Array.isArray(eventTypes) || eventTypes.length === 0) {
      return next(createError(400, 'url, secret, and events[] are required'))
    }

    const user = req.user as { id: string }
    const webhook = await prisma.webhookEndpoint.create({
      data: { url, secret, events: eventTypes, createdById: user.id, tenantId: req.tenantId! },
    })

    logger.info('Webhook registered', { id: webhook.id, url: webhook.url })
    res.status(201).json({ ...webhook, secret: '••••••••' })
  } catch (err) {
    next(err)
  }
})

router.delete('/webhooks/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const webhook = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!webhook) return next(createError(404, 'Webhook not found'))

    await prisma.webhookEndpoint.delete({ where: { id: webhook.id } })
    res.json({ message: 'Webhook deleted' })
  } catch (err) {
    next(err)
  }
})

router.get('/webhooks/:id/log', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const { cursor, limit: limitStr } = req.query
    const limit = Math.min(parseInt(String(limitStr ?? '50')), 200)

    const webhook = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!webhook) return next(createError(404, 'Webhook not found'))

    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        tenantId: req.tenantId,
        webhookId: id,
        ...(cursor ? { createdAt: { lt: new Date(String(cursor)) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    })

    const hasMore = deliveries.length > limit
    if (hasMore) deliveries.pop()

    res.json({ deliveries, nextCursor: hasMore ? deliveries[deliveries.length - 1]?.createdAt : null })
  } catch (err) {
    next(err)
  }
})

// ─── Delivery management ─────────────────────────────────────────────────────

router.get('/deliveries', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { webhookId, status, limit: limitStr } = req.query
    const limit = Math.min(parseInt(String(limitStr ?? '100')), 500)

    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        tenantId: req.tenantId,
        ...(webhookId ? { webhookId: String(webhookId) } : {}),
        ...(status === 'failed' ? { deliveredAt: null } : {}),
        ...(status === 'delivered' ? { deliveredAt: { not: null } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { webhook: { select: { url: true } } },
    })

    res.json(deliveries)
  } catch (err) {
    next(err)
  }
})

router.post('/deliveries/:id/retry', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = String(req.params.id)
    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id, tenantId: req.tenantId },
      include: { webhook: true },
    })
    if (!delivery) return next(createError(404, 'Delivery not found'))

    const { publishService } = await import('../services/publishService.js')
    await publishService.retryDelivery(delivery)

    res.json({ message: 'Retry queued' })
  } catch (err) {
    next(err)
  }
})

export default router
