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
  FIXTURE_CHANNELS,
  FIXTURE_COMPETITIONS,
  FIXTURE_CONTRACTS,
  FIXTURE_EVENTS,
  FIXTURE_NOW_DAYTIME,
  FIXTURE_PLANS,
  FIXTURE_PLAYERS,
  FIXTURE_SLOTS,
  FIXTURE_SPORTS,
  FIXTURE_TEAMS,
  makeSlot,
} from '../src/components/ops/__fixtures__/opsFixtureWeek'

/**
 * Midnight-boundary pin (B-4-T1 review): a slot at EXACTLY Tuesday 00:00Z.
 * Half-open window semantics → it belongs to Tuesday's payload
 * (dateStart=2026-03-03) and is ABSENT from Monday's (dateEnd=2026-03-03);
 * the backend's inclusive `lte` would return it for BOTH — the EPIC B spec
 * pins our chosen side at the network level. E2E-LOCAL on purpose (eventId
 * 9999 matches no fixture event, so it renders nowhere): keeping it out of
 * the shared deep-frozen FIXTURE_SLOTS avoids any unit-suite ripple.
 */
export const MIDNIGHT_BOUNDARY_SLOT = makeSlot({
  id: 's-midnight-boundary',
  eventId: 9999,
  channelId: 2,
  plannedStartUtc: '2026-03-03T00:00:00.000Z',
  plannedEndUtc: '2026-03-03T01:00:00.000Z',
})

/** What the slots endpoint serves: the shared fixture + the e2e-local boundary pin. */
const E2E_SLOTS = [...FIXTURE_SLOTS, MIDNIGHT_BOUNDARY_SLOT]

export { FIXTURE_NOW_DAYTIME }

/**
 * Vite-emitted lazy-chunk name patterns — SINGLE SOURCE for both smoke specs
 * (A-5-T1 review): the flag-on POSITIVE ops-chunk assertion is what guards the
 * flag-off NEGATIVE one against chunk-name rot, so the two must share one
 * literal and can never be edited apart.
 */
export const OPS_CHUNK = /OpsShell-[^/]+\.js/
export const LEGACY_DASHBOARD_CHUNK = /DashboardView-[^/]+\.js/

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

/**
 * Competitions come from the SHARED fixture since B-4-T1 (FIXTURE_COMPETITIONS
 * landed at B-3-T1 — one source of truth; the previous local mirror of
 * ScheduleScreen.test.tsx's list is gone). Delta vs the old list: comp 107
 * 'Quiet G' (referenced by nothing — excluded from the rights matrix by the
 * universe rule, so no spec literals moved; declared at B-4-T1).
 */
export const E2E_COMPETITIONS = FIXTURE_COMPETITIONS

/**
 * API-shaped date serialization. Fixture e9 carries a LOCAL-midnight Date on
 * purpose; naive JSON.stringify would toISOString() it and SHIFT THE DAY on
 * any machine east of UTC. The real backend (Prisma → res.json) serves
 * 'YYYY-MM-DDT00:00:00.000Z' keyed on the stored day — reproduce that from
 * LOCAL components, exactly like utils/dateTime's dateStr.
 */
function toApiDate(value: Event['startDateBE']): string {
  if (value instanceof Date) {
    // Footgun guard (A-5-T1 review): a NON-midnight Date would silently lose
    // its time of day below — fail loudly so a future fixture addition can't
    // corrupt e2e payloads unnoticed.
    if (
      value.getHours() !== 0 ||
      value.getMinutes() !== 0 ||
      value.getSeconds() !== 0 ||
      value.getMilliseconds() !== 0
    ) {
      throw new Error(
        `ops-e2e toApiDate: expected a LOCAL-midnight Date (got "${value.toString()}") — ` +
          'serializing it would silently truncate the time of day',
      )
    }
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

/**
 * Pin the browser clock to the fixture week's daytime instant (2026-03-04T10:00Z).
 * setFixedTime (B-4-T1 review): Date is FROZEN — nothing in the ops screens
 * needs ticking fake timers, and a frozen clock kills the ±seconds drift
 * budget on time-derived literals (e.g. the validity-bar width).
 */
export async function pinFixtureClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXTURE_NOW_DAYTIME)
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
  // ── B-4-T1 additions (Rundown/Rights journey) ──
  await page.route('**/api/channels', (route) => route.fulfill({ json: FIXTURE_CHANNELS }))
  // schedulesApi.listSlots sends ?dateStart=YYYY-MM-DD&dateEnd=<next day>.
  // The interception DELIBERATELY models a HALF-OPEN day window
  // [dateStart, dateEnd) on the textual date part of plannedStartUtc — this
  // DIVERGES from the real backend (broadcastSlots.ts uses an INCLUSIVE `lte`
  // on dateEnd, so a midnight-UTC slot returns for BOTH adjacent days in
  // prod, one day here). The half-open semantics are what a day window MEANS;
  // the auditor suspects the backend's `lte` is itself the bug — recorded as
  // a retro/debt item (B-4-T1 review), do not "fix" this to match until the
  // backend question is settled. The MIDNIGHT_BOUNDARY_SLOT below pins the
  // chosen semantics (spec asserts it in Tuesday's payload, absent from
  // Monday's). Start-less slots are EXCLUDED whenever a window param is
  // present (mirrors Prisma's gte/lte null exclusion); no query → all slots.
  await page.route('**/api/broadcast-slots*', (route) => {
    const url = new URL(route.request().url())
    const dateStart = url.searchParams.get('dateStart')
    const dateEnd = url.searchParams.get('dateEnd')
    const hasWindow = Boolean(dateStart || dateEnd)
    const slots = E2E_SLOTS.filter((slot) => {
      if (!slot.plannedStartUtc) return !hasWindow
      const day = slot.plannedStartUtc.split('T')[0]
      if (dateStart && day < dateStart) return false
      if (dateEnd && day >= dateEnd) return false
      return true
    })
    return route.fulfill({ json: slots })
  })
}

