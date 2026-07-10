/**
 * Style contract test for the Ops palette (A-1-T1, ADR-013; amended by A-1-T4).
 * Contract: docs/governance/contracts/ops-tokens.md (ops-tokens v3)
 * Mapping rationale: docs/ops-token-map.md · Audit: docs/ops-contrast-audit.md
 *
 * A-1-T4 (architect decision 2026-07-02, post contrast audit): the semantic sets
 * (status/alert/channel/kind base colors) are THEME-AWARE — light values live in the
 * [data-theme="light"] block alongside the shell vars. Only the chip `-bg` tints
 * remain theme-invariant literals.
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

/** Ops shell vars: dark = `:root` default, light = `[data-theme="light"]` override. */
const SHELL_THEME_VARS: Record<string, { dark: string; light: string }> = {
  '--bg-shell':        { dark: '#090B0D', light: '#EDF1F2' },
  '--surface-shell':   { dark: '#0F1316', light: '#FFFFFF' },
  '--surface-shell-2': { dark: '#141A1E', light: '#F0F4F5' },
  '--border-shell':    { dark: '#212A31', light: '#D6DEE1' },
  '--text-shell':      { dark: '#D9E4EB', light: '#111A1F' },
  '--text-shell-2':    { dark: '#7E8E9A', light: '#54646D' },
  '--text-shell-3':    { dark: '#738594', light: '#5E6E77' }, // AA-adjusted (A-1-T4, F-1)
  '--accent-shell':    { dark: '#2FD6C3', light: '#0D9488' },
  '--accent-shell-fg': { dark: '#04241F', light: '#111A1F' }, // light: AA-adjusted (A-1-T4, F-2)
}

/**
 * Semantic base colors — theme-aware since A-1-T4 (architect decision 2026-07-02):
 * dark values are design final-intent; light values are AA-derived (F-3/F-4/F-5).
 */
const SEMANTIC_THEME_VARS: Record<string, { dark: string; light: string }> = {
  // Editorial Status
  '--status-draft':      { dark: '#98A2B3', light: '#5C687D' },
  '--status-ready':      { dark: '#4C8DF5', light: '#0C5CDC' },
  '--status-approved':   { dark: '#2BB673', light: '#1C744A' },
  // Alerts
  '--alert-danger':      { dark: '#E5484D', light: '#D31F24' },
  '--alert-warning':     { dark: '#E5A13C', light: '#976214' },
  '--alert-negotiation': { dark: '#E07B39', light: '#A9551B' },
  // Channels
  '--channel-een':       { dark: '#E4572E', light: '#C13F19' },
  '--channel-canvas':    { dark: '#4C8DF5', light: '#0D63EC' },
  '--channel-vrtmax':    { dark: '#2BB673', light: '#1D7B4E' },
  // Registry Kinds (staff dark AA-adjusted per A-1-T4 F-4)
  '--kind-sport':        { dark: '#4C8DF5', light: '#0C5CDC' },
  '--kind-competition':  { dark: '#E5A13C', light: '#8F5D13' },
  '--kind-team':         { dark: '#2FD6C3', light: '#17756B' },
  '--kind-player':       { dark: '#2BB673', light: '#1C744A' },
  '--kind-performer':    { dark: '#B48EF5', light: '#7C3AEE' },
  '--kind-staff':        { dark: '#E76843', light: '#B43B17' },
}

/**
 * Chip `-bg` tints — still theme-invariant (architect decision: tints stay the
 * dark-tuned base @ alpha 22 in both themes). Staff tint follows its new dark base.
 */
const THEME_INVARIANT_VARS: Record<string, string> = {
  '--status-draft-bg':     '#98A2B322',
  '--status-ready-bg':     '#4C8DF522',
  '--status-approved-bg':  '#2BB67322',
  '--kind-sport-bg':       '#4C8DF522',
  '--kind-competition-bg': '#E5A13C22',
  '--kind-team-bg':        '#2FD6C322',
  '--kind-player-bg':      '#2BB67322',
  '--kind-performer-bg':   '#B48EF522',
  '--kind-staff-bg':       '#E7684322', // follows the A-1-T4 dark base shift
}

/**
 * Rights/Crew word aliases (A-3-T2, ops-tokens v3) — pure var() references to
 * semantic referents; never declared in the light block (they follow referents).
 */
