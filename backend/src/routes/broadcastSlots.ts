import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeOutboxEvent } from '../services/outbox.js'

const router = Router()

// List broadcast slots (filter by channelId, dateStart, dateEnd, eventId, status)
router.get('/', async (req, res, next) => {
  try {
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.channelId) {
      where.channelId = Number(req.query.channelId)
    }
    if (req.query.eventId) {
      where.eventId = Number(req.query.eventId)
    }
    if (req.query.status) {
      where.status = req.query.status as string
    }

    // Date range filter on plannedStartUtc
    if (req.query.dateStart || req.query.dateEnd) {
      const plannedStartUtc: Record<string, Date> = {}
      if (req.query.dateStart) {
        plannedStartUtc.gte = new Date(req.query.dateStart as string)
      }
      if (req.query.dateEnd) {
        plannedStartUtc.lte = new Date(req.query.dateEnd as string)
      }
      where.plannedStartUtc = plannedStartUtc
    }

    const slots = await prisma.broadcastSlot.findMany({
      where,
      include: {
        channel: { select: { id: true, name: true, color: true } },
        event: { select: { id: true, participants: true, sportId: true, competitionId: true, startDateBE: true, startTimeBE: true } }
      },
      orderBy: { plannedStartUtc: 'asc' }
    })

    res.json(slots)
  } catch (error) {
    next(error)
  }
})

// Get slot by id (with event and channel)
router.get('/:id', async (req, res, next) => {
  try {
    const slot = await prisma.broadcastSlot.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        channel: true,
        event: {
          include: {
            sport: { select: { id: true, name: true, icon: true } },
            competition: { select: { id: true, name: true } }
          }
        }
      }
    })

    if (!slot) {
      return next(createError(404, 'Broadcast slot not found'))
    }

    res.json(slot)
  } catch (error) {
    next(error)
  }
})

// Create broadcast slot (planner+)
router.post('/', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const {
      channelId,
      eventId,
      schedulingMode,
      plannedStartUtc,
      plannedEndUtc,
      estimatedStartUtc,
      estimatedEndUtc,
      earliestStartUtc,
      latestStartUtc,
      bufferBeforeMin,
      bufferAfterMin,
      expectedDurationMin,
      overrunStrategy,
      conditionalTriggerUtc,
      conditionalTargetChannelId,
      anchorType,
      coveragePriority,
      fallbackEventId,
      status,
      contentSegment,
      scheduleVersionId,
      sportMetadata
    } = req.body

    if (!channelId) {
      return next(createError(400, 'channelId is required'))
    }

    // Verify channel belongs to tenant
    const channel = await prisma.channel.findFirst({
      where: { id: channelId, tenantId: req.tenantId }
    })
    if (!channel) return next(createError(404, 'Channel not found'))

    // Verify event belongs to tenant (if provided)
    if (eventId) {
      const event = await prisma.event.findFirst({
        where: { id: eventId, tenantId: req.tenantId }
      })
      if (!event) return next(createError(404, 'Event not found'))
    }

    const slot = await prisma.$transaction(async (tx) => {
      const created = await tx.broadcastSlot.create({
        data: {
          channelId,
          eventId: eventId || null,
          schedulingMode: schedulingMode || 'FIXED',
          plannedStartUtc: plannedStartUtc ? new Date(plannedStartUtc) : null,
          plannedEndUtc: plannedEndUtc ? new Date(plannedEndUtc) : null,
          estimatedStartUtc: estimatedStartUtc ? new Date(estimatedStartUtc) : null,
          estimatedEndUtc: estimatedEndUtc ? new Date(estimatedEndUtc) : null,
          earliestStartUtc: earliestStartUtc ? new Date(earliestStartUtc) : null,
          latestStartUtc: latestStartUtc ? new Date(latestStartUtc) : null,
          bufferBeforeMin: bufferBeforeMin ?? 15,
          bufferAfterMin: bufferAfterMin ?? 25,
          expectedDurationMin: expectedDurationMin || null,
          overrunStrategy: overrunStrategy || 'EXTEND',
          conditionalTriggerUtc: conditionalTriggerUtc ? new Date(conditionalTriggerUtc) : null,
          conditionalTargetChannelId: conditionalTargetChannelId || null,
          anchorType: anchorType || 'FIXED_TIME',
          coveragePriority: coveragePriority ?? 1,
          fallbackEventId: fallbackEventId || null,
          status: status || 'PLANNED',
          contentSegment: contentSegment || 'FULL',
          scheduleVersionId: scheduleVersionId || null,
          sportMetadata: sportMetadata || {},
          tenantId: req.tenantId!
        },
        include: {
          channel: { select: { id: true, name: true, color: true } },
          event: { select: { id: true, participants: true, sportId: true } }
        }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'slot.created',
        aggregateType: 'BroadcastSlot',
        aggregateId: created.id,
        payload: created,
      })

      return created
    })

    res.status(201).json(slot)
  } catch (error) {
    next(error)
  }
})

