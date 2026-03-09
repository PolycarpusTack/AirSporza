import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseId } from '../utils/parseId.js'

const router = Router()

// Helper: build nested tree from flat list
function buildTree(channels: any[]): any[] {
  const map = new Map<number, any>()
  const roots: any[] = []

  for (const ch of channels) {
    map.set(ch.id, { ...ch, children: [] })
  }
  for (const ch of channels) {
    const node = map.get(ch.id)!
    if (ch.parentId && map.has(ch.parentId)) {
      map.get(ch.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// List all channels for tenant (flat, with optional type filter)
router.get('/', async (req, res, next) => {
  try {
    const where: any = { tenantId: req.tenantId }
    const typeFilter = req.query.type as string | undefined
    if (typeFilter) {
      where.types = { has: typeFilter }
    }

    const channels = await prisma.channel.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, types: true, color: true, sortOrder: true } },
        _count: { select: { broadcastSlots: true } }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })
    res.json(channels)
  } catch (error) {
    next(error)
  }
})

// Get channel tree (nested hierarchy)
router.get('/tree', async (req, res, next) => {
  try {
    const where: any = { tenantId: req.tenantId }
    const typeFilter = req.query.type as string | undefined
    if (typeFilter) {
      where.types = { has: typeFilter }
    }

    const channels = await prisma.channel.findMany({
      where,
      include: {
        _count: { select: { broadcastSlots: true } }
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    })

    res.json(buildTree(channels))
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
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true, types: true, color: true, platformConfig: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        },
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
    const { name, parentId, types, timezone, broadcastDayStartLocal, platformConfig, epgConfig, color, sortOrder } = req.body

    if (!name) {
      return next(createError(400, 'Name is required'))
    }

    // Validate parentId belongs to same tenant
    if (parentId) {
      const parent = await prisma.channel.findFirst({
        where: { id: parentId, tenantId: req.tenantId }
      })
      if (!parent) return next(createError(400, 'Parent channel not found'))
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        parentId: parentId || null,
        types: types || ['linear'],
        timezone: timezone || 'Europe/Brussels',
        broadcastDayStartLocal: broadcastDayStartLocal || '06:00',
        platformConfig: platformConfig || {},
        epgConfig: epgConfig || {},
        color: color || '#3B82F6',
        sortOrder: sortOrder ?? 0,
        tenantId: req.tenantId!
      },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } }
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

    const { name, parentId, types, timezone, broadcastDayStartLocal, platformConfig, epgConfig, color, sortOrder } = req.body

    // Prevent self-referential parentId
    if (parentId === existing.id) {
      return next(createError(400, 'Channel cannot be its own parent'))
    }

    // Validate parentId belongs to same tenant
    if (parentId) {
      const parent = await prisma.channel.findFirst({
        where: { id: parentId, tenantId: req.tenantId }
      })
      if (!parent) return next(createError(400, 'Parent channel not found'))
    }

    const channel = await prisma.channel.update({
      where: { id: existing.id },
      data: {
        name,
        parentId: parentId !== undefined ? (parentId || null) : undefined,
        types,
        timezone,
        broadcastDayStartLocal,
        platformConfig,
        epgConfig,
        color,
        sortOrder
      },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } }
      }
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
