/**
 * A-5-T0 harness proof, FLAG-ON profile — deliberately trivial (the full AC
 * smoke spec is A-5-T1). Proves: authenticated session (seeded token +
 * intercepted /auth/me), pinned clock, deep link ?day=2026-03-02, and at least
 * one intercepted fixture round-trip reaching the DOM.
 */
import { expect, test } from '@playwright/test'
import { setUpPlanzaE2E } from './planzaApi'

test('authenticated /ops/schedule?day=2026-03-02 renders the fixture schedule', async ({ page }) => {
  await setUpPlanzaE2E(page)

  const eventsRoundTrip = page.waitForResponse(
    (response) => response.url().includes('/api/events') && response.ok(),
  )
  await page.goto('/ops/schedule?day=2026-03-02')

  // Intercepted fixture round-trip observed on the wire…
  await eventsRoundTrip
  // …and the flagged shell + a fixture event row actually rendered from it.
  await expect(page.getByTestId('ops-screen-schedule')).toBeVisible()
  await expect(page.getByTestId('ops-schedule-row-1')).toBeVisible()
})
