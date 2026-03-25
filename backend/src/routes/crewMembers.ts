import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import * as s from '../schemas/crewMembers.js'

const router = Router()

// GET /api/crew-members — list all crew members with optional filters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, role, active } = req.query

    const where: Prisma.CrewMemberWhereInput = { tenantId: req.tenantId }

    if (typeof search === 'string' && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' }
    }

    if (typeof active === 'string') {
      where.isActive = active === 'true'
    }

    const members = await prisma.crewMember.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    // Filter by role in application code since roles is JSON
    if (typeof role === 'string' && role.trim()) {
      const roleFilter = role.trim().toLowerCase()
      const filtered = members.filter((m) => {
        const roles = m.roles as string[]
        return roles.some((r) => r.toLowerCase() === roleFilter)
      })
      return res.json(filtered)
    }

    res.json(members)
  } catch (error) {
    next(error)
  }
})

// GET /api/crew-members/autocomplete?q=...&role=...
router.get('/autocomplete', authenticate, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (q.length < 1) return res.json([])

    const members = await prisma.crewMember.findMany({
      where: {
        tenantId: req.tenantId,
        isActive: true,
        name: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, name: true, roles: true },
      orderBy: { name: 'asc' },
      take: 10,
    })

    // Optional role filter
    const role = typeof req.query.role === 'string' ? req.query.role.trim().toLowerCase() : ''
    if (role) {
      const filtered = members.filter((m) => {
        const roles = m.roles as string[]
        return roles.some((r) => r.toLowerCase() === role)
      })
      return res.json(filtered)
    }

    res.json(members)
  } catch (error) {
    next(error)
  }
})

// POST /api/crew-members — create a crew member
router.post('/', authenticate, validate({ body: s.crewMemberSchema }), async (req, res, next) => {
  try {
    const member = await prisma.crewMember.create({ data: { ...req.body, tenantId: req.tenantId! } })
    res.status(201).json(member)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(createError(409, 'A crew member with this name already exists'))
    }
    next(error)
  }
})

// POST /api/crew-members/extract — scan tech plans and create/update crew members
router.post('/extract', authenticate, async (req, res, next) => {
  try {
    const techPlans = await prisma.techPlan.findMany({
      where: { tenantId: req.tenantId },
      select: { crew: true },
    })

    // Build map: name -> set of roles
    const nameRoles = new Map<string, Set<string>>()
    for (const tp of techPlans) {
      const crew = tp.crew as Record<string, unknown>
      for (const [role, value] of Object.entries(crew)) {
        if (typeof value === 'string' && value.trim()) {
          const name = value.trim()
          if (!nameRoles.has(name)) nameRoles.set(name, new Set())
          nameRoles.get(name)!.add(role)
        } else if (Array.isArray(value)) {
          for (const v of value) {
            if (typeof v === 'string' && v.trim()) {
              const name = v.trim()
              if (!nameRoles.has(name)) nameRoles.set(name, new Set())
              nameRoles.get(name)!.add(role)
            }
          }
        }
      }
    }

    let created = 0
    let updated = 0

    for (const [name, roles] of nameRoles) {
      const rolesArray = Array.from(roles)
      const existing = await prisma.crewMember.findFirst({ where: { name, tenantId: req.tenantId } })
      if (existing) {
        const existingRoles = existing.roles as string[]
        const merged = Array.from(new Set([...existingRoles, ...rolesArray]))
        if (merged.length !== existingRoles.length || !merged.every((r) => existingRoles.includes(r))) {
          await prisma.crewMember.update({
            where: { id: existing.id },
            data: { roles: merged },
          })
          updated++
        }
      } else {
        await prisma.crewMember.create({
          data: { name, roles: rolesArray, tenantId: req.tenantId! },
        })
        created++
      }
    }

    const total = await prisma.crewMember.count({ where: { tenantId: req.tenantId } })
    res.json({ created, updated, total })
  } catch (error) {
    next(error)
  }
})

// POST /api/crew-members/merge — merge sourceId into targetId
router.post('/merge', authenticate, validate({ body: s.mergeSchema }), async (req, res, next) => {
  try {
    const { sourceId, targetId } = req.body
    if (sourceId === targetId) return next(createError(400, 'Source and target must be different'))

    const [source, target] = await Promise.all([
      prisma.crewMember.findFirst({ where: { id: sourceId, tenantId: req.tenantId } }),
      prisma.crewMember.findFirst({ where: { id: targetId, tenantId: req.tenantId } }),
    ])

    if (!source) return next(createError(404, 'Source crew member not found'))
    if (!target) return next(createError(404, 'Target crew member not found'))

    // Merge roles
    const sourceRoles = source.roles as string[]
    const targetRoles = target.roles as string[]
    const mergedRoles = Array.from(new Set([...targetRoles, ...sourceRoles]))

    // Perform merge in a single transaction
    const planUpdates = await prisma.$transaction(async (tx) => {
      const techPlans = await tx.techPlan.findMany({ where: { tenantId: req.tenantId }, select: { id: true, crew: true } })
      let updates = 0

      for (const tp of techPlans) {
        const crew = tp.crew as Record<string, unknown>
        let changed = false
        const updatedCrew: Record<string, unknown> = {}

        for (const [role, val] of Object.entries(crew)) {
          if (typeof val === 'string' && val.trim() === source.name) {
            updatedCrew[role] = target.name
            changed = true
          } else if (Array.isArray(val)) {
            const newArr = val.map((v: unknown) =>
              typeof v === 'string' && v.trim() === source.name ? target.name : v
            )
            updatedCrew[role] = newArr
            if (JSON.stringify(newArr) !== JSON.stringify(val)) changed = true
          } else {
            updatedCrew[role] = val
          }
        }

        if (changed) {
          await tx.techPlan.update({
            where: { id: tp.id },
            data: { crew: updatedCrew as Prisma.InputJsonValue },
          })
          updates++
        }
      }

      // Update target roles and delete source
      await tx.crewMember.update({
        where: { id: targetId },
        data: { roles: mergedRoles },
      })
      await tx.crewMember.delete({ where: { id: sourceId } })

      return updates
    })

    res.json({ merged: true, targetId, planUpdates })
  } catch (error) {
    next(error)
  }
})

// PUT /api/crew-members/:id — update a crew member
router.put('/:id', authenticate, validate({ params: s.idParam, body: s.crewMemberUpdateSchema }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)

    const existing = await prisma.crewMember.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Crew member not found'))

    const member = await prisma.crewMember.update({ where: { id: existing.id }, data: req.body })
    res.json(member)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(createError(409, 'A crew member with this name already exists'))
    }
    next(error)
  }
})

// DELETE /api/crew-members/:id — delete a crew member
router.delete('/:id', authenticate, validate({ params: s.idParam }), async (req, res, next) => {
  try {
    const id = Number(req.params.id)

    const toDelete = await prisma.crewMember.findFirst({ where: { id, tenantId: req.tenantId } })
    if (!toDelete) return next(createError(404, 'Crew member not found'))
    await prisma.crewMember.delete({ where: { id: toDelete.id } })
    res.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return next(createError(404, 'Crew member not found'))
    }
    next(error)
  }
})

export default router
