/**
 * EPIC B smoke — FLAG-ON profile (B-4-T1).
 * Journey (backlog §Story B-4): schedule → select event → RUNDOWN shows the
 * same selection outlined → switch day via pills → RIGHTS tiles/matrix match
 * the intercepted fixture contracts. Pins the EPIC B DoD additions: rundown
 * positions correct to the minute, selection shared via URL, rights numbers
 * reconciling 1:1 with the contracts payload.
 *
 * SEPARATE file from smoke.flag-on.spec.ts (recorded call): EPIC A pins stay
 * byte-stable, and the flag-on Playwright project/webServer is SHARED — a new
 * spec file adds ZERO build cost (the ops-e2e two-build note concerns
 * projects, not files).
 *
 * Tab-switch UX observation (for the EPIC B retro): OpsShell tabs are plain
 * path NavLinks — ?day/?event DROP on tab switch, so the Schedule→Rundown hop
 * deep-links here. ADR-014 is silent on param carry-over; revisit at the retro.
 *
 * Clock: FIXTURE_NOW_DAYTIME (setUpPlanzaE2E). Tile counts were verified
 * IDENTICAL to the unit suite's FIXTURE_NOW; the comp-101 validity bar literal
 * DIFFERS from the unit literal (44.1629% vs 44.2009%) because 10 clock-hours
 * of term have additionally elapsed — probed through the real selectors.
 */
import { expect, test } from '@playwright/test'
import { setUpPlanzaE2E } from './planzaApi'

