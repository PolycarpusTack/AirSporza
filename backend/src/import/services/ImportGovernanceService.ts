import { prisma } from '../../db/prisma.js'
import { FIELD_SOURCE_PRIORITY, PROTECTED_FIELDS, type EntityType, type SourceCode } from '../types.js'

type GovernedEntityType = Extract<EntityType, 'competition' | 'team' | 'event'>

export function isProtectedImportedField(fieldName: string) {
  return PROTECTED_FIELDS.includes(fieldName)
}

export async function getFieldSourceCodes(entityType: GovernedEntityType, entityId: string) {
  const records = await prisma.fieldProvenance.findMany({
    where: {
      entityType,
      entityId,
    }
  })

  const sourceIds = [...new Set(records.map(record => record.sourceId))]
  const sources = sourceIds.length > 0
    ? await prisma.importSource.findMany({
        where: {
          id: { in: sourceIds }
        },
        select: {
          id: true,
          code: true,
        }
      })
    : []

  const sourceMap = new Map(sources.map(source => [source.id, source.code as SourceCode]))
  return Object.fromEntries(
    records.map(record => [record.fieldName, sourceMap.get(record.sourceId) || null])
  ) as Record<string, SourceCode | null>
}

export function shouldApplyImportedField(
  fieldName: string,
  incomingSourceCode: SourceCode,
  currentSourceCode?: SourceCode | null
) {
  if (isProtectedImportedField(fieldName)) {
    return false
  }

  if (!currentSourceCode) {
    return true
  }

  const priority = FIELD_SOURCE_PRIORITY[fieldName]
  if (!priority || priority.length === 0) {
    return true
  }

  const incomingIndex = priority.indexOf(incomingSourceCode)
  const currentIndex = priority.indexOf(currentSourceCode)

  if (incomingIndex === -1) {
    return currentIndex === -1
  }

  if (currentIndex === -1) {
    return true
  }

  return incomingIndex <= currentIndex
}

export async function recordFieldProvenance(params: {
  entityType: GovernedEntityType
  entityId: string
  fieldNames: string[]
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt?: Date | null
}) {
  const { entityType, entityId, fieldNames, sourceId, sourceRecordId, sourceUpdatedAt } = params

  await Promise.all(fieldNames.map(fieldName =>
    prisma.fieldProvenance.upsert({
      where: {
        entityType_entityId_fieldName: {
          entityType,
          entityId,
          fieldName,
        }
      },
      create: {
        entityType,
        entityId,
        fieldName,
        sourceId,
        sourceRecordId,
        sourceUpdatedAt: sourceUpdatedAt || null,
      },
      update: {
        sourceId,
        sourceRecordId,
        sourceUpdatedAt: sourceUpdatedAt || null,
        importedAt: new Date(),
      }
    })
  ))
}
