/**
 * EPIC D smoke — FLAG-ON profile (D-4-T1).
 * Journey (backlog §Story D-4): /ops/sync job-health cards + merge-review queue.
 * Covers: 3 job cards (meta strings + status dot) + SYNC [3] tab badge → cand-high
 * resolved merge diff (FIELD | INCOMING | CURRENT, PARTICIPANTS amber, 95% MATCH green)
 * + cand-low incoming-only (62% MATCH amber, no CURRENT column, APPROVE disabled) →
 * APPROVE MERGE / KEEP SEPARATE decisions (terminal status + badge decrement) →
 * a failing decision (inline error + buttons re-enable + badge unchanged).
 *
 * Stateful interception: `setUpSyncE2E` (ops-e2e v1.2) serves STATIC import jobs +
 * an IN-MEMORY merge-candidate store (reset per test — fresh page). This exercises
 * the built bundle + all EPIC D contracts (sync-selectors v1.2 / useSyncData v1 /
 * merge-decision v1) end-to-end; the real-backend WRITE gap (decisions emulated
 * in-memory, jobs static) is the recorded A-5/C-7 trade-off (runbook §sync).
 *
 * TZ pin: the browser timezone is America/New_York so the FIXTURE_JOBS winter (EST,
 * UTC-5) instants read deterministically — 20:00Z→15:00, 21:00Z→16:00, 22:00Z→17:00
 * (matches the syncSelectors unit EST pin).
 *
 * PII (EPIC C DoD 3): every name here is an anonymised fixture value (teams
 * Riverside United / Coastal Rovers, participants 'Coastal Classic — Round 1',
 * 'Summit United — River Falls', sources 'Sports Feed A' …) — NO real fixtures/athletes.
 */
import { expect, test } from '@playwright/test'
import { setUpSyncE2E } from './planzaApi'

// Pin the browser TZ so the job-card wall-clock times are deterministic (EST).
test.use({ timezoneId: 'America/New_York' })

test.beforeEach(async ({ page }) => {
  await setUpSyncE2E(page) // fresh in-memory sync store per test (reset)
})

// Anonymised incoming-name anchors (used to scope each merge card).
const HIGH = 'Riverside United — Coastal Rovers' // cand-high (suggestedEntityId '1')
const LOW = 'Coastal Classic' // cand-low (suggestedEntityId null, incoming-only)
const FAIL = 'Summit United' // cand-fail (decision routes 500)

// AC-1 — job-health cards + SYNC tab badge
test('sync renders 3 job cards with meta + status dot; the SYNC tab reads the pending count', async ({ page }) => {
  await page.goto('/ops/sync')

  const jobCards = page.getByTestId('ops-sync-job')
  await expect(jobCards).toHaveCount(3)

  // deterministic EST wall-clock meta strings (per FIXTURE_JOBS)
  await expect(page.getByText('15:00 · OK · 128 RECORDS')).toBeVisible()
  await expect(page.getByText('16:00 · 3 DEAD-LETTERS')).toBeVisible() // the dead-letter card
  await expect(page.getByText('17:00 · OK · 0 RECORDS')).toBeVisible() // the running job (createdAt fallback)

  // a status-dot span renders per card AND carries the semantic status colour
  // (DOT_COLOR_BY_STATUS): completed→green, failed→red — pins the dot MEANING,
  // not just presence.
  await expect(page.locator('[data-testid="ops-sync-job"] span[aria-hidden="true"]')).toHaveCount(3)
  const completedDot = page.locator('[data-testid="ops-sync-job"]', { hasText: '128 RECORDS' }).locator('span[aria-hidden="true"]')
  await expect(completedDot).toHaveAttribute('style', /status-approved/) // green
  const failedDot = page.locator('[data-testid="ops-sync-job"]', { hasText: '3 DEAD-LETTERS' }).locator('span[aria-hidden="true"]')
  await expect(failedDot).toHaveAttribute('style', /alert-danger/) // red

  // pending fixture count → SYNC [3] on the shell tab
  await expect(page.getByText('SYNC [3]')).toBeVisible()
})

