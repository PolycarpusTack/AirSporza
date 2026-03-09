import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { getSocketServer } from '../services/socketInstance.js'
import { logger } from '../utils/logger.js'

const router = Router()

// POST /api/channel-switches — initiate a channel switch
router.post('/', async (req, res, next) => {
  try {
    const { fromSlotId, toChannelId, toSlotId, triggerType, switchAtUtc, reasonCode, reasonText } = req.body
    const tenantId = req.tenantId!

    const action = await prisma.channelSwitchAction.create({
      data: {
        tenantId,
        fromSlotId,
        toChannelId,
        toSlotId: toSlotId || null,
        triggerType,
        switchAtUtc: switchAtUtc ? new Date(switchAtUtc) : null,
        reasonCode,
        reasonText: reasonText || null,
      },
    })

    // Emit via Socket.IO
    const io = getSocketServer()
    if (io) {
      io.of('/switches').to(`tenant:${tenantId}`).emit('switch:created', action)
    }

    res.status(201).json(action)
  } catch (err) {
    next(err)
  }
})

// POST /api/channel-switches/:id/confirm — planner confirms a switch
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { id } = req.params

    const action = await prisma.channelSwitchAction.update({
      where: { id, tenantId },
      data: {
        confirmedBy: (req as any).user?.id || 'system',
        confirmedAt: new Date(),
        executionStatus: 'EXECUTING',
      },
    })

    // Emit via Socket.IO
    const io = getSocketServer()
    if (io) {
      io.of('/switches').to(`tenant:${tenantId}`).emit('switch:confirmed', action)
    }

    res.json(action)
  } catch (err) {
    next(err)
  }
})

// GET /api/channel-switches — list (audit trail)
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.tenantId!
    const { fromSlotId, executionStatus } = req.query

    const where: any = { tenantId }
    if (fromSlotId) where.fromSlotId = fromSlotId as string
    if (executionStatus) where.executionStatus = executionStatus as string

    const actions = await prisma.channelSwitchAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    res.json(actions)
  } catch (err) {
    next(err)
  }
})

export default router
