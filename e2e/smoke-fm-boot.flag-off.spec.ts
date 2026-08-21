/**
 * EPIC FM-1 smoke — FLAG-OFF profile, AC-F (Story FM1-7, FM1-7-T1).
 * `.env.e2e-off` already pins VITE_FM_SHELL=false (added at FM1-2) -- no new
 * Playwright project needed, this file just runs under the EXISTING
 * `flag-off` project (testMatch `*.flag-off.spec.ts$`) alongside the ops
 * equivalent (`smoke.flag-off.spec.ts`), mirroring its exact technique.
 */
import { expect, test } from '@playwright/test'
import { FM_CHUNK, setUpPlanzaE2E } from './planzaApi'

test('AC-F: authenticated /fm lands on /dashboard and the fm lazy chunk is never requested', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await setUpPlanzaE2E(page)

  await page.goto('/fm')

  await expect(page).toHaveURL(/\/dashboard$/)
  expect(requested.filter((url) => FM_CHUNK.test(url))).toEqual([])
})
