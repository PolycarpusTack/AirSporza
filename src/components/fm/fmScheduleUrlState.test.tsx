/**
 * Unit tests for useFmScheduleDay (FM2-1-T2). Structural copy of
 * opsUrlState.test.tsx's useOpsDay coverage — sibling file, not shared
 * (see fmScheduleUrlState.ts's own header for why this hook is a copy, not
 * an import, of useOpsDay).
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { useFmScheduleDay } from './fmScheduleUrlState'

const wrapperAt = (initialEntry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  }

const renderFmScheduleDay = (initialEntry = '/fm/schedule') =>
  renderHook(
    () => ({
      dayState: useFmScheduleDay(),
      location: useLocation(),
    }),
    { wrapper: wrapperAt(initialEntry) },
  )

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

const urlParam = (result: { current: { location: { search: string } } }, name: string) =>
  new URLSearchParams(result.current.location.search).get(name)

describe('hydration from the URL', () => {
  it('absent ?day → null', () => {
    const { result } = renderFmScheduleDay('/fm/schedule')
    expect(result.current.dayState.day).toBeNull()
  })

  it('?day=2026-03-04 hydrates day', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?day=2026-03-04')
    expect(result.current.dayState.day).toBe('2026-03-04')
  })

  it('?day=2024-02-29 (real leap day) is accepted', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?day=2024-02-29')
    expect(result.current.dayState.day).toBe('2024-02-29')
  })

  it('?day=2026-02-31 (impossible calendar date) falls back to null', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?day=2026-02-31')
    expect(result.current.dayState.day).toBeNull()
  })

  it('malformed ?day (not ISO shape) falls back to null', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?day=not-a-date')
    expect(result.current.dayState.day).toBeNull()
  })
})

describe('setDay', () => {
  it('writes a valid day into the URL', () => {
    const { result } = renderFmScheduleDay('/fm/schedule')

    act(() => result.current.dayState.setDay('2026-03-09'))

    expect(result.current.dayState.day).toBe('2026-03-09')
    expect(urlParam(result, 'day')).toBe('2026-03-09')
  })

  it('null clears the param', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?day=2026-03-04')

    act(() => result.current.dayState.setDay(null))

    expect(result.current.dayState.day).toBeNull()
    expect(urlParam(result, 'day')).toBeNull()
  })

  it('preserves unrelated params and uses replace (path untouched)', () => {
    const { result } = renderFmScheduleDay('/fm/schedule?foo=bar')

    act(() => result.current.dayState.setDay('2026-03-04'))

    expect(urlParam(result, 'foo')).toBe('bar')
    expect(result.current.location.pathname).toBe('/fm/schedule')
  })
})
