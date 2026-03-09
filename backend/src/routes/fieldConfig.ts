import { Router } from 'express'
import Joi from 'joi'
import { prisma } from '../db/prisma.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { writeAuditLog } from '../utils/audit.js'

const router = Router()

export function generateFieldId(section: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `custom_${section}_${slug}`
}

const fieldSchema = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().required(),
  fieldType: Joi.string().valid('text', 'number', 'date', 'time', 'dropdown', 'checkbox', 'textarea').required(),
  section: Joi.string().valid('event', 'crew', 'contract').required(),
  required: Joi.boolean().default(false),
  sortOrder: Joi.number().integer().default(0),
  options: Joi.array().items(Joi.string()).default([]),
  dropdownSourceId: Joi.string().allow(null, '').default(null),
  defaultValue: Joi.string().allow(null, '').default(null),
  conditionalRules: Joi.array().default([]),
  visibleByRoles: Joi.array().items(Joi.string().valid('admin', 'planner', 'sports', 'contracts')).default([]),
  visible: Joi.boolean().default(true),
})

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
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = fieldSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const id = generateFieldId(value.section, value.name)

    if (value.dropdownSourceId) {
      const list = await prisma.dropdownList.findFirst({ where: { id: value.dropdownSourceId, tenantId: req.tenantId } })
      if (!list) return next(createError(400, `Dropdown list '${value.dropdownSourceId}' not found`))
    }

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.create({
      data: { ...value, id, isSystem: false, isCustom: true, createdById: user.id, tenantId: req.tenantId! },
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
router.put('/order', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.array().items(
      Joi.object({ id: Joi.string().required(), sortOrder: Joi.number().integer().required() })
    )
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    await prisma.$transaction(
      (value as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
        prisma.fieldDefinition.update({ where: { id }, data: { sortOrder } })
      )
    )

    res.json({ message: 'Order updated' })
  } catch (error) {
    next(error)
  }
})

// PUT /api/fields/:id — admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.fieldDefinition.findFirst({ where: { id: String(req.params.id), tenantId: req.tenantId } })
    if (!existing) return next(createError(404, 'Field not found'))

    const updateSchema = Joi.object({
      label: Joi.string(),
      required: Joi.boolean(),
      sortOrder: Joi.number().integer(),
      visible: Joi.boolean(),
      options: Joi.array().items(Joi.string()),
      conditionalRules: Joi.array(),
      visibleByRoles: Joi.array().items(Joi.string()),
    })

    const { error, value } = updateSchema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const user = req.user as { id: string }
    const field = await prisma.fieldDefinition.update({ where: { id: String(req.params.id) }, data: value })

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

router.post('/dropdowns', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().allow('', null),
      managedBy: Joi.string().valid('admin', 'planner', 'sports', 'contracts').default('admin'),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const list = await prisma.dropdownList.create({ data: { ...value, tenantId: req.tenantId! } })
    res.status(201).json(list)
  } catch (error) {
    next(error)
  }
})

router.post('/dropdowns/:listId/options', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const list = await prisma.dropdownList.findFirst({ where: { id: String(req.params.listId), tenantId: req.tenantId } })
    if (!list) return next(createError(404, 'Dropdown list not found'))

    const schema = Joi.object({
      value: Joi.string().required(),
      label: Joi.string().required(),
      parentId: Joi.string().allow(null, '').default(null),
      sortOrder: Joi.number().integer().default(0),
      metadata: Joi.object().default({}),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const option = await prisma.dropdownOption.create({
      data: { ...value, listId: String(req.params.listId), tenantId: req.tenantId! },
    })
    res.status(201).json(option)
  } catch (error) {
    next(error)
  }
})

// ── Mandatory Field Configs (per sport) ────────────────────────────────────

router.get('/mandatory/:sportId', async (req, res, next) => {
  try {
    const config = await prisma.mandatoryFieldConfig.findFirst({
      where: { sportId: Number(req.params.sportId), tenantId: req.tenantId },
    })
    res.json(config ?? { sportId: Number(req.params.sportId), fieldIds: [], conditionalRequired: [] })
  } catch (error) {
    next(error)
  }
})

router.put('/mandatory/:sportId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const schema = Joi.object({
      fieldIds: Joi.array().items(Joi.string()).required(),
      conditionalRequired: Joi.array().default([]),
    })
    const { error, value } = schema.validate(req.body)
    if (error) return next(createError(400, error.details[0].message))

    const config = await prisma.mandatoryFieldConfig.upsert({
      where: { sportId: Number(req.params.sportId) },
      create: { sportId: Number(req.params.sportId), tenantId: req.tenantId!, ...value },
      update: value,
    })
    res.json(config)
  } catch (error) {
    next(error)
  }
})

export default router
