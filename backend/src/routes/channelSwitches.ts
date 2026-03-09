import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { writeOutboxEvent } from '../services/outbox.js'

const router = Router()

// POST /api/channel-switches — initiate a channel switch
router.post('/', async (req, res, next) => {
  try {
    const { fromSlotId, toChannelId, toSlotId, triggerType, switchAtUtc, reasonCode, reasonText } = req.body
    const tenantId = req.tenantId!

    const action = await prisma.$transaction(async (tx) => {
      const created = await tx.channelSwitchAction.create({
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

      await writeOutboxEvent(tx, {
        tenantId,
        eventType: 'channel_switch.created',
        aggregateType: 'ChannelSwitchAction',
        aggregateId: created.id,
        payload: created,
      })

      return created
    })

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

    const action = await prisma.$transaction(async (tx) => {
      const confirmed = await tx.channelSwitchAction.update({
        where: { id, tenantId },
        data: {
          confirmedBy: (req as any).user?.id || 'system',
          confirmedAt: new Date(),
          executionStatus: 'EXECUTING',
        },
      })

      await writeOutboxEvent(tx, {
        tenantId,
        eventType: 'channel_switch.confirmed',
        aggregateType: 'ChannelSwitchAction',
        aggregateId: confirmed.id,
        payload: confirmed,
      })

      return confirmed
    })

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
