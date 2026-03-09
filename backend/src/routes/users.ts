import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()

// List all users
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { events: true, techPlans: true }
        }
      }
    })
    res.json(users)
  } catch (error) {
    next(error)
  }
})

// Update user role
const updateRoleSchema = Joi.object({
  role: Joi.string().valid('planner', 'sports', 'contracts', 'admin').required(),
})

router.put('/:id/role', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = updateRoleSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const userId = req.params.id as string
    const existingUser = await prisma.user.findFirst({ where: { id: userId, tenantId: req.tenantId } })
    if (!existingUser) return next(createError(404, 'User not found'))
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role: value.role },
      select: { id: true, email: true, name: true, role: true }
    })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// Delete user (only if no events/techPlans)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = req.params.id as string
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: req.tenantId },
      include: {
        _count: { select: { events: true, techPlans: true } }
      }
    })
    if (!user) return next(createError(404, 'User not found'))
    if ((user._count.events + user._count.techPlans) > 0) {
      return next(createError(400, 'Cannot delete user with existing events or tech plans'))
    }
    await prisma.user.delete({ where: { id: userId } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
