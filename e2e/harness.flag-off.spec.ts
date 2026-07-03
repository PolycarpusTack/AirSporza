/**
 * A-5-T0 harness proof, FLAG-OFF profile — deliberately trivial (the full AC
 * smoke spec is A-5-T1). Proves: the OFF build has no /ops route, and an
 * AUTHENTICATED user lands on /dashboard — landing on /login instead would
 * mask an auth regression (story AC wording, DoR gate 2026-07-03).
 */
import { expect, test } from '@playwright/test'
import { setUpPlanzaE2E } from './planzaApi'

test('authenticated /ops falls through to /dashboard (flag off)', async ({ page }) => {
  await setUpPlanzaE2E(page)

  await page.goto('/ops')

  await expect(page).toHaveURL(/\/dashboard$/)
})
