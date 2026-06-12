import type { Event } from '../data/types'
import type { Resource, ResourceAssignment } from '../services/resources'
import { effectiveDurationMin } from './dateTime'

export interface ResourceConflict {
  resourceName: string
  resourceId: number
  capacity: number
  concurrentCount: number
  overlappingEvents: {
    eventId: number
    eventName: string
    techPlanId: number
    planType: string
    time: string
    quantity: number
  }[]
}

function parseEventWindow(event: Event): { start: number; end: number } | null {
  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE
    : event.startDateBE?.toISOString?.().split('T')[0]
  if (!dateStr || !event.startTimeBE) return null

  const start = new Date(`${dateStr}T${event.startTimeBE}:00`).getTime()
  if (isNaN(start)) return null

  // quality-pass fix (C-quality): unified duration accessor — durations are
  // MINUTES app-wide via effectiveDurationMin (durationMin preferred, else the
  // parsed duration string, default 90). This replaces the last PRE-TD-15
  // parseFloat-as-HOURS + 3h-default logic, under which '120' meant 120 HOURS
  // and '01:30:00' truncated to 1 hour. CONFLICT WINDOWS get a conservative
  // 90-min floor: a zero-width window can never overlap anything, so
  // placeholder '00:00:00' feeds would silently disable conflict detection.
  const durationMin = effectiveDurationMin(event)
  const durationMs = (durationMin === 0 ? 90 : durationMin) * 60000

  return { start, end: start + durationMs }
}

function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Detect resource conflicts: when concurrent assignments exceed capacity.
 * Groups overlapping assignments by time window and checks against capacity.
 */
export function detectResourceConflicts(
  resources: Resource[],
  allAssignments: Record<number, ResourceAssignment[]>,
  events: Event[]
): ResourceConflict[] {
  const eventMap = new Map(events.map(e => [e.id, e]))
  const conflicts: ResourceConflict[] = []

  for (const resource of resources) {
    const assignments = allAssignments[resource.id]
    if (!assignments || assignments.length < 2) continue

    // Build assignment windows
    const windows: {
      assignment: ResourceAssignment
      event: Event
      window: { start: number; end: number }
    }[] = []

    for (const a of assignments) {
      const eventId = a.techPlan?.eventId ?? a.techPlanId
      const event = a.techPlan?.event
        ? eventMap.get((a.techPlan.event as any).id) ?? (a.techPlan.event as unknown as Event)
        : eventMap.get(eventId)
      if (!event) continue
      const w = parseEventWindow(event)
      if (!w) continue
      windows.push({ assignment: a, event, window: w })
    }

    if (windows.length < 2) continue

    // For each assignment, find all overlapping ones and check if total > capacity
    const checked = new Set<string>()

    for (let i = 0; i < windows.length; i++) {
      const group = [windows[i]]
      for (let j = 0; j < windows.length; j++) {
        if (i === j) continue
        if (windowsOverlap(windows[i].window, windows[j].window)) {
          group.push(windows[j])
        }
      }

      const totalQty = group.reduce((sum, g) => sum + g.assignment.quantity, 0)
      if (totalQty <= resource.capacity) continue

      // Create a stable key to avoid duplicate conflict entries
      const key = group.map(g => g.assignment.id).sort().join(',')
      if (checked.has(key)) continue
      checked.add(key)

      conflicts.push({
        resourceName: resource.name,
        resourceId: resource.id,
        capacity: resource.capacity,
        concurrentCount: totalQty,
        overlappingEvents: group.map(g => {
          const dateStr = typeof g.event.startDateBE === 'string'
            ? g.event.startDateBE
            : g.event.startDateBE?.toISOString?.().split('T')[0] || ''
          return {
            eventId: g.event.id,
            eventName: g.event.participants,
            techPlanId: g.assignment.techPlanId,
            planType: (g.assignment as any).techPlan?.planType ?? 'Unknown',
            time: `${dateStr} ${g.event.startTimeBE ?? ''}`.trim(),
            quantity: g.assignment.quantity,
          }
        }),
      })
    }
  }

  return conflicts.sort((a, b) => (b.concurrentCount - b.capacity) - (a.concurrentCount - a.capacity))
}
