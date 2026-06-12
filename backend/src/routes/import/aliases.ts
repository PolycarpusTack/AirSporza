import { Router } from 'express'
import { prisma } from '../../db/prisma.js'
import { authenticate, authorize } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { createError } from '../../middleware/errorHandler.js'
import { normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import * as s from '../../schemas/import.js'

const router = Router()

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

router.get('/aliases', authenticate, authorize('planner', 'sports', 'admin'), async (req, res, next) => {
  try {
    const type = String(req.query.type || '')
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const include = getAliasInclude(type)

    if (!include) {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    const where: Record<string, unknown> = { tenantId: req.tenantId }
    if (req.query.sourceId) where.sourceId = String(req.query.sourceId)

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

router.post('/aliases/:type', authenticate, authorize('planner', 'sports', 'admin'), validate({ body: s.aliasSchema }), async (req, res, next) => {
  try {
    const type = String(req.params.type)
    const delegate = getAliasDelegate(type)
    if (!delegate) {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    const value = req.body

    const normalizedAlias = normalizeAlias(value.alias)

    // NOTE: where keys use tenant-scoped compound unique (tenantId_sourceId_normalizedAlias).
    // Prisma client types update after `npx prisma generate` post-migration.
    if (type === 'team') {
      const alias = await (prisma.teamAlias.upsert as any)({
        where: {
          tenantId_sourceId_normalizedAlias: {
            tenantId: req.tenantId!,
            sourceId: value.sourceId || null,
            normalizedAlias,
          }
        },
        create: {
          tenantId: req.tenantId!,
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
      const alias = await (prisma.competitionAlias.upsert as any)({
        where: {
          tenantId_sourceId_normalizedAlias: {
            tenantId: req.tenantId!,
            sourceId: value.sourceId || null,
            normalizedAlias,
          }
        },
        create: {
          tenantId: req.tenantId!,
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

    const alias = await (prisma.venueAlias.upsert as any)({
      where: {
        tenantId_sourceId_normalizedAlias: {
          tenantId: req.tenantId!,
          sourceId: value.sourceId || null,
          normalizedAlias,
        }
      },
      create: {
        tenantId: req.tenantId!,
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
    const aliasId = String(req.params.id)

    if (type === 'team') {
      const alias = await prisma.teamAlias.findFirst({ where: { id: aliasId, tenantId: req.tenantId } })
      if (!alias) return next(createError(404, 'Alias not found'))
      await prisma.teamAlias.delete({ where: { id: alias.id } })
    } else if (type === 'competition') {
      const alias = await prisma.competitionAlias.findFirst({ where: { id: aliasId, tenantId: req.tenantId } })
      if (!alias) return next(createError(404, 'Alias not found'))
      await prisma.competitionAlias.delete({ where: { id: alias.id } })
    } else if (type === 'venue') {
      const alias = await prisma.venueAlias.findFirst({ where: { id: aliasId, tenantId: req.tenantId } })
      if (!alias) return next(createError(404, 'Alias not found'))
      await prisma.venueAlias.delete({ where: { id: alias.id } })
    } else {
      return next(createError(400, 'Alias type must be team, competition, or venue'))
    }

    res.json({ message: 'Alias deleted successfully' })
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

export default router
