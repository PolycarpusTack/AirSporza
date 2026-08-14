/**
 * FmToast — render/auto-dismiss timing tests (FM1-5-T1, README toast spec).
 * Fake timers throughout — no real sleep-waits (story's TDD order note).
 *
 * @vitest-environment jsdom
 */
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FmToastHost, useFmToast } from './FmToast'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  vi.useRealTimers()
})

const wrapper = ({ children }: { children: ReactNode }) => <FmToastHost>{children}</FmToastHost>

describe('render', () => {
  it('renders nothing before show() is called', () => {
    render(<FmToastHost />)

    expect(screen.queryByTestId('fm-toast')).toBeNull()
  })

  it('renders the exact message after show()', () => {
    const { result } = renderHook(() => useFmToast(), { wrapper })

    act(() => result.current.show('CONFLICT: Crew conflict — England v Wales'))

    expect(screen.getByTestId('fm-toast').textContent).toBe('CONFLICT: Crew conflict — England v Wales')
  })

  it('a caller with no FmToastHost ancestor never throws (default no-op context)', () => {
    const { result } = renderHook(() => useFmToast())

    expect(() => act(() => result.current.show('x'))).not.toThrow()
  })
})

describe('auto-dismiss timing (~2.6s)', () => {
  it('is still visible just before 2.6s', () => {
    const { result } = renderHook(() => useFmToast(), { wrapper })
    act(() => result.current.show('hello'))

    act(() => {
      vi.advanceTimersByTime(2599)
    })

    expect(screen.getByTestId('fm-toast')).toBeTruthy()
  })

  it('is gone at 2.6s', () => {
    const { result } = renderHook(() => useFmToast(), { wrapper })
    act(() => result.current.show('hello'))

    act(() => {
      vi.advanceTimersByTime(2600)
    })

    expect(screen.queryByTestId('fm-toast')).toBeNull()
  })
})

describe('last call wins (no queueing)', () => {
  it('a second show() before dismissal replaces the message and restarts the timer', () => {
    const { result } = renderHook(() => useFmToast(), { wrapper })
    act(() => result.current.show('first'))

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    act(() => result.current.show('second'))

    expect(screen.getByTestId('fm-toast').textContent).toBe('second')

    // 2000ms further = 4000ms since 'first' (would be long dismissed) but
    // only 2000ms since 'second' — still visible because the timer restarted.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByTestId('fm-toast').textContent).toBe('second')

    // Now 2600ms since 'second' — dismisses.
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByTestId('fm-toast')).toBeNull()
  })
})