test('EPIC B journey: schedule selection → rundown lanes/pills → rights tiles + matrix', async ({ page }) => {
  await setUpPlanzaE2E(page)

  // ── 1. SCHEDULE: fixture week, select e3 ──
  await page.goto('/ops/schedule?day=2026-03-02')
  await page.getByTestId('ops-schedule-row-3').click()
  await expect(page).toHaveURL(/[?&]event=3(&|$)/)
  await expect(page).toHaveURL(/[?&]day=2026-03-02(&|$)/) // setters preserve unrelated params (ops-selection)

  // ── 2. RUNDOWN (deep link — see tab-switch observation above) ──
  // Network-level pin of the interception's HALF-OPEN day window: Tuesday's
  // payload INCLUDES the Tue-00:00Z boundary slot (the backend's inclusive
  // `lte` would also hand it to Monday — divergence recorded in planzaApi.ts).
  const tuesdaySlotsResponse = page.waitForResponse(
    (response) => response.url().includes('/api/broadcast-slots') && response.url().includes('dateStart=2026-03-03'),
  )
  await page.goto('/ops/planner?day=2026-03-03&event=3')
  const tuesdaySlots = (await (await tuesdaySlotsResponse).json()) as { id: string }[]
  expect(tuesdaySlots.some((slot) => slot.id === 's-midnight-boundary')).toBe(true)

  // shared selection: e3's block selected with the accent outline; partner e4 stays danger-outlined
  const e3 = page.getByTestId('ops-rundown-block-3')
  await expect(e3).toBeVisible()
  await expect(e3).toHaveAttribute('data-selected', 'true')
  expect(await e3.getAttribute('style')).toContain('var(--accent-shell)')
  expect(await page.getByTestId('ops-rundown-block-4').getAttribute('style')).toContain('var(--alert-danger)')

  // day pill TUE active for the deep-linked day
  await expect(page.getByTestId('ops-rundown-pill-2026-03-03')).toHaveAttribute('aria-pressed', 'true')

  // geometry to the minute (rundown-layout fixture: slot 18:00–20:00 on Eén)
  await expect(page.getByTestId('ops-rundown-lane-2').getByTestId('ops-rundown-block-3')).toBeVisible()
  const e3Left = await e3.evaluate((el) => parseFloat((el as HTMLElement).style.left))
  const e3Width = await e3.evaluate((el) => parseFloat((el as HTMLElement).style.width))
  expect(e3Left).toBeCloseTo(68.42105263157895, 4) // (1080−300)/1140
  expect(e3Width).toBeCloseTo(10.526315789473685, 4) // 120/1140

  // ── 3. day pill switch → MONDAY lanes swap; ?event survives (ops-selection) ──
  const mondaySlotsResponse = page.waitForResponse(
    (response) => response.url().includes('/api/broadcast-slots') && response.url().includes('dateStart=2026-03-02'),
  )
  await page.getByTestId('ops-rundown-pill-2026-03-02').click()
  await expect(page).toHaveURL(/[?&]day=2026-03-02(&|$)/)
  await expect(page).toHaveURL(/[?&]event=3(&|$)/)

  // half-open window pin, Monday side: the Tue-00:00Z boundary slot is ABSENT
  // (dateEnd=2026-03-03 is EXCLUSIVE here; the backend's `lte` would include it)
  const mondaySlots = (await (await mondaySlotsResponse).json()) as { id: string }[]
  expect(mondaySlots.some((slot) => slot.id === 's-midnight-boundary')).toBe(false)

  // gate on the SETTLED Monday lanes (channel lanes + e2's slot-divergence line
  // '15:00 · 120 min' only exist after the slots/channels payloads applied —
  // the pre-settle fallback paint puts everything in UNASSIGNED at 14:00)
  await expect(page.getByTestId('ops-rundown-lane-2').getByTestId('ops-rundown-block-1')).toBeVisible() // Mon Eén
  await expect(page.getByTestId('ops-rundown-lane-1').getByTestId('ops-rundown-block-2')).toBeVisible() // Mon Canvas
  await expect(page.getByTestId('ops-rundown-block-2').getByText('15:00 · 120 min')).toBeVisible()
  await expect(page.getByTestId('ops-rundown-block-3')).toHaveCount(0) // Tuesday content gone

  // DoD(1) at e2e level: e1's cross-24:00 clamp with floor-yield at the boundary
  const e1 = page.getByTestId('ops-rundown-block-1')
  const e1Left = await e1.evaluate((el) => parseFloat((el as HTMLElement).style.left))
  const e1Width = await e1.evaluate((el) => parseFloat((el as HTMLElement).style.width))
  expect(e1Left).toBeCloseTo(94.73684210526315, 4) // (1380−300)/1140
  expect(e1Width).toBeCloseTo(5.263157894736842, 4) // clamped width 60 — the 80-min floor YIELDS at 24:00

  // ── 4. RIGHTS tab (params drop is fine — the screen uses none) ──
  await page.getByRole('link', { name: 'RIGHTS' }).click()
  await expect(page).toHaveURL(/\/ops\/rights$/)

  // tiles reconcile 1:1 with the intercepted contracts (EPIC B DoD)
  for (const [status, count] of [
    ['VALID', '3'],
    ['EXPIRING', '2'],
    ['NEGOTIATION', '1'],
    ['MISSING', '3'],
  ] as const) {
    await expect(
      page.getByTestId(`ops-rights-tile-${status}`).getByTestId('ops-rights-tile-count'),
    ).toHaveText(count)
  }

  // matrix spot-check: comp 102 derives EXPIRING (word + row status agree)
  const row102 = page.getByTestId('ops-rights-row-102')
  await expect(row102).toHaveAttribute('data-status', 'EXPIRING')
  await expect(row102.getByTestId('ops-rights-status')).toHaveText('EXPIRING')

  // validity bar literal at the DAYTIME clock (see header — differs from the unit literal)
  const bar101 = page.getByTestId('ops-rights-row-101').getByTestId('ops-rights-bar')
  const bar101Width = await bar101.evaluate((el) => parseFloat((el as HTMLElement).style.width))
  expect(bar101Width).toBeCloseTo(44.16286149103842, 4)

  // ON-DEM is RESERVED (AS-8): every cell renders ·
  const ondemTexts = await page.getByTestId('ops-rights-cell-ONDEM').allTextContents()
  expect(ondemTexts).toHaveLength(9)
  expect(ondemTexts.every((text) => text === '·')).toBe(true)
})
