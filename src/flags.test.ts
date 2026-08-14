/**
 * Pins the feature-flag convention itself (A-2-T1) against the REAL module —
 * the routing tests mock src/flags.ts, so the absent-env default is pinned here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFmShellEnabled, isOpsRedesignEnabled } from './flags'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('flags convention — opsRedesign (ADR-012)', () => {
  it('defaults OFF when VITE_OPS_REDESIGN is absent (this test env defines no value)', () => {
    expect(import.meta.env.VITE_OPS_REDESIGN).toBeUndefined()
    expect(isOpsRedesignEnabled()).toBe(false)
  })

  it('is ON only for the exact string "true" — read at call time', () => {
    vi.stubEnv('VITE_OPS_REDESIGN', 'true')
    expect(isOpsRedesignEnabled()).toBe(true)
  })

  it('any other value stays OFF', () => {
    vi.stubEnv('VITE_OPS_REDESIGN', '1')
    expect(isOpsRedesignEnabled()).toBe(false)

    vi.stubEnv('VITE_OPS_REDESIGN', 'TRUE')
    expect(isOpsRedesignEnabled()).toBe(false)
  })
})

describe('flags convention — fmShell (ADR-020, FM1-2-T1)', () => {
  it('defaults OFF when VITE_FM_SHELL is absent (this test env defines no value)', () => {
    expect(import.meta.env.VITE_FM_SHELL).toBeUndefined()
    expect(isFmShellEnabled()).toBe(false)
  })

  it('is ON only for the exact string "true" — read at call time', () => {
    vi.stubEnv('VITE_FM_SHELL', 'true')
    expect(isFmShellEnabled()).toBe(true)
  })

  it('any other value stays OFF (never z.coerce.boolean — the RD-3/SV footgun)', () => {
    vi.stubEnv('VITE_FM_SHELL', '1')
    expect(isFmShellEnabled()).toBe(false)

    vi.stubEnv('VITE_FM_SHELL', 'TRUE')
    expect(isFmShellEnabled()).toBe(false)
  })
})
