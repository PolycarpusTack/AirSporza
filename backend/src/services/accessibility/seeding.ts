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
 */
import type { Prisma } from '@prisma/client'
import { buildDefaultAccessibilityDeliverables } from '../../config/accessibility.js'

export async function seedDefaultAccessibilityDeliverables(
  tx: Prisma.TransactionClient,
  event: { id: number; sportId: number; tenantId: string },
): Promise<Prisma.BatchPayload> {
  return tx.accessibilityDeliverable.createMany({
    data: buildDefaultAccessibilityDeliverables(event).map(d => ({ ...d, eventId: event.id, tenantId: event.tenantId })),
    skipDuplicates: true,
  })
}
