/**
 * RC-2-T1 defaulting hook, extracted as a shared writer (TD-31): the ONE
 * function every event-creation site calls to seed the default accessibility
 * deliverable rows, so no creation path can silently bypass the T888
 * obligation.
 *
 * Additive + idempotent: skipDuplicates with the unique (eventId, type) index
 * makes re-seeding a no-op, and rows that already exist are never overwritten.
 *
 * Call inside the SAME transaction as the event create (mirrors
 * writeOutboxEvent / syncEventToSlot posture). tenantId is read from the created
 * event row itself — a caller cannot seed under a different tenant than the event's.
 *
 * RC-5-T2: the T888 exclusion set is read here via the per-tenant config loader
 * (constants as fallback when no row) — this choke point wires the tenant
 * override ONCE for all five event-creation sites. Same tx, same tenant as the
 * event row; `buildDefaultAccessibilityDeliverables` keeps its pure signature.
 */
import type { Prisma } from '@prisma/client'
import { buildDefaultAccessibilityDeliverables } from '../../config/accessibility.js'
import { loadTenantAccessibilityConfig } from './tenantConfig.js'

export async function seedDefaultAccessibilityDeliverables(
  tx: Prisma.TransactionClient,
  event: { id: number; sportId: number; tenantId: string },
): Promise<Prisma.BatchPayload> {
  const config = await loadTenantAccessibilityConfig(tx, event.tenantId)
  return tx.accessibilityDeliverable.createMany({
    data: buildDefaultAccessibilityDeliverables(event, config.t888ExcludedSportIds).map(d => ({
      ...d,
      eventId: event.id,
      tenantId: event.tenantId,
    })),
    skipDuplicates: true,
  })
}
