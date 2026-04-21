/**
 * Event → BroadcastSlot Auto-Bridge
 *
 * When an Event has a channelId + startDateBE + startTimeBE, automatically
 * create or sync a linked BroadcastSlot. This ensures the schedule grid
 * always reflects events that have been assigned to a channel.
 */
import { Prisma, PrismaClient, BroadcastSlotStatus, type Event, type Channel, type BroadcastSlot } from '@prisma/client'
import { prisma as defaultPrisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

/** Fields that trigger a slot sync when changed */
const TRIGGER_FIELDS = new Set([
  'channelId', 'startDateBE', 'startTimeBE', 'durationMin', 'status',
])

/** Check if any trigger field changed between old and new event */
export function shouldSync(oldEvent: Partial<Event>, newEvent: Partial<Event>): boolean {
  for (const field of TRIGGER_FIELDS) {
    const key = field as keyof Event
    if (String(oldEvent[key] ?? '') !== String(newEvent[key] ?? '')) return true
  }
  return false
}

/** Convert local date+time in a timezone to UTC Date */
function toUtc(dateStr: string, timeStr: string, timezone: string): Date {
  // dateStr: "2026-03-15", timeStr: "14:30"
  const dtString = `${dateStr}T${timeStr}:00`
  // Use Intl to get the offset for this timezone at this date/time
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })

    // Create a date assuming it's in the given timezone
    // Parse the local time as UTC first, then adjust
    const localDate = new Date(dtString + 'Z')

    // Find the timezone offset by comparing formatted output
    const parts = formatter.formatToParts(localDate)
    const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0'

    const formattedYear = parseInt(getPart('year'))
    const formattedMonth = parseInt(getPart('month')) - 1
    const formattedDay = parseInt(getPart('day'))
    const formattedHour = parseInt(getPart('hour'))
    const formattedMinute = parseInt(getPart('minute'))

    // The difference between what we put in (UTC) and what comes out (timezone)
    // tells us the timezone offset
    const utcMs = Date.UTC(formattedYear, formattedMonth, formattedDay, formattedHour, formattedMinute)
    const offsetMs = utcMs - localDate.getTime()

    // Now convert the actual local time to UTC by subtracting the offset
    const actualLocal = new Date(dtString + 'Z')
    return new Date(actualLocal.getTime() - offsetMs)
  } catch {
    // Fallback: treat as UTC if timezone is invalid
    return new Date(dtString + 'Z')
  }
}

/**
 * Create or update a BroadcastSlot linked to this event.
 *
 * Uses a single `INSERT ... ON CONFLICT` keyed on the partial unique index
 * `(tenantId, eventId) WHERE autoLinked = true`. One round-trip instead of
 * findFirst + conditional update/create. DUPLICATE_SLOT and manual
 * POST /broadcast-slots callers stay outside the partial index because they
 * leave `autoLinked = false`, so this never clobbers them.
 *
 * Call inside a transaction for atomicity.
 */
export async function syncEventToSlot(
  event: Event & { channel?: Channel | null },
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<BroadcastSlot | null> {
  // Skip if event has no channel or no date/time
  if (!event.channelId || !event.startDateBE || !event.startTimeBE) {
    return null
  }

  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE
    : (event.startDateBE as Date).toISOString().slice(0, 10)
  const timeStr = event.startTimeBE

  // Get channel timezone (for UTC conversion). Scope by tenantId so a
  // stale/foreign channelId can't leak another tenant's timezone into our
  // slot math. If the channel isn't visible to this tenant, skip the sync
  // rather than silently defaulting — a silent Europe/Brussels fallback
  // previously masked genuinely missing rows.
  const channel = event.channel ?? await db.channel.findFirst({
    where: { id: event.channelId, tenantId: event.tenantId },
    select: { timezone: true },
  })
  if (!channel) {
    return null
  }
  const timezone = channel.timezone ?? 'Europe/Brussels'

  const plannedStartUtc = toUtc(dateStr, timeStr, timezone)
  const durationMin = event.durationMin ?? 90 // Default 90 min if unknown
  const plannedEndUtc = new Date(plannedStartUtc.getTime() + durationMin * 60_000)

  // Map event status to slot status
  const slotStatus: BroadcastSlotStatus = event.status === 'cancelled' ? BroadcastSlotStatus.VOIDED
    : event.status === 'live' ? BroadcastSlotStatus.LIVE
    : event.status === 'completed' ? BroadcastSlotStatus.COMPLETED
    : BroadcastSlotStatus.PLANNED

  const rows = await db.$queryRaw<BroadcastSlot[]>(Prisma.sql`
    INSERT INTO "BroadcastSlot" (
      id, "tenantId", "eventId", "channelId",
      "schedulingMode", "anchorType", "overrunStrategy", "contentSegment",
      "sportMetadata", "plannedStartUtc", "plannedEndUtc",
      "expectedDurationMin", status, "autoLinked",
      "bufferBeforeMin", "bufferAfterMin", "coveragePriority",
      "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      ${event.tenantId}::uuid,
      ${event.id},
      ${event.channelId},
      'FIXED'::"SchedulingMode",
      'FIXED_TIME'::"AnchorType",
      'EXTEND'::"OverrunStrategy",
      'FULL'::"ContentSegment",
      '{}'::jsonb,
      ${plannedStartUtc}::timestamptz,
      ${plannedEndUtc}::timestamptz,
      ${durationMin},
      ${slotStatus}::"BroadcastSlotStatus",
      true,
      15, 25, 1,
      NOW(), NOW()
    )
    ON CONFLICT ("tenantId", "eventId") WHERE "autoLinked" = true AND "eventId" IS NOT NULL
    DO UPDATE SET
      "channelId" = EXCLUDED."channelId",
      "plannedStartUtc" = EXCLUDED."plannedStartUtc",
      "plannedEndUtc" = EXCLUDED."plannedEndUtc",
      "expectedDurationMin" = EXCLUDED."expectedDurationMin",
      status = EXCLUDED.status,
      "updatedAt" = NOW()
    RETURNING *
  `)

  const slot = rows[0] ?? null
  if (slot) {
    logger.debug('Auto-bridge: upserted slot', { slotId: slot.id, eventId: event.id })
  }
  return slot
}

/**
 * Remove the linked BroadcastSlot when an event loses its channel assignment.
 * Only removes bridge-managed slots so manual/duplicate slots are preserved.
 */
export async function unlinkEventSlot(
  eventId: number,
  tenantId: string,
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<void> {
  const deleted = await db.broadcastSlot.deleteMany({
    where: { eventId, tenantId, autoLinked: true },
  })
  if (deleted.count > 0) {
    logger.debug('Auto-bridge: removed slot for unlinked event', { eventId })
  }
}
