/**
 * EPIC A smoke — FLAG-OFF profile (A-5-T1).
 * Implements backlog §Story A-5 AC-5. Supersedes the A-5-T0 harness spec
 * (absorbed — recorded in the ops-e2e changelog).
 *
 * The ops chunk EXISTS in the off build (the lazy import is always emitted);
 * what the flag controls is whether it is ever REQUESTED — that network-level
 * assertion closes OpsShell v1 §Resolved ambiguities #4 and the EPIC A DoD
 * "bundle-split verified". Chunk-name rot is guarded by the flag-on AC-1
 * POSITIVE assertion using the same regex.
 */
import { expect, test } from '@playwright/test'
// Chunk regexes shared with the flag-on spec ON PURPOSE (A-5-T1 review): its
// POSITIVE OPS_CHUNK match is the rot-guard for the NEGATIVE assertion here.
import { LEGACY_DASHBOARD_CHUNK, OPS_CHUNK, setUpPlanzaE2E } from './planzaApi'

test('AC-5: authenticated /ops lands on /dashboard (not /login) and the ops lazy chunk is never requested', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await setUpPlanzaE2E(page)

  await page.goto('/ops')

  // Landing on /dashboard proves BOTH the flag fallthrough AND an intact
  // authenticated session — /login here would mask an auth regression (AC wording).
  await expect(page).toHaveURL(/\/dashboard$/)

  // The legacy app actually booted (its own lazy chunk arrived)…
  await expect.poll(() => requested.some((url) => LEGACY_DASHBOARD_CHUNK.test(url))).toBe(true)
  // …and the ops chunk was never requested.
  expect(requested.filter((url) => OPS_CHUNK.test(url))).toEqual([])
})
