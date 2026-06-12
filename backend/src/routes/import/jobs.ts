import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createError } from '../../middleware/errorHandler.js'
import { getImportSourceRuntimeStatus } from '../../import/adapters/index.js'
import { mergeImportJobStats, readImportJobStats } from '../../import/services/ImportJobState.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import { getOffsetPagination, paginationEnvelope } from '../../utils/pagination.js'
import * as s from '../../schemas/import.js'

const router = Router()

router.get('/jobs', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.status) {
      where.status = req.query.status
    }

    if (req.query.sourceCode) {
      where.source = { code: req.query.sourceCode }
    }

    if (req.query.entityScope) {
      where.entityScope = req.query.entityScope
    }

    const pagination = getOffsetPagination(req.query.offset, limit)
    const jobs = await prisma.importJob.findMany({
      where,
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
      },
      orderBy: pagination ? [{ createdAt: 'desc' }, { id: 'asc' }] : { createdAt: 'desc' },
      take: limit,
      ...(pagination ? { skip: pagination.offset } : {}),
    })

    if (pagination) {
      const total = await prisma.importJob.count({ where })
      return res.json(paginationEnvelope(jobs, total, pagination))
    }
    res.json(jobs)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.get('/jobs/:id', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const job = await prisma.importJob.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
      include: {
        source: {
          select: {
            id: true,
            code: true,
            name: true,
            priority: true,
            isEnabled: true,
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

    if (!job) {
      return next(createError(404, 'Import job not found'))
    }

    res.json(job)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/jobs', authenticate, authorize('planner', 'sports', 'admin'), validate({ body: s.createJobSchema }), async (req, res, next) => {
  try {
    const value = req.body

    const source = await prisma.importSource.findUnique({
      where: { code: value.sourceCode }
    })

    if (!source) {
      return next(createError(404, 'Import source not found'))
    }

    if (!source.isEnabled) {
      return next(createError(400, `${source.name} is disabled`))
    }

    const runtime = getImportSourceRuntimeStatus({
      code: source.code as 'football_data' | 'the_sports_db' | 'api_football' | 'statsbomb_open',
      configJson: source.configJson,
      kind: source.kind as 'api' | 'file',
    })

    if (!runtime.capabilities.hasAdapter) {
      return next(createError(400, `${source.name} does not have an executable adapter yet`))
    }

    if (!runtime.capabilities.supportedScopes.includes(value.entityScope)) {
      return next(createError(400, `${source.name} does not support the '${value.entityScope}' scope`))
    }

    if (!runtime.configStatus.canExecute) {
      return next(createError(
        400,
        `${source.name} is missing required configuration: ${runtime.configStatus.missingConfig.join(', ')}`
      ))
    }

    const user = req.user as { email?: string; id: string }
    const entityId = value.entityId == null ? null : String(value.entityId)
    const note = value.note?.trim()

    const result = await prisma.importJob.create({
      data: {
        tenantId: req.tenantId!,
        sourceId: source.id,
        entityScope: value.entityScope,
        mode: value.mode,
        status: 'queued',
        statsJson: {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          requestedEntityId: entityId,
          requestedBy: user.email || user.id,
          note: note || null,
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
      message: 'Manual sync request accepted and queued for worker execution.',
      job: result
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/jobs/:id/cancel', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const existing = await prisma.importJob.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
      include: {
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        }
      }
    })

    if (!existing) {
      return next(createError(404, 'Import job not found'))
    }

    if (!['queued', 'running'].includes(existing.status)) {
      return next(createError(400, 'Only queued or running jobs can be cancelled'))
    }

    const user = req.user as { email?: string; id: string }
    const cancelledBy = user.email || user.id
    const now = new Date()
    const nextStats = mergeImportJobStats(existing.statsJson, {
      cancelRequested: true,
      cancelledBy,
      cancelledAt: now.toISOString(),
      lastError: `Cancelled by ${cancelledBy}`,
    })

    const cancelled = existing.status === 'queued'
      ? await prisma.importJob.update({
          where: { id: existing.id },
          data: {
            status: 'failed',
            finishedAt: now,
            errorLog: `Cancelled by ${cancelledBy}`,
            statsJson: nextStats,
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
      : await prisma.importJob.update({
          where: { id: existing.id },
          data: {
            statsJson: nextStats,
            errorLog: `Cancellation requested by ${cancelledBy}`,
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

    if (existing.status === 'queued') {
      await prisma.syncHistory.create({
        data: {
          tenantId: req.tenantId!,
          entityType: existing.entityScope,
          entityId: null,
          sourceCode: existing.source.code,
          syncType: 'manual',
          triggeredBy: cancelledBy,
          status: 'failed',
          recordsProcessed: Number(readImportJobStats(existing.statsJson).recordsProcessed || 0),
          recordsCreated: Number(readImportJobStats(existing.statsJson).recordsCreated || 0),
          recordsUpdated: Number(readImportJobStats(existing.statsJson).recordsUpdated || 0),
          recordsSkipped: Number(readImportJobStats(existing.statsJson).recordsSkipped || 0),
          errorMessage: `Cancelled by ${cancelledBy}`,
        }
      })
    }

    res.status(existing.status === 'queued' ? 200 : 202).json({
      message: existing.status === 'queued'
        ? `Job cancelled before execution by ${cancelledBy}.`
        : `Cancellation requested for running job by ${cancelledBy}.`,
      job: cancelled,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/jobs/:id/retry', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const existing = await prisma.importJob.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
      include: {
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        }
      }
    })

    if (!existing) {
      return next(createError(404, 'Import job not found'))
    }

    if (!['failed', 'partial'].includes(existing.status)) {
      return next(createError(400, 'Only failed or partial jobs can be retried'))
    }

    const user = req.user as { email?: string; id: string }
    const retriedBy = user.email || user.id
    const previousStats = readImportJobStats(existing.statsJson)

    const job = await prisma.importJob.create({
      data: {
        tenantId: req.tenantId!,
        sourceId: existing.sourceId,
        entityScope: existing.entityScope,
        mode: existing.mode,
        status: 'queued',
        statsJson: {
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          requestedEntityId: previousStats.requestedEntityId || null,
          requestedBy: retriedBy,
          note: previousStats.note || `Retry of ${existing.id}`,
          retryOf: existing.id,
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
      message: `Retry queued for job ${existing.id}.`,
      job,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

export default router
