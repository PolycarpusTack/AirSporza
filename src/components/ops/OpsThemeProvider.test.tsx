/**
 * Unit tests for OpsThemeProvider / useOpsTheme (A-1-T2, ADR-013).
 * Upstream contract: docs/governance/contracts/ops-tokens.md (ops-tokens v2) —
 * the attribute flipped here is `data-theme="light"` on <html>; the CSS side
 * (shell + semantic vars swap, legacy vars inert) is covered by tokens.opsTheme.test.ts.
 * This provider's contract: docs/governance/contracts/useOpsTheme.md (useOpsTheme v1).
 */
import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpsThemeProvider, useOpsTheme } from './OpsThemeProvider'

const STORAGE_KEY = 'planza.opsTheme'
const html = () => document.documentElement

const wrapper = ({ children }: { children: ReactNode }) => (
  <OpsThemeProvider>{children}</OpsThemeProvider>
)

const strictWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <OpsThemeProvider>{children}</OpsThemeProvider>
  </StrictMode>
)

const renderOpsTheme = () => renderHook(() => useOpsTheme(), { wrapper })

beforeEach(() => {
  localStorage.clear()
  html().removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  html().removeAttribute('data-theme')
})

describe('useOpsTheme — defaults (AC: no stored preference)', () => {
  it('is dark and leaves <html> without a data-theme attribute', () => {
    const { result } = renderOpsTheme()

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })

  it('does not write a preference the user never expressed', () => {
    renderOpsTheme()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('treats an unrecognised stored value as dark', () => {
    localStorage.setItem(STORAGE_KEY, 'banana')

    const { result } = renderOpsTheme()

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })
})

describe('useOpsTheme — toggle (AC: attribute flip + persistence)', () => {
  it('toggle() → light: sets data-theme="light" on <html> and persists "light"', () => {
    const { result } = renderOpsTheme()

    act(() => result.current.toggle())

    expect(result.current.theme).toBe('light')
    expect(html().getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('toggle() twice → dark again: attribute removed and "dark" persisted', () => {
    const { result } = renderOpsTheme()

    act(() => result.current.toggle())
    act(() => result.current.toggle())

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('persists exactly once per toggle and never on mount, even under <StrictMode>', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const { result } = renderHook(() => useOpsTheme(), { wrapper: strictWrapper })
    expect(setItem).not.toHaveBeenCalled()

    act(() => result.current.toggle())

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, 'light')
  })
})

describe('useOpsTheme — stored preference on mount (AC: persists across reload)', () => {
  it('stored "light" → mounts light with the attribute set', () => {
    localStorage.setItem(STORAGE_KEY, 'light')

    const { result } = renderOpsTheme()

    expect(result.current.theme).toBe('light')
    expect(html().getAttribute('data-theme')).toBe('light')
  })

  it('stored "dark" → mounts dark without the attribute', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')

    const { result } = renderOpsTheme()

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })
})

describe('useOpsTheme — FOUC guard (AC: attribute set before first paint of ops content)', () => {
  it('applies a stored "light" preference at module-evaluation time, before any render', async () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    vi.resetModules()

    await import('./OpsThemeProvider') // fresh module instance — guard runs at import

    expect(html().getAttribute('data-theme')).toBe('light')
  })

  it('leaves <html> untouched at module-evaluation time when nothing is stored', async () => {
    vi.resetModules()

    await import('./OpsThemeProvider')

    expect(html().hasAttribute('data-theme')).toBe(false)
  })
})

describe('useOpsTheme — storage unavailable (AC: session-only degradation, ADR-013)', () => {
  const breakStorage = () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
  }

  it('mounts dark without crashing', () => {
    breakStorage()

    const { result } = renderOpsTheme()

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })

  it('toggle() → light still works for the session and surfaces no error', () => {
    breakStorage()

    const { result } = renderOpsTheme()

    act(() => result.current.toggle())

    expect(result.current.theme).toBe('light')
    expect(html().getAttribute('data-theme')).toBe('light')
  })

  it('toggle() twice → dark again, still session-only and error-free', () => {
    breakStorage()

    const { result } = renderOpsTheme()

    act(() => result.current.toggle())
    act(() => result.current.toggle())

    expect(result.current.theme).toBe('dark')
    expect(html().hasAttribute('data-theme')).toBe(false)
  })

  it('module-evaluation guard does not crash either', async () => {
    breakStorage()
    vi.resetModules()

    await expect(import('./OpsThemeProvider')).resolves.toBeDefined()
    expect(html().hasAttribute('data-theme')).toBe(false)
  })
})

describe('useOpsTheme — misuse', () => {
  it('throws a descriptive error outside <OpsThemeProvider>', () => {
    // silence React's error boundary logging for the expected throw
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useOpsTheme())).toThrow(/OpsThemeProvider/)
  })
})
