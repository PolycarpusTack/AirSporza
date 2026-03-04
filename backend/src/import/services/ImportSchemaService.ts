import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { createError, type AppError } from '../../middleware/errorHandler.js'

const REQUIRED_IMPORT_TABLES = [
  'ImportSource',
  'ImportJob',
  'ImportRecord',
  'ImportSourceLink',
  'MergeCandidate',
  'ImportDeadLetter',
  'SyncHistory',
] as const

export async function ensureImportSchemaReady() {
  const [row] = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(`
    SELECT
      to_regclass('public."ImportSource"')::text AS "ImportSource",
      to_regclass('public."ImportJob"')::text AS "ImportJob",
      to_regclass('public."ImportRecord"')::text AS "ImportRecord",
      to_regclass('public."ImportSourceLink"')::text AS "ImportSourceLink",
      to_regclass('public."MergeCandidate"')::text AS "MergeCandidate",
      to_regclass('public."ImportDeadLetter"')::text AS "ImportDeadLetter",
      to_regclass('public."SyncHistory"')::text AS "SyncHistory"
  `)

  const missing = REQUIRED_IMPORT_TABLES.filter(tableName => !row?.[tableName])

  if (missing.length > 0) {
    throw buildMissingSchemaError(missing)
  }
}

export function normalizeImportSchemaError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    return buildMissingSchemaError()
  }

  return error as AppError
}

function buildMissingSchemaError(missing = REQUIRED_IMPORT_TABLES as unknown as string[]) {
  const error = createError(
    503,
    `Import schema is not applied to the database. Missing tables: ${missing.join(', ')}. Run 'npx prisma db push' and then 'npm run db:seed' in /backend.`
  )
  error.code = 'IMPORT_SCHEMA_MISSING'
  return error
}
