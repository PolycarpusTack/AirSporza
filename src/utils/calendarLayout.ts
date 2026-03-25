// ── Calendar layout constants & helpers ──────────────────────────────────────

import { timeToMinutes, parseDurationMin } from './dateTime'
import type { Event, EventStatus, BadgeVariant } from '../data/types'

// ── Constants ────────────────────────────────────────────────────────────────

export const CAL_START_HOUR = 8   // 08:00
export const CAL_END_HOUR   = 23  // 23:00
export const CAL_HOURS      = CAL_END_HOUR - CAL_START_HOUR  // 15
export const PX_PER_HOUR    = 60
export const CAL_HEIGHT     = CAL_HOURS * PX_PER_HOUR        // 900

export const FALLBACK_COLOR = { border: '#4B5563', bg: 'rgba(75,85,99,0.1)', text: '#9CA3AF' }

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const HOUR_LABELS = Array.from({ length: CAL_HOURS }, (_, i) => {
  const h = CAL_START_HOUR + i
  return `${String(h).padStart(2, '0')}:00`
})

// ── Layout functions ─────────────────────────────────────────────────────────

export function eventTopPx(time: string): number {
  const mins = timeToMinutes(time)
  const calStartMin = CAL_START_HOUR * 60
  return Math.max(0, (mins - calStartMin) * (PX_PER_HOUR / 60))
}

export function eventHeightPx(durationMin: number): number {
  return Math.max(20, durationMin * (PX_PER_HOUR / 60))
}

/** Compute overlap columns for events in a single day. Returns Map<eventId, {col, totalCols}> */
export function computeOverlapLayout(events: Event[]): Map<number, { col: number; totalCols: number }> {
  const result = new Map<number, { col: number; totalCols: number }>()
  if (events.length === 0) return result

  // Sort by start time, then duration (longer first)
  const sorted = [...events].sort((a, b) => {
    const ta = timeToMinutes(a.linearStartTime || a.startTimeBE || '00:00')
    const tb = timeToMinutes(b.linearStartTime || b.startTimeBE || '00:00')
    if (ta !== tb) return ta - tb
    return parseDurationMin(b.duration) - parseDurationMin(a.duration)
  })

  // Track active columns: each entry is the end-minute of the event in that column
  const columns: number[] = []
  const eventCols: { id: number; col: number; group: number[] }[] = []

  for (const ev of sorted) {
    const start = timeToMinutes(ev.linearStartTime || ev.startTimeBE || '00:00')
    const end = start + parseDurationMin(ev.duration)

    // Find first column where this event doesn't overlap
    let placed = -1
    for (let c = 0; c < columns.length; c++) {
      if (columns[c] <= start) {
        placed = c
        break
      }
    }
    if (placed === -1) {
      placed = columns.length
      columns.push(0)
    }
    columns[placed] = end
    eventCols.push({ id: ev.id, col: placed, group: [] })
  }

  // For each event, find all events it overlaps with to determine totalCols in its cluster
  for (let i = 0; i < eventCols.length; i++) {
    const ev = sorted[i]
    const start = timeToMinutes(ev.linearStartTime || ev.startTimeBE || '00:00')
    const end = start + parseDurationMin(ev.duration)
    let maxCol = eventCols[i].col
    for (let j = 0; j < eventCols.length; j++) {
      if (i === j) continue
      const ej = sorted[j]
      const sj = timeToMinutes(ej.linearStartTime || ej.startTimeBE || '00:00')
      const ej_end = sj + parseDurationMin(ej.duration)
      if (sj < end && ej_end > start) {
        maxCol = Math.max(maxCol, eventCols[j].col)
      }
    }
    result.set(ev.id, { col: eventCols[i].col, totalCols: maxCol + 1 })
  }

  return result
}

// ── Color helpers ────────────────────────────────────────────────────────────

export function hexToChannelColor(hex: string): { border: string; bg: string; text: string } {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return FALLBACK_COLOR
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Compute relative luminance (0 = darkest, 1 = lightest)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  let textColor: string
  if (luminance > 0.5) {
    // Light background color — darken for text
    const dr = Math.round(r * 0.4).toString(16).padStart(2, '0')
    const dg = Math.round(g * 0.4).toString(16).padStart(2, '0')
    const db = Math.round(b * 0.4).toString(16).padStart(2, '0')
    textColor = `#${dr}${dg}${db}`
  } else {
    // Dark background color — lighten for text
    const lr = Math.round(r + (255 - r) * 0.35).toString(16).padStart(2, '0')
    const lg = Math.round(g + (255 - g) * 0.35).toString(16).padStart(2, '0')
    const lb = Math.round(b + (255 - b) * 0.35).toString(16).padStart(2, '0')
    textColor = `#${lr}${lg}${lb}`
  }
  return { border: hex, bg: `rgba(${r},${g},${b},0.1)`, text: textColor }
}

export function buildColorMapById(channels: { id: number; color: string }[]): Record<number, { border: string; bg: string; text: string }> {
  const map: Record<number, { border: string; bg: string; text: string }> = {}
  for (const ch of channels) {
    map[ch.id] = hexToChannelColor(ch.color)
  }
  return map
}

export function statusVariant(s: EventStatus): BadgeVariant {
  const map: Record<EventStatus, BadgeVariant> = {
    draft: 'draft',
    ready: 'warning',
    approved: 'success',
    published: 'live',
    live: 'live',
    completed: 'default',
    cancelled: 'danger',
  }
  return map[s] ?? 'default'
}
