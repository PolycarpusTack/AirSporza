/**
 * Playwright e2e infrastructure (A-5-T0) — contract: docs/governance/contracts/ops-e2e.md.
 *
 * TWO projects because VITE_OPS_REDESIGN is a BUILD-TIME Vite env (TD-27, no
 * runtime toggle): each flag state gets its own build + preview server, driven
 * by Vite mode files `.env.e2e-on` / `.env.e2e-off` (Windows-safe — no shell
 * env assignments, no cross-env dependency).
 *
 * Specs live in e2e/ (repo root) — outside vitest's include (src/**) and the
 * app tsconfig (src + packages); Playwright's own loader transpiles them.
 * Data strategy: FULL network interception (e2e/planzaApi.ts) — the real
 * backend is never started. Chromium only (kept lean on purpose).
 */
import { defineConfig, devices } from '@playwright/test'

const FLAG_ON_PORT = 4181
const FLAG_OFF_PORT = 4182

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
      name: 'flag-off',
      testMatch: /\.flag-off\.spec\.ts$/,
      use: { baseURL: `http://localhost:${FLAG_OFF_PORT}` },
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
  ],
})
