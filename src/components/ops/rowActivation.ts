/**
 * getRowActivationProps (E-2-T2 PREPARATORY) — shared a11y props that turn a
 * clickable `<div>` into a keyboard-operable button (WCAG 2.1.1). Rule-of-Three
 * extraction: ScheduleRow, the Rundown timeline block, and the Registry table row
 * all spread these instead of hand-rolling the same role/tabIndex/onKeyDown.
 *
 * A PLAIN function (not a hook — `get*`, never `use*`: it calls no React hooks and
 * returns a static props bag, so it is safe to call inside a `.map()` with no
 * rules-of-hooks concern). onKeyDown activates on Enter or Space, and calls
 * preventDefault() on Space to suppress the browser's default page-scroll (an
 * additive correctness fix over the previous inline handlers, which omitted it).
 *
 * The element still needs its OWN onClick={onActivate} for pointer users — this
 * covers keyboard only, matching the pre-existing consumers' shape.
 */
import type { KeyboardEvent } from 'react'

export interface RowActivationProps {
  role: 'button'
  tabIndex: 0
  onKeyDown: (e: KeyboardEvent) => void
}

export function getRowActivationProps(onActivate: () => void): RowActivationProps {
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
