/**
 * useContinue — CONTINUE loop hook unit tests (FM1-5-T1, Story FM1-5 AC).
 * `useFmActionItems()` is MOCKED here (its own fetch/derivation orchestration
 * is useFmActionItems.test.ts's job) — this suite proves ONLY this hook's
 * own contract: priority order, navigation, toast wording, empty-queue ALL
 * CLEAR, and live count. Renders under a real MemoryRouter + FmToastHost
 * (not mocked — FmToast.test.tsx covers FmToast in isolation; this file is
 * FmToast's first real caller, proving the two wire together end to end).
 *
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FmActionItem, UseFmActionItemsReturn } from './useFmActionItems'
import { FmToastHost } from './FmToast'

let hookReturn: UseFmActionItemsReturn

vi.mock('./useFmActionItems', () => ({
  useFmActionItems: () => hookReturn,
}))

import { useContinue } from './useContinue'

function makeItem(overrides: Partial<FmActionItem> & Pick<FmActionItem, 'kind' | 'key'>): FmActionItem {
  return {
    title: `Title for ${overrides.key}`,
    sub: `Sub for ${overrides.key}`,
    targetRoute: '/ops/schedule',
    targetParams: { event: '1' },
    resolved: false,
    ...overrides,
  }
}

function setHook(items: FmActionItem[]) {
  hookReturn = { items, weekEvents: [], isSettled: true, resolve: vi.fn(), refresh: vi.fn() }
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname + location.search}</span>
}

const wrapperAt = (initialEntry: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <FmToastHost>
          {children}
          <LocationProbe />
        </FmToastHost>
      </MemoryRouter>
    )
  }

const renderUseContinue = (initialEntry = '/fm/home') => renderHook(() => useContinue(), { wrapper: wrapperAt(initialEntry) })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  vi.useRealTimers()
})

describe('priority order (CONFLICT > RIGHTS > UNPLACED > CREW > FEED — Story FM1-5 AC)', () => {
  it('targets the first unresolved CONFLICT item even when other kinds appear earlier in derivation order', () => {
    setHook([
      makeItem({ kind: 'FEED', key: 'FEED:1' }),
      makeItem({ kind: 'CREW', key: 'CREW:1' }),
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1', title: 'Crew conflict', targetParams: { event: '9' } }),
    ])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('location').textContent).toBe('/ops/schedule?event=9')
    expect(screen.getByTestId('fm-toast').textContent).toBe('CONFLICT: Crew conflict')
  })

  it('falls through to RIGHTS when no CONFLICT item is unresolved', () => {
    setHook([
      makeItem({ kind: 'UNPLACED', key: 'UNPLACED:1' }),
      makeItem({ kind: 'RIGHTS', key: 'RIGHTS:1', title: 'Rights expiring: Premier League' }),
    ])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('fm-toast').textContent).toBe('RIGHTS: Rights expiring: Premier League')
  })

  it('falls all the way through to FEED when only a FEED item is unresolved', () => {
    setHook([makeItem({ kind: 'FEED', key: 'FEED:1', title: 'Feed change proposed' })])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('fm-toast').textContent).toBe('FEED: Feed change proposed')
  })
})

describe('advance() navigates', () => {
  it('composes targetRoute + targetParams into a real URL (query string)', () => {
    setHook([
      makeItem({ kind: 'UNPLACED', key: 'UNPLACED:1', targetRoute: '/ops/planner', targetParams: { event: '7' } }),
    ])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('location').textContent).toBe('/ops/planner?event=7')
  })

  it('navigates to a bare route (no params) when targetParams is empty', () => {
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1', targetRoute: '/ops/schedule', targetParams: {} })])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('location').textContent).toBe('/ops/schedule')
  })
})

describe('resolve then advance moves on (Story FM1-5 AC)', () => {
  it('skips an item once its `resolved` flag is true and targets the next unresolved one', () => {
    setHook([
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1', resolved: true }),
      makeItem({ kind: 'RIGHTS', key: 'RIGHTS:1', title: 'Next item' }),
    ])
    const { result } = renderUseContinue()

    act(() => result.current.advance())

    expect(screen.getByTestId('fm-toast').textContent).toBe('RIGHTS: Next item')
  })
})

describe('empty queue → ALL CLEAR, no navigation (Story FM1-5 AC)', () => {
  it('shows ALL CLEAR and does not navigate when every item is resolved', () => {
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1', resolved: true })])
    const { result } = renderUseContinue('/fm/home')

    act(() => result.current.advance())

    expect(screen.getByTestId('location').textContent).toBe('/fm/home')
    expect(screen.getByTestId('fm-toast').textContent).toBe('ALL CLEAR')
  })

  it('shows ALL CLEAR when the items list itself is empty', () => {
    setHook([])
    const { result } = renderUseContinue('/fm/home')

    act(() => result.current.advance())

    expect(screen.getByTestId('location').textContent).toBe('/fm/home')
    expect(screen.getByTestId('fm-toast').textContent).toBe('ALL CLEAR')
  })
})

describe('unresolvedCount (Story FM1-5 AC: "current unresolved count", live)', () => {
  it('counts unresolved items across all 5 kinds, INCLUDING FEED (unlike the nav badge)', () => {
    setHook([
      makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1' }),
      makeItem({ kind: 'FEED', key: 'FEED:1' }),
      makeItem({ kind: 'CREW', key: 'CREW:1', resolved: true }),
    ])
    const { result } = renderUseContinue()

    expect(result.current.unresolvedCount).toBe(2)
  })

  it('is 0 when items is empty', () => {
    setHook([])
    const { result } = renderUseContinue()

    expect(result.current.unresolvedCount).toBe(0)
  })

  it('updates live as the underlying items list changes', () => {
    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1' })])
    const { result, rerender } = renderUseContinue()
    expect(result.current.unresolvedCount).toBe(1)

    setHook([makeItem({ kind: 'CONFLICT', key: 'CONFLICT:1' }), makeItem({ kind: 'RIGHTS', key: 'RIGHTS:1' })])
    rerender()

    expect(result.current.unresolvedCount).toBe(2)
  })
})
