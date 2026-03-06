import { useState, useRef, useCallback } from 'react'
import { snapTo5 } from './useDrawToCreate'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface VerticalDragState {
  eventId: number
  mode: 'move' | 'resize'
  date: string
  startMin: number      // current preview start (minutes from midnight)
  endMin: number        // current preview end
  originalStartMin: number
  originalEndMin: number
}

export interface VerticalDragResult {
  eventId: number
  newStartMin: number
  newDurationMin: number
}

interface UseVerticalDragOptions {
  enabled: boolean
  calStartHour: number
  calEndHour: number
  pxPerHour: number
  isLocked: (eventId: number) => boolean
  onComplete: (result: VerticalDragResult) => void
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_DURATION = 15        // minimum 15 minutes
const DIRECTION_THRESHOLD = 5  // pixels to detect direction
const RESIZE_ZONE_PX = 10     // bottom pixels for resize handle

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useVerticalDrag({
  enabled,
  calStartHour,
  calEndHour,
  pxPerHour,
  isLocked,
  onComplete,
}: UseVerticalDragOptions) {
  const [state, setState] = useState<VerticalDragState | null>(null)

  // Ref-mirrored state for synchronous reads in pointer handlers
  const stateRef = useRef<VerticalDragState | null>(null)

  // Pending activation: pointerDown recorded but direction not yet determined
  const pendingRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    eventId: number
    startMin: number
    endMin: number
    date: string
    mode: 'move' | 'resize'
    target: HTMLDivElement  // the day column element for pointer capture
  } | null>(null)

  // Anchor for move: the minute offset between cursor and event start
  const anchorRef = useRef<{
    offsetMin: number  // cursor minute - startMin at activation
  } | null>(null)

  /** Convert a pixel offset from the top of the day column to minutes (snapped). */
  const pxToMin = useCallback(
    (px: number): number => {
      const raw = calStartHour * 60 + (px / pxPerHour) * 60
      return snapTo5(raw)
    },
    [calStartHour, pxPerHour],
  )

  const calMinBound = calStartHour * 60
  const calMaxBound = calEndHour * 60

  /* ---- pointer down on event card ---- */
  const onPointerDown = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      eventId: number,
      startMin: number,
      durationMin: number,
      date: string,
    ) => {
      if (!enabled) return
      if (isLocked(eventId)) return
      // Only primary button
      if (e.button !== 0) return

      // Detect resize vs move: check if pointer is in bottom 10px of the event card
      const card = (e.target as HTMLElement).closest('[data-event-card]') as HTMLElement | null
      let mode: 'move' | 'resize' = 'move'
      if (card) {
        const cardRect = card.getBoundingClientRect()
        if (e.clientY >= cardRect.bottom - RESIZE_ZONE_PX) {
          mode = 'resize'
        }
      }

      // Find the day column (the relative-positioned container)
      const dayCol = (e.target as HTMLElement).closest('.relative.border-l') as HTMLDivElement | null
      if (!dayCol) return

      // Record pending — don't activate yet, wait for direction detection
      pendingRef.current = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        eventId,
        startMin,
        endMin: startMin + durationMin,
        date,
        mode,
        target: dayCol,
      }

      // Don't prevent default or capture yet — let direction detection decide
    },
    [enabled, isLocked],
  )

  /* ---- pointer move (on day column) ---- */
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // --- Phase 1: Direction detection for pending activation ---
      if (pendingRef.current && !stateRef.current) {
        const p = pendingRef.current
        const dx = Math.abs(e.clientX - p.originX)
        const dy = Math.abs(e.clientY - p.originY)

        // Not enough movement yet
        if (dx < DIRECTION_THRESHOLD && dy < DIRECTION_THRESHOLD) return

        // Horizontal wins → cancel, let @dnd-kit handle it
        if (dx >= dy) {
          pendingRef.current = null
          return
        }

        // Vertical wins → activate!
        // Capture pointer so @dnd-kit won't see further events
        p.target.setPointerCapture(p.pointerId)

        const rect = p.target.getBoundingClientRect()
        const offsetY = e.clientY - rect.top
        const cursorMin = pxToMin(offsetY)

        // For move mode, store the offset between cursor and event start
        anchorRef.current = { offsetMin: cursorMin - p.startMin }

        const initialState: VerticalDragState = {
          eventId: p.eventId,
          mode: p.mode,
          date: p.date,
          startMin: p.startMin,
          endMin: p.endMin,
          originalStartMin: p.startMin,
          originalEndMin: p.endMin,
        }
        stateRef.current = initialState
        setState(initialState)
        pendingRef.current = null
        return
      }

      // --- Phase 2: Active drag tracking ---
      if (!stateRef.current) return

      const s = stateRef.current
      const rect = e.currentTarget.getBoundingClientRect()
      const offsetY = e.clientY - rect.top
      const cursorMin = pxToMin(offsetY)

      let newStart: number
      let newEnd: number

      if (s.mode === 'move') {
        const offset = anchorRef.current?.offsetMin ?? 0
        newStart = cursorMin - offset
        newEnd = newStart + (s.originalEndMin - s.originalStartMin)

        // Clamp to calendar bounds
        if (newStart < calMinBound) {
          newStart = calMinBound
          newEnd = newStart + (s.originalEndMin - s.originalStartMin)
        }
        if (newEnd > calMaxBound) {
          newEnd = calMaxBound
          newStart = newEnd - (s.originalEndMin - s.originalStartMin)
        }
      } else {
        // Resize mode: start stays fixed, end follows cursor
        newStart = s.originalStartMin
        newEnd = snapTo5(cursorMin)

        // Enforce minimum duration
        if (newEnd - newStart < MIN_DURATION) {
          newEnd = newStart + MIN_DURATION
        }
        // Clamp end to calendar bounds
        if (newEnd > calMaxBound) {
          newEnd = calMaxBound
        }
      }

      const updated: VerticalDragState = {
        ...s,
        startMin: newStart,
        endMin: newEnd,
      }
      stateRef.current = updated
      setState(updated)
    },
    [pxToMin, calMinBound, calMaxBound],
  )

  /* ---- pointer up ---- */
  const onPointerUp = useCallback(() => {
    // If still pending (no direction resolved), just cancel
    if (pendingRef.current) {
      pendingRef.current = null
      return
    }

    const s = stateRef.current
    if (!s) return

    stateRef.current = null
    anchorRef.current = null
    setState(null)

    // Only fire if position actually changed
    const changed = s.startMin !== s.originalStartMin || s.endMin !== s.originalEndMin
    if (changed) {
      onComplete({
        eventId: s.eventId,
        newStartMin: s.startMin,
        newDurationMin: s.endMin - s.startMin,
      })
    }
  }, [onComplete])

  /* ---- cancel ---- */
  const cancel = useCallback(() => {
    pendingRef.current = null
    stateRef.current = null
    anchorRef.current = null
    setState(null)
  }, [])

  return { state, onPointerDown, onPointerMove, onPointerUp, cancel }
}
