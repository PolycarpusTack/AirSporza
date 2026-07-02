# CONTRACT SNAPSHOT: ops-selectors

Version: 1 · Date: 2026-07-02 · Task: A-3-T1 (input contract for A-3-T2, A-4-T1, B-3-T1)

## Public interface

```ts
// src/components/ops/selectors.ts — PURE functions: no React, no fetching, no Date.now()
export type RightsStatus = 'VALID' | 'EXPIRING' | 'NEGOTIATION' | 'MISSING'
export type CrewHealth  = 'OK' | 'OPEN' | 'CONFLICT'
export interface DayGroup { date: string /* YYYY-MM-DD */; events: Event[] /* time-ordered */ }

export function deriveRightsStatus(event: Event, contracts: Contract[], now: Date): RightsStatus
export function deriveCrewHealth(
  event: Event,
  plans: TechPlan[],       // filtered by plan.eventId INSIDE — pass the screen's full array
  conflicts: ConflictMap,  // ONE detectCrewConflicts(allPlans, allEvents) pass per screen
  crewFields: FieldConfig[], // AppProvider crewFields — required-role source
): CrewHealth
export function groupEventsByDay(events: Event[], week: { start: string }): DayGroup[]
```

**Backlog correction (DoR gate, binding):** `deriveCrewHealth` takes a 4th param
`crewFields` — the backlog's Interfaces line omitted it. Requiredness ALWAYS comes from
this param (only `encoder` is required in the defaults); never hard-coded.

## Rights precedence — AS-4 PROVISIONAL standard formulas

> Architect decision 2026-07-02: standard formulas now; a dedicated threshold-formula
> session revisits them by re-reading the FIRST rows of the permutation table in
> `src/components/ops/selectors.test.ts`. The 90-day window is single-sourced in the
> selector (`EXPIRY_WINDOW_MS`) — do NOT derive from `contractsApi.expiring(days)`.

| # | Rule | Result |
|---|---|---|
| 1 | no contract row for `event.competitionId` OR picked contract `status === 'none'` | MISSING |
| 2 | `status === 'draft'` (outranks the lapse rule — a lapsed draft is still NEGOTIATION, pinned) | NEGOTIATION |
| 3 | `validUntil` lapsed — **END of its day** `< now` | MISSING (rights no longer held — pinned) |
| 4 | RAW `validUntil ≤ now + 90d` (**boundary inclusive**; `validUntil == today` ⇒ expiring today, still held all day) | EXPIRING |
| 5 | else — including absent/empty-string/garbage `validUntil` with a non-draft/none status | VALID |

Pinned semantics:
- **`validUntil` is END of its day** (adversarial-review BLOCKER 3): stored day-precision
  dates are widened by `+DAY_MS − 1` in ONE place (`validUntilEndOfDayMs`), used by BOTH the
  lapse rule and the covering check — a contract governs its whole expiry day even at 10:00.
  The +90d EXPIRING comparison deliberately uses the RAW day value (calendar-stable) — do
  not widen it.
- **Stored `'valid'`/`'expiring'` are IGNORED** (stale) — the valid/expiring/lapsed split
  always derives from `validUntil` vs `now`; only `'draft'`/`'none'` carry non-derivable meaning.
- **Empty-string dates are absent** (seed contains `validUntil: ""`; `new Date("")` is NaN).
- **Multiple contracts per competition (PROVISIONAL — AS-4 revisit session):**
  1. prefer contracts COVERING `now` (`validFrom` absent-or-past AND end-of-day `validUntil`
     absent-or-future);
  2. among covering: **status class** — rights-bearing (`'valid'`/`'expiring'`) > `'draft'` >
     `'none'` — then latest `validUntil` (absent = open-ended = latest), ties keep input order;
  3. none covering: latest parseable `validUntil` (absent = earliest), ties keep input order.
  Pick happens BEFORE the status rules (a covering `'valid'` row beats a stale `'none'`
  sibling — pinned). A future-`validFrom` draft is NOT covering (pinned).
- There is NO `'negotiation'` ContractStatus in the codebase — NEGOTIATION == `'draft'`.

