import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

// List all channels for tenant
router.get('/', async (req, res, next) => {
  try {
    const channels = await prisma.channel.findMany({
      where: { tenantId: req.tenantId },
      include: {
        _count: { select: { broadcastSlots: true } }
      },
      orderBy: { name: 'asc' }
    })
    res.json(channels)
  } catch (error) {
    next(error)
  }
})

// Get channel by id
router.get('/:id', async (req, res, next) => {
  try {
    const channel = await prisma.channel.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId },
      include: {
        _count: { select: { broadcastSlots: true } }
      }
    })

    if (!channel) {
      return next(createError(404, 'Channel not found'))
    }

    res.json(channel)
  } catch (error) {
    next(error)
  }
})

// Create channel (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, timezone, broadcastDayStartLocal, epgConfig, color } = req.body

    if (!name) {
      return next(createError(400, 'Name is required'))
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        timezone: timezone || 'Europe/Brussels',
        broadcastDayStartLocal: broadcastDayStartLocal || '06:00',
        epgConfig: epgConfig || {},
        color: color || '#3B82F6',
        tenantId: req.tenantId!
      }
    })

    res.status(201).json(channel)
  } catch (error) {
    next(error)
  }
})

// Update channel (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.channel.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Channel not found'))

    const { name, timezone, broadcastDayStartLocal, epgConfig, color } = req.body
    const channel = await prisma.channel.update({
      where: { id: existing.id },
      data: { name, timezone, broadcastDayStartLocal, epgConfig, color }
    })

    res.json(channel)
  } catch (error) {
    next(error)
  }
})

// Delete channel (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const toDelete = await prisma.channel.findFirst({
      where: { id: parseId(req.params.id), tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Channel not found'))

    await prisma.channel.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Channel deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
