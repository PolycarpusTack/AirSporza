import { Request, Response, NextFunction } from 'express'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

declare global {
  namespace Express {
    interface Request {
      tenantId?: string
    }
  }
}

// Cache the default tenant ID to avoid repeated queries on unauthenticated routes
let defaultTenantId: string | null = null

export async function setTenantContext(req: Request, _res: Response, next: NextFunction) {
  try {
    // Derive tenantId from authenticated user when available (set by passport)
    const user = req.user as { tenantId?: string } | undefined
    let tenantId = user?.tenantId ?? null

    // Fall back to default tenant for unauthenticated/public routes
    if (!tenantId) {
      if (!defaultTenantId) {
        const tenant = await prisma.tenant.findFirst({ where: { slug: 'default' } })
        defaultTenantId = tenant?.id ?? null
        if (defaultTenantId) {
          logger.info('Default tenant context initialized', { tenantId: defaultTenantId })
        }
      }
      tenantId = defaultTenantId
    }

    if (tenantId) {
      // Set PostgreSQL session variable for RLS
      await prisma.$executeRaw`SELECT set_tenant_context(${tenantId})`
      req.tenantId = tenantId
    } else {
      logger.warn('No tenant context resolved — neither user tenant nor default found')
    }

    next()
  } catch (err) {
    logger.error('Failed to set tenant context', { error: err })
    next(err)
  }
}