// Update broadcast slot (planner+)
router.put('/:id', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const existing = await prisma.broadcastSlot.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Broadcast slot not found'))

    const {
      channelId,
      eventId,
      schedulingMode,
      plannedStartUtc,
      plannedEndUtc,
      estimatedStartUtc,
      estimatedEndUtc,
      earliestStartUtc,
      latestStartUtc,
      bufferBeforeMin,
      bufferAfterMin,
      expectedDurationMin,
      overrunStrategy,
      conditionalTriggerUtc,
      conditionalTargetChannelId,
      anchorType,
      coveragePriority,
      fallbackEventId,
      status,
      contentSegment,
      scheduleVersionId,
      sportMetadata
    } = req.body

    // If changing channel, verify it belongs to tenant
    if (channelId && channelId !== existing.channelId) {
      const channel = await prisma.channel.findFirst({
        where: { id: channelId, tenantId: req.tenantId }
      })
      if (!channel) return next(createError(404, 'Channel not found'))
    }

    // If changing event, verify it belongs to tenant
    if (eventId !== undefined && eventId !== existing.eventId) {
      if (eventId) {
        const event = await prisma.event.findFirst({
          where: { id: eventId, tenantId: req.tenantId }
        })
        if (!event) return next(createError(404, 'Event not found'))
      }
    }

    const data: Record<string, unknown> = {}
    if (channelId !== undefined) data.channelId = channelId
    if (eventId !== undefined) data.eventId = eventId || null
    if (schedulingMode !== undefined) data.schedulingMode = schedulingMode
    if (plannedStartUtc !== undefined) data.plannedStartUtc = plannedStartUtc ? new Date(plannedStartUtc) : null
    if (plannedEndUtc !== undefined) data.plannedEndUtc = plannedEndUtc ? new Date(plannedEndUtc) : null
    if (estimatedStartUtc !== undefined) data.estimatedStartUtc = estimatedStartUtc ? new Date(estimatedStartUtc) : null
    if (estimatedEndUtc !== undefined) data.estimatedEndUtc = estimatedEndUtc ? new Date(estimatedEndUtc) : null
    if (earliestStartUtc !== undefined) data.earliestStartUtc = earliestStartUtc ? new Date(earliestStartUtc) : null
    if (latestStartUtc !== undefined) data.latestStartUtc = latestStartUtc ? new Date(latestStartUtc) : null
    if (bufferBeforeMin !== undefined) data.bufferBeforeMin = bufferBeforeMin
    if (bufferAfterMin !== undefined) data.bufferAfterMin = bufferAfterMin
    if (expectedDurationMin !== undefined) data.expectedDurationMin = expectedDurationMin
    if (overrunStrategy !== undefined) data.overrunStrategy = overrunStrategy
    if (conditionalTriggerUtc !== undefined) data.conditionalTriggerUtc = conditionalTriggerUtc ? new Date(conditionalTriggerUtc) : null
    if (conditionalTargetChannelId !== undefined) data.conditionalTargetChannelId = conditionalTargetChannelId
    if (anchorType !== undefined) data.anchorType = anchorType
    if (coveragePriority !== undefined) data.coveragePriority = coveragePriority
    if (fallbackEventId !== undefined) data.fallbackEventId = fallbackEventId
    if (status !== undefined) data.status = status
    if (contentSegment !== undefined) data.contentSegment = contentSegment
    if (scheduleVersionId !== undefined) data.scheduleVersionId = scheduleVersionId
    if (sportMetadata !== undefined) data.sportMetadata = sportMetadata

    const slot = await prisma.broadcastSlot.update({
      where: { id: existing.id },
      data,
      include: {
        channel: { select: { id: true, name: true, color: true } },
        event: { select: { id: true, participants: true, sportId: true } }
      }
    })

    res.json(slot)
  } catch (error) {
    next(error)
  }
})

// Update slot status only (planner+)
router.patch('/:id/status', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const existing = await prisma.broadcastSlot.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId }
    })
    if (!existing) return next(createError(404, 'Broadcast slot not found'))

    const { status } = req.body
    if (!status) {
      return next(createError(400, 'status is required'))
    }

    const validStatuses = ['PLANNED', 'LIVE', 'OVERRUN', 'SWITCHED_OUT', 'COMPLETED', 'VOIDED']
    if (!validStatuses.includes(status)) {
      return next(createError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`))
    }

    const slot = await prisma.$transaction(async (tx) => {
      const updated = await tx.broadcastSlot.update({
        where: { id: existing.id },
        data: { status },
        include: {
          channel: { select: { id: true, name: true, color: true } },
          event: { select: { id: true, participants: true, sportId: true } }
        }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'slot.status_changed',
        aggregateType: 'BroadcastSlot',
        aggregateId: updated.id,
        payload: { ...updated, previousStatus: existing.status },
      })

      return updated
    })

    res.json(slot)
  } catch (error) {
    next(error)
  }
})

// Delete broadcast slot (planner+)
router.delete('/:id', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const toDelete = await prisma.broadcastSlot.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId }
    })
    if (!toDelete) return next(createError(404, 'Broadcast slot not found'))

    await prisma.broadcastSlot.delete({ where: { id: toDelete.id } })

    res.json({ message: 'Broadcast slot deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
