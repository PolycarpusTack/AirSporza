import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

const enableQueryLog = process.env.PRISMA_QUERY_LOG === 'true'

export const prisma = new PrismaClient({
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
