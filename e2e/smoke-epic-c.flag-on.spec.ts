/**
 * EPIC C smoke — FLAG-ON profile (C-7-T1).
 * Journey (backlog §Story C-7): /ops/registry counters + facets + search/facet
 * compose → row select → ?record deep-link + inspector → LINKED hop → create
 * (MANUAL provenance) + duplicate-409 inline error → protected remark save.
 *
 * Stateful interception: `setUpRegistryE2E` (ops-e2e v1.1) serves an IN-MEMORY
 * registry store seeded from the anonymised fixture families, reset per test
 * (fresh page). This exercises the built bundle + all EPIC C contracts wired
 * end-to-end; the real-backend WRITE gap (create/notes emulated) is the recorded
 * A-5 trade-off, now covering writes (runbook §registry known-limitations).
 *
 * PII (C-7 pin 2): every name here is an anonymised fixture value (players
 * Jonas Vale / Milo Ferran …, teams Riverside United / Coastal Rovers …) or the
 * invented 'Newport County' — NO real athletes.
 */
import { expect, test } from '@playwright/test'
import { setUpRegistryE2E } from './planzaApi'

test.beforeEach(async ({ page }) => {
  await setUpRegistryE2E(page) // fresh in-memory store per test (reset)
})

// AC-1 — counters + facets + search/facet compose
test('registry renders the fixture inventory; facet filters; search composes with facet', async ({ page }) => {
  await page.goto('/ops/registry')

  // literal counters (pin 5 — N PLAYERS, not PEOPLE)
  await expect(page.getByTestId('ops-registry-counters')).toHaveText(
    '5 SPORTS · 10 COMPETITIONS · 3 TEAMS · 6 PLAYERS',
  )

  // facet counts match the inventory (unfiltered)
  await expect(page.getByTestId('ops-registry-facet-all')).toContainText('24')
  await expect(page.getByTestId('ops-registry-facet-sport')).toContainText('5')
  await expect(page.getByTestId('ops-registry-facet-competition')).toContainText('10')
  await expect(page.getByTestId('ops-registry-facet-team')).toContainText('3')
  await expect(page.getByTestId('ops-registry-facet-player')).toContainText('6')

  // full universe = 24 rows
  await expect(page.locator('[data-testid^="ops-registry-row-"]')).toHaveCount(24)

  // clicking Teams → exactly the 3 fixture team rows
  await page.getByTestId('ops-registry-facet-team').click()
  await expect(page.locator('[data-testid^="ops-registry-row-"]')).toHaveCount(3)
  await expect(page.getByTestId('ops-registry-row-team:1')).toBeVisible()

  // typing an anonymised player's name composes search AND facet:
  // Players facet + 'Ferran' → only Milo Ferran (player:2)
  await page.getByTestId('ops-registry-facet-player').click()
  await page.getByTestId('ops-registry-search').fill('Ferran')
  await expect(page.locator('[data-testid^="ops-registry-row-"]')).toHaveCount(1)
  await expect(page.getByTestId('ops-registry-row-player:2')).toBeVisible()

  // facet counts stay UNFILTERED while rows shrink
  await expect(page.getByTestId('ops-registry-facet-player')).toContainText('6')
})

// AC-2 — selection → ?record + inspector; LINKED hop; deep-link restore
test('row select sets ?record + inspector; LINKED hop updates both; deep link restores', async ({ page }) => {
  await page.goto('/ops/registry')

  // table LINKED column uses the static _count → team 1 shows '5 linked records'
  await expect(page.getByTestId('ops-registry-row-team:1')).toContainText('5 linked records')

  // select team 1 → URL + inspector
  await page.getByTestId('ops-registry-row-team:1').click()
  await expect(page).toHaveURL(/[?&]record=team(:|%3A)1(&|$)/)
  const inspector = page.getByTestId('ops-record-inspector')
  await expect(inspector.getByTestId('ops-record-name')).toHaveText('Riverside United')

  // LINKED hop rows come from the LAZY endpoints (/teams/1/competitions) → hop to League A
  const hop = page.getByTestId('ops-record-linked-competition:101')
  await expect(hop).toBeVisible()
  await hop.click()
  await expect(page).toHaveURL(/[?&]record=competition(:|%3A)101(&|$)/)
  await expect(inspector.getByTestId('ops-record-name')).toHaveText('League A')

  // a FRESH load of the deep link restores the same inspector state
  await page.goto('/ops/registry?record=team:1')
  await expect(page.getByTestId('ops-record-inspector').getByTestId('ops-record-name')).toHaveText('Riverside United')
})

// AC-3 — create (MANUAL provenance) + duplicate-409 inline error
test('+ NEW creates a team (MANUAL provenance); a duplicate name shows the inline error, modal stays open', async ({ page }) => {
  await page.goto('/ops/registry')

  // narrow first so we can prove filters clear post-create
  await page.getByTestId('ops-registry-search').fill('zzz-no-match')
  await page.getByTestId('ops-registry-new').click()
  await expect(page.getByTestId('ops-create-modal')).toBeVisible()

  // default kind is team → just a name
  await page.getByTestId('ops-create-name').fill('Newport County')
  await page.getByTestId('ops-create-submit').click()

  // modal closes, filters clear, inspector shows the new MANUAL record
  await expect(page.getByTestId('ops-create-modal')).toHaveCount(0)
  await expect(page).toHaveURL(/[?&]record=team(:|%3A)4(&|$)/)
  await expect(page.getByTestId('ops-registry-search')).toHaveValue('')
  const inspector = page.getByTestId('ops-record-inspector')
  await expect(inspector.getByTestId('ops-record-name')).toHaveText('Newport County')
  await expect(inspector.getByTestId('ops-record-provenance')).toHaveText(
    'MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE',
  )

  // it appended to the store → a subsequent list shows 4 team rows
  await page.getByTestId('ops-registry-facet-team').click()
  await expect(page.locator('[data-testid^="ops-registry-row-"]')).toHaveCount(4)

  // duplicate create: reuse an existing fixture team name → inline 409, modal STAYS open
  await page.getByTestId('ops-registry-new').click()
  await page.getByTestId('ops-create-name').fill('Riverside United')
  await page.getByTestId('ops-create-submit').click()
  await expect(page.getByTestId('ops-create-error')).toContainText('already exists')
  await expect(page.getByTestId('ops-create-modal')).toBeVisible()
})

// AC-4 — protected remark save renders the REMARKS · MANUAL box
test('saving a remark on a fixture team renders the REMARKS · MANUAL box', async ({ page }) => {
  // team 2 (Coastal Rovers) has no notes → ghost reads + ADD REMARK
  await page.goto('/ops/registry?record=team:2')
  const inspector = page.getByTestId('ops-record-inspector')
  await expect(inspector.getByTestId('ops-record-name')).toHaveText('Coastal Rovers')
  await expect(inspector.getByTestId('ops-record-remarks')).toHaveCount(0)

  await inspector.getByTestId('ops-record-add-remark').click()
  await inspector.getByTestId('ops-record-remark-input').fill('Signed a new keeper')
  await inspector.getByTestId('ops-record-remark-save').click()

  // PATCH notes → refresh → the REMARKS box renders the saved text
  await expect(inspector.getByTestId('ops-record-remarks')).toHaveText('Signed a new keeper')
})
