import type { Event, EventStatus } from '../data/types'

export interface LockResult {
  locked: boolean
  reason: 'status' | 'freeze' | null
  canOverride: boolean
}

const TERMINAL_STATUSES: EventStatus[] = ['completed', 'cancelled']
const LOCKED_STATUSES: EventStatus[] = ['approved', 'published', 'live']

/** Status ordering for forward-transition check */
const STATUS_ORDER: Record<EventStatus, number> = {
  draft: 0,
  ready: 1,
  approved: 2,
  published: 3,
  live: 4,
  completed: 5,
  cancelled: 6,
}

/**
 * Determine whether an event is locked for editing.
 *
 * - Terminal statuses (completed/cancelled) -> locked, no override
 * - Locked statuses (approved/published/live) -> locked, admin can override
 * - Freeze window (event starts within `freezeWindowHours`) -> locked, admin can override
 * - Otherwise -> not locked
 */
export function isEventLocked(
  event: Event,
  freezeWindowHours: number,
  userRole?: string,
): LockResult {
  const status = (event.status ?? 'draft') as EventStatus
  const isAdmin = userRole === 'admin'

  // Terminal states: locked, nobody can override
  if (TERMINAL_STATUSES.includes(status)) {
    return { locked: true, reason: 'status', canOverride: false }
  }

  // Locked statuses: admin can override
  if (LOCKED_STATUSES.includes(status)) {
    return { locked: true, reason: 'status', canOverride: isAdmin }
  }

  // Freeze window check (0 = disabled)
  if (freezeWindowHours > 0) {
    const eventStart = parseEventStart(event)
    if (eventStart) {
      const now = new Date()
      const hoursUntilStart = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60)
      if (hoursUntilStart < freezeWindowHours) {
        return { locked: true, reason: 'freeze', canOverride: isAdmin }
      }
    }
  }

  return { locked: false, reason: null, canOverride: false }
}

/**
 * Check if a status transition is a "forward" transition
 * (e.g. approved -> published -> live -> completed).
 * Forward transitions bypass the lock.
 */
export function isForwardTransition(from: EventStatus, to: EventStatus): boolean {
  return STATUS_ORDER[to] > STATUS_ORDER[from]
}

/**
 * Get a human-readable lock reason for confirmation dialogs.
 */
export function lockReasonLabel(result: LockResult): string {
  if (result.reason === 'status') return 'approved/published/live'
  if (result.reason === 'freeze') return 'within freeze window'
  return ''
}

function parseEventStart(event: Event): Date | null {
  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE.split('T')[0]
    : event.startDateBE instanceof Date
      ? event.startDateBE.toISOString().split('T')[0]
      : null
  if (!dateStr) return null
  const time = event.startTimeBE || '00:00'
  return new Date(`${dateStr}T${time}:00`)
}
