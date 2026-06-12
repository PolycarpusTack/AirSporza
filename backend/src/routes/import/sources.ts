import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createError } from '../../middleware/errorHandler.js'
import { getImportSourceRuntimeStatus } from '../../import/adapters/index.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import * as s from '../../schemas/import.js'
import { buildRateLimitStatus } from './shared.js'

const router = Router()

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

router.get('/sources', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const sources = await prisma.importSource.findMany({
      where: { tenantId: req.tenantId },
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

router.patch('/sources/:id', authenticate, authorize('admin'), validate({ body: s.sourceUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.importSource.findFirst({
      where: { id: String(req.params.id), tenantId: req.tenantId },
    })
    if (!existing) {
      return next(createError(404, 'Import source not found'))
    }

    const source = await prisma.importSource.update({
      where: { id: existing.id },
      data: req.body,
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

export default router
