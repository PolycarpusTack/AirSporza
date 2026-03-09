import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import { writeOutboxEvent } from '../services/outbox.js'

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

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { eventId } = req.query

    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (eventId) where.eventId = Number(eventId)

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

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const plan = await prisma.techPlan.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId },
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

    // Auto-fill crew from plan-type default template if crew is empty
    let crew = value.crew || {}
    if (Object.keys(crew).length === 0 && value.planType) {
      const defaultTemplate = await prisma.crewTemplate.findFirst({
        where: { tenantId: req.tenantId, planType: value.planType, createdById: null },
      })
      if (defaultTemplate) {
        crew = defaultTemplate.crewData as Record<string, unknown>
      }
    }

    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.techPlan.create({
        data: {
          ...value,
          tenantId: req.tenantId!,
          crew,
          createdById: user.id
        },
        include: {
          event: { include: { sport: true, competition: true } }
        }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'techPlan.created',
        aggregateType: 'TechPlan',
        aggregateId: String(created.id),
        payload: created,
      })

      return created
    })

    await writeAuditLog({
      userId: user.id,
      action: 'techPlan.create',
      entityType: 'techPlan',
      entityId: String(plan.id),
      newValue: plan,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
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

    const existing = await prisma.techPlan.findFirst({
      where: { id: Number(req.params.id), tenantId: req.tenantId }
    })

    if (!existing) {
      return next(createError(404, 'Tech plan not found'))
    }

    // Validate that eventId belongs to the same tenant
    if (value.eventId) {
      const event = await prisma.event.findFirst({
        where: { id: value.eventId, tenantId: req.tenantId },
      })
      if (!event) {
        return next(createError(400, 'eventId does not belong to this tenant'))
      }
    }

    const plan = await prisma.$transaction(async (tx) => {
      const updated = await tx.techPlan.update({
        where: { id: existing.id },
        data: value,
        include: {
          event: { include: { sport: true, competition: true } }
        }
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'techPlan.updated',
        aggregateType: 'TechPlan',
        aggregateId: String(updated.id),
        payload: updated,
      })

      return updated
    })

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
      tenantId: req.tenantId,
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

    const existing = await prisma.techPlan.findFirst({ where: { id: planId, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Tech plan not found'))

    // Check for an active lock held by someone else
    const lock = await prisma.encoderLock.findFirst({ where: { encoderName: encoder, tenantId: req.tenantId } })
    if (lock && !isLockExpired(lock.expiresAt) && lock.lockedById !== user.id) {
      return next(createError(409, `Encoder "${encoder}" is currently locked by another user`))
    }

    const crew = existing.crew as Record<string, unknown>
    const updatedCrew = { ...crew, encoder }

    const plan = await prisma.$transaction(async (tx) => {
      // Upsert lock with 30-second TTL
      await tx.encoderLock.upsert({
        where: { encoderName: encoder },
        create: { tenantId: req.tenantId!, encoderName: encoder, lockedById: user.id, planId, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
        update: { lockedById: user.id, planId, expiresAt: new Date(Date.now() + LOCK_TTL_MS) },
      })

      const updated = await tx.techPlan.update({
        where: { id: planId },
        data: { crew: updatedCrew },
        include: { event: { include: { sport: true, competition: true } } },
      })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'techPlan.updated',
        aggregateType: 'TechPlan',
        aggregateId: String(planId),
        payload: { ...updated, encoderSwapped: encoder },
      })

      return updated
    })

    await writeAuditLog({
      userId: user.id,
      action: 'encoder.swap',
      entityType: 'techPlan',
      entityId: String(planId),
      oldValue: crew,
      newValue: updatedCrew,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json(plan)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', authenticate, authorize('sports', 'admin'), async (req, res, next) => {
  try {
    const planId = Number(req.params.id)
    const existing = await prisma.techPlan.findFirst({ where: { id: planId, tenantId: req.tenantId } })
    if (!existing) {
      return next(createError(404, 'Tech plan not found'))
    }

    await prisma.$transaction(async (tx) => {
      await tx.techPlan.delete({ where: { id: planId } })

      await writeOutboxEvent(tx, {
        tenantId: req.tenantId!,
        eventType: 'techPlan.deleted',
        aggregateType: 'TechPlan',
        aggregateId: String(planId),
        payload: { id: planId },
      })
    })

    const user = req.user as { id: string }
    await writeAuditLog({
      userId: user.id,
      action: 'techPlan.delete',
      entityType: 'techPlan',
      entityId: String(planId),
      oldValue: existing ?? undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json({ message: 'Tech plan deleted successfully' })
  } catch (error) {
    next(error)
  }
})

export default router
