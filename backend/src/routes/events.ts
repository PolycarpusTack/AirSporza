import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { canTransition } from '../services/eventTransitions.js'
import { createNotification } from '../services/notificationService.js'
import { detectConflicts, type ConflictWarning } from '../services/conflictService.js'
import { writeOutboxEvent } from '../services/outbox.js'
import { syncEventToSlot, shouldSync, unlinkEventSlot } from '../services/eventSlotBridge.js'
import { parseDurationToMinutes } from '../utils/parseDuration.js'
import * as s from '../schemas/events.js'
import type { EventStatus, Role } from '@prisma/client'

const router = Router()

/** Auto-parse duration string into durationMin if not explicitly provided */
function enrichDuration(data: Record<string, any>): void {
  if (data.durationMin != null) return // explicit durationMin takes precedence
  if (data.duration) {
    const parsed = parseDurationToMinutes(data.duration)
    if (parsed != null) data.durationMin = parsed
  }
}

router.get('/', validate({ query: s.eventsQuery }), async (req, res, next) => {
  try {
    const { sportId, competitionId, channel, channelId: chId, from, to, search } = req.query as {
      sportId?: number
      competitionId?: number
      channel?: string
      channelId?: number
      from?: string
      to?: string
      search?: string
    }

    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (sportId) where.sportId = sportId
    if (competitionId) where.competitionId = competitionId
    if (chId) {
      where.channelId = chId
    } else if (channel) {
      // Support both channelId (int) and channel name (string) for backwards compat
      const parsed = Number(channel)
      if (!isNaN(parsed) && parsed > 0) {
        where.channelId = parsed
      } else {
        where.linearChannel = channel
      }
    }

    if (from || to) {
      where.startDateBE = {}
      if (from) (where.startDateBE as Record<string, unknown>).gte = new Date(from)
      if (to) (where.startDateBE as Record<string, unknown>).lte = new Date(to)
    }

    const searchTerm = search ? search.slice(0, 200) : undefined
    if (searchTerm) {
      where.OR = [
        { participants: { contains: searchTerm, mode: 'insensitive' } },
        { content: { contains: searchTerm, mode: 'insensitive' } }
      ]
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        sport: true,
        competition: true,
        channel: { select: { id: true, name: true, color: true, types: true } },
      },
      orderBy: [
        { startDateBE: 'asc' },
        { startTimeBE: 'asc' }
      ]
    })

    const eventIds = events.map(e => String(e.id))
    const customValues = eventIds.length > 0
      ? await prisma.customFieldValue.findMany({ where: { tenantId: req.tenantId, entityType: 'event', entityId: { in: eventIds } } })
      : []

    const valuesByEvent = new Map<string, typeof customValues>()
    for (const v of customValues) {
      const arr = valuesByEvent.get(v.entityId) ?? []
      arr.push(v)
      valuesByEvent.set(v.entityId, arr)
    }

    res.json(events.map(e => ({ ...e, customValues: valuesByEvent.get(String(e.id)) ?? [] })))
  } catch (error) {
    next(error)
  }
})