/** One-call setup: auth seed + pinned clock + full API interception. */
export async function setUpPlanzaE2E(page: Page): Promise<void> {
  await seedAuthToken(page)
  await pinFixtureClock(page)
  await interceptPlanzaApi(page)
}

/* ────────────────────────────────────────────────────────────────────────────
 * C-7-T1 — STATEFUL registry interception (ops-e2e v1.1, first stateful capability).
 * `setUpRegistryE2E` calls setUpPlanzaE2E (auth/clock/base) then ADDS registry
 * routes backed by an IN-MEMORY store seeded from the anonymised fixture families
 * (FIXTURE_{SPORTS,COMPETITIONS,TEAMS,PLAYERS} — NOT E2E_SPORTS, whose sport-5
 * federation differs). Create/notes round-trips mutate the store so a following
 * GET re-derives; call it per test (fresh page → fresh store = reset per test).
 * The real-backend WRITE gap (A-5 trade-off, now covering create/notes) is
 * recorded in the runbook. Playwright consults routes in REVERSE registration
 * order — the general `teams`/`players` list routes are registered BEFORE the
 * specific per-id routes (competitions / roster teams / notes) so the specific
 * ones win; the registry `sports`/`competitions` are registered LAST so they
 * override the static base routes. Minimal by design (pin/Size-M): per-kind
 * arrays, only teamId/competitionId filtering, only the CRUD the 4 ACs exercise.
 * No deletes.
 * ──────────────────────────────────────────────────────────────────────── */

/** deep mutable clone — the FIXTURE_* families are deep-frozen. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

interface RegistryStore {
  sports: Record<string, unknown>[]
  competitions: Record<string, unknown>[]
  teams: Record<string, unknown>[]
  players: Record<string, unknown>[]
  nextId: { sport: number; competition: number; team: number; player: number }
}

/**
 * Minimal linked graph (pin: a HOP needs a target). team 1 (Riverside United) →
 * competitions 101/103 + players 1/2; team 2 → comp 102 + player 3; team 3 →
 * player 6. Competition names mirror FIXTURE_COMPETITIONS (101 League A, 102
 * Open B, 103 Cup C). Names are anonymised fixture values only (PII pin 2).
 */
const TEAM_COMPETITION_LINKS = [
  { teamId: 1, competition: { id: 101, name: 'League A' } },
  { teamId: 1, competition: { id: 103, name: 'Cup C' } },
  { teamId: 2, competition: { id: 102, name: 'Open B' } },
]
const PLAYER_TEAM_LINKS = [
  { teamId: 1, player: { id: 1, name: 'Jonas Vale' } },
  { teamId: 1, player: { id: 2, name: 'Milo Ferran' } },
  { teamId: 2, player: { id: 3, name: 'Aria Kessler' } },
  { teamId: 3, player: { id: 6, name: 'Ivo Marchand' } },
]

function seedRegistryStore(): RegistryStore {
  return {
    sports: clone(FIXTURE_SPORTS as unknown as Record<string, unknown>[]),
    competitions: clone(FIXTURE_COMPETITIONS as unknown as Record<string, unknown>[]),
    teams: clone(FIXTURE_TEAMS as unknown as Record<string, unknown>[]),
    players: clone(FIXTURE_PLAYERS as unknown as Record<string, unknown>[]),
    nextId: { sport: 6, competition: 111, team: 4, player: 7 },
  }
}

/** `/api/teams/12/notes` → 12 (the id is the second-to-last path segment). */
function idFromPath(url: URL): number {
  const parts = url.pathname.split('/').filter(Boolean)
  return Number(parts[parts.length - 2])
}

