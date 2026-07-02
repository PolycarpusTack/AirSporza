/**
 * Style contract test for the Ops palette (A-1-T1, ADR-013).
 * Contract: docs/governance/contracts/ops-tokens.md (ops-tokens v1)
 * Mapping rationale: docs/ops-token-map.md
 *
 * tokens.css is read from disk and injected into a <style> tag because jsdom does not
 * load linked stylesheets. jsdom 29 resolves custom properties through the full cascade
 * (verified: both `:root` defaults and `[data-theme="light"]` attribute overrides resolve
 * via getComputedStyle), so these are real computed-value assertions, not raw-text checks.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const TOKENS_CSS_PATH = resolve(__dirname, 'tokens.css')

/** Ops theme vars: dark = `:root` default, light = `[data-theme="light"]` override. */
const SHELL_THEME_VARS: Record<string, { dark: string; light: string }> = {
  '--bg-shell':        { dark: '#090B0D', light: '#EDF1F2' },
  '--surface-shell':   { dark: '#0F1316', light: '#FFFFFF' },
  '--surface-shell-2': { dark: '#141A1E', light: '#F0F4F5' },
  '--border-shell':    { dark: '#212A31', light: '#D6DEE1' },
  '--text-shell':      { dark: '#D9E4EB', light: '#111A1F' },
  '--text-shell-2':    { dark: '#7E8E9A', light: '#54646D' },
  '--text-shell-3':    { dark: '#4E5B66', light: '#8697A0' },
  '--accent-shell':    { dark: '#2FD6C3', light: '#0D9488' },
  '--accent-shell-fg': { dark: '#04241F', light: '#FFFFFF' },
}

/** Fixed semantic sets — identical in both themes, never overridden by the light block. */
const THEME_INVARIANT_VARS: Record<string, string> = {
  // Editorial Status
  '--status-draft':          '#98A2B3',
  '--status-ready':          '#4C8DF5',
  '--status-approved':       '#2BB673',
  '--status-draft-bg':       '#98A2B322',
  '--status-ready-bg':       '#4C8DF522',
  '--status-approved-bg':    '#2BB67322',
  // Alerts
  '--alert-danger':          '#E5484D',
  '--alert-warning':         '#E5A13C',
  '--alert-negotiation':     '#E07B39',
  // Channels
  '--channel-een':           '#E4572E',
  '--channel-canvas':        '#4C8DF5',
  '--channel-vrtmax':        '#2BB673',
  // Registry Kinds
  '--kind-sport':            '#4C8DF5',
  '--kind-competition':      '#E5A13C',
  '--kind-team':             '#2FD6C3',
  '--kind-player':           '#2BB673',
  '--kind-performer':        '#B48EF5',
  '--kind-staff':            '#E4572E',
  '--kind-sport-bg':         '#4C8DF522',
  '--kind-competition-bg':   '#E5A13C22',
  '--kind-team-bg':          '#2FD6C322',
  '--kind-player-bg':        '#2BB67322',
  '--kind-performer-bg':     '#B48EF522',
  '--kind-staff-bg':         '#E4572E22',
}

/** Legacy vars that must keep their pre-ops values in BOTH theme states (story AC-4). */
const LEGACY_REGRESSION_VARS: Record<string, string> = {
  '--bg':      '#0B0F19',   // consumed by src/App.tsx and src/styles/index.css — not repurposed
  '--surface': '#111827',
  '--text':    '#F0F4FF',
  '--text-2':  '#9BAAC4',
  '--text-3':  '#5E6F8A',
  '--border':  '#1F2D45',
  '--primary': '#F59E0B',
  '--danger':  '#F87171',
  '--warning': '#F59E0B',
  '--t2':      '1.75rem',   // type-scale SIZE — name deliberately not taken by the ops text color
  '--t3':      '2.25rem',
}

let styleEl: HTMLStyleElement

const readVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

beforeAll(() => {
  styleEl = document.createElement('style')
  styleEl.textContent = readFileSync(TOKENS_CSS_PATH, 'utf8')
  document.head.appendChild(styleEl)
})

afterAll(() => {
  styleEl.remove()
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('ops theme vars — dark is the default (no data-theme attribute)', () => {
  it.each(Object.entries(SHELL_THEME_VARS))('%s resolves to its dark value', (name, { dark }) => {
    expect(readVar(name)).toBe(dark)
  })
})

describe('ops theme vars — [data-theme="light"] overrides to light values', () => {
  it.each(Object.entries(SHELL_THEME_VARS))('%s resolves to its light value', (name, { light }) => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(light)
  })
})

describe('fixed semantic vars — identical in both themes', () => {
  it.each(Object.entries(THEME_INVARIANT_VARS))('%s is theme-invariant', (name, value) => {
    expect(readVar(name)).toBe(value)

    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(value)
  })
})

describe('legacy token regression (AC-4: existing values untouched, light block scoped to ops vars)', () => {
  it.each(Object.entries(LEGACY_REGRESSION_VARS))('%s keeps its legacy value in both states', (name, value) => {
    expect(readVar(name)).toBe(value)

    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(value)
  })

  it('the [data-theme="light"] block declares ONLY the nine ops theme vars', () => {
    expect(styleEl.sheet).not.toBeNull()
    const sheet = styleEl.sheet!
    const lightRules = Array.from(sheet.cssRules).filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText.includes('data-theme="light"'),
    )
    expect(lightRules.length).toBe(1)

    const declared = Array.from({ length: lightRules[0].style.length }, (_, i) => lightRules[0].style[i])
    expect(declared.sort()).toEqual(Object.keys(SHELL_THEME_VARS).sort())
  })
})
