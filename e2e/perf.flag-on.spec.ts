/**
 * E-1 Playwright perf layer (VERIFICATION hat — measurement only, NO production
 * edit). Wall-clock goto→settled-testid for the mount-to-settled RENDER SLOs
 * (#1 schedule@500, #5 registry@2000, #8 sync@50+100) and the INTERACTION SLOs
 * (#2 theme toggle, #3 rundown day-switch, #7 registry row→inspector).
 *
 * HONESTY: these are browser + THIS-MACHINE numbers (Chromium via `vite preview`
 * of the flag-on build, served locally with intercepted network). They are NOT a
 * production-hardware guarantee — the p95 over N is labelled with the machine
 * profile in the report. Scaled fixtures are synthetic/anonymised, served through
 * the existing interception harness (setUpPlanzaE2E) with the four registry / the
 * events / the import routes overridden by the deterministic generators.
 *
 * The spec NEVER hard-fails on an SLO breach (a breach is DATA, surfaced in the
 * log + report, never a silently-retargeted PASS); it asserts only that the
 * settled DOM was reached so the measurement is real. Verdicts are printed as
 * `PERF-PW … VERDICT=PASS|FAIL`.
 */
import { expect, test, type Page } from '@playwright/test'
import { setUpPlanzaE2E } from './planzaApi'
import {
  makeCandidateScale,
  makeEventScale,
  makeJobScale,
  makeRegistryScale,
} from '../src/components/ops/__perf__/scaledFixtures'

// Independent measurement tests (NOT serial — one breach must never skip the rest).
test.describe.configure({ timeout: 240_000 })

const RENDER_N = 15
const INTERACT_N = 25

function pctl(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

function verdict(label: string, samples: number[], budget: number, tag: 'p95' | 'p99'): void {
  const p50 = pctl(samples, 50)
  const p = tag === 'p99' ? pctl(samples, 99) : pctl(samples, 95)
  const pass = p < budget
  // eslint-disable-next-line no-console
  console.log(
    `PERF-PW ${label} | ${tag}=${p.toFixed(1)}ms p50=${p50.toFixed(1)}ms budget=${budget}ms ` +
      `N=${samples.length} min=${Math.min(...samples).toFixed(1)} max=${Math.max(...samples).toFixed(1)} ` +
      `VERDICT=${pass ? 'PASS' : 'FAIL'}`,
  )
}

/** API-shaped events: startDateBE date-only strings are already wire-safe. */
async function overrideRegistry(page: Page): Promise<void> {
  const reg = makeRegistryScale(1) // 20 + 200 + 780 + 1000 = 2000
  await page.route('**/api/sports', (r) => r.fulfill({ json: reg.sports }))
  await page.route('**/api/competitions', (r) => r.fulfill({ json: reg.competitions }))
  await page.route('**/api/teams*', (r) => r.fulfill({ json: reg.teams }))
  await page.route('**/api/players*', (r) => r.fulfill({ json: reg.players }))
}

test('PERF-PW #5 registry initial render @2000 (goto → table painted, windowed)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await overrideRegistry(page)

  const samples: number[] = []
  for (let i = 0; i < RENDER_N; i++) {
    const t0 = Date.now()
    await page.goto('/ops/registry')
    // E-1 remediation: the table now WINDOWS the row list, so the last row
    // (player:1000) is deliberately NOT mounted — the pre-fix "all 2,000 nodes
    // attached" marker is gone by design. Settled = the full data path is done
    // (all 2,000 records fetched → buildRegistryIndex → projectRegistryRows) and
    // the windowed table is interactive: the scroll container plus the FIRST
    // projected row (sport:1) are attached. That is the honest "initial render"
    // signal for a windowed list.
    await page.getByTestId('ops-registry-scroll').waitFor({ state: 'attached', timeout: 20_000 })
    await page.getByTestId('ops-registry-row-sport:1').waitFor({ state: 'attached', timeout: 20_000 })
    samples.push(Date.now() - t0)
  }
  verdict('#5 registry render @2000', samples, 1500, 'p95')
  expect(samples.length).toBe(RENDER_N)
})

test('PERF-PW #1 schedule initial render @500 (goto → all rows settled)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  const events = makeEventScale(500)
  await page.route('**/api/events', (r) => r.fulfill({ json: events }))

  const samples: number[] = []
  for (let i = 0; i < RENDER_N; i++) {
    const t0 = Date.now()
    await page.goto('/ops/schedule?day=2026-03-02')
    await page.getByTestId('ops-schedule-row-500').waitFor({ state: 'attached' })
    samples.push(Date.now() - t0)
  }
  verdict('#1 schedule render @500', samples, 1500, 'p95')
  expect(samples.length).toBe(RENDER_N)
})

