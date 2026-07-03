/**
 * EPIC A smoke — FLAG-ON profile (A-5-T1).
 * Implements backlog §Story A-5 Gherkin ACs 1–4 against the intercepted
 * fixture week (ops-e2e v1: token-seed auth, pinned clock 2026-03-04T10:00Z,
 * full /api/* interception). AC-5 lives in smoke.flag-off.spec.ts.
 * Supersedes the A-5-T0 harness spec (absorbed — recorded in ops-e2e changelog).
 *
 * Runbook: docs/runbooks/ops-shell.md §verification mirrors these steps as a
 * manual checklist — keep the two in sync.
 */
import { expect, test } from '@playwright/test'
// OPS_CHUNK is shared with the flag-off spec ON PURPOSE (A-5-T1 review): the
// POSITIVE match here is the rot-guard for that spec's NEGATIVE assertion.
import { OPS_CHUNK, setUpPlanzaE2E } from './planzaApi'

const FIXTURE_WEEK_URL = '/ops/schedule?day=2026-03-02'

test('AC-1: /ops redirects to /ops/schedule (lazy ops chunk requested); ?day=2026-03-02 renders the fixture week', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(request.url()))
  await setUpPlanzaE2E(page)

  await page.goto('/ops')
  await expect(page).toHaveURL(/\/ops\/schedule$/)
  // Positive chunk assertion — guards the flag-off absence check against
  // chunk-name rot (same regex must keep matching a real request here).
  await expect.poll(() => requested.some((url) => OPS_CHUNK.test(url))).toBe(true)

  await page.goto(FIXTURE_WEEK_URL)

  // Day groups: non-empty fixture days have headers, empty Sat/Sun do not.
  for (const day of ['MON 2 MARCH', 'TUE 3 MARCH', 'WED 4 MARCH', 'THU 5 MARCH', 'FRI 6 MARCH']) {
    await expect(page.getByText(day)).toBeVisible()
  }
  await expect(page.getByText('SAT 7 MARCH')).toHaveCount(0)
  await expect(page.getByText('SUN 8 MARCH')).toHaveCount(0)

  // All 9 in-week events render; e10 (outside the week) does not.
  await expect(page.getByTestId(/^ops-schedule-row-/)).toHaveCount(9)
  await expect(page.getByTestId('ops-schedule-row-10')).toHaveCount(0)

  // comp-102 (event e2) derives EXPIRING (inside the 90-day window at the pinned
  // clock). exact: true — e2's own title also CONTAINS the word "EXPIRING";
  // the RIGHTS word span is the only element whose full text is exactly it.
  await expect(page.getByTestId('ops-schedule-row-2').getByText('EXPIRING', { exact: true })).toBeVisible()
})

test('AC-2: clicking the Football facet (advertised count 3) filters the table to exactly 3 rows', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await page.goto(FIXTURE_WEEK_URL)

  // Scoped to the left rail (<aside>) — schedule rows are role="button" too and
  // a future fixture title could contain "Football". The EXACT accessible name
  // pins the advertised count precisely (a bare toContainText('3') would pass
  // on 13/30/…); the facet icon is aria-hidden, so the name is "Football 3".
  const football = page.locator('aside').getByRole('button', { name: 'Football 3', exact: true })
  await expect(football).toBeVisible()
  await football.click()

  await expect(page.getByTestId(/^ops-schedule-row-/)).toHaveCount(3)
  for (const id of [1, 3, 9]) {
    await expect(page.getByTestId(`ops-schedule-row-${id}`)).toBeVisible()
  }
})

test("AC-3: clicking e3's row selects it (?event=3) and the inspector shows title + red conflict callout with the fixed date shape", async ({ page }) => {
  await setUpPlanzaE2E(page)
  await page.goto(FIXTURE_WEEK_URL)

  await page.getByTestId('ops-schedule-row-3').click()

  await expect(page).toHaveURL(/[?&]event=3(&|$)/)
  await expect(page.getByTestId('ops-inspector-title')).toHaveText(
    'Tue full-conflict A (NEGOTIATION, API-shaped ISO datetime)',
  )
  const callout = page.getByTestId('ops-inspector-conflict')
  await expect(callout).toBeVisible()
  // Pins the A-4-T0 display fix: e3 carries an API-shaped ISO-datetime
  // startDateBE; before the fix this rendered '…T00:00:00.000Z 18:00'.
  await expect(callout).toContainText('2026-03-03 18:00')
  await expect(callout).not.toContainText('T00:00:00')
})

test('AC-4: clean storage → no data-theme; toggling to LIGHT persists across reload (useOpsTheme v1)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await page.goto(FIXTURE_WEEK_URL)

  // Shell must be BOOTED before the clean-storage negative below — asserting
  // attribute-absence against a not-yet-rendered page would false-pass
  // (boot-race window closed at the A-5-T1 review).
  const lightToggle = page.getByRole('button', { name: '☀ LIGHT' })
  await expect(lightToggle).toBeVisible()

  // Clean localStorage (only the auth token is seeded) → dark = attribute ABSENT.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)

  await lightToggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light') // planza.opsTheme persisted
  await expect(page.getByRole('button', { name: '☾ DARK' })).toBeVisible()
})
