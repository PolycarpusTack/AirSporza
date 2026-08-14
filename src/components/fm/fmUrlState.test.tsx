/**
 * Unit tests for useFmSelection (FM1-2-T2).
 * Contract: Contract Snapshot `fmUrlState v1` (this task's hand-off).
 * Mirrors opsUrlState.test.tsx's shape (src/components/ops/opsUrlState.test.tsx) —
 * structural copy, not shared — Rule of Three (2nd occurrence, same reasoning
 * FM1-2-T1 already applied to the shell itself).
 *
 * Scope: `?inbox=<key>` ONLY. `?sport/?comp/?team/?person` are deliberately
 * NOT covered here — they arrive with the screens that consume them
 * (EPIC FM-2/FM-3), not with this task (Core §5.3: no speculative params
 * without a reader).
 */
import { cleanup, renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { useFmSelection } from './fmUrlState'

const wrapperAt = (initialEntry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  }

/** Renders the hook + location/navigation probes under one router. */
const renderFmUrlState = (initialEntry = '/fm/home') =>
  renderHook(
    () => ({
      selection: useFmSelection(),
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
  it('?inbox=abc hydrates inboxKey', () => {
    const { result } = renderFmUrlState('/fm/home?inbox=abc')

    expect(result.current.selection.inboxKey).toBe('abc')
  })

  it('?inbox=conflict:42 (opaque compound key) hydrates as-is', () => {
    const { result } = renderFmUrlState('/fm/home?inbox=conflict:42')

    expect(result.current.selection.inboxKey).toBe('conflict:42')
  })
})

describe('absent / malformed value falls back to null silently', () => {
  it('absent ?inbox → null', () => {
    const { result } = renderFmUrlState('/fm/home')

    expect(result.current.selection.inboxKey).toBeNull()
  })

  it('empty-string ?inbox= is treated as absent → null', () => {
    const { result } = renderFmUrlState('/fm/home?inbox=')

    expect(result.current.selection.inboxKey).toBeNull()
  })
})

describe('updates write the URL (replace, not push) and preserve unrelated params', () => {
  it('setInboxKey writes ?inbox= and preserves unrelated params', () => {
    const { result } = renderFmUrlState('/fm/home?other=keep')

    act(() => result.current.selection.setInboxKey('x'))

    expect(result.current.selection.inboxKey).toBe('x')
    expect(urlParam(result, 'inbox')).toBe('x')
    expect(urlParam(result, 'other')).toBe('keep')
  })

  it('setInboxKey(null) removes the param and leaves unrelated params intact', () => {
    const { result } = renderFmUrlState('/fm/home?inbox=abc&other=keep')

    act(() => result.current.selection.setInboxKey(null))

    expect(result.current.selection.inboxKey).toBeNull()
    expect(urlParam(result, 'inbox')).toBeNull()
    expect(urlParam(result, 'other')).toBe('keep')
  })

  it('the path is never touched by param updates', () => {
    const { result } = renderFmUrlState('/fm/home')

    act(() => result.current.selection.setInboxKey('x'))

    // guard: prove the setter actually wrote, so this test can't pass vacuously
    expect(urlParam(result, 'inbox')).toBe('x')
    expect(result.current.location.pathname).toBe('/fm/home')
  })
})

describe('history behavior (mirrors ops-selection v1\'s judgment call)', () => {
  it('hydration follows location changes: back restores the previous pushed selection', () => {
    const { result } = renderFmUrlState('/fm/home?inbox=one')

    act(() => result.current.navigate('/fm/home?inbox=two'))
    expect(result.current.selection.inboxKey).toBe('two')

    act(() => result.current.navigate(-1))
    expect(result.current.selection.inboxKey).toBe('one')
  })

  it('setInboxKey updates REPLACE, not push: rapid selection does not spam history', () => {
    const { result } = renderFmUrlState('/fm/home')

    // a real pushed entry first, so back has somewhere meaningful to go
    act(() => result.current.navigate('/fm/schedule'))
    act(() => result.current.selection.setInboxKey('a'))
    act(() => result.current.selection.setInboxKey('b'))
    expect(result.current.selection.inboxKey).toBe('b')

    // ONE back-press exits the screen — the two selection sets left no history entries
    act(() => result.current.navigate(-1))
    expect(result.current.location.pathname).toBe('/fm/home')
    expect(result.current.selection.inboxKey).toBeNull()
  })
})
