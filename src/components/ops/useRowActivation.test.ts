/**
 * Unit tests for useRowActivation (E-2-T2 PREPARATORY) — the shared a11y prop
 * builder for a div-as-button ops row/block. Rule-of-Three extraction: the same
 * role/tabIndex/onKeyDown boilerplate lived inline in ScheduleRow + the Rundown
 * block (and was MISSING on the Registry row — the gap E-2-T2 FEATURE fixes).
 *
 * The hook is pure (calls no React hooks), so it is exercised directly here — no
 * render needed. onKeyDown fires onActivate on Enter or Space; Space additionally
 * calls preventDefault() to suppress the browser's page-scroll (an ADDITIVE
 * correctness improvement over the old ad-hoc handlers, which did not).
 */
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRowActivation } from './useRowActivation'

const keyEvent = (key: string) => {
  const preventDefault = vi.fn()
  return { key, preventDefault } as unknown as KeyboardEvent
}

describe('useRowActivation', () => {
  it('returns the div-as-button a11y props (role="button", tabIndex 0)', () => {
    const props = useRowActivation(() => {})
    expect(props.role).toBe('button')
    expect(props.tabIndex).toBe(0)
  })

  it('Enter fires onActivate (no preventDefault — Enter does not scroll)', () => {
    const onActivate = vi.fn()
    const e = keyEvent('Enter')

    useRowActivation(onActivate).onKeyDown(e)

    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('Space fires onActivate AND preventDefault (suppresses page scroll)', () => {
    const onActivate = vi.fn()
    const e = keyEvent(' ')

    useRowActivation(onActivate).onKeyDown(e)

    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('other keys do nothing (no activation, no preventDefault)', () => {
    const onActivate = vi.fn()
    const { onKeyDown } = useRowActivation(onActivate)
    for (const key of ['a', 'Tab', 'ArrowDown', 'Escape']) {
      const e = keyEvent(key)
      onKeyDown(e)
      expect(e.preventDefault).not.toHaveBeenCalled()
    }
    expect(onActivate).not.toHaveBeenCalled()
  })
})
