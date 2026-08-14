/**
 * Style contract test for FM tokens (FM1-1-T1, EPIC FM-1).
 * Contract: docs/ops-token-map.md (FM section) — marker bumped to ops-tokens v4 (additive only).
 *
 * Scope: FM-1 ships no theme toggle (backlog AC), so `--border-shell-soft` is a DARK-ONLY
 * addition — deliberately not declared in the `[data-theme="light"]` block. Light-theme
 * derivation is explicitly deferred to EPIC FM-5.2. This file is intentionally separate
 * from `tokens.opsTheme.test.ts`: that file's fixtures assert both-theme values and an
 * *exact* light-block membership set (nine shell + fifteen semantic vars) — folding a
 * dark-only var into those fixtures would wrongly imply it needs (or is missing) a light
 * value. See `docs/ops-token-map.md` "FM tokens" section for the naming rationale.
 *
 * tokens.css is read from disk and injected into a <style> tag because jsdom does not load
 * linked stylesheets (same technique as tokens.opsTheme.test.ts).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const TOKENS_CSS_PATH = resolve(__dirname, 'tokens.css')

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

describe('--border-shell-soft (FM1-1-T1, dark-only)', () => {
  it('resolves to #1A2126 by default (no data-theme attribute)', () => {
    expect(readVar('--border-shell-soft')).toBe('#1A2126')
  })

  it('keeps resolving to #1A2126 under [data-theme="light"] (no override — light derivation deferred to FM-5.2)', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(readVar('--border-shell-soft')).toBe('#1A2126')
  })

  it('is NOT declared inside the [data-theme="light"] block (deferral is deliberate, not an oversight)', () => {
    const lightRule = Array.from(styleEl.sheet!.cssRules).find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText.includes('data-theme="light"'),
    )!
    const declared = Array.from({ length: lightRule.style.length }, (_, i) => lightRule.style[i])
    expect(declared).not.toContain('--border-shell-soft')
  })
})
