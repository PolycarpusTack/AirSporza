import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { getImportSourceRuntimeStatus } from '../import/adapters/index.js'
import type { CanonicalImportEvent } from '../import/types.js'
import { mergeImportJobStats, readImportJobStats } from '../import/services/ImportJobState.js'
import { manualCreateNormalizedEvent, manualMergeNormalizedEvent } from '../import/services/ImportJobRunner.js'
import { ensureImportSchemaReady, normalizeImportSchemaError } from '../import/services/ImportSchemaService.js'

const router = Router()
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const sourceUpdateSchema = Joi.object({
  isEnabled: Joi.boolean(),
  priority: Joi.number().integer().min(1).max(999),
  rateLimitPerMinute: Joi.number().integer().min(1).allow(null),
  rateLimitPerDay: Joi.number().integer().min(1).allow(null),
}).min(1)

const createJobSchema = Joi.object({
  sourceCode: Joi.string().required(),
  entityScope: Joi.string().valid('sports', 'competitions', 'teams', 'events', 'fixtures', 'live').required(),
  mode: Joi.string().valid('full', 'incremental', 'backfill').default('incremental'),
  entityId: Joi.alternatives(Joi.string(), Joi.number()).allow(null),
  note: Joi.string().allow('').max(500),
})

const mergeDecisionSchema = Joi.object({
  targetEntityId: Joi.alternatives(Joi.string(), Joi.number()).allow(null),
})

const aliasSchema = Joi.object({
  canonicalId: Joi.string().required(),
  alias: Joi.string().trim().min(2).required(),
  sourceId: Joi.string().allow(null, ''),
})

const buildWindowUsage = (
  limit: number | null,
  used: number,
  resetAt: Date | null
) => ({
  limit,
  used,
  remaining: limit == null ? null : Math.max(limit - used, 0),
  resetAt,
})

const buildRateLimitStatus = (source: {
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  rateLimits?: {
    requestsThisMinute: number
    requestsThisDay: number
    minuteWindowStart: Date
    dayWindowStart: Date
    lastRequestAt: Date | null
  } | null
}) => {
  const now = Date.now()
  const state = source.rateLimits
  const minuteWindowActive = state ? now - state.minuteWindowStart.getTime() < MINUTE_MS : false
  const dayWindowActive = state ? now - state.dayWindowStart.getTime() < DAY_MS : false
  const minuteUsed = state && minuteWindowActive ? state.requestsThisMinute : 0
  const dayUsed = state && dayWindowActive ? state.requestsThisDay : 0

  return {
    minute: buildWindowUsage(
      source.rateLimitPerMinute,
      minuteUsed,
      source.rateLimitPerMinute == null
        ? null
        : new Date((state?.minuteWindowStart.getTime() ?? now) + MINUTE_MS)
    ),
    day: buildWindowUsage(
      source.rateLimitPerDay,
      dayUsed,
      source.rateLimitPerDay == null
        ? null
        : new Date((state?.dayWindowStart.getTime() ?? now) + DAY_MS)
    ),
    lastRequestAt: state?.lastRequestAt ?? null,
  }
}

const sanitizeSource = (source: {
  id: string
  code: string
  name: string
  kind: string
  priority: number
  isEnabled: boolean
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  lastFetchAt: Date | null
  createdAt: Date
  configJson: unknown
  rateLimits?: {
    requestsThisMinute: number
    requestsThisDay: number
    minuteWindowStart: Date
    dayWindowStart: Date
    lastRequestAt: Date | null
  } | null
  _count?: {
    jobs: number
    deadLetters: number
    records: number
    sourceLinks: number
  }
}) => {
  const runtime = getImportSourceRuntimeStatus({
    code: source.code as 'football_data' | 'the_sports_db' | 'api_football' | 'statsbomb_open',
    configJson: source.configJson,
    kind: source.kind as 'api' | 'file',
  })

  return {
    id: source.id,
    code: source.code,
    name: source.name,
    kind: source.kind,
    priority: source.priority,
    isEnabled: source.isEnabled,
    rateLimitPerMinute: source.rateLimitPerMinute,
    rateLimitPerDay: source.rateLimitPerDay,
    lastFetchAt: source.lastFetchAt,
    createdAt: source.createdAt,
    hasCredentials: runtime.configStatus.hasCredentials,
    capabilities: runtime.capabilities,
    configStatus: runtime.configStatus,
    rateLimitStatus: buildRateLimitStatus(source),
    stats: {
      jobs: source._count?.jobs ?? 0,
      deadLetters: source._count?.deadLetters ?? 0,
      records: source._count?.records ?? 0,
      sourceLinks: source._count?.sourceLinks ?? 0,
    },
  }
}

