import { prisma } from '../db/prisma.js'

/**
 * Set the PostgreSQL session variable used by Row-Level Security policies.
 * Call this in workers before processing tenant-scoped data.
 */
export async function setTenantRLS(tenantId: string): Promise<void> {
  // Explicit ::uuid cast required: Prisma binds string params as `text`, and
  // postgres will NOT implicit-cast text→uuid during function resolution.
  // Without this cast, the call fails with `function set_tenant_context(text) does not exist`
  // even when the uuid-typed function is present.
  await prisma.$executeRaw`SELECT set_tenant_context(${tenantId}::uuid)`
}