## Crew precedence (pinned)

| # | Rule | Result |
|---|---|---|
| 1 | any ConflictMap key `${plan.id}:${fieldId}` on any of the event's plans — severity `'full'` AND `'partial'` both count | CONFLICT |
| 2 | any `required && visible` crew field blank (non-string / empty / whitespace) in any of the event's plans, OR the event has **zero plans** (pinned: unplanned event = crew work open) | OPEN |
| 3 | else | OK |

CONFLICT outranks OPEN (pinned with a both-apply permutation). "Filled" = non-empty
trimmed string, matching `detectCrewConflicts`' own value semantics. Invisible required
fields are ignored (pinned).

## groupEventsByDay (pinned shape)

- Returns EXACTLY 7 `DayGroup`s for `week.start … +6d`, in order, **including empty
  days** (Schedule's empty-state AC consumes zero-event weekdays).
- **Day keys via the canonical `getDateKey`** (utils/dateTime — BLOCKER 1/MAJOR 5): API
  ISO-datetime strings (`"…T00:00:00.000Z"`) split on 'T'; Date objects keyed by LOCAL
  components (a local-midnight Date must not shift a day via toISOString). No hand-rolled
  date normalization (anti-duplication guardrail).
- Events outside the week excluded; within a day ordered by `startTimeBE` via
  **`timeToMinutes`** ('H:MM' single-digit hours sort numerically); equal times keep input
  order. Unparseable `week.start` → `[]`; date-less events and INVALID Date objects skipped
  silently (no throw).

## Fixture week (shared deliverable — `src/components/ops/__fixtures__/opsFixtureWeek.ts`)

Reused by A-4, B-1, A-5. Fixed clocks `FIXTURE_NOW = 2026-03-04T00:00:00Z` and
`FIXTURE_NOW_DAYTIME = 2026-03-04T10:00:00Z` (end-of-day boundary pins); week
`2026-03-02` (Mon–Sun — deliberately clear of the 2026-03-29 DST switch). Inventory:
rights comps 101 VALID · 102 EXPIRING · 103 NEGOTIATION · 104 MISSING('none') · 105
MISSING(no row) · 106 stale-stored-status → VALID · 108 lapsed → MISSING · 109
two-contract pick → VALID · 110 exact +90d boundary → EXPIRING. Crew: e3/e4 full
conflict (e3 API-shaped) · e5/e6 partial · e7 zero-plans OPEN · e8 blank required
encoder OPEN · e1/e2/e9 OK. **API-shaped dates on purpose:** e2 + e3 carry ISO
DATETIME strings (`'…T00:00:00.000Z'`, the real res.json shape); e9 is a LOCAL-midnight
`new Date(2026, 2, 6)` (the toISOString pitfall). Grouping: Mon 2 events out of array
order · 5 days covered · Sat+Sun empty · e10 outside week. 5 sports, uneven counts
(3/2/2/1/1). Exports `FIXTURE_CONFLICTS` (precomputed via the REAL `detectCrewConflicts`),
`makeEvent` and `makeContract` builders. **No `Date.now()` anywhere.**

## Upstream bugfix shipped alongside (separate commit unit)

`src/utils/crewConflicts.ts` `parseEventWindow` concatenated ISO-datetime `startDateBE`
verbatim (`'…T00:00:00.000ZT18:00:00'` → NaN) — **conflict detection was silently OFF for
all API-loaded data**, ops AND legacy planner. Fixed via `getDateKey` normalization; three
characterization tests pinned in `src/utils/crewConflicts.test.ts` (ISO-datetime, mixed
shapes, local-midnight Date). The selectors' CONFLICT path is proven against API-shaped
data through fixture event e3.

## Depends on

`src/utils/crewConflicts.ts` (`ConflictMap`, `detectCrewConflicts` — consumers compute
the map once per screen), `src/data/types.ts`. TD-24 honored: no @deprecated field reads.

## Domain terms used

Rights Status, Crew Health, Editorial Status (not derived here), Screen (backlog §4).
