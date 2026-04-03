import { prisma } from '../db/prisma.js'

/**
 * Set the PostgreSQL session variable used by Row-Level Security policies.
 * Call this in workers before processing tenant-scoped data.
 */
export async function setTenantRLS(tenantId: string): Promise<void> {
  await prisma.$executeRaw`SELECT set_tenant_context(${tenantId})`
}
