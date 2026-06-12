import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createError } from '../../middleware/errorHandler.js'
import type { CanonicalImportEvent } from '../../import/types.js'
import { manualCreateNormalizedEvent, manualMergeNormalizedEvent } from '../../import/services/ImportJobRunner.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import { getOffsetPagination, paginationEnvelope } from '../../utils/pagination.js'
import * as s from '../../schemas/import.js'

const router = Router()

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

router.get('/merge-candidates', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const where: Record<string, unknown> = { tenantId: req.tenantId }

    if (req.query.status) {
      where.status = req.query.status
    }

    if (req.query.entityType) {
      where.entityType = req.query.entityType
    }

    const pagination = getOffsetPagination(req.query.offset, limit)
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
      orderBy: pagination ? [{ createdAt: 'desc' }, { id: 'asc' }] : { createdAt: 'desc' },
      take: limit,
      ...(pagination ? { skip: pagination.offset } : {}),
    })

    if (pagination) {
      const total = await prisma.mergeCandidate.count({ where })
      return res.json(paginationEnvelope(candidates, total, pagination))
    }
    res.json(candidates)
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.post('/merge-candidates/:id/approve-merge', authenticate, authorize('planner', 'sports', 'admin'), validate({ body: s.mergeDecisionSchema }), async (req, res, next) => {
  try {
    const candidate = await prisma.mergeCandidate.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
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

    const targetEntityId = req.body.targetEntityId != null
      ? Number(req.body.targetEntityId)
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
      tenantId: req.tenantId,
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
    const candidate = await prisma.mergeCandidate.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
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
      tenantId: req.tenantId,
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
    const existing = await prisma.mergeCandidate.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
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

export default router