const normalizeAlias = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

const getAliasDelegate = (type: string) => {
  switch (type) {
    case 'team':
      return prisma.teamAlias
    case 'competition':
      return prisma.competitionAlias
    case 'venue':
      return prisma.venueAlias
    default:
      return null
  }
}

const getAliasInclude = (type: string) => {
  switch (type) {
    case 'team':
      return {
        canonicalTeam: {
          select: {
            id: true,
            primaryName: true,
          }
        },
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        }
      }
    case 'competition':
      return {
        canonicalCompetition: {
          select: {
            id: true,
            primaryName: true,
          }
        },
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        }
      }
    case 'venue':
      return {
        canonicalVenue: {
          select: {
            id: true,
            primaryName: true,
          }
        },
        source: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        }
      }
    default:
      return undefined
  }
}

function isCanonicalImportEvent(value: unknown): value is {
  sportName: string
  competitionName: string
  startsAtUtc: string
  metadata: Record<string, unknown>
  externalKeys?: Array<{ source: 'football_data' | 'the_sports_db' | 'api_football' | 'statsbomb_open'; id: string }>
  sourceTimezone?: string
  homeTeam?: string
  awayTeam?: string
  participantsText?: string
  venueName?: string
  country?: string
  scoreHome?: number
  scoreAway?: number
  winner?: string
  minute?: number
  seasonLabel?: string
  stage?: string
  status: 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled'
} {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).sportName === 'string' &&
    typeof (value as Record<string, unknown>).competitionName === 'string' &&
    typeof (value as Record<string, unknown>).startsAtUtc === 'string'
  )
}

function toCanonicalImportEvent(value: unknown): CanonicalImportEvent | null {
  if (!isCanonicalImportEvent(value)) {
    return null
  }

  return {
    ...value,
    externalKeys: value.externalKeys || [],
  }
}

router.use(async (_req, _res, next) => {
  try {
    await ensureImportSchemaReady()
    next()
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

// Search unlinked import records (for "Link from Import" in event form)
router.get('/records/unlinked', authenticate, async (req, res, next) => {
  try {
    const { search, entityType, limit } = req.query
    const take = Math.min(Number(limit) || 20, 50)

    const where: any = {
      entityType: entityType || 'event',
      validationStatus: { in: ['valid', 'pending'] },
      isSuperseded: false,
      // Unlinked: no approved merge candidate
      mergeCandidates: {
        none: { status: 'approved' },
      },
    }

    if (search) {
      const q = String(search)
      where.OR = [
        { normalizedJson: { path: ['participantsText'], string_contains: q } },
        { normalizedJson: { path: ['homeTeam'], string_contains: q } },
        { normalizedJson: { path: ['awayTeam'], string_contains: q } },
        { normalizedJson: { path: ['competitionName'], string_contains: q } },
        { sourceRecordId: { contains: q } },
      ]
    }

    const records = await prisma.importRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        sourceRecordId: true,
        entityType: true,
        normalizedJson: true,
        validationStatus: true,
        createdAt: true,
        source: { select: { code: true, name: true } },
      },
    })

    res.json(records)
  } catch (error) {
    next(error)
  }
})

