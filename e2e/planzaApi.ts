/**
 * Planza e2e network-interception fixtures (A-5-T0) — ops-e2e v1.
 *
 * Strategy: FULL interception — every /api/* request is served here from
 * opsFixtureWeek-shaped payloads (single source of truth: the fixture module
 * is IMPORTED, not copied). The real backend is never contacted; this is the
 * recorded live-data trade-off (see docs/governance/contracts/ops-e2e.md).
 *
 * Auth decision (recorded): the app keeps a Bearer token in
 * localStorage('token') and AuthProvider resolves the user via GET /auth/me.
 * We seed a dummy token via addInitScript and intercept /auth/me — no login
 * flow, no storage-state file needed (nothing else lives in the session).
 * IMPORTANT: interception must never answer 401 — the ApiClient hard-redirects
 * to /login and clears the token on any 401.
 *
 * Endpoints the app calls on an authenticated boot (verified against
 * src/context/AppProvider.tsx + src/hooks/useAuth.tsx + src/pages/ops/ScheduleScreen.tsx):
 *   GET /auth/me            → { user }                    (useAuth)
 *   GET /events             → Event[]                     (AppProvider; VITE_INCREMENTAL_LOADING unset → plain list)
 *   GET /tech-plans         → TechPlan[]                  (AppProvider)
 *   GET /sports             → Sport[]                     (AppProvider)
 *   GET /competitions       → Competition[]               (AppProvider)
 *   GET /settings/app?role= → AppSettingsResponse (nulls) (AppProvider; nulls keep DEFAULT_* fields incl. crewFields)
 *   GET /contracts          → Contract[]                  (ScheduleScreen quiet fetch)
 * Everything else → 404 JSON (deliberate: unhandled endpoints must be visible,
 * and 404 — unlike 401 — has no auth side effects). socket.io uses websockets,
 * which route interception does not cover; the connection fails quietly.
 */
import type { Page } from '@playwright/test'
import type { Event } from '../src/data/types'
import {
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW_DAYTIME,
  FIXTURE_PLANS,
} from '../src/components/ops/__fixtures__/opsFixtureWeek'

export { FIXTURE_NOW_DAYTIME }

export const E2E_USER = {
  id: 'e2e-user-1',
  email: 'e2e@planza.test',
  name: 'E2E Planner',
  role: 'planner',
}

/** Mirrors ScheduleScreen.test.tsx's fixture sports (ids match FIXTURE_EVENTS.sportId). */
export const E2E_SPORTS = [
  { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA' },
  { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF' },
  { id: 3, name: 'Cycling', icon: '🚴', federation: 'UCI' },
  { id: 4, name: 'Formula 1', icon: '🏎️', federation: 'FIA' },
  { id: 5, name: 'Athletics', icon: '🏃', federation: 'WA' },
]

/** Mirrors ScheduleScreen.test.tsx's fixture competitions (ids match FIXTURE_EVENTS/CONTRACTS). */
export const E2E_COMPETITIONS = [
  { id: 101, sportId: 1, name: 'League A', matches: 10, season: '2026' },
  { id: 102, sportId: 2, name: 'Open B', matches: 10, season: '2026' },
  { id: 103, sportId: 1, name: 'Cup C', matches: 10, season: '2026' },
  { id: 104, sportId: 3, name: 'Tour D', matches: 10, season: '2026' },
  { id: 105, sportId: 4, name: 'GP E', matches: 10, season: '2026' },
  { id: 106, sportId: 2, name: 'Masters F', matches: 10, season: '2026' },
  { id: 108, sportId: 1, name: 'Series H', matches: 10, season: '2026' },
  { id: 109, sportId: 3, name: 'Classic I', matches: 10, season: '2026' },
  { id: 110, sportId: 5, name: 'Champs J', matches: 10, season: '2026' },
]

/**
 * API-shaped date serialization. Fixture e9 carries a LOCAL-midnight Date on
 * purpose; naive JSON.stringify would toISOString() it and SHIFT THE DAY on
 * any machine east of UTC. The real backend (Prisma → res.json) serves
 * 'YYYY-MM-DDT00:00:00.000Z' keyed on the stored day — reproduce that from
 * LOCAL components, exactly like utils/dateTime's dateStr.
 */
function toApiDate(value: Event['startDateBE']): string {
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}T00:00:00.000Z`
  }
  return value
}

/** FIXTURE_EVENTS as the wire would deliver them (fixture itself stays frozen/untouched). */
const API_EVENTS = FIXTURE_EVENTS.map((event) => ({ ...event, startDateBE: toApiDate(event.startDateBE) }))

/** AppSettingsResponse with all-null payloads → app keeps its DEFAULT_* configs. */
const EMPTY_APP_SETTINGS = {
  scopeRules: {
    eventFields: 'global',
    crewFields: 'global',
    dashboardWidgets: 'user_role_with_role_fallback',
    orgConfig: 'global',
  },
  eventFields: null,
  crewFields: null,
  dashboardWidgets: null,
  orgConfig: null,
  meta: {
    eventFieldsScope: null,
    crewFieldsScope: null,
    dashboardWidgetsScope: null,
    orgConfigScope: null,
  },
}

/** Seed the Bearer token BEFORE any app code runs — AuthProvider then calls /auth/me. */
export async function seedAuthToken(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('token', 'e2e-fixture-token'))
}

/** Pin the browser clock to the fixture week's daytime instant (2026-03-04T10:00Z). */
export async function pinFixtureClock(page: Page): Promise<void> {
  await page.clock.install({ time: FIXTURE_NOW_DAYTIME })
}

/**
 * Register all /api/* routes. Playwright consults routes in REVERSE
 * registration order, so the 404 catch-all goes FIRST and specific
 * endpoints override it.
 */
export async function interceptPlanzaApi(page: Page): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { message: 'ops-e2e: unhandled endpoint (add it to e2e/planzaApi.ts)' } }),
  )
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: E2E_USER } }))
  await page.route('**/api/events', (route) => route.fulfill({ json: API_EVENTS }))
  await page.route('**/api/tech-plans', (route) => route.fulfill({ json: FIXTURE_PLANS }))
  await page.route('**/api/sports', (route) => route.fulfill({ json: E2E_SPORTS }))
  await page.route('**/api/competitions', (route) => route.fulfill({ json: E2E_COMPETITIONS }))
  await page.route('**/api/contracts', (route) => route.fulfill({ json: FIXTURE_CONTRACTS }))
  await page.route('**/api/settings/app*', (route) => route.fulfill({ json: EMPTY_APP_SETTINGS }))
}

/** One-call setup: auth seed + pinned clock + full API interception. */
export async function setUpPlanzaE2E(page: Page): Promise<void> {
  await seedAuthToken(page)
  await pinFixtureClock(page)
  await interceptPlanzaApi(page)
}
