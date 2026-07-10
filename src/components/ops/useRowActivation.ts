/**
 * useRowActivation (E-2-T2 PREPARATORY) — shared a11y props that turn a clickable
 * `<div>` into a keyboard-operable button (WCAG 2.1.1). Rule-of-Three extraction:
 * ScheduleRow, the Rundown timeline block, and (after the FEATURE commit) the
 * Registry table row all consume this instead of hand-rolling the same
 * role/tabIndex/onKeyDown boilerplate.
 *
 * Pure — calls no React hooks; the `use*` name marks it as a prop-builder meant to
 * be spread onto a row element. onKeyDown activates on Enter or Space, and calls
 * preventDefault() on Space to suppress the browser's default page-scroll (an
 * additive correctness fix over the previous inline handlers, which omitted it).
 *
 * The element still needs its OWN onClick={onActivate} for pointer users — this
 * hook covers keyboard only, matching the pre-existing consumers' shape.
 */
import type { KeyboardEvent } from 'react'

export interface RowActivation {
  role: 'button'
  tabIndex: 0
  onKeyDown: (e: KeyboardEvent) => void
}

export function useRowActivation(onActivate: () => void): RowActivation {
  return {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault() // avoid page scroll on Space
        onActivate()
      }
    },
  }
}
