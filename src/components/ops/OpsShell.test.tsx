/**
 * OpsShell chrome/tab tests (A-2-T1, ADR-012 · README §Layout constants).
 * Contract: docs/governance/contracts/OpsShell.md (OpsShell v1).
 * Token names per ops-tokens v2 — assertions check var() references, never hex.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The real ScheduleScreen (A-3-T2) needs AppProvider data + a contracts fetch —
// stubbed empty here (screen behavior is covered by ScheduleScreen.test.tsx;
// this file tests the shell chrome/routing only).
vi.mock('../../context/AppProvider', () => ({
  useApp: () => ({ events: [], sports: [], competitions: [], techPlans: [], crewFields: [] }),
}))
vi.mock('../../services', () => ({ contractsApi: { list: vi.fn(async () => []) } }))

import { OpsShell, OPS_TABS, type OpsTabId } from './OpsShell'

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

const renderShell = (initialPath = '/ops', tabBadges?: Partial<Record<OpsTabId, number>>) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/ops/*" element={<OpsShell tabBadges={tabBadges} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

const currentPath = () => screen.getByTestId('location').textContent

afterEach(() => {
  cleanup() // vitest runs without globals — RTL auto-cleanup is off (codebase convention)
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('tab registry (ADR-014 public URL contract)', () => {
  it('exposes exactly the five contracted tab ids, in order', () => {
    expect(OPS_TABS.map((t) => t.id)).toEqual(['schedule', 'planner', 'rights', 'registry', 'sync'])
  })
})

describe('routing inside the shell', () => {
  it('redirects the /ops index to /ops/schedule', () => {
    renderShell('/ops')

    expect(currentPath()).toBe('/ops/schedule')
    expect(screen.getByTestId('ops-screen-schedule')).toBeTruthy()
  })

  it('falls back to schedule for unknown tab segments', () => {
    renderShell('/ops/bogus')

    expect(currentPath()).toBe('/ops/schedule')
  })

  it('clicking the PLANNER tab navigates to /ops/planner and shows the Rundown placeholder', async () => {
    const user = userEvent.setup()
    renderShell('/ops')

    await user.click(screen.getByRole('link', { name: 'PLANNER' }))

    expect(currentPath()).toBe('/ops/planner')
    expect(screen.getByTestId('ops-screen-planner')).toBeTruthy() // renders RundownScreen (glossary)
  })

  it.each(OPS_TABS)('tab $id reaches its screen', async (tab) => {
    const user = userEvent.setup()
    renderShell('/ops')

    await user.click(screen.getByRole('link', { name: new RegExp(`^${tab.label}`) }))

    expect(currentPath()).toBe(`/ops/${tab.id}`)
    expect(screen.getByTestId(`ops-screen-${tab.id}`)).toBeTruthy()
  })
})

describe('chrome (README §Layout constants, ops-tokens v2)', () => {
  it('renders brand PLANZA with /OPS in the shell accent token', () => {
    renderShell()

    const brand = screen.getByText('PLANZA')
    const ops = screen.getByText('/OPS')
    expect(brand).toBeTruthy()
    expect(ops.style.color).toBe('var(--accent-shell)')
  })

  it('renders the full chrome inventory: 5 tabs, LIVE badge, theme toggle', () => {
    renderShell()

    for (const tab of OPS_TABS) {
      expect(screen.getByRole('link', { name: new RegExp(`^${tab.label}`) })).toBeTruthy()
    }
    expect(screen.getByTestId('ops-live-badge')).toBeTruthy()
    expect(screen.getByRole('button', { name: '☀ LIGHT' })).toBeTruthy()
  })

  it('active tab uses accent bg + accent-fg text; inactive tabs use text-shell-2', () => {
    renderShell('/ops/rights')

    const active = screen.getByRole('link', { name: 'RIGHTS' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(active.style.background).toBe('var(--accent-shell)')
    expect(active.style.color).toBe('var(--accent-shell-fg)')

    const inactive = screen.getByRole('link', { name: 'SCHEDULE' })
    expect(inactive.getAttribute('aria-current')).toBeNull()
    expect(inactive.style.color).toBe('var(--text-shell-2)')
  })

  it('LIVE dot pulses: class wired to the ops.css keyframes (1.4s ease infinite, opacity to 0.3)', () => {
    renderShell()

    const dot = screen.getByTestId('ops-live-badge').querySelector('.ops-live-dot')
    expect(dot).not.toBeNull()

    // jsdom does not compute animations — pin the stylesheet contract instead;
    // the visual pulse itself is A-5 E2E scope.
    const css = readFileSync(resolve(__dirname, 'ops.css'), 'utf8')

    // the fading opacity must live INSIDE the ops-live-pulse keyframes block
    const keyframesBlock = css.match(/@keyframes\s+ops-live-pulse\s*\{[\s\S]*?^\}/m)?.[0]
    expect(keyframesBlock).toBeDefined()
    expect(keyframesBlock).toMatch(/opacity:\s*0?\.3/)

    // the dot rule must reference each animation shorthand token (order-agnostic)
    const dotRule = css.match(/\.ops-live-dot\s*\{[\s\S]*?\}/)?.[0]
    expect(dotRule).toBeDefined()
    for (const token of ['ops-live-pulse', '1.4s', 'ease', 'infinite', 'var(--alert-danger)']) {
      expect(dotRule).toContain(token)
    }
  })
})

describe('theme toggle integration (provider behavior unit-tested in OpsThemeProvider.test.tsx)', () => {
  it('click → light theme on <html> and relabel to ☾ DARK; click again → back to dark', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('button', { name: '☀ LIGHT' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    await user.click(screen.getByRole('button', { name: '☾ DARK' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('SYNC badge slot (wired for real in EPIC D)', () => {
  it('renders SYNC [n] when a badge count is provided', () => {
    renderShell('/ops', { sync: 3 })

    expect(screen.getByRole('link', { name: 'SYNC [3]' })).toBeTruthy()
  })

  it('renders a plain SYNC tab when no badge is provided', () => {
    renderShell()

    const sync = screen.getByRole('link', { name: 'SYNC' })
    expect(sync.textContent).toBe('SYNC')
  })
})