router.get('/sources', authenticate, authorize('planner', 'sports', 'admin'), async (_req, res, next) => {
  try {
    const sources = await prisma.importSource.findMany({
      include: {
        rateLimits: true,
        _count: {
          select: {
            jobs: true,
            deadLetters: true,
            records: true,
            sourceLinks: true,
          }
        }
      },
      orderBy: [
        { priority: 'asc' },
        { name: 'asc' }
      ]
    })

    res.json(sources.map(sanitizeSource))
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.patch('/sources/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = sourceUpdateSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const source = await prisma.importSource.update({
      where: { id: String(req.params.id) },
      data: value,
      include: {
        _count: {
          select: {
            jobs: true,
            deadLetters: true,
            records: true,
            sourceLinks: true,
          }
        }
      }
    })

    res.json(sanitizeSource(source))
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.get('/jobs', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    const where: Record<string, unknown> = {}

    if (req.query.status) {
      where.status = req.query.status
    }

    if (req.query.sourceCode) {
      where.source = { code: req.query.sourceCode }
    }

    if (req.query.entityScope) {
      where.entityScope = req.query.entityScope
    }

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
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    res.json(jobs)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.get('/jobs/:id', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({
      where: { id: String(req.params.id) },
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

router.get('/merge-candidates', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const where: Record<string, unknown> = {}

    if (req.query.status) {
      where.status = req.query.status
    }

    if (req.query.entityType) {
      where.entityType = req.query.entityType
    }

    const candidates = await prisma.mergeCandidate.findMany({
      where,
      include: {
        importRecord: {
          include: {
            source: {
              select: {
                id: true,
                code: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    res.json(candidates)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/merge-candidates/:id/approve-merge', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = mergeDecisionSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const candidate = await prisma.mergeCandidate.findUnique({
      where: { id: String(req.params.id) },
      include: {
        importRecord: true,
      }
    })

    if (!candidate) {
      return next(createError(404, 'Merge candidate not found'))
    }

    if (candidate.entityType !== 'event') {
      return next(createError(400, 'Only event merge candidates are currently reviewable'))
    }

    const normalized = toCanonicalImportEvent(candidate.importRecord.normalizedJson)
    if (!normalized) {
      return next(createError(400, 'Merge candidate does not contain a replayable normalized event'))
    }

    const targetEntityId = value.targetEntityId != null
      ? Number(value.targetEntityId)
      : candidate.suggestedEntityId
        ? Number(candidate.suggestedEntityId)
        : null

    if (!targetEntityId) {
      return next(createError(400, 'A target event id is required to approve this merge'))
    }

    const event = await manualMergeNormalizedEvent({
      sourceId: candidate.importRecord.sourceId,
      sourceRecordId: candidate.importRecord.sourceRecordId,
      sourceUpdatedAt: candidate.importRecord.sourceUpdatedAt,
      normalized,
      targetEventId: targetEntityId,
    })

    const user = req.user as { email?: string; id: string }
    const reviewedBy = user.email || user.id

    const updatedCandidate = await prisma.mergeCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'approved_merge',
        suggestedEntityId: String(targetEntityId),
        reviewedBy,
        reviewedAt: new Date(),
      }
    })

    res.json({
      message: `Merge candidate ${candidate.id} was merged into event ${targetEntityId}.`,
      candidate: updatedCandidate,
      event,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/merge-candidates/:id/create-new', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const candidate = await prisma.mergeCandidate.findUnique({
      where: { id: String(req.params.id) },
      include: {
        importRecord: true,
      }
    })

    if (!candidate) {
      return next(createError(404, 'Merge candidate not found'))
    }

    if (candidate.entityType !== 'event') {
      return next(createError(400, 'Only event merge candidates are currently reviewable'))
    }

    const normalized = toCanonicalImportEvent(candidate.importRecord.normalizedJson)
    if (!normalized) {
      return next(createError(400, 'Merge candidate does not contain a replayable normalized event'))
    }

    const event = await manualCreateNormalizedEvent({
      sourceId: candidate.importRecord.sourceId,
      sourceRecordId: candidate.importRecord.sourceRecordId,
      sourceUpdatedAt: candidate.importRecord.sourceUpdatedAt,
      normalized,
    })

    const user = req.user as { email?: string; id: string }
    const reviewedBy = user.email || user.id

    const updatedCandidate = await prisma.mergeCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'create_new',
        suggestedEntityId: String(event.id),
        reviewedBy,
        reviewedAt: new Date(),
      }
    })

    res.json({
      message: `Merge candidate ${candidate.id} created event ${event.id}.`,
      candidate: updatedCandidate,
      event,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/merge-candidates/:id/ignore', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const existing = await prisma.mergeCandidate.findUnique({
      where: { id: String(req.params.id) },
    })

    if (!existing) {
      return next(createError(404, 'Merge candidate not found'))
    }

    const user = req.user as { email?: string; id: string }
    const reviewedBy = user.email || user.id

    const candidate = await prisma.mergeCandidate.update({
      where: { id: existing.id },
      data: {
        status: 'ignored',
        reviewedBy,
        reviewedAt: new Date(),
      }
    })

    res.json({
      message: `Merge candidate ${candidate.id} ignored.`,
      candidate,
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/jobs', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = createJobSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

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
    const now = new Date()
    const entityId = value.entityId == null ? null : String(value.entityId)
    const note = value.note?.trim()

    const result = await prisma.importJob.create({
      data: {
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
    const existing = await prisma.importJob.findUnique({
      where: { id: String(req.params.id) },
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
    const existing = await prisma.importJob.findUnique({
      where: { id: String(req.params.id) },
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

router.get('/dead-letters', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const where: Record<string, unknown> = {}

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
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    res.json(deadLetters)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/dead-letters/:id/replay', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const deadLetter = await prisma.importDeadLetter.findUnique({
      where: { id: String(req.params.id) },
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

router.get('/aliases', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const type = String(req.query.type || '')
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const include = getAliasInclude(type)

    if (!include) {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    const where = req.query.sourceId ? { sourceId: String(req.query.sourceId) } : undefined
    if (type === 'team') {
      return res.json(await prisma.teamAlias.findMany({
        where,
        include,
        orderBy: { alias: 'asc' },
        take: limit,
      }))
    }

    if (type === 'competition') {
      return res.json(await prisma.competitionAlias.findMany({
        where,
        include,
        orderBy: { alias: 'asc' },
        take: limit,
      }))
    }

    if (type === 'venue') {
      return res.json(await prisma.venueAlias.findMany({
        where,
        include,
        orderBy: { alias: 'asc' },
        take: limit,
      }))
    }

    return next(createError(400, 'Alias type must be team, competition, or venue'))
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/aliases/:type', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const type = String(req.params.type)
    const delegate = getAliasDelegate(type)
    if (!delegate) {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    const { error, value } = aliasSchema.validate(req.body)
    if (error) {
      return next(createError(400, error.details[0].message))
    }

    const normalizedAlias = normalizeAlias(value.alias)

    if (type === 'team') {
      const alias = await prisma.teamAlias.upsert({
        where: {
          sourceId_normalizedAlias: {
            sourceId: value.sourceId || null,
            normalizedAlias,
          }
        },
        create: {
          canonicalTeamId: value.canonicalId,
          sourceId: value.sourceId || null,
          alias: value.alias,
          normalizedAlias,
        },
        update: {
          canonicalTeamId: value.canonicalId,
          alias: value.alias,
        },
        include: getAliasInclude(type),
      })
      return res.status(201).json(alias)
    }

    if (type === 'competition') {
      const alias = await prisma.competitionAlias.upsert({
        where: {
          sourceId_normalizedAlias: {
            sourceId: value.sourceId || null,
            normalizedAlias,
          }
        },
        create: {
          canonicalCompetitionId: value.canonicalId,
          sourceId: value.sourceId || null,
          alias: value.alias,
          normalizedAlias,
        },
        update: {
          canonicalCompetitionId: value.canonicalId,
          alias: value.alias,
        },
        include: getAliasInclude(type),
      })
      return res.status(201).json(alias)
    }

    const alias = await prisma.venueAlias.upsert({
      where: {
        sourceId_normalizedAlias: {
          sourceId: value.sourceId || null,
          normalizedAlias,
        }
      },
      create: {
        canonicalVenueId: value.canonicalId,
        sourceId: value.sourceId || null,
        alias: value.alias,
        normalizedAlias,
      },
      update: {
        canonicalVenueId: value.canonicalId,
        alias: value.alias,
      },
      include: getAliasInclude(type),
    })

    res.status(201).json(alias)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.delete('/aliases/:type/:id', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const type = String(req.params.type)

    if (type === 'team') {
      await prisma.teamAlias.delete({ where: { id: String(req.params.id) } })
    } else if (type === 'competition') {
      await prisma.competitionAlias.delete({ where: { id: String(req.params.id) } })
    } else if (type === 'venue') {
      await prisma.venueAlias.delete({ where: { id: String(req.params.id) } })
    } else {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    res.json({ message: 'Alias deleted successfully' })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.get('/provenance/:entityType/:entityId', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const entityType = String(req.params.entityType)
    const entityId = String(req.params.entityId)

    const records = await prisma.fieldProvenance.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: [
        { fieldName: 'asc' },
        { importedAt: 'desc' },
      ]
    })

    const sourceIds = [...new Set(records.map(record => record.sourceId))]
    const sources = sourceIds.length > 0
      ? await prisma.importSource.findMany({
          where: { id: { in: sourceIds } },
          select: {
            id: true,
            code: true,
            name: true,
          }
        })
      : []
    const sourceMap = new Map(sources.map(source => [source.id, source]))

    res.json(records.map(record => ({
      ...record,
      source: sourceMap.get(record.sourceId) || null,
    })))
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.get('/metrics', authenticate, authorize('planner', 'sports', 'admin'), async (_req, res, next) => {
  try {
    const [
      sources,
      pendingJobs,
      completedJobs24h,
      pendingReviews,
      unresolvedDeadLetters,
      manualSyncs24h,
      totalImportRecords,
      totalLinkedRecords,
    ] = await Promise.all([
      prisma.importSource.findMany({
        orderBy: [{ priority: 'asc' }, { name: 'asc' }],
        include: {
          rateLimits: true,
          _count: {
            select: {
              jobs: true,
              records: true,
              deadLetters: true,
              sourceLinks: true,
            }
          }
        }
      }),
      prisma.importJob.count({
        where: { status: { in: ['queued', 'running'] } }
      }),
      prisma.importJob.count({
        where: {
          status: { in: ['completed', 'partial'] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.mergeCandidate.count({
        where: { status: 'pending' }
      }),
      prisma.importDeadLetter.count({
        where: { resolvedAt: null }
      }),
      prisma.syncHistory.count({
        where: {
          syncType: 'manual',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.importRecord.count(),
      prisma.importSourceLink.count(),
    ])

    const overallLinkCoverage = totalImportRecords > 0
      ? Number(((totalLinkedRecords / totalImportRecords) * 100).toFixed(2))
      : 0
    const reviewRate = totalImportRecords > 0
      ? Number(((pendingReviews / totalImportRecords) * 100).toFixed(2))
      : 0
    const deadLetterRate = totalImportRecords > 0
      ? Number(((unresolvedDeadLetters / totalImportRecords) * 100).toFixed(2))
      : 0

    res.json({
      totals: {
        sources: sources.length,
        enabledSources: sources.filter((source: { isEnabled: boolean }) => source.isEnabled).length,
        pendingJobs,
        completedJobs24h,
        pendingReviews,
        unresolvedDeadLetters,
        manualSyncs24h,
      },
      quality: {
        totalImportRecords,
        totalLinkedRecords,
        overallLinkCoverage,
        reviewRate,
        deadLetterRate,
      },
      sources: sources.map((source: {
        id: string
        code: string
        name: string
        isEnabled: boolean
        priority: number
        lastFetchAt: Date | null
        rateLimitPerMinute: number | null
        rateLimitPerDay: number | null
        rateLimits: {
          requestsThisMinute: number
          requestsThisDay: number
          minuteWindowStart: Date
          dayWindowStart: Date
          lastRequestAt: Date | null
        } | null
        _count: {
          jobs: number
          records: number
          deadLetters: number
          sourceLinks: number
        }
      }) => ({
        id: source.id,
        code: source.code,
        name: source.name,
        isEnabled: source.isEnabled,
        priority: source.priority,
        lastFetchAt: source.lastFetchAt,
        rateLimitStatus: buildRateLimitStatus(source),
        jobs: source._count.jobs,
        records: source._count.records,
        deadLetters: source._count.deadLetters,
        quality: {
          linkCoverage: source._count.records > 0
            ? Number(((source._count.sourceLinks / source._count.records) * 100).toFixed(2))
            : 0,
          deadLetterRate: source._count.records > 0
            ? Number(((source._count.deadLetters / source._count.records) * 100).toFixed(2))
            : 0,
        }
      }))
    })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

export default router
