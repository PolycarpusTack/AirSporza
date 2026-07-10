/**
 * Unit tests for useOpsSelection / useOpsDay (A-2-T2, ADR-014).
 * Contract: docs/governance/contracts/ops-selection.md (ops-selection v1).
 * ADR-014: `?event=` and `?day=` are PUBLIC URL contract; invalid values fall back
 * silently; hooks never touch the path (OpsShell v1 absolute-path rule is moot but
 * acknowledged in the implementation header).
 */
import { cleanup, renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { useOpsDay, useOpsRecord, useOpsSelection } from './opsUrlState'

const wrapperAt = (initialEntry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  }

/** Renders all three hooks + location/navigation probes under one router. */
const renderOpsUrlState = (initialEntry = '/ops/schedule') =>
  renderHook(
    () => ({
      selection: useOpsSelection(),
      dayState: useOpsDay(),
      recordState: useOpsRecord(),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    { wrapper: wrapperAt(initialEntry) },
  )

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

/** Exact param read through the parser — substring matching on `search` is imprecise. */
const urlParam = (result: { current: { location: { search: string } } }, name: string) =>
  new URLSearchParams(result.current.location.search).get(name)

describe('hydration from the URL', () => {
  it('?event=abc hydrates eventId', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=abc')

    expect(result.current.selection.eventId).toBe('abc')
  })

  it('?day=2026-03-04 hydrates day', () => {
    const { result } = renderOpsUrlState('/ops/planner?day=2026-03-04')

    expect(result.current.dayState.day).toBe('2026-03-04')
  })

  it('?day=2024-02-29 (real leap day) is accepted', () => {
    const { result } = renderOpsUrlState('/ops/planner?day=2024-02-29')

    expect(result.current.dayState.day).toBe('2024-02-29')
  })

  it('both hooks compose: both params present hydrate together', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=42&day=2026-03-04')

    expect(result.current.selection.eventId).toBe('42')
    expect(result.current.dayState.day).toBe('2026-03-04')
  })
})

describe('absent / garbage params fall back silently (ADR-014)', () => {
  it('absent params → null for both hooks', () => {
    const { result } = renderOpsUrlState('/ops/schedule')

    expect(result.current.selection.eventId).toBeNull()
    expect(result.current.dayState.day).toBeNull()
  })

  it('empty-string params are treated as absent', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=&day=')

    expect(result.current.selection.eventId).toBeNull()
    expect(result.current.dayState.day).toBeNull()
  })

  it.each(['garbage', '2026-13-04', '2026-02-31', '2026-02-29', '04-03-2026', '2026-3-4'])(
    'day rejects non-ISO / impossible value %s → null, no crash',
    (bad) => {
      const { result } = renderOpsUrlState(`/ops/planner?day=${bad}`)

      expect(result.current.dayState.day).toBeNull()
    },
  )
})

describe('updates write the URL without touching other params (composability)', () => {
  it('setEventId writes ?event= and preserves ?day=', () => {
    const { result } = renderOpsUrlState('/ops/schedule?day=2026-03-04')

    act(() => result.current.selection.setEventId('x'))

    expect(result.current.selection.eventId).toBe('x')
    expect(urlParam(result, 'event')).toBe('x')
    expect(urlParam(result, 'day')).toBe('2026-03-04')
  })

  it('setDay writes ?day= and preserves ?event=', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=abc')

    act(() => result.current.dayState.setDay('2026-03-05'))

    expect(result.current.dayState.day).toBe('2026-03-05')
    expect(urlParam(result, 'day')).toBe('2026-03-05')
    expect(urlParam(result, 'event')).toBe('abc')
  })

  it('setEventId(null) removes the param and leaves ?day= intact', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=abc&day=2026-03-04')

    act(() => result.current.selection.setEventId(null))

    expect(result.current.selection.eventId).toBeNull()
    expect(urlParam(result, 'event')).toBeNull()
    expect(urlParam(result, 'day')).toBe('2026-03-04')
  })

  it('setDay(null) removes the param and leaves ?event= intact', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=abc&day=2026-03-04')

    act(() => result.current.dayState.setDay(null))

    expect(result.current.dayState.day).toBeNull()
    expect(urlParam(result, 'day')).toBeNull()
    expect(urlParam(result, 'event')).toBe('abc')
  })

  it('the path is never touched by param updates', () => {
    const { result } = renderOpsUrlState('/ops/schedule')

    act(() => result.current.selection.setEventId('x'))
    act(() => result.current.dayState.setDay('2026-03-04'))

    // guard: prove the setters actually wrote, so this test can't pass vacuously
    expect(urlParam(result, 'event')).toBe('x')
    expect(result.current.location.pathname).toBe('/ops/schedule')
  })
})