test('PERF-PW #8 sync initial render @50jobs+100cand (goto → cards settled)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  const jobs = makeJobScale(50)
  const candidates = makeCandidateScale(100)
  const events = makeEventScale(500)
  await page.route('**/api/events', (r) => r.fulfill({ json: events }))
  await page.route('**/api/import/jobs', (r) => r.fulfill({ json: jobs }))
  await page.route('**/api/import/merge-candidates*', (r) => r.fulfill({ json: candidates }))

  const samples: number[] = []
  for (let i = 0; i < RENDER_N; i++) {
    const t0 = Date.now()
    await page.goto('/ops/sync')
    await expect(page.getByTestId('ops-sync-job')).toHaveCount(50)
    await expect(page.getByTestId('ops-sync-merge-card')).toHaveCount(100)
    samples.push(Date.now() - t0)
  }
  verdict('#8 sync render @50+100', samples, 1500, 'p95')
  expect(samples.length).toBe(RENDER_N)
})

test('PERF-PW #2 theme toggle palette swap (click → data-theme applied)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await page.goto('/ops/schedule?day=2026-03-02')
  await page.getByTestId('ops-schedule-row-1').waitFor({ state: 'attached' })

  const samples: number[] = []
  for (let i = 0; i < INTERACT_N; i++) {
    const toLight = i % 2 === 0
    // the palette-swap is settled when the toggle flips to its opposite label
    // (dark REMOVES data-theme, so assert on the control, not the attribute).
    const t0 = Date.now()
    await page.getByRole('button', { name: toLight ? '☀ LIGHT' : '☾ DARK' }).click()
    await page.getByRole('button', { name: toLight ? '☾ DARK' : '☀ LIGHT' }).waitFor({ state: 'visible' })
    samples.push(Date.now() - t0)
  }
  verdict('#2 theme toggle', samples, 100, 'p99')
  expect(samples.length).toBe(INTERACT_N)
})

test('PERF-PW #3 rundown day-switch (pill click → lanes settled)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await page.goto('/ops/planner?day=2026-03-03')
  await page.getByTestId('ops-rundown-pill-2026-03-03').waitFor({ state: 'attached' })

  const days = ['2026-03-02', '2026-03-03']
  const samples: number[] = []
  for (let i = 0; i < INTERACT_N; i++) {
    const target = days[i % 2]
    const t0 = Date.now()
    await page.getByTestId(`ops-rundown-pill-${target}`).click()
    await expect(page.getByTestId(`ops-rundown-pill-${target}`)).toHaveAttribute('aria-pressed', 'true')
    // settled lane paint for the target day (a block that only exists once slots apply)
    await page.locator('[data-testid^="ops-rundown-block-"]').first().waitFor({ state: 'attached' })
    samples.push(Date.now() - t0)
  }
  verdict('#3 rundown day-switch', samples, 200, 'p95')
  expect(samples.length).toBe(INTERACT_N)
})

test('PERF-PW #7 registry row → inspector update @2000 (row click → name settled)', async ({ page }) => {
  await setUpPlanzaE2E(page)
  await overrideRegistry(page)
  await page.goto('/ops/registry')
  await page.getByTestId('ops-registry-row-sport:1').waitFor({ state: 'attached' })

  const samples: number[] = []
  for (let i = 0; i < INTERACT_N; i++) {
    // E-1 remediation: the table WINDOWS, so team rows (projection index ≥220) are
    // NOT mounted at the top — hop between the two FIRST visible rows (sport:1 /
    // sport:2) instead. Each click is still a real selection change (?record flips,
    // the selected/unselected booleans flip on two memoized rows), which is exactly
    // the re-render the #7 SLO measures — now bounded by memo + windowing.
    const target = i % 2 === 0 ? { id: 'sport:1', name: 'Sport 1' } : { id: 'sport:2', name: 'Sport 2' }
    const t0 = Date.now()
    await page.getByTestId(`ops-registry-row-${target.id}`).click()
    await expect(page.getByTestId('ops-record-name')).toHaveText(target.name)
    samples.push(Date.now() - t0)
  }
  verdict('#7 registry row→inspector', samples, 100, 'p95')
  expect(samples.length).toBe(INTERACT_N)
})
