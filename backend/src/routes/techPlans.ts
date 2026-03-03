import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { emit } from '../services/socketInstance.js'
import { writeAuditLog } from '../utils/audit.js'

export const LOCK_TTL_MS = 30_000

export function isLockExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now()
}

const router = Router()

const techPlanSchema = Joi.object({
  eventId: Joi.number().required(),
  planType: Joi.string().required(),
  crew: Joi.object().required(),
  isLivestream: Joi.boolean(),
  customFields: Joi.array().items(Joi.object({ name: Joi.string(), value: Joi.string() }))
})

router.get('/', async (req, res, next) => {
  try {
    const { eventId } = req.query
    
    const where = eventId ? { eventId: Number(eventId) } : {}
    
    const plans = await prisma.techPlan.findMany({
      where,
      include: {
        event: {
          include: { sport: true, competition: true }
        },
        createdBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    res.json(plans)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const plan = await prisma.techPlan.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        event: {
          include: { sport: true, competition: true }
        },
        createdBy: { select: { id: true, name: true, email: true } }
      }
    })
    
    if (!plan) {
      return next(createError(404, 'Tech plan not found'))
    }
    
    res.json(plan)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = techPlanSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }
    
    const user = req.user as { id: string }
    
    const plan = await prisma.techPlan.create({
      data: {
        ...value,
        createdById: user.id
      },
      include: {
        event: { include: { sport: true, competition: true } }
      }
    })
    
    emit('techPlan:created', plan)
    await writeAuditLog({
      userId: user.id,
      action: 'techPlan.create',
      entityType: 'techPlan',
      entityId: String(plan.id),
      newValue: plan,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.status(201).json(plan)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = techPlanSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }
    
    const existing = await prisma.techPlan.findUnique({
      where: { id: Number(req.params.id) }
    })
    
    if (!existing) {
      return next(createError(404, 'Tech plan not found'))
    }
    
    const plan = await prisma.techPlan.update({
      where: { id: Number(req.params.id) },
      data: value,
      include: {
        event: { include: { sport: true, competition: true } }
      }
    })
    
    emit('techPlan:updated', plan)
    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'techPlan.update',
      entityType: 'techPlan',
      entityId: String(plan.id),
      oldValue: existing,
      newValue: plan,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(plan)
  } catch (error) {
    next(error)
  }
})

router.patch('/:id/encoder', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const { encoder } = req.body
    if (!encoder) return next(createError(400, 'Encoder is required'))

    const planId = Number(req.params.id)
    const user = req.user as { id: string }

    const existing = await prisma.techPlan.findUnique({ where: { id: planId } })
    if (!existing) return next(createError(404, 'Tech plan not found'))

    // Check for an active lock held by someone else
    const lock = await prisma.encoderLock.findUnique({ where: { encoderName: encoder } })
    if (lock && !isLockExpired(lock.expiresAt) && lock.lockedById !== user.id) {
      return next(createError(409, `Encoder "${encoder}" is currently locked by another user`))
    }

    // Upsert lock with 30-second TTL
    await prisma.encoderLock.upsert({
      where: { encoderName: encoder },
      create: { encoderName: encoder, lockedById: user.id, planId, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
      update: { lockedById: user.id, planId, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
    })

    const crew = existing.crew as Record<string, unknown>
    const updatedCrew = { ...crew, encoder }

    const plan = await prisma.techPlan.update({
      where: { id: planId },
      data: { crew: updatedCrew },
      include: { event: { include: { sport: true, competition: true } } },
    })

    emit('encoder:swapped', { planId: plan.id, encoder, plan })
    await writeAuditLog({
      userId: user.id,
      action: 'encoder.swap',
      entityType: 'techPlan',
      entityId: String(planId),
      oldValue: crew,
      newValue: updatedCrew,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json(plan)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const planId = Number(req.params.id)
    const existing = await prisma.techPlan.findUnique({ where: { id: planId } })

    await prisma.techPlan.delete({ where: { id: planId } })

    emit('techPlan:deleted', { id: planId })
    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'techPlan.delete',
      entityType: 'techPlan',
      entityId: String(planId),
      oldValue: existing ?? undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    })

    res.json({ message: 'Tech plan deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