describe('history behavior (judgment call recorded in ops-selection v1)', () => {
  it('hydration follows location changes: back restores the previous pushed state', () => {
    const { result } = renderOpsUrlState('/ops/schedule?event=one')

    act(() => result.current.navigate('/ops/schedule?event=two'))
    expect(result.current.selection.eventId).toBe('two')

    act(() => result.current.navigate(-1))
    expect(result.current.selection.eventId).toBe('one')
  })

  it('setter updates REPLACE, not push: rapid selection does not spam history', () => {
    const { result } = renderOpsUrlState('/ops/schedule')

    // a real pushed entry first, so back has somewhere meaningful to go
    act(() => result.current.navigate('/ops/planner'))
    act(() => result.current.selection.setEventId('a'))
    act(() => result.current.selection.setEventId('b'))
    expect(result.current.selection.eventId).toBe('b')

    // ONE back-press exits the screen — the two selection sets left no history entries
    act(() => result.current.navigate(-1))
    expect(result.current.location.pathname).toBe('/ops/schedule')
    expect(result.current.selection.eventId).toBeNull()
  })
})

/**
 * `?record` (ops-selection v2, C-2-T1): the RESERVED param delivered by the
 * Registry story. Mirrors the `?event` idiom EXACTLY — opaque id, NO validation
 * (unknown/malformed resolves screen-side, not here), inherits all v1 semantics.
 */
describe('useOpsRecord — ?record selection (ops-selection v2 additive bump)', () => {
  it('?record=team:12 hydrates recordId', () => {
    const { result } = renderOpsUrlState('/ops/registry?record=team:12')

    expect(result.current.recordState.recordId).toBe('team:12')
  })

  it('absent ?record → null', () => {
    const { result } = renderOpsUrlState('/ops/registry')

    expect(result.current.recordState.recordId).toBeNull()
  })

  it('empty ?record= is treated as absent → null', () => {
    const { result } = renderOpsUrlState('/ops/registry?record=')

    expect(result.current.recordState.recordId).toBeNull()
  })

  it('malformed ?record=zzz returns AS-IS (opaque — no validation, unlike ?day)', () => {
    const { result } = renderOpsUrlState('/ops/registry?record=zzz')

    expect(result.current.recordState.recordId).toBe('zzz')
  })

  it('setRecordId writes ?record= and preserves ?day= and ?event=', () => {
    const { result } = renderOpsUrlState('/ops/registry?day=2026-03-04&event=abc')

    act(() => result.current.recordState.setRecordId('player:3'))

    expect(result.current.recordState.recordId).toBe('player:3')
    expect(urlParam(result, 'record')).toBe('player:3')
    expect(urlParam(result, 'day')).toBe('2026-03-04')
    expect(urlParam(result, 'event')).toBe('abc')
  })

  it('setRecordId(null) removes the param and leaves ?day= intact', () => {
    const { result } = renderOpsUrlState('/ops/registry?record=team:1&day=2026-03-04')

    act(() => result.current.recordState.setRecordId(null))

    expect(result.current.recordState.recordId).toBeNull()
    expect(urlParam(result, 'record')).toBeNull()
    expect(urlParam(result, 'day')).toBe('2026-03-04')
  })

  it('the path is never touched by setRecordId', () => {
    const { result } = renderOpsUrlState('/ops/registry')

    act(() => result.current.recordState.setRecordId('sport:5'))

    // guard: prove the setter actually wrote, so this test can't pass vacuously
    expect(urlParam(result, 'record')).toBe('sport:5')
    expect(result.current.location.pathname).toBe('/ops/registry')
  })

  it('hydration follows location changes: back restores the previous pushed record', () => {
    const { result } = renderOpsUrlState('/ops/registry?record=team:1')

    act(() => result.current.navigate('/ops/registry?record=player:2'))
    expect(result.current.recordState.recordId).toBe('player:2')

    act(() => result.current.navigate(-1))
    expect(result.current.recordState.recordId).toBe('team:1')
  })

  it('setRecordId updates REPLACE, not push: rapid selection does not spam history', () => {
    const { result } = renderOpsUrlState('/ops/registry')

    // a real pushed entry first, so back has somewhere meaningful to go
    act(() => result.current.navigate('/ops/schedule'))
    act(() => result.current.recordState.setRecordId('team:1'))
    act(() => result.current.recordState.setRecordId('team:2'))
    expect(result.current.recordState.recordId).toBe('team:2')

    // ONE back-press exits the screen — the two selection sets left no history entries
    act(() => result.current.navigate(-1))
    expect(result.current.location.pathname).toBe('/ops/registry')
    expect(result.current.recordState.recordId).toBeNull()
  })
})
