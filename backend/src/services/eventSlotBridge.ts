/**
 * Event → BroadcastSlot Auto-Bridge
 *
 * When an Event has a channelId + startDateBE + startTimeBE, automatically
 * create or sync a linked BroadcastSlot. This ensures the schedule grid
 * always reflects events that have been assigned to a channel.
 */
import { PrismaClient, BroadcastSlotStatus, type Event, type Channel, type BroadcastSlot } from '@prisma/client'
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
 * Call inside a transaction for atomicity.
 */
export async function syncEventToSlot(
  event: Event & { channel?: Channel | null },
  db: PrismaClient = defaultPrisma,
): Promise<BroadcastSlot | null> {
  // Skip if event has no channel or no date/time
  if (!event.channelId || !event.startDateBE || !event.startTimeBE) {
    return null
  }

  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE
    : (event.startDateBE as Date).toISOString().slice(0, 10)
  const timeStr = event.startTimeBE

  // Get channel timezone (for UTC conversion)
  const channel = event.channel ?? await db.channel.findUnique({
    where: { id: event.channelId },
    select: { timezone: true },
  })
  const timezone = (channel as { timezone?: string })?.timezone ?? 'Europe/Brussels'

  const plannedStartUtc = toUtc(dateStr, timeStr, timezone)
  const durationMin = event.durationMin ?? 90 // Default 90 min if unknown
  const plannedEndUtc = new Date(plannedStartUtc.getTime() + durationMin * 60_000)

  // Map event status to slot status
  const slotStatus: BroadcastSlotStatus = event.status === 'cancelled' ? BroadcastSlotStatus.VOIDED
    : event.status === 'live' ? BroadcastSlotStatus.LIVE
    : event.status === 'completed' ? BroadcastSlotStatus.COMPLETED
    : BroadcastSlotStatus.PLANNED

  // Find existing linked slot
  const existingSlot = await db.broadcastSlot.findFirst({
    where: { eventId: event.id, tenantId: event.tenantId },
  })

  const slotData = {
    channelId: event.channelId,
    plannedStartUtc,
    plannedEndUtc,
    expectedDurationMin: durationMin,
    status: slotStatus,
  }

  if (existingSlot) {
    const updated = await db.broadcastSlot.update({
      where: { id: existingSlot.id },
      data: slotData,
    })
    logger.debug('Auto-bridge: updated slot', { slotId: updated.id, eventId: event.id })
    return updated
  }

  const created = await db.broadcastSlot.create({
    data: {
      tenantId: event.tenantId,
      eventId: event.id,
      schedulingMode: 'FIXED',
      anchorType: 'FIXED_TIME',
      overrunStrategy: 'EXTEND',
      contentSegment: 'FULL',
      sportMetadata: {},
      ...slotData,
    },
  })
  logger.debug('Auto-bridge: created slot', { slotId: created.id, eventId: event.id })
  return created
}

/**
 * Remove the linked BroadcastSlot when an event loses its channel assignment.
 */
export async function unlinkEventSlot(
  eventId: number,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const deleted = await db.broadcastSlot.deleteMany({
    where: { eventId, tenantId },
  })
  if (deleted.count > 0) {
    logger.debug('Auto-bridge: removed slot for unlinked event', { eventId })
  }
}
