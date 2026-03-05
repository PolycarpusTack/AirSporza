import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { emit } from '../services/socketInstance.js'
import { writeAuditLog } from '../utils/audit.js'
import { publishService } from '../services/publishService.js'
import { canTransition } from '../services/eventTransitions.js'
import { createNotification } from '../services/notificationService.js'
import { detectConflicts, type ConflictWarning } from '../services/conflictService.js'
import type { EventStatus, Role } from '@prisma/client'

const router = Router()

function parseId(param: string | string[] | undefined): number {
  if (!param || Array.isArray(param)) return 0
  return parseInt(param, 10)
}

const positiveId = Joi.number().integer().min(1).required()

const statusUpdateSchema = Joi.object({
  status: Joi.string()
    .valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled')
    .required()
})

const conflictCheckSchema = Joi.object({
  id:              Joi.number().integer().min(1).optional(),
  competitionId:   Joi.number().integer().min(1).optional(),
  linearChannel:   Joi.string().allow('').optional(),
  onDemandChannel: Joi.string().allow('').optional(),
  radioChannel:    Joi.string().allow('').optional(),
  startDateBE:     Joi.string().isoDate().optional(),
  startTimeBE:     Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  status:          Joi.string().valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled').optional(),
})

const bulkIdsSchema = Joi.array()
  .items(Joi.number().integer().min(1))
  .min(1)
  .max(100)
  .required()

const bulkDeleteSchema = Joi.object({ ids: bulkIdsSchema })

const bulkStatusSchema = Joi.object({
  ids: bulkIdsSchema,
  status: Joi.string()
    .valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled')
    .required(),
})

const bulkRescheduleSchema = Joi.object({
  ids: bulkIdsSchema,
  shiftDays: Joi.number().integer().min(-365).max(365).required(),
})

const bulkAssignSchema = Joi.object({
  ids: bulkIdsSchema,
  field: Joi.string().valid('linearChannel', 'sportId', 'competitionId').required(),
  value: Joi.alternatives().try(Joi.string().allow(''), Joi.number()).required(),
})

const eventSchema = Joi.object({
  sportId: positiveId,
  competitionId: positiveId,
  phase: Joi.string().allow(''),
  category: Joi.string().allow(''),
  participants: Joi.string().required(),
  content: Joi.string().allow(''),
  startDateBE: Joi.string().isoDate().required(),
  startTimeBE: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  startDateOrigin: Joi.string().isoDate().allow(''),
  startTimeOrigin: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(''),
  complex: Joi.string().allow(''),
  livestreamDate: Joi.string().isoDate().allow(''),
  livestreamTime: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(''),
  linearChannel: Joi.string().allow(''),
  radioChannel: Joi.string().allow(''),
  onDemandChannel: Joi.string().allow(''),
  linearStartTime: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(''),
  isLive: Joi.boolean(),
  isDelayedLive: Joi.boolean(),
  videoRef: Joi.string().allow(''),
  winner: Joi.string().allow(''),
  score: Joi.string().allow(''),
  duration: Joi.string().allow(''),
  customFields: Joi.object(),
  customValues: Joi.array().items(
    Joi.object({ fieldId: Joi.string().required(), fieldValue: Joi.string().required() })
  ).default([]),
  status: Joi.string().valid('draft', 'ready', 'approved', 'published', 'live', 'completed', 'cancelled'),
})

