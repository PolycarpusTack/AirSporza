import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

// Cache the default tenant ID to avoid repeated queries
let defaultTenantId: string | null = null

export async function setTenantContext(req: Request, _res: Response, next: NextFunction) {
  try {
    // For now: all requests use default tenant
    // Later: derive from JWT claims or subdomain
    if (!defaultTenantId) {
      const tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } })
      defaultTenantId = tenant?.id ?? null
      if (defaultTenantId) {
        logger.info('Tenant context initialized', { tenantId: defaultTenantId })
      }
    }

    if (defaultTenantId) {
      // Set PostgreSQL session variable for RLS
      await prisma.$executeRawUnsafe(`SELECT set_tenant_context('${defaultTenantId}')`)
      ;(req as any).tenantId = defaultTenantId
    } else {
      logger.warn('No default tenant found — tenant context not set')
    }

    next()
  } catch (err) {
    logger.error('Failed to set tenant context', { error: err })
    next(err)
  }
}
