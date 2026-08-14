/**
 * FmNavBadgeContext unit tests (FM1-2-T1). Structural copy of the "unit-
 * testable in isolation" guarantee documented in opsTabBadges.ts's header —
 * ops has no equivalent standalone test file (its context is only exercised
 * through OpsShell's mounted SyncScreen, D-1-T2), so this file is FM-only
 * coverage, not a mirrored precedent.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FmNavBadgeContext, useSetNavBadge } from './fmNavBadges'

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
})

function Publisher({ count }: { count: number | undefined }) {
  const setNavBadge = useSetNavBadge()
  setNavBadge('home', count)
  return <div data-testid="publisher" />
}

describe('FmNavBadgeContext', () => {
  it('default value is a no-op — calling it outside a Provider never throws', () => {
    expect(() => render(<Publisher count={3} />)).not.toThrow()
    expect(screen.getByTestId('publisher')).toBeTruthy()
  })

  it('a Provider value receives the published (navId, count) call', () => {
    const setNavBadge = vi.fn()

    render(
      <FmNavBadgeContext.Provider value={setNavBadge}>
        <Publisher count={5} />
      </FmNavBadgeContext.Provider>,
    )

    expect(setNavBadge).toHaveBeenCalledWith('home', 5)
  })
})
