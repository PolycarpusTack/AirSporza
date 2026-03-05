import type { Event, TechPlan } from '../data/types'

export interface CrewConflict {
  personName: string
  fieldId: string           // the crew field where this person is assigned
  planId: number            // the plan where the conflict is
  eventId: number
  eventName: string         // participants
  role: string              // the crew field in the conflicting plan
  startTime: string         // "YYYY-MM-DD HH:MM"
  severity: 'full' | 'partial'  // full = same start time, partial = overlapping window
}

// Key format: "planId:fieldId" — identifies a specific crew assignment
export type ConflictMap = Map<string, CrewConflict[]>

const DEFAULT_DURATION_HOURS = 3

function parseEventWindow(event: Event): { start: number; end: number } | null {
  const dateStr = typeof event.startDateBE === 'string'
    ? event.startDateBE
    : event.startDateBE?.toISOString?.().split('T')[0]
  if (!dateStr || !event.startTimeBE) return null

  const start = new Date(`${dateStr}T${event.startTimeBE}:00`).getTime()
  if (isNaN(start)) return null

  let durationMs = DEFAULT_DURATION_HOURS * 3600000
  if (event.duration) {
    const parsed = parseFloat(event.duration)
    if (!isNaN(parsed) && parsed > 0) {
      durationMs = parsed * 3600000
    }
  }

  return { start, end: start + durationMs }
}

function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): 'full' | 'partial' | null {
  if (a.start === b.start) return 'full'
  if (a.start < b.end && b.start < a.end) return 'partial'
  return null
}

/**
 * Detect crew conflicts across all tech plans.
 * Returns a Map keyed by "planId:fieldId" with arrays of conflicts.
 */
export function detectCrewConflicts(plans: TechPlan[], events: Event[]): ConflictMap {
  const conflicts: ConflictMap = new Map()
  const eventMap = new Map(events.map(e => [e.id, e]))

  // Build a lookup: person name -> list of assignments
  interface Assignment {
    planId: number
    fieldId: string
    eventId: number
    window: { start: number; end: number }
  }

  const personAssignments = new Map<string, Assignment[]>()

  for (const plan of plans) {
    const crew = plan.crew as Record<string, unknown>
    if (!crew || typeof crew !== 'object') continue
    const event = eventMap.get(plan.eventId)
    if (!event) continue
    const window = parseEventWindow(event)
    if (!window) continue

    for (const [fieldId, value] of Object.entries(crew)) {
      if (typeof value !== 'string' || !value.trim()) continue
      const name = value.trim().toLowerCase()
      if (!personAssignments.has(name)) personAssignments.set(name, [])
      personAssignments.get(name)!.push({
        planId: plan.id,
        fieldId,
        eventId: plan.eventId,
        window,
      })
    }
  }

  // For each person with 2+ assignments, check for overlaps
  for (const [name, assignments] of personAssignments) {
    if (assignments.length < 2) continue

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]
        const b = assignments[j]
        if (a.eventId === b.eventId) continue // same event is not a conflict

        const overlap = windowsOverlap(a.window, b.window)
        if (!overlap) continue

        const eventA = eventMap.get(a.eventId)!
        const eventB = eventMap.get(b.eventId)!
        const dateA = typeof eventA.startDateBE === 'string' ? eventA.startDateBE : eventA.startDateBE?.toISOString?.().split('T')[0] || ''
        const dateB = typeof eventB.startDateBE === 'string' ? eventB.startDateBE : eventB.startDateBE?.toISOString?.().split('T')[0] || ''

        // Add conflict for assignment A (conflicting with B)
        const keyA = `${a.planId}:${a.fieldId}`
        if (!conflicts.has(keyA)) conflicts.set(keyA, [])
        conflicts.get(keyA)!.push({
          personName: name,
          fieldId: a.fieldId,
          planId: b.planId,
          eventId: b.eventId,
          eventName: eventB.participants,
          role: b.fieldId,
          startTime: `${dateB} ${eventB.startTimeBE}`,
          severity: overlap,
        })

        // Add conflict for assignment B (conflicting with A)
        const keyB = `${b.planId}:${b.fieldId}`
        if (!conflicts.has(keyB)) conflicts.set(keyB, [])
        conflicts.get(keyB)!.push({
          personName: name,
          fieldId: b.fieldId,
          planId: a.planId,
          eventId: a.eventId,
          eventName: eventA.participants,
          role: a.fieldId,
          startTime: `${dateA} ${eventA.startTimeBE}`,
          severity: overlap,
        })
      }
    }
  }

  return conflicts
}

/**
 * Get all unique conflicts (deduplicated by person + event pair).
 * Useful for the conflict dashboard.
 */
export interface PersonConflictGroup {
  personName: string
  conflicts: {
    eventA: { id: number; name: string; role: string; time: string }
    eventB: { id: number; name: string; role: string; time: string }
    severity: 'full' | 'partial'
  }[]
}

export function groupConflictsByPerson(plans: TechPlan[], events: Event[]): PersonConflictGroup[] {
  const eventMap = new Map(events.map(e => [e.id, e]))
  const personAssignments = new Map<string, { planId: number; fieldId: string; eventId: number; window: { start: number; end: number } }[]>()

  for (const plan of plans) {
    const crew = plan.crew as Record<string, unknown>
    if (!crew || typeof crew !== 'object') continue
    const event = eventMap.get(plan.eventId)
    if (!event) continue
    const window = parseEventWindow(event)
    if (!window) continue

    for (const [fieldId, value] of Object.entries(crew)) {
      if (typeof value !== 'string' || !value.trim()) continue
      const name = value.trim().toLowerCase()
      if (!personAssignments.has(name)) personAssignments.set(name, [])
      personAssignments.get(name)!.push({ planId: plan.id, fieldId, eventId: plan.eventId, window })
    }
  }

  const groups: PersonConflictGroup[] = []
  const seen = new Set<string>()

  for (const [name, assignments] of personAssignments) {
    if (assignments.length < 2) continue
    const conflicts: PersonConflictGroup['conflicts'] = []

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]
        const b = assignments[j]
        if (a.eventId === b.eventId) continue

        const overlap = windowsOverlap(a.window, b.window)
        if (!overlap) continue

        const pairKey = `${name}:${Math.min(a.eventId, b.eventId)}:${Math.max(a.eventId, b.eventId)}`
        if (seen.has(pairKey)) continue
        seen.add(pairKey)

        const evA = eventMap.get(a.eventId)!
        const evB = eventMap.get(b.eventId)!
        const dateA = typeof evA.startDateBE === 'string' ? evA.startDateBE : evA.startDateBE?.toISOString?.().split('T')[0] || ''
        const dateB = typeof evB.startDateBE === 'string' ? evB.startDateBE : evB.startDateBE?.toISOString?.().split('T')[0] || ''

        conflicts.push({
          eventA: { id: a.eventId, name: evA.participants, role: a.fieldId, time: `${dateA} ${evA.startTimeBE}` },
          eventB: { id: b.eventId, name: evB.participants, role: b.fieldId, time: `${dateB} ${evB.startTimeBE}` },
          severity: overlap,
        })
      }
    }

    if (conflicts.length > 0) {
      // Capitalize the display name
      const displayName = name.charAt(0).toUpperCase() + name.slice(1)
      groups.push({ personName: displayName, conflicts })
    }
  }

  return groups.sort((a, b) => b.conflicts.length - a.conflicts.length)
}
