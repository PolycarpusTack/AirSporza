/**
 * Playwright e2e infrastructure (A-5-T0) — contract: docs/governance/contracts/ops-e2e.md.
 * FM1-7-T0 layers a THIRD project (`flag-fm-on`) on top — contract:
 * docs/governance/contracts/fm-e2e.md.
 *
 * THREE projects because VITE_OPS_REDESIGN / VITE_FM_SHELL are BUILD-TIME Vite
 * envs (TD-27, no runtime toggle): each flag combination gets its own build +
 * preview server, driven by Vite mode files `.env.e2e-on` / `.env.e2e-off` /
 * `.env.e2e-fm-on` (Windows-safe — no shell env assignments, no cross-env
 * dependency). NOTE (FM1-7-T0): the flag-OFF AC for `VITE_FM_SHELL=false`
 * reuses the EXISTING `flag-off` project below — `.env.e2e-off` already pins
 * `VITE_FM_SHELL=false` (added at FM1-2) — so there is no separate
 * `flag-fm-off` project; adding one would just rebuild an already-OFF profile.
 *
 * Specs live in e2e/ (repo root) — outside vitest's include (src/**) and the
 * app tsconfig (src + packages); Playwright's own loader transpiles them.
 * Data strategy: FULL network interception (e2e/planzaApi.ts) — the real
 * backend is never started. Chromium only (kept lean on purpose).
 */
import { defineConfig, devices } from '@playwright/test'

const FLAG_ON_PORT = 4181
const FLAG_OFF_PORT = 4182
const FLAG_FM_ON_PORT = 4183

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Flag-ON build: /ops/* routes registered, ops chunk served.
      name: 'flag-on',
      testMatch: /\.flag-on\.spec\.ts$/,
      use: { baseURL: `http://localhost:${FLAG_ON_PORT}` },
    },
    {
      // Flag-OFF build: /ops falls through to the legacy catch-all (/dashboard).
      // Also the flag-fm-off project: `.env.e2e-off` already pins
      // VITE_FM_SHELL=false, so /fm falls through the same way — no separate
      // FM-specific OFF profile needed (FM1-7-T0).
      name: 'flag-off',
      testMatch: /\.flag-off\.spec\.ts$/,
      use: { baseURL: `http://localhost:${FLAG_OFF_PORT}` },
    },
    {
      // Flag-FM-ON build: VITE_FM_SHELL=true AND VITE_OPS_REDESIGN=true — the
      // FM interim bridge (ADR-014) navigates to real /ops/* routes, so ops
      // must be ON too (FM1-7-T0).
      name: 'flag-fm-on',
      testMatch: /\.flag-fm-on\.spec\.ts$/,
      use: { baseURL: `http://localhost:${FLAG_FM_ON_PORT}` },
    },
  ],
  // Each server builds its profile then serves it (vite preview has SPA
  // history fallback, so deep links like /ops/schedule?day=… resolve).
  webServer: [
    {
      command: 'npm run e2e:serve:on',
      url: `http://localhost:${FLAG_ON_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run e2e:serve:off',
      url: `http://localhost:${FLAG_OFF_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run e2e:serve:fm-on',
      url: `http://localhost:${FLAG_FM_ON_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
