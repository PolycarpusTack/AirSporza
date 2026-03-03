import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
})

prisma.$on('query', (e: { query: string; duration: number }) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Query: ${e.query}`)
    logger.debug(`Duration: ${e.duration}ms`)
  }
})

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
