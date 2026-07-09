# CONTRACT SNAPSHOT: ops-selectors

Version: 3 · Date: 2026-07-04 · Task: B-3-T1 (input contract for B-3-T2 Rights screen, B-4 e2e)

**Changelog**
- **v3 (2026-07-04, B-3-T1):** Rights tiles/matrix selectors —
  `deriveCompetitionRightsInfo` (pin-3 extraction: the v2 event-scoped rights
  body moved VERBATIM to a competition-scoped core; `deriveRightsInfo`
  delegates via `event.competitionId`; A-3/A-4 permutation suites stayed
  byte-unchanged as the behavior pin), `deriveRightsMatrix`,
  `deriveRightsTiles` (a fold over the matrix — reconciliation identity by
  construction), `deriveValidityProgress` + `deriveValidityBand` (threshold
  single source). v1/v2 signatures untouched. See §Rights matrix below; ON-DEM
  column reserved per AS-8.
  **Review renames (before any consumer):** row field `validityPct` →
  `validityProgress` — the value is an UNROUNDED 0..1 FRACTION (glossary:
  validity progress); pin 4's 'pct' shorthand is SUPERSEDED by the glossary
  term. Row field `platforms` → `platformColumns` (avoids shape collision with
  the raw `Contract.platforms` string array on the same row).
- **v2 (2026-07-02, A-4-T0):** ADDITIVE inspector selectors — `deriveRightsInfo`
  (status + governing-contract `validUntil` exposure; `deriveRightsStatus` now delegates
  to it, single-sourced, A-3 permutation rows unchanged), `deriveCrewRoles` (per-role
  inspector rows), `filterConflictsToEvent` (event-scoped PersonConflictGroup filter —
  named `filter…` because it narrows data, it derives nothing; renamed from
  `deriveEventConflicts` at the A-4-T0 review).
  v1 signatures untouched. NOTE: the backlog's B-3-T1 hand-off labelled "ops-selectors v2"
  renumbers to **v3**.
- v1 (2026-07-02, A-3-T1): deriveRightsStatus / deriveCrewHealth / groupEventsByDay + fixture week.

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

// ── v2 additions (A-4-T0, inspector) ──
export interface RightsInfo {
  status: RightsStatus
  validUntil: string | null   // 'YYYY-MM-DD' via getDateKey; null when no row or absent/''/unparseable;
                              // EXPOSED for lapsed contracts too (informative "until <past date>")
  contract: Contract | null   // pickGoverningContract result; null when no row
}
export function deriveRightsInfo(event: Event, contracts: Contract[], now: Date): RightsInfo
// deriveRightsStatus(e, c, n) === deriveRightsInfo(e, c, n).status — single source (pinned)

export interface CrewRoleRow {
  fieldId: string; label: string
  name: string | null          // first filled (trimmed) assignment across the event's plans
  state: CrewHealth            // same scale as deriveCrewHealth; dot casing = component concern
}
export function deriveCrewRoles(event, plans, conflicts, crewFields): CrewRoleRow[]
// Rows = crewFields where visible && type !== 'checkbox', in FieldConfig.order.
// Per-field precedence mirrors deriveCrewHealth: CONFLICT > OPEN > OK.
// PINNED: blank OPTIONAL role → OK with name null (component renders —);
// zero plans → required rows OPEN, all names null; multi-plan → worst state,
// first filled name. CONSISTENCY INVARIANT (pinned across the fixture week):
// deriveCrewHealth === worst VISIBLE-row state — EXCEPT conflicts keyed on
// hidden/checkbox fields, which may raise the event-level word ABOVE the rows
// (decided at the A-4-T0 review: correct UX, the word is broader; pinned).

export function filterConflictsToEvent(event: Event, groups: PersonConflictGroup[]): PersonConflictGroup[]
// Keeps groups whose conflicts touch the event (eventA.id or eventB.id), with the
// conflict arrays themselves filtered; emptied groups dropped. `role` fields stay
// RAW crew fieldIds — label mapping is the COMPONENT's job via crewFields (pinned).

// ── v3 additions (B-3-T1, Rights tiles + matrix) ──
export function deriveCompetitionRightsInfo(competitionId: number, contracts: Contract[], now: Date): RightsInfo
// The competition-scoped CORE (B-3 pin 3): the v2 rights body verbatim.
// deriveRightsInfo(e, c, n) === deriveCompetitionRightsInfo(e.competitionId, c, n) — pinned.

export type RightsPlatformColumn = 'LINEAR' | 'MAX' | 'RADIO' | 'ONDEM'
export interface RightsMatrixRow {
  competitionId: number
  competitionName: string      // Competition.name, or 'COMPETITION #<id>' fallback (never dropped)
  competition: Competition | null // null = dangling competitionId (data-quality signal)
  status: RightsStatus         // DERIVED only — never the stored contract.status
  contract: Contract | null    // governing (pickGoverningContract); null = no contract row
  validUntil: string | null    // as RightsInfo
  platformColumns: Record<RightsPlatformColumn, boolean> // ONDEM always false today (AS-8); named ≠ Contract.platforms
  validityProgress: number | null // UNROUNDED 0..1 FRACTION (never 0..100); null = no bar
  validityLabel: string        // 'Until 30 Jun 2027' | 'In negotiation' | 'No agreement in place' | 'Until —'
  note: string | null          // governing contract's notes; null when absent/whitespace
}
export function deriveRightsMatrix(contracts: Contract[], competitions: Competition[], events: Event[], now: Date): RightsMatrixRow[]

export type RightsTiles = Record<RightsStatus, number>
export function deriveRightsTiles(contracts: Contract[], competitions: Competition[], events: Event[], now: Date): RightsTiles
// A FOLD over deriveRightsMatrix rows — tiles == matrix aggregation is an
// identity by construction (test-pinned, plus ∀-events reconciliation property).