const ALIAS_VARS: Record<string, string> = {
  '--rights-valid':       '--status-approved',
  '--rights-expiring':    '--alert-warning',
  '--rights-negotiation': '--alert-negotiation',
  '--rights-missing':     '--alert-danger',
  '--crew-ok':            '--status-approved',
  '--crew-open':          '--alert-warning',
  '--crew-conflict':      '--alert-danger',
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

/** Everything the [data-theme="light"] block must declare — exactly, nothing else. */
const LIGHT_BLOCK_VARS = [...Object.keys(SHELL_THEME_VARS), ...Object.keys(SEMANTIC_THEME_VARS)]

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

describe('ops shell vars — dark is the default (no data-theme attribute)', () => {
  it.each(Object.entries(SHELL_THEME_VARS))('%s resolves to its dark value', (name, { dark }) => {
    expect(readVar(name)).toBe(dark)
  })
})

describe('ops shell vars — [data-theme="light"] overrides to light values', () => {
  it.each(Object.entries(SHELL_THEME_VARS))('%s resolves to its light value', (name, { light }) => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(light)
  })
})

describe('semantic base vars — dark design values by default (theme-aware since A-1-T4)', () => {
  it.each(Object.entries(SEMANTIC_THEME_VARS))('%s resolves to its dark value', (name, { dark }) => {
    expect(readVar(name)).toBe(dark)
  })
})

describe('semantic base vars — [data-theme="light"] overrides to AA-derived light values', () => {
  it.each(Object.entries(SEMANTIC_THEME_VARS))('%s resolves to its light value', (name, { light }) => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(light)
  })
})

describe('chip -bg tints — identical in both themes (dark-tuned base @ alpha 22)', () => {
  it.each(Object.entries(THEME_INVARIANT_VARS))('%s is theme-invariant', (name, value) => {
    expect(readVar(name)).toBe(value)

    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(value)
  })
})

describe('rights/crew word aliases — pure var() references to their referents (ops-tokens v3)', () => {
  // jsdom LIMITATION: getComputedStyle keeps custom-property values verbatim (no
  // var() substitution inside custom properties), so we pin the raw reference in
  // both theme states instead. Theme-awareness follows transitively: the referents'
  // per-theme values are pinned by the SEMANTIC_THEME_VARS suites above, and the
  // aliases are proven absent from the light block below.
  it.each(Object.entries(ALIAS_VARS))('%s is declared as var(%s) in both theme states', (alias, referent) => {
    expect(readVar(alias)).toBe(`var(${referent})`)

    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(alias)).toBe(`var(${referent})`)
  })

  // Guards coordinated fixture+CSS drift: an alias pointing at a var that is not
  // itself theme-aware would stay green in jsdom but break in a real browser.
  it.each([...new Set(Object.values(ALIAS_VARS))])(
    'referent %s is itself a pinned theme-aware semantic var',
    (referent) => {
      expect(Object.keys(SEMANTIC_THEME_VARS)).toContain(referent)
    },
  )

  it('aliases are NEVER declared in the [data-theme="light"] block (they follow referents)', () => {
    const lightRule = Array.from(styleEl.sheet!.cssRules).find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText.includes('data-theme="light"'),
    )!
    const declared = Array.from({ length: lightRule.style.length }, (_, i) => lightRule.style[i])
    for (const alias of Object.keys(ALIAS_VARS)) {
      expect(declared).not.toContain(alias)
    }
  })
})

describe('legacy token regression (AC-4: existing values untouched, light block scoped to ops vars)', () => {
  it.each(Object.entries(LEGACY_REGRESSION_VARS))('%s keeps its legacy value in both states', (name, value) => {
    expect(readVar(name)).toBe(value)

    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar(name)).toBe(value)
  })

  it('the [data-theme="light"] block declares EXACTLY the 9 shell + 15 semantic ops vars — never a legacy var', () => {
    expect(styleEl.sheet).not.toBeNull()
    const sheet = styleEl.sheet!
    const lightRules = Array.from(sheet.cssRules).filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText.includes('data-theme="light"'),
    )
    expect(lightRules.length).toBe(1)

    const declared = Array.from({ length: lightRules[0].style.length }, (_, i) => lightRules[0].style[i])
    expect(declared.sort()).toEqual([...LIGHT_BLOCK_VARS].sort())
    // guards fixture drift: proves LIGHT_BLOCK_VARS shares no name with LEGACY_REGRESSION_VARS
    // (set equality alone would pass if a legacy name were added to both fixture and CSS)
    for (const legacyVar of Object.keys(LEGACY_REGRESSION_VARS)) {
      expect(declared).not.toContain(legacyVar)
    }
  })
})