router.get('/', async (req, res, next) => {
  try {
    const { sportId, competitionId, channel, from, to, search } = req.query
    
    const where: Record<string, unknown> = {}
    
    if (sportId) where.sportId = Number(sportId)
    if (competitionId) where.competitionId = Number(competitionId)
    if (channel) where.linearChannel = channel
    
    if (from || to) {
      where.startDateBE = {}
      if (from) (where.startDateBE as Record<string, unknown>).gte = new Date(from as string)
      if (to) (where.startDateBE as Record<string, unknown>).lte = new Date(to as string)
    }
    
    if (search) {
      where.OR = [
        { participants: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } }
      ]
    }
    
    const events = await prisma.event.findMany({
      where,
      include: {
        sport: true,
        competition: true,
      },
      orderBy: [
        { startDateBE: 'asc' },
        { startTimeBE: 'asc' }
      ]
    })

    const eventIds = events.map(e => String(e.id))
    const customValues = eventIds.length > 0
      ? await prisma.customFieldValue.findMany({ where: { entityType: 'event', entityId: { in: eventIds } } })
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

router.post('/conflicts', authenticate, async (req, res, next) => {
  try {
    const { error, value } = conflictCheckSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const result = await detectConflicts(value)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

const bulkConflictSchema = Joi.object({
  eventIds: Joi.array()
    .items(Joi.number().integer().min(1))
    .min(1)
    .max(50)
    .required(),
})

router.post('/conflicts/bulk', authenticate, async (req, res, next) => {
  try {
    const { error, value } = bulkConflictSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const { eventIds } = value as { eventIds: number[] }

    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        competitionId: true,
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

// ── Bulk operations (must be before /:id routes) ────────────────────────────

router.delete('/bulk', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkDeleteSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids } = value as { ids: number[] }

    await prisma.$transaction(async (tx) => {
      await tx.customFieldValue.deleteMany({
        where: { entityType: 'event', entityId: { in: ids.map(String) } },
      })
      await tx.event.deleteMany({ where: { id: { in: ids } } })
    })

    for (const id of ids) {
      emit('event:deleted', { id }, 'events')
    }

    res.json({ deleted: ids.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/status', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkStatusSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, status } = value as { ids: number[]; status: EventStatus }

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({
        where: { id: { in: ids } },
        data: { status },
      })
      return tx.event.findMany({ where: { id: { in: ids } } })
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/reschedule', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkRescheduleSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, shiftDays } = value as { ids: number[]; shiftDays: number }

    const currentEvents = await prisma.event.findMany({
      where: { id: { in: ids } },
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
      }
      return updated
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.patch('/bulk/assign', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = bulkAssignSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const { ids, field, value: fieldValue } = value as {
      ids: number[]
      field: 'linearChannel' | 'sportId' | 'competitionId'
      value: string | number
    }

    const data: Record<string, unknown> = { [field]: fieldValue }

    const updatedEvents = await prisma.$transaction(async (tx) => {
      await tx.event.updateMany({ where: { id: { in: ids } }, data })
      return tx.event.findMany({ where: { id: { in: ids } } })
    })

    for (const ev of updatedEvents) {
      emit('event:updated', ev, 'events')
    }

    res.json({ updated: updatedEvents.length })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        sport: true,
        competition: true,
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
      where: { entityType: 'event', entityId: String(event.id) }
    })

    res.json({ ...event, customValues })
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = eventSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }
    
    const user = req.user as { id: string }
    const { customValues, ...eventData } = value

    const event = await prisma.event.create({
      data: {
        ...eventData,
        startDateBE: new Date(eventData.startDateBE),
        startDateOrigin: eventData.startDateOrigin ? new Date(eventData.startDateOrigin) : null,
        livestreamDate: eventData.livestreamDate ? new Date(eventData.livestreamDate) : null,
        createdById: user.id
      },
      include: {
        sport: true,
        competition: true,
      }
    })

    const customValuesList = customValues as { fieldId: string; fieldValue: string }[]
    if (customValuesList.length > 0) {
      await prisma.$transaction(
        customValuesList.map(({ fieldId, fieldValue }) =>
          prisma.customFieldValue.upsert({
            where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(event.id), fieldId } },
            create: { entityType: 'event', entityId: String(event.id), fieldId, fieldValue },
            update: { fieldValue },
          })
        )
      )
    }

    emit('event:created', event, 'events')
    void publishService.dispatch('event.created', event)

    await writeAuditLog({
      userId: user.id,
      action: 'event.create',
      entityType: 'event',
      entityId: String(event.id),
      newValue: event,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json(event)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id/status', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    const { error: vErr, value: vBody } = statusUpdateSchema.validate(req.body)
    if (vErr) return next(createError(400, vErr.details[0].message))
    const { status } = vBody as { status: EventStatus }

    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) return next(createError(404, 'Event not found'))

    const user = req.user as { id: string; role: string }
    if (!canTransition(event.status, status, user.role as Role)) {
      return next(createError(422, `Transition ${event.status} → ${status} is not allowed for role ${user.role}`))
    }

    const updated = await prisma.event.update({ where: { id }, data: { status } })

    await writeAuditLog({
      userId: user.id,
      action: 'event.statusTransition',
      entityType: 'event',
      entityId: String(id),
      oldValue: { status: event.status },
      newValue: { status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    if (status === 'approved' && event.createdById) {
      void createNotification(
        event.createdById,
        'event_approved',
        `Your event "${event.participants ?? 'Event'}" was approved`,
        { entityType: 'event', entityId: String(id) }
      )
    }

    emit('event:statusChanged', updated, 'events')

    res.json(updated)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = eventSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const existing = await prisma.event.findUnique({
      where: { id: Number(req.params.id) }
    })

    if (!existing) {
      return next(createError(404, 'Event not found'))
    }

    const { customValues, ...eventData } = value

    const event = await prisma.event.update({
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
      }
    })

    const customValuesList = customValues as { fieldId: string; fieldValue: string }[]
    if (customValuesList.length > 0) {
      await prisma.$transaction(
        customValuesList.map(({ fieldId, fieldValue }) =>
          prisma.customFieldValue.upsert({
            where: { entityType_entityId_fieldId: { entityType: 'event', entityId: String(event.id), fieldId } },
            create: { entityType: 'event', entityId: String(event.id), fieldId, fieldValue },
            update: { fieldValue },
          })
        )
      )
    }

    emit('event:updated', event, 'events')
    void publishService.dispatch('event.updated', event)

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
    })

    res.json(event)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('planner', 'admin'), async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: Number(req.params.id) }
    })
    
    if (!event) {
      return next(createError(404, 'Event not found'))
    }
    
    await prisma.$transaction([
      prisma.customFieldValue.deleteMany({
        where: { entityType: 'event', entityId: String(req.params.id) }
      }),
      prisma.event.delete({
        where: { id: Number(req.params.id) }
      }),
    ])
    
    emit('event:deleted', { id: Number(req.params.id) }, 'events')
    void publishService.dispatch('event.deleted', { id: Number(req.params.id) })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'event.delete',
      entityType: 'event',
      entityId: String(req.params.id),
      oldValue: event,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json({ message: 'Event deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
