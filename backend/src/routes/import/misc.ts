import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import { buildRateLimitStatus } from './shared.js'

const router = Router()

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

router.get('/metrics', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const tid = req.tenantId
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
        where: { tenantId: tid },
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
        where: { tenantId: tid, status: { in: ['queued', 'running'] } }
      }),
      prisma.importJob.count({
        where: {
          tenantId: tid,
          status: { in: ['completed', 'partial'] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.mergeCandidate.count({
        where: { tenantId: tid, status: 'pending' }
      }),
      prisma.importDeadLetter.count({
        where: { tenantId: tid, resolvedAt: null }
      }),
      prisma.syncHistory.count({
        where: {
          tenantId: tid,
          syncType: 'manual',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.importRecord.count({ where: { tenantId: tid } }),
      prisma.importSourceLink.count({ where: { tenantId: tid } }),
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
