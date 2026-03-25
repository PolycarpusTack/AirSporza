import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'
import * as s from '../schemas/fieldConfig.js'

const router = Router()

export function generateFieldId(section: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `custom_${section}_${slug}`
}

// GET /api/fields?section=event
router.get('/', async (req, res, next) => {
  try {
    const section = typeof req.query.section === 'string' ? req.query.section : undefined
    const fields = await prisma.fieldDefinition.findMany({
      where: { tenantId: req.tenantId, ...(section ? { section: section as 'event' | 'crew' | 'contract' } : {}) },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    })
    res.json(fields)
  } catch (error) {
    next(error)
  }
})

// POST /api/fields — admin only
router.post('/', authenticate, authorize('admin'), validate({ body: s.fieldSchema }), async (req, res, next) => {
  try {
    const id = generateFieldId(req.body.section, req.body.name)

    if (req.body.dropdownSourceId) {
      const list = await prisma.dropdownList.findFirst({ where: { id: req.body.dropdownSourceId, tenantId: req.tenantId } })
      if (!list) return next(createError(400, `Dropdown list '${req.body.dropdownSourceId}' not found`))
    }

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.create({
      data: { ...req.body, id, isSystem: false, isCustom: true, createdById: user.id, tenantId: req.tenantId! },
    })

    await writeAuditLog({
      userId: user.id,
      action: 'field.create',
      entityType: 'field_definition',
      entityId: id,
      newValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.status(201).json(field)
  } catch (error) {
    next(error)
  }
})

// PUT /api/fields/order — batch reorder
router.put('/order', authenticate, authorize('admin'), validate({ body: s.fieldOrderSchema }), async (req, res, next) => {
  try {
    // Pre-fetch all field IDs belonging to this tenant
    const tenantFields = await prisma.fieldDefinition.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true },
    })
    const tenantFieldIds = new Set(tenantFields.map(f => f.id))

    // Filter client-supplied IDs to only those belonging to the tenant
    const filtered = (req.body as { id: string; sortOrder: number }[]).filter(({ id }) => tenantFieldIds.has(id))

    await prisma.$transaction(
      filtered.map(({ id, sortOrder }) =>
        prisma.fieldDefinition.update({ where: { id }, data: { sortOrder } })
      )
    )

    res.json({ message: 'Order updated' })
  } catch (error) {
    next(error)
  }
})

// PUT /api/fields/:id — admin only
router.put('/:id', authenticate, authorize('admin'), validate({ body: s.fieldUpdateSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.fieldDefinition.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Field not found'))

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.update({ where: { id: String(req.params.id) }, data: req.body })

    await writeAuditLog({
      userId: user.id,
      action: 'field.update',
      entityType: 'field_definition',
      entityId: String(req.params.id),
      oldValue: existing,
      newValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json(field)
  } catch (error) {
    next(error)
  }
})

// DELETE /api/fields/:id — admin only, cannot delete system fields
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const field = await prisma.fieldDefinition.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId } })
    if (!field) return next(createError(404, 'Field not found'))
    if (field.isSystem) return next(createError(400, 'Cannot delete system fields'))

    const user = req.user as { id: string }
    await prisma.fieldDefinition.delete({ where: { id: String(req.params.id) } })

    await writeAuditLog({
      userId: user.id,
      action: 'field.delete',
      entityType: 'field_definition',
      entityId: String(req.params.id),
      oldValue: field,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      tenantId: req.tenantId,
    })

    res.json({ message: 'Field deleted' })
  } catch (error) {
    next(error)
  }
})


// ── Dropdown Lists ──────────────────────────────────────────────────────────

router.get('/dropdowns', async (req, res, next) => {
  try {
    const lists = await prisma.dropdownList.findMany({
      where: { tenantId: req.tenantId },
      include: { options: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    })
    res.json(lists)
  } catch (error) {
    next(error)
  }
})

router.post('/dropdowns', authenticate, authorize('admin'), validate({ body: s.dropdownCreateSchema }), async (req, res, next) => {
  try {
    const list = await prisma.dropdownList.create({ data: { ...req.body, tenantId: req.tenantId! } })
    res.status(201).json(list)
  } catch (error) {
    next(error)
  }
})

router.post('/dropdowns/:listId/options', authenticate, authorize('admin'), validate({ body: s.dropdownOptionSchema }), async (req, res, next) => {
  try {
    const list = await prisma.dropdownList.findFirst({ where: { id: String(req.params.listId), tenantId: req.tenantId } })
    if (!list) return next(createError(404, 'Dropdown list not found'))

    const option = await prisma.dropdownOption.create({
      data: { ...req.body, listId: String(req.params.listId), tenantId: req.tenantId! },
    })
    res.status(201).json(option)
  } catch (error) {
    next(error)
  }
})

// ── Mandatory Field Configs (per sport) ────────────────────────────────────

router.get('/mandatory/:sportId', validate({ params: s.sportIdParam }), async (req, res, next) => {
  try {
    const config = await prisma.mandatoryFieldConfig.findFirst({
      where: { sportId: Number(req.params.sportId), tenantId: req.tenantId },
    })
    res.json(config ?? { sportId: Number(req.params.sportId), fieldIds: [], conditionalRequired: [] })
  } catch (error) {
    next(error)
  }
})

router.put('/mandatory/:sportId', authenticate, authorize('admin'), validate({ params: s.sportIdParam, body: s.mandatoryFieldSchema }), async (req, res, next) => {
  try {
    const config = await prisma.mandatoryFieldConfig.upsert({
      where: { sportId: Number(req.params.sportId) },
      create: { sportId: Number(req.params.sportId), tenantId: req.tenantId!, ...req.body },
      update: req.body,
    })
    res.json(config)
  } catch (error) {
    next(error)
  }
})

export default router
