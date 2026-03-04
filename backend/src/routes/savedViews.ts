import { Router } from 'express'
import { Prisma } from '@prisma/client'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'

const router = Router()
const schema = Joi.object({
  name: Joi.string().max(80).required(),
  context: Joi.string().valid('planner', 'contracts', 'sports').required(),
  filterState: Joi.object().required(),
})

router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const { context } = req.query
    const contextStr = Array.isArray(context) ? context[0] : context
    const views = await prisma.savedView.findMany({
      where: { userId: user.id, ...(contextStr ? { context: contextStr } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    res.json(views)
  } catch (error) { next(error) }
})

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))
    const user = req.user as { id: string }
    const view = await prisma.savedView.create({ data: { userId: user.id, ...value } })
    res.status(201).json(view)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(createError(409, 'A saved view with that name already exists'))
    }
    next(error)
  }
})

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const user = req.user as { id: string }
    const id = String(req.params.id)
    const view = await prisma.savedView.findUnique({ where: { id } })
    if (!view) return next(createError(404, 'Saved view not found'))
    if (view.userId !== user.id) return next(createError(403, 'Forbidden'))
    await prisma.savedView.delete({ where: { id: view.id } })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
