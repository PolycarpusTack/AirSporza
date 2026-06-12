import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

const enableQueryLog = process.env.PRISMA_QUERY_LOG === 'true'

/**
 * RLS enforcement (ADR-011 layer 2): when APP_DATABASE_URL is set, request-
 * serving processes connect as the non-owner `planza_app` role so the
 * tenant_isolation policies actually bind. Processes that legitimately span
 * tenants (the worker process, migrations, seeds) declare PLANZA_DB_ROLE=owner
 * and keep the owner DATABASE_URL. With APP_DATABASE_URL unset, behavior is
 * byte-identical to before.
 */
const databaseUrl =
  process.env.PLANZA_DB_ROLE === 'owner'
    ? process.env.DATABASE_URL
    : process.env.APP_DATABASE_URL || process.env.DATABASE_URL

export const prisma = new PrismaClient({
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  log: [
    ...(enableQueryLog ? [{ level: 'query' as const, emit: 'event' as const }] : []),
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
})

if (enableQueryLog) {
  prisma.$on('query', (e: { query: string; duration: number }) => {
    logger.debug(`Query: ${e.query}`)
    logger.debug(`Duration: ${e.duration}ms`)
  })
}

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
