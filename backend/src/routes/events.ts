import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { emit } from '../services/socketInstance.js'
import { writeAuditLog } from '../utils/audit.js'
import { publishService } from '../services/publishService.js'

const router = Router()

const positiveId = Joi.number().integer().min(1).required()

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

    emit('event:created', event)
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

    emit('event:updated', event)
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
    
    emit('event:deleted', { id: Number(req.params.id) })
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