router.post('/conflicts', authenticate, validate({ body: s.conflictCheckSchema }), async (req, res, next) => {
  try {
    const result = await detectConflicts(req.body)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/conflicts/bulk', authenticate, validate({ body: s.bulkConflictSchema }), async (req, res, next) => {
  try {
    const { eventIds } = req.body as { eventIds: number[] }

    const events = await prisma.event.findMany({
      where: { tenantId: req.tenantId, id: { in: eventIds } },
      select: {
        id: true,
        competitionId: true,
        channelId: true,
        radioChannelId: true,
        onDemandChannelId: true,
        linearChannel: true,
        onDemandChannel: true,
        radioChannel: true,
        startDateBE: true,
        startTimeBE: true,
        status: true,
      },
    })

    const results = await Promise.all(
      events.map(async ev => {
        const { warnings } = await detectConflicts({
          id: ev.id,
          competitionId: ev.competitionId,
          channelId: ev.channelId ?? undefined,
          radioChannelId: ev.radioChannelId ?? undefined,
          onDemandChannelId: ev.onDemandChannelId ?? undefined,
          linearChannel: ev.linearChannel ?? undefined,
          onDemandChannel: ev.onDemandChannel ?? undefined,
          radioChannel: ev.radioChannel ?? undefined,
          startDateBE: ev.startDateBE.toISOString().slice(0, 10),
          startTimeBE: ev.startTimeBE,
          status: ev.status ?? undefined,
        })
        return { id: ev.id, warnings }
      })
    )

    const conflictMap: Record<number, ConflictWarning[]> = {}
    for (const id of eventIds) {
      conflictMap[id] = []
    }
    for (const { id, warnings } of results) {
      conflictMap[id] = warnings
    }

    res.json(conflictMap)
  } catch (error) {
    next(error)
  }
})

// Get fixture dates for a competition (for matchday repeat pattern)
router.get('/fixtures/:competitionId', authenticate, validate({ params: s.competitionIdParam }), async (req, res, next) => {
  try {
    const competitionId = Number(req.params.competitionId)

    const events = await prisma.event.findMany({
      where: { tenantId: req.tenantId, competitionId },
      select: {
        startDateBE: true,
        phase: true,
        participants: true,
      },
      orderBy: { startDateBE: 'asc' },
      distinct: ['startDateBE'],
    })

    // Group by date, label as matchdays
    const matchdays = events.map((e, i) => ({
      matchday: i + 1,
      date: e.startDateBE.toISOString().split('T')[0],
      label: e.phase || `Matchday ${i + 1}`,
      sample: e.participants,
    }))

    res.json(matchdays)
  } catch (error) {
    next(error)
  }
})

// ── Bulk operations (must be before /:id routes) ────────────────────────────

router.delete('/bulk', authenticate, authorize('planner', 'admin'), validate({ body: s.bulkDeleteSchema }), async (req, res, next) => {
  try {
    const { ids } = req.body as { ids: number[] }

    await prisma.$transaction(async (tx) => {
      // Void any linked BroadcastSlots before deleting events
      await tx.broadcastSlot.updateMany({
        where: { eventId: { in: ids }, tenantId: req.tenantId },
        data: { status: 'VOIDED', eventId: null }
      })

      await tx.customFieldValue.deleteMany({
        where: { tenantId: req.tenantId, entityType: 'event', entityId: { in: ids.map(String) } },
      })
      await tx.event.deleteMany({ where: { tenantId: req.tenantId, id: { in: ids } } })

      for (const id of ids) {
        await writeOutboxEvent(tx, {
          tenantId: req.tenantId!,
          eventType: 'event.deleted',
          aggregateType: 'Event',
          aggregateId: String(id),
          payload: { id },
        })
      }
    })

    res.json({ deleted: ids.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/status', authenticate, authorize('planner', 'admin'), validate({ body: s.bulkStatusSchema }), async (req, res, next) => {
  try {
    const { ids, status } = req.body as { ids: number[]; status: EventStatus }

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: { tenantId: req.tenantId, id: { in: ids } },
        data: { status },
      })
      const events = await tx.event.findMany({ where: { tenantId: req.tenantId, id: { in: ids } } })

      for (const ev of events) {
        await writeOutboxEvent(tx, {
          tenantId: req.tenantId!,
          eventType: 'event.updated',
          aggregateType: 'Event',
          aggregateId: String(ev.id),
          payload: ev,
        })
      }

      return events
    })

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/reschedule', authenticate, authorize('planner', 'admin'), validate({ body: s.bulkRescheduleSchema }), async (req, res, next) => {
  try {
    const { ids, shiftDays } = req.body as { ids: number[]; shiftDays: number }

    const currentEvents = await prisma.event.findMany({
      where: { tenantId: req.tenantId, id: { in: ids } },
      select: { id: true, startDateBE: true },
    })

    const updatedEvents = await prisma.$transaction(async (tx) => {
      const updated: Awaited<ReturnType<typeof tx.event.update>>[] = []
      for (const ev of currentEvents) {
        const d = new Date(ev.startDateBE)
        d.setDate(d.getDate() + shiftDays)
        const newDate = d.toISOString().slice(0, 10)
        const result = await tx.event.update({
          where: { id: ev.id },
          data: { startDateBE: new Date(newDate) },
        })
        updated.push(result)

        await writeOutboxEvent(tx, {
          tenantId: req.tenantId!,
          eventType: 'event.updated',
          aggregateType: 'Event',
          aggregateId: String(ev.id),
          payload: result,
        })
      }
      return updated
    })

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/assign', authenticate, authorize('planner', 'admin'), validate({ body: s.bulkAssignSchema }), async (req, res, next) => {
  try {
    const { ids, field, value: fieldValue } = req.body as {
      ids: number[]
      field: 'channelId' | 'linearChannel' | 'sportId' | 'competitionId'
      value: string | number
    }

    const data: Record<string, unknown> = { [field]: fieldValue }
    const affectsSlots = field === 'channelId'

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({ where: { tenantId: req.tenantId, id: { in: ids } }, data })
      const events = await tx.event.findMany({
        where: { tenantId: req.tenantId, id: { in: ids } },
        include: affectsSlots ? { channel: true } : undefined,
      })

      for (const ev of events) {
        await writeOutboxEvent(tx, {
          tenantId: req.tenantId!,
          eventType: 'event.updated',
          aggregateType: 'Event',
          aggregateId: String(ev.id),
          payload: ev,
        })
      }

      // Sync broadcast slots when channel assignment changes
      if (affectsSlots) {
        for (const ev of events) {
          if (ev.channelId) {
            await syncEventToSlot(ev as Parameters<typeof syncEventToSlot>[0], tx as unknown as Parameters<typeof syncEventToSlot>[1])
          } else {
            await unlinkEventSlot(ev.id, req.tenantId!, tx as unknown as Parameters<typeof unlinkEventSlot>[2])
          }
        }
      }

      return events
    })

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
      include: {
        sport: true,
        competition: true,
        channel: { select: { id: true, name: true, color: true, types: true } },
        techPlans: {
          include: {
            createdBy: { select: { id: true, name: true, email: true } }
          }
        },
        createdBy: { select: { id: true, name: true, email: true } }
      }
    })

    if (!event) {
      return next(createError(404, 'Event not found'))
    }

    const customValues = await prisma.customFieldValue.findMany({
      where: { tenantId: req.tenantId, entityType: 'event', entityId: String(event.id) }
    })

    res.json({ ...event, customValues })
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('planner', 'sports', 'admin'), validate({ body: s.eventSchema }), async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const { customValues, ...eventData } = req.body

    // Remove undefined values that Prisma can't handle
    Object.keys(eventData).forEach(k => {
      if (eventData[k] === undefined) delete eventData[k]
    })
    enrichDuration(eventData)

    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          ...eventData,
          tenantId: req.tenantId!,
          startDateBE: new Date(eventData.startDateBE),
          startDateOrigin: eventData.startDateOrigin ? new Date(eventData.startDateOrigin) : null,
          livestreamDate: eventData.livestreamDate ? new Date(eventData.livestreamDate) : null,
          createdById: user.id
        },
        include: {
          sport: true,
          competition: true,
          channel: { select: { id: true, name: true, color: true, types: true } },
        }
      })

      const customValuesList = customValues as { fieldId: string; fieldValue: string }[]
      if (customValuesList.length > 0) {
        await Promise.all(
          customValuesList.map(({ fieldId, fieldValue }) =>
            tx.customFieldValue.upsert({
              where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(created.id), fieldId } },
              create: { tenantId: req.tenantId!, entityType: 'event', entityId: String(created.id), fieldId, fieldValue },
              update: { fieldValue },
            })
          )
        )
      }

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'event.created',
        aggregateType: 'Event',
        aggregateId: String(created.id),
        payload: created,
      })

      // Auto-bridge: create linked BroadcastSlot if event has channel + time
      await syncEventToSlot(created as Parameters<typeof syncEventToSlot>[0], tx as unknown as Parameters<typeof syncEventToSlot>[1])

      return created
    })

    await writeAuditLog({
      userId: user.id,
      action: 'event.create',
      entityType: 'event',
      entityId: String(event.id),
      newValue: event,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.status(201).json(event)
  } catch (error) {
    next(error)
  }
})