export function deriveValidityProgress(contract: Contract, now: Date): number | null
export function deriveValidityBand(progress: number): 'red' | 'amber' | 'green'
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

## Rights matrix + tiles (v3 — B-3 pins 1/2/4/5, AS-8)

**Row universe (pin 2):** competitions with ≥1 contract row ∪ competitions with
≥1 event — ALL events, no date scoping (deferred to the AS-4 threshold
session). One row per competition = its GOVERNING contract (comp 109 renders
successor id 10 — pinned). Dangling `competitionId` → fallback label
`COMPETITION #<id>`, `competition: null`, never dropped. A Competition record
with neither contracts nor events is EXCLUDED (fixture comp 107 'Quiet G'
pins this).

**Platform → column (pin 1; pull-gated vocabulary `['linear','on-demand','radio']`):**

| platforms[] value | Column |
|---|---|
| `linear` | LINEAR |
| `on-demand` | MAX (legacy `maxRights` lineage — VRT MAX is the OTT service) |
| `radio` | RADIO |
| *(none)* | **ONDEM — RESERVED, false for all rows (AS-8)**; lights only when the domain distinguishes a non-MAX on-demand right |
| unknown value | NO column + `console.warn` ONCE per distinct value per process (module-level Set guard — deliberate purity exception, observability only) |

**Validity progress (pin 4 — its 'pct' shorthand superseded by the glossary term):**
`progress = clamp((validUntilEndOfDayMs − now) / (validUntilEndOfDayMs − toEpochMs(validFrom)), 0, 1)`
— an UNROUNDED 0..1 FRACTION, never a 0..100 percentage. `null` (no bar) for
absent/`''`/garbage `validFrom` OR `validUntil`, and degenerate
`validFrom ≥ END-OF-DAY validUntil` (a SAME-DAY term is NOT degenerate — the
end-of-day widening keeps it a real 1-day window; mutation-pinned). Lapsed ⇒ 0
exactly (bar disappears when the word flips); future `validFrom` clamps to 1.
Threshold bands are single-sourced in `deriveValidityBand`: red `< 0.15`,
amber `< 0.50`, green else — **exact 0.15 is amber, exact 0.50 is green**
(strict `<`, pinned). Matrix wiring is mutation-pinned with literal fixture
fractions (comp 101 ≈ 0.4420; comp 109 uses the SUCCESSOR's dates ≈ 12/17).

**Validity text variants (pin 4, design HTML ~line 575) — returned by the
SELECTOR as `validityLabel` (recorded deviation from "components render
words": the variants are status-coupled derivation with exact pinned strings;
T2 renders them verbatim):** NEGOTIATION → `In negotiation` (wins over any
date) · no-agreement MISSING (no row or `'none'`) → `No agreement in place` ·
lapsed MISSING keeps its informative date → `Until 1 Feb 2026` · date-less
otherwise → `Until —` · else → `Until <D MMM YYYY>` (the date part comes from
a selector-local `untilDateLabel` kept BYTE-IDENTICAL to EventInspector's —
occurrence two of the title-case contract-date family; Rule of Three not met,
and the literal duplicate keeps the extraction trigger grep-detectable).

**Row note (pin 5):** governing contract's `notes`, `null` when
absent/whitespace or no contract. **Order (pin 5):** severity-first
(MISSING, EXPIRING, NEGOTIATION, VALID) then `competitionName` asc (plain
code-point comparison — deterministic, locale-independent).

**Tiles:** `deriveRightsTiles` folds the matrix rows — reconciliation is an
identity by construction; the ∀-fixture-events property
(`deriveRightsStatus(event) === its competition row's status`) is additionally
test-pinned.

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
v3 addition (B-3 pin 8, ADDITIVE): `FIXTURE_COMPETITIONS` (ids 101–110, names
mirroring ScheduleScreen.test.tsx; **107 'Quiet G' referenced by nothing** —
the universe-exclusion pin) + `makeCompetition`. FIXTURE_NOW now carries a
TZ-pin warning comment (reads as Mar 3 LOCAL under the vitest
America/New_York pin — never derive a local day from it).

## Upstream bugfixes shipped alongside (separate commit units)

**v1 (A-3-T1, historical):** `src/utils/crewConflicts.ts` `parseEventWindow` concatenated
ISO-datetime `startDateBE` verbatim (`'…T00:00:00.000ZT18:00:00'` → NaN) — **conflict
detection was silently OFF for all API-loaded data**, ops AND legacy planner. Fixed via
`getDateKey` normalization; three characterization tests pinned in
`src/utils/crewConflicts.test.ts` (ISO-datetime, mixed shapes, local-midnight Date). The
selectors' CONFLICT path is proven against API-shaped data through fixture event e3.

**v2 (A-4-T0):** the DISPLAY strings had the same defect — `CrewConflict.startTime` and
`PersonConflictGroup` conflict `time` fields built from raw `startDateBE` (ISO datetimes
rendered `"…T00:00:00.000Z 18:00"`, Date objects took the toISOString UTC day-shift).
Normalized via `getDateKey` in both `detectCrewConflicts` and `groupConflictsByPerson`;
pinned at `src/utils/crewConflicts.test.ts` §"A-4-T0 upstream bugfix" (three tests,
"YYYY-MM-DD HH:MM" shape + local-day pin).

## Depends on

`src/utils/crewConflicts.ts` (`ConflictMap`, `detectCrewConflicts` — consumers compute
the map once per screen), `src/data/types.ts`. TD-24 honored: no @deprecated field reads.

## Domain terms used

Rights Status, Crew Health, Editorial Status (not derived here), Screen (backlog §4).