// AC-2 — merge cards: resolved diff (amber changed row + green band) vs incoming-only (amber band)
test('merge cards render the resolved diff + confidence bands; a create-only candidate has no CURRENT column', async ({ page }) => {
  await page.goto('/ops/sync')

  // cand-high — resolved against event 1: FIELD | INCOMING | CURRENT with 4 diff rows.
  const highCard = page.locator('[data-testid="ops-sync-merge-card"]', { hasText: HIGH })
  await expect(highCard).toBeVisible()
  await expect(highCard.getByText('FIELD', { exact: true })).toBeVisible()
  await expect(highCard.getByText('INCOMING', { exact: true })).toBeVisible()
  await expect(highCard.getByText('CURRENT', { exact: true })).toBeVisible()

  const diffRows = highCard.locator('[data-testid="ops-sync-diff-row"]')
  await expect(diffRows).toHaveCount(4)

  // PARTICIPANTS is the changed row — INCOMING flagged amber; both differing values shown.
  const partRow = highCard.locator('[data-testid="ops-sync-diff-row"]', { hasText: 'PARTICIPANTS' })
  await expect(partRow).toContainText(HIGH) // incoming
  await expect(partRow).toContainText('Mon late') // current (event 1 participants)
  const incomingCell = partRow.locator('span').nth(1)
  await expect(incomingCell).toHaveText(HIGH)
  await expect(incomingCell).toHaveAttribute('style', /alert-warning/) // amber (auto-retrying)

  // 95% MATCH in the green band (≥90)
  const highMatch = highCard.getByText('95% MATCH')
  await expect(highMatch).toBeVisible()
  await expect(highMatch).toHaveAttribute('style', /status-approved/) // green

  // cand-low — incoming-only: 62% MATCH amber, NO CURRENT column, APPROVE create-gated off.
  const lowCard = page.locator('[data-testid="ops-sync-merge-card"]', { hasText: LOW })
  await expect(lowCard).toBeVisible()
  const lowMatch = lowCard.getByText('62% MATCH')
  await expect(lowMatch).toBeVisible()
  await expect(lowMatch).toHaveAttribute('style', /alert-warning/) // amber (<90, auto-retrying)
  await expect(lowCard.locator('[data-testid="ops-sync-diff-row"]')).toHaveCount(0)
  await expect(lowCard.getByText('CURRENT NOT LOADED')).toBeVisible()
  await expect(lowCard.getByTestId('ops-sync-approve')).toBeDisabled() // create-only
})

// AC-3 + AC-4 — decisions (terminal status + badge decrement) then a failing decision
test('decisions record terminal status + decrement the badge; a failing decision shows an inline error and re-enables', async ({ page }) => {
  await page.goto('/ops/sync')

  // baseline: 3 pending.
  await expect(page.getByText('SYNC [3]')).toBeVisible()

  // APPROVE MERGE on cand-high → ✓ MERGED INTO REGISTRY, badge 3 → 2.
  const highCard = page.locator('[data-testid="ops-sync-merge-card"]', { hasText: HIGH })
  await highCard.getByTestId('ops-sync-approve').click()
  await expect(highCard.getByTestId('ops-sync-decision-status')).toHaveText('✓ MERGED INTO REGISTRY')
  await expect(page.getByText('SYNC [2]')).toBeVisible()

  // KEEP SEPARATE on cand-low → KEPT AS SEPARATE RECORDS, badge 2 → 1.
  const lowCard = page.locator('[data-testid="ops-sync-merge-card"]', { hasText: LOW })
  await lowCard.getByTestId('ops-sync-keep').click()
  await expect(lowCard.getByTestId('ops-sync-decision-status')).toHaveText('KEPT AS SEPARATE RECORDS')
  await expect(page.getByText('SYNC [1]')).toBeVisible()

  // Failing decision on cand-fail (its route 500s) → inline error, buttons re-enable,
  // badge UNCHANGED (the decided map is untouched).
  const failCard = page.locator('[data-testid="ops-sync-merge-card"]', { hasText: FAIL })
  await failCard.getByTestId('ops-sync-keep').click()
  await expect(failCard.getByTestId('ops-sync-decision-error')).toContainText('Emulated decision failure')
  await expect(failCard.getByTestId('ops-sync-decision-status')).toHaveCount(0) // buttons NOT replaced
  await expect(failCard.getByTestId('ops-sync-keep')).toBeEnabled() // still present/clickable
  await expect(page.getByText('SYNC [1]')).toBeVisible() // unchanged
  await expect(page.getByText('SYNC [0]')).toHaveCount(0) // no phantom commit-on-failure
})