router.post('/batch', authenticate, authorize('planner', 'sports', 'admin'), validate({ body: s.batchCreateSchema }), async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const { events: eventPayloads, seriesId } = req.body

    const created = await prisma.$transaction(async (tx) => {
      const results = []
      for (const payload of eventPayloads) {
        const { customValues, ...eventData } = payload
        enrichDuration(eventData)
        const event = await tx.event.create({
          data: {
            ...eventData,
            tenantId: req.tenantId!,
            seriesId: seriesId || null,
            startDateBE: new Date(eventData.startDateBE),
            startDateOrigin: eventData.startDateOrigin ? new Date(eventData.startDateOrigin) : null,
            livestreamDate: eventData.livestreamDate ? new Date(eventData.livestreamDate) : null,
            createdById: user.id,
          },
          include: { sport: true, competition: true, channel: { select: { id: true, name: true, color: true, types: true } } },
        })

        const cvList = customValues as { fieldId: string; fieldValue: string }[]
        if (cvList.length > 0) {
          await Promise.all(
            cvList.map(({ fieldId, fieldValue }) =>
              tx.customFieldValue.upsert({
                where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(event.id), fieldId } },
                create: { tenantId: req.tenantId!, entityType: 'event', entityId: String(event.id), fieldId, fieldValue },
                update: { fieldValue },
              })
            )
          )
        }
        await writeOutboxEvent(tx, {
          tenantId: req.tenantId!,
          eventType: 'event.created',
          aggregateType: 'Event',
          aggregateId: String(event.id),
          payload: event,
        })

        // Auto-bridge: create linked BroadcastSlot
        await syncEventToSlot(event as Parameters<typeof syncEventToSlot>[0], tx as unknown as Parameters<typeof syncEventToSlot>[1])

        results.push(event)
      }
      return results
    })

    await writeAuditLog({
      userId: user.id,
      action: 'event.batch_create',
      entityType: 'event',
      entityId: created.map(e => String(e.id)).join(','),
      newValue: { count: created.length, seriesId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id/status', authenticate, authorize('planner', 'sports', 'admin'), validate({ params: s.idParam, body: s.statusUpdateSchema }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const { status } = req.body as { status: EventStatus }

    const event = await prisma.event.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!event) return next(createError(404, 'Event not found'))

    const user = req.user as { id: string; role: string }
    if (!canTransition(event.status, status, user.role as Role)) {
      return next(createError(422, `Transition ${event.status} → ${status} is not allowed for role ${user.role}`))
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.event.update({
        where: { id },
        data: { status },
        include: { channel: { select: { id: true, name: true, timezone: true } } },
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'event.status_changed',
        aggregateType: 'Event',
        aggregateId: String(id),
        payload: { ...result, previousStatus: event.status },
        priority: status === 'live' ? 'HIGH' : 'NORMAL',
      })

      // Auto-bridge: sync slot status (cancelled → VOIDED, live → LIVE, etc.)
      if (result.channelId) {
        await syncEventToSlot(result as Parameters<typeof syncEventToSlot>[0], tx as unknown as Parameters<typeof syncEventToSlot>[1])
      }

      return result
    })

    await writeAuditLog({
      userId: user.id,
      action: 'event.statusTransition',
      entityType: 'event',
      entityId: String(id),
      oldValue: { status: event.status },
      newValue: { status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    if (status === 'approved' && event.createdById) {
      void createNotification(
        event.createdById,
        'event_approved',
        `Your event "${event.participants ?? 'Event'}" was approved`,
        { entityType: 'event', entityId: String(id) }
      )
    }

    res.json(updated)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('planner', 'sports', 'admin'), validate({ params: s.idParam, body: s.eventSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.event.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })

    if (!existing) {
      return next(createError(404, 'Event not found'))
    }

    const { customValues, ...eventData } = req.body

    // Remove undefined values that Prisma can't handle
    Object.keys(eventData).forEach(k => {
      if (eventData[k] === undefined) delete eventData[k]
    })
    enrichDuration(eventData)

    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id: Number(req.params.id) },
        data: {
          ...eventData,
          startDateBE: new Date(eventData.startDateBE),
          startDateOrigin: eventData.startDateOrigin ? new Date(eventData.startDateOrigin) : null,
          livestreamDate: eventData.livestreamDate ? new Date(eventData.livestreamDate) : null
        },
        include: {
          sport: true,
          competition: true,
          channel: { select: { id: true, name: true, color: true, types: true, timezone: true } },
        }
      })

      const customValuesList = customValues as { fieldId: string; fieldValue: string }[]
      // Delete custom field values not in the submitted list, then upsert the rest
      const submittedFieldIds = customValuesList.map(cv => cv.fieldId)
      await tx.customFieldValue.deleteMany({
        where: {
          entityType: 'event',
          entityId: String(updated.id),
          tenantId: req.tenantId!,
          ...(submittedFieldIds.length > 0
            ? { fieldId: { notIn: submittedFieldIds } }
            : {}),
        },
      })
      if (customValuesList.length > 0) {
        await Promise.all(
          customValuesList.map(({ fieldId, fieldValue }) =>
            tx.customFieldValue.upsert({
              where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(updated.id), fieldId } },
              create: { tenantId: req.tenantId!, entityType: 'event', entityId: String(updated.id), fieldId, fieldValue },
              update: { fieldValue },
            })
          )
        )
      }

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'event.updated',
        aggregateType: 'Event',
        aggregateId: String(updated.id),
        payload: updated,
      })

      // Auto-bridge: sync linked BroadcastSlot if trigger fields changed
      if (shouldSync(existing, updated)) {
        if (updated.channelId) {
          await syncEventToSlot(updated as Parameters<typeof syncEventToSlot>[0], tx as unknown as Parameters<typeof syncEventToSlot>[1])
        } else {
          // Channel removed — unlink the slot
          await unlinkEventSlot(updated.id, updated.tenantId, tx as unknown as Parameters<typeof unlinkEventSlot>[2])
        }
      }

      return updated
    })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'event.update',
      entityType: 'event',
      entityId: String(event.id),
      oldValue: existing,
      newValue: event,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json(event)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('planner', 'admin'), validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })

    if (!event) {
      return next(createError(404, 'Event not found'))
    }

    await prisma.$transaction(async (tx) => {
      // Void any linked BroadcastSlots before deleting the event
      await tx.broadcastSlot.updateMany({
        where: { eventId: event.id, tenantId: req.tenantId },
        data: { status: 'VOIDED', eventId: null }
      })

      await tx.customFieldValue.deleteMany({
        where: { tenantId: req.tenantId, entityType: 'event', entityId: String(req.params.id) }
      })
      await tx.event.delete({
        where: { id: Number(req.params.id) }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'event.deleted',
        aggregateType: 'Event',
        aggregateId: String(req.params.id),
        payload: { id: Number(req.params.id) },
      })
    })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'event.delete',
      entityType: 'event',
      entityId: String(req.params.id),
      oldValue: event,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json({ message: 'Event deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