export async function setUpRegistryE2E(page: Page): Promise<void> {
  await setUpPlanzaE2E(page)
  const store = seedRegistryStore()

  // ── general teams (list, ?competitionId filter, POST create/dup) ──
  await page.route('**/api/teams*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const { name } = request.postDataJSON() as { name: string }
      if (store.teams.some((team) => team.name === name)) {
        return route.fulfill({ status: 409, json: { message: 'A team with that name already exists' } })
      }
      const created = {
        id: store.nextId.team++,
        tenantId: 'e2e',
        name,
        sportId: null,
        externalRefs: {}, // → SOURCE MANUAL (registry-selectors pin 3)
        _count: { competitionLinks: 0, playerLinks: 0 },
        teamLinks: [],
      }
      store.teams.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    const competitionId = url.searchParams.get('competitionId')
    if (competitionId) {
      const teamIds = TEAM_COMPETITION_LINKS.filter((l) => l.competition.id === Number(competitionId)).map((l) => l.teamId)
      return route.fulfill({ json: store.teams.filter((team) => teamIds.includes(team.id as number)) })
    }
    return route.fulfill({ json: store.teams })
  })

  // ── general players (list, ?teamId filter, POST create/dup) ──
  await page.route('**/api/players*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const { fullName, sportId } = request.postDataJSON() as { fullName: string; sportId: number }
      if (store.players.some((player) => player.fullName === fullName)) {
        return route.fulfill({ status: 409, json: { message: 'A player with those details already exists' } })
      }
      const created = {
        id: store.nextId.player++,
        tenantId: 'e2e',
        fullName,
        sportId,
        status: 'active',
        externalRefs: {},
        teamLinks: [],
      }
      store.players.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    const teamId = url.searchParams.get('teamId')
    if (teamId) {
      const playerIds = PLAYER_TEAM_LINKS.filter((l) => l.teamId === Number(teamId)).map((l) => l.player.id)
      return route.fulfill({ json: store.players.filter((player) => playerIds.includes(player.id as number)) })
    }
    return route.fulfill({ json: store.players })
  })

  // ── specific: team → its competition memberships (TeamCompetitionLink[]) ──
  await page.route('**/api/teams/*/competitions', (route) => {
    const teamId = idFromPath(new URL(route.request().url()))
    const links = TEAM_COMPETITION_LINKS.filter((l) => l.teamId === teamId).map((l, index) => ({
      id: index + 1,
      teamId,
      competitionId: l.competition.id,
      seasonId: null,
      source: 'manual',
      competition: { id: l.competition.id, name: l.competition.name, season: '2026' },
    }))
    return route.fulfill({ json: links })
  })

  // ── specific: player → its team memberships (PlayerTeamLink[]) ──
  await page.route('**/api/players/*/teams', (route) => {
    const playerId = idFromPath(new URL(route.request().url()))
    const links = PLAYER_TEAM_LINKS.filter((l) => l.player.id === playerId).map((l, index) => ({
      id: index + 1,
      playerId,
      teamId: l.teamId,
      competitionId: null,
      seasonId: null,
      isCurrent: true,
      source: 'manual',
      team: { id: l.teamId, name: (store.teams.find((t) => t.id === l.teamId)?.name as string) ?? `Team ${l.teamId}` },
    }))
    return route.fulfill({ json: links })
  })

  // ── specific: protected remark save (PATCH notes) — mutate the store row ──
  await page.route('**/api/teams/*/notes', (route) => {
    const teamId = idFromPath(new URL(route.request().url()))
    const { notes } = route.request().postDataJSON() as { notes: string | null }
    const team = store.teams.find((t) => t.id === teamId)
    if (team) team.notes = notes
    return route.fulfill({ json: team ?? {} })
  })
  await page.route('**/api/players/*/notes', (route) => {
    const playerId = idFromPath(new URL(route.request().url()))
    const { notes } = route.request().postDataJSON() as { notes: string | null }
    const player = store.players.find((p) => p.id === playerId)
    if (player) player.notes = notes
    return route.fulfill({ json: player ?? {} })
  })

  // ── sports / competitions (list + POST) — registered LAST so they override the base ──
  await page.route('**/api/sports', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const { name, icon, federation } = request.postDataJSON() as { name: string; icon: string; federation: string }
      if (store.sports.some((sport) => sport.name === name)) {
        return route.fulfill({ status: 409, json: { message: 'A sport with that name already exists' } })
      }
      const created = { id: store.nextId.sport++, tenantId: 'e2e', name, icon, federation }
      store.sports.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    return route.fulfill({ json: store.sports })
  })
  await page.route('**/api/competitions', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      const { sportId, name, season } = request.postDataJSON() as { sportId: number; name: string; season: string }
      if (store.competitions.some((competition) => competition.name === name && competition.season === season)) {
        return route.fulfill({ status: 409, json: { message: 'A competition with that name and season already exists' } })
      }
      const created = { id: store.nextId.competition++, tenantId: 'e2e', sportId, name, season, matches: 0, _count: { events: 0, teamLinks: 0 } }
      store.competitions.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    return route.fulfill({ json: store.competitions })
  })
}
