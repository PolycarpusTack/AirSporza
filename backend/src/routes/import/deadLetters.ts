import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { createError } from '../../middleware/errorHandler.js'
import { getImportSourceRuntimeStatus } from '../../import/adapters/index.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import { getOffsetPagination, paginationEnvelope } from '../../utils/pagination.js'

const router = Router()

router.get('/dead-letters', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const pagination = getOffsetPagination(req.query.offset, limit)
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.sourceCode) {
      where.source = { code: req.query.sourceCode }
    }

    if (req.query.resolved === 'true') {
      where.resolvedAt = { not: null }
    } else if (req.query.resolved !== 'all') {
      where.resolvedAt = null
    }

    const deadLetters = await prisma.importDeadLetter.findMany({
      where,
      include: {
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        },
        job: {
          select: {
            id: true,
            entityScope: true,
            status: true,
          }
        }
      },
      orderBy: pagination ? [{ createdAt: 'desc' }, { id: 'asc' }] : { createdAt: 'desc' },
      take: limit,
      ...(pagination ? { skip: pagination.offset } : {}),
    })

    if (pagination) {
      const total = await prisma.importDeadLetter.count({ where })
      return res.json(paginationEnvelope(deadLetters, total, pagination))
    }
    res.json(deadLetters)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/dead-letters/:id/replay', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const deadLetter = await prisma.importDeadLetter.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
      include: {
        job: {
          select: {
            entityScope: true,
            mode: true,
          }
        },
        source: {
          select: {
            id: true,
            code: true,
            name: true,
            isEnabled: true,
            kind: true,
            configJson: true,
          }
        }
      }
    })

    if (!deadLetter) {
      return next(createError(404, 'Dead letter not found'))
    }

    if (deadLetter.resolvedAt) {
      return next(createError(400, 'Dead letter has already been resolved'))
    }

    if (!deadLetter.job) {
      return next(createError(400, 'Dead letter is not associated with a replayable import job'))
    }

    const runtime = getImportSourceRuntimeStatus({
      code: deadLetter.source.code as 'football_data' | 'the_sports_db' | 'api_football' | 'statsbomb_open',
      configJson: deadLetter.source.configJson,
      kind: deadLetter.source.kind as 'api' | 'file',
    })

    if (!deadLetter.source.isEnabled) {
      return next(createError(400, `${deadLetter.source.name} is disabled`))
    }

    if (!runtime.configStatus.canExecute) {
      return next(createError(
        400,
        `${deadLetter.source.name} is missing required configuration: ${runtime.configStatus.missingConfig.join(', ')}`
      ))
    }

    const user = req.user as { email?: string; id: string }
    const requestedBy = user.email || user.id
    const job = await prisma.importJob.create({
      data: {
        tenantId: req.tenantId!,
        sourceId: deadLetter.sourceId,
        entityScope: deadLetter.job.entityScope,
        mode: deadLetter.job.mode,
        status: 'queued',
        statsJson: {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          requestedBy,
          note: `Replay dead letter ${deadLetter.id}`,
          replayDeadLetterId: deadLetter.id,
          retryCount: 0,
        }
      },
      include: {
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        },
        _count: {
          select: {
            records: true,
            deadLetters: true,
          }
        }
      }
    })

    res.status(202).json({
      message: `Replay queued for dead letter ${deadLetter.id}.`,
      job,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

export default router
