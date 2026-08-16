/**
 * FM boot-proof smoke — FLAG-FM-ON profile (FM1-7-T0).
 * TDD gate mirroring A-5-T0's own trivial harness spec: proves the new
 * `flag-fm-on` build profile + `setUpFmE2E` interception boot green BEFORE
 * FM1-7-T1 builds the real ACs (CONTINUE loop, resolve-persists, create
 * modal, interim-bridge navigation, …) on top. Deliberately ONE trivial test.
 */
import { expect, test } from '@playwright/test'
import { setUpFmE2E } from './planzaApi'

test.beforeEach(async ({ page }) => {
  await setUpFmE2E(page)
})

test('boot: authenticated /fm redirects to /fm/home and the FM chrome renders', async ({ page }) => {
  await page.goto('/fm')

  await expect(page).toHaveURL(/\/fm\/home$/)
  await expect(page.getByText('PLANZA/FM')).toBeVisible()
})
