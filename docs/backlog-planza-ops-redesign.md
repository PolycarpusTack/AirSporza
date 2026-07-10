# Planza "Ops" Redesign — Development Backlog v1

> **Generated per:** `C:\Projects\ClaudeExtras\core` framework —
> `core-specification-v1.md` (modes, DoD, economics) · `backlog-builder-v5.1.md` (templates, validator) ·
> `backlog-builder-agent-v2.md` (workflow) · `gpm-v2.1.md` (ZAP/CIP/PREP execution)
> **Solution design:** `docs/design_handoff_planza_ops/README.md` + `Planza App.dc.html` + screenshots
> **Current-state baseline:** codebase survey 2026-07-02 (see §6 Architecture Memory delta)
> **Status:** v1 — EPICs A, B, C & D COMPLETE incl. retros (D done 2026-07-09 — SYNC: job health + merge review, the 2nd write surface); EPIC E outlined (HARDENING — BB v5.1 §10)

---

## 1. Readiness Decision

**Health Score (BB v5.1 §5):**

| Dimension | Score | Notes |
|---|---|---|
| Clarity | 3/3 | Pixel-level spec: tokens, grids, type scale, interactions all quantified; live HTML is source of truth |
| Feasibility | 3/3 | All data dependencies exist: services layer complete, import endpoints live, teams/players repo merged to main, `crewConflicts.ts` exists |
| Completeness | 2/3 | Open: shell strategy (replace vs parallel), light theme is greenfield, lane-channel derivation, remark/plan endpoint wiring |

**Total: 8/9 → PROCEED.** No High risk without mitigation (see EPIC risk tables).

Required design sections present: Business Context ✓ (README overview), Architecture Overview ✓ (maps to existing patterns), Data Models ✓ (state section + existing `types.ts`), APIs/Interfaces ✓ (existing `services/*`), User Journeys ✓ (interactions section).

---

## 2. Critical Gaps → Decisions Needed (ADRs)

| # | Gap | Resolution | Owner |
|---|---|---|---|
| ADR-012 ✅ **Accepted 2026-07-02** | **Shell strategy** — the 5 Ops screens overlap existing pages (SCHEDULE≈ScheduleView, PLANNER≈PlannerView, RIGHTS≈ContractsView, REGISTRY≈TeamsView, SYNC≈ImportView). | Parallel **feature-flagged Ops shell** under `/ops/*` (flag `opsRedesign`, default OFF). Existing screens untouched. Cutover deferred to EPIC E. See `docs/governance/adr/ADR-012-ops-shell-strategy.md`. | Architect ✓ |
| ADR-013 ✅ **Accepted 2026-07-02** | **Theming mechanism** — app is dark-only today; `darkMode: ['class']` unwired. Design requires dark default + light palette + toggle. | `data-theme="light"` on `<html>` overriding CSS variables in `tokens.css`; `localStorage` persistence. Extend existing token families — no second token system. See `docs/governance/adr/ADR-013-ops-theming.md`. | Architect ✓ |
| ADR-014 ✅ **Accepted 2026-07-02** | **Ops deep-linking** — planner state is component-local today. | URL params on `/ops/:tab`: `?event=<id>&day=<iso>` (schedule/rundown), `?record=<id>` (registry), via `useSearchParams` behind dedicated hooks. See `docs/governance/adr/ADR-014-ops-deep-linking.md`. | Architect ✓ |
| Open | **Lane-channel derivation** for PLANNER — `Event` channel fields are `@deprecated`; `BroadcastSlot`/`Channel` entities exist. | Assumption AS-3 below; verify with a SPIKE if slot coverage is incomplete. | Backlog |
| Open | **"+ ADD REMARK" / "+ PLAN"** affordances — wire to existing notes/tech-plan endpoints. | In scope for EPIC C (registry remarks — `Team.notes` protected field exists) and deferred for tech plans (existing SportsWorkspace remains the editor). | Backlog |

---

## 3. Execution Mode (Core §1)

**DELIVERY** for all EPICs in this backlog.

Rationale: validated production architecture, mature codebase (post-mitigation-plan, RLS/observability EPICs merged), multi-year lifetime, real users. Per Core §5.1 this is core business UI with a wide blast radius → full governance: TDD on all logic, Two Hats per task, feature flags, TD tracking, pull gates.

Rigor calibration within DELIVERY (Core §5.1): derived-status selectors, theme engine, timeline math, merge decisions = **max rigor** (expensive to get wrong). Pure presentational markup (chips, tiles, static layout) = tests at smoke/interaction level, not pixel assertions.

---

## 4. Domain Glossary (Core §2 P3 — enforced in code names)

| Term | Definition |
|---|---|
| **Ops Shell** | The redesigned app chrome: 48px top bar, brand `PLANZA/OPS`, 5 tabs, theme toggle, LIVE badge |
| **Screen** | One of the 5 tabs: Schedule, Rundown (PLANNER), Rights, Registry, Sync |
| **Rundown** | Per-channel day timeline with positioned event blocks (design's "PLANNER"; named Rundown in code to avoid collision with existing `PlannerView`) |
| **Inspector** | Right-hand 320px detail pane; shows the selected Event (Schedule/Rundown) or Record (Registry) |
| **Facet** | Left-rail filter button with count (sport facets on Schedule; kind facets on Registry) |
| **Editorial Status** | Event workflow state: `DRAFT` / `READY` / `APPROVED` (existing enum) |
| **Rights Status** | Derived per event from its competition's Contract: `VALID` / `EXPIRING` / `NEGOTIATION` / `MISSING` |
| **Crew Health** | Derived per event from crew assignments + `detectCrewConflicts`: `OK` / `OPEN` / `CONFLICT` |
| **Kind** | Registry record type: `sport` / `competition` / `team` / `player` / `performer` / `staff` |
| **Record** | Any Registry entity of a Kind, with provenance (source + protection) |
| **Provenance** | A Record's origin: `MANUAL` (protected from sync overwrite) or a source code (`TSDB`, `API-FB`, `FB-DATA`) — existing `ImportGovernanceService` semantics |
| **Merge Candidate** | Deduplication pair (incoming vs current) awaiting a merge decision — existing `ImportMergeCandidate` |
| **Merge Decision** | `APPROVE MERGE` or `KEEP SEPARATE` on a Merge Candidate |
| **Sync Job** | Nightly import job with status + record count / dead-letter count — existing `ImportJob` |
| **Ops Theme** | `dark` (default) or `light` palette applied via CSS variables |

Synonym flags: design says "PLANNER" → code uses **Rundown** (collision). Design says "REGISTRY" record types → code already uses **Kind**-compatible entity names; "performer"/"staff" are **new** Kinds (see AS-5).

---

## 5. Assumptions Ledger

| ID | Assumption | Impact | Verify by |
|---|---|---|---|
| AS-1 ✅ resolved | Parallel flagged shell (ADR-012 accepted 2026-07-02); no old-screen removal in EPICs A–D | Whole plan shape | Done |
| AS-2 | Existing `--surface/--text/--border` token families are extended with light-theme values; ops screens consume the same vars (README: "extend rather than hard-code hex") | A-1 design | ADR-013 |
| AS-3 ✅ resolved | Rundown lane channel comes from the event's `BroadcastSlot.channelId` (fallback: the `event.channel` RELATION — the TD-24 sanctioned path; the deprecated fields are the free-text name strings); Eén/Canvas/VRT MAX exist in `channels` service | B-1 | **Pull gate run 2026-07-04 → SPIKE run and CLOSED same day:** seed slot coverage 8/14 (57%, <90%) — but a seed artifact (`take: 8`), not a model gap: 14/14 events carry `channelId`, so slot-first + relation-fallback resolves 100%; unresolvable events go to the UNASSIGNED lane per the B-1 AC. Channels Eén/Canvas/Ketnet/VRT MAX/VRT MAX Sport/Radio 1 exist as Channel rows; `schedulesApi.listSlots({channelId?, date?})` already exposes day-filtered slots. Design as planned — no change. |
| AS-4 ◐ provisional | Contract → Rights Status mapping: `EXPIRING` = `validUntil` within 90 days; `NEGOTIATION` = contract status field; `MISSING` = no contract for competition. **Stakeholder decision 2026-07-02: build A-3 with these standard formulas; contract start/end time/date formulas to be revisited in a dedicated session.** Mitigation: thresholds live in ONE place (`ops/selectors`, single source for the 90-day rule per B-3-T1 Abstraction Check) so the revisit is a cheap, test-pinned change | A-3 | Dedicated threshold-formula session (post-A-3) |
| AS-5 ✅ resolved | "Performer" and "Staff" Kinds map to existing person-entities where present; if absent, Registry v1 ships with sports/competitions/teams/players only and performers/staff are an EPIC C follow-up story | C scope | **Verified 2026-07-05 (EPIC C expansion gate):** schema has full `Player`/`PlayerTeam` (+ canonical bridge) and `Team`; NO Performer/Staff/Person model exists anywhere (crew names in TechPlans are free text, not entities). Fallback applies: **Registry v1 = sports/competitions/teams/players**; performer/staff Kinds = follow-up story gated on a product/schema decision (out of this UI initiative's scope). |
| AS-6 | IBM Plex Sans/Mono already loaded (survey: configured in tailwind fonts) — no new font pipeline | A-1 | Trivial |
| AS-7 ✅ resolved (REFUTED 2026-07-06, EPIC D expansion gate) | Merge decisions call existing endpoints (`approve-merge` / `create-new`); the premise "idempotency handled server-side per existing routes" is **FALSE** — `backend/src/routes/import/mergeCandidates.ts` has NO already-decided guard: `approve-merge` re-runs `manualMergeNormalizedEvent` and `create-new` re-runs `manualCreateNormalizedEvent` (creating a DUPLICATE event) on a repeat call. Mitigation: UI single-flight + terminal button-replacement + pending-only listing (D-3-T1); a CONDITIONAL additive backend already-decided guard (D-3-T0) is architect-gated | D | **Verified 2026-07-06 in `mergeCandidates.ts` — resolved into D-3 pins** |
| AS-8 (added 2026-07-04, B-3 re-gate) | The rights matrix ON-DEM column is RESERVED: real `Contract.platforms[]` has no value distinct from `'on-demand'`→MAX (legacy `maxRights` lineage), and the design demo never lights ON-DEM. It lights only when the domain model distinguishes a non-MAX on-demand right (candidate source: RightsPolicy `Platform` SVOD/AVOD) | B-3 display honesty | AS-4 threshold/stakeholder session (same venue) |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza Ops Redesign
Updated: 2026-07-06 (EPIC C retro)

Components (new):
  OpsShell:            chrome + tabs + theme toggle + flag gate — BUILT (OpsShell v1; lazy
                       /ops/:tab, flag isOpsRedesignEnabled(), absolute-path rule)
  OpsThemeProvider:    data-theme switch + persistence — BUILT (useOpsTheme v1; FOUC guard
                       runs at ops-chunk eval — lazy load is REQUIRED, not an optimisation)
  ScheduleScreen:      facet rail + day-grouped event table — BUILT (A-3-T2; in-screen
                       contracts fetch, ONE detectCrewConflicts + ONE groupConflictsByPerson
                       memo per screen)
  EventInspector:      shared inspector (Schedule + Rundown) — BUILT (EventInspector v1;
                       props-driven, owns its 320px panel chrome, B-1 embeds it as-is)
  ops/selectors:       pure derived-status functions — BUILT (ops-selectors v3:
                       rightsStatus/rightsInfo + competition-scoped core, crewHealth/
                       crewRoles, groupEventsByDay, filterConflictsToEvent, rights
                       matrix/tiles/validityProgress/Band)
  rundownLayout:       pure lane/position selectors (resolveChannel slot-first +
                       relation fallback, layoutRundown clamp→floor→re-clamp geometry)
                       — BUILT (rundown-layout v1, B-1; sibling module, slot datetimes
                       read as wall-clock text — TZ revisit at first real payload)
  dayLabels:           shared formatOpsDayLabel (Rule-of-Three extraction, B-2 PREP) — BUILT
  useContracts:        shared quiet contracts fetch { contracts, isSettled } (Rule-of-
                       Three extraction at the 3rd consumer, B-3 PREP) — BUILT (v1)
  ops e2e harness:     Playwright, two flag-profile builds, full /api/* interception fed
                       from opsFixtureWeek (incl. channels/slots with a HALF-OPEN day
                       window — deliberate divergence from the backend's inclusive lte,
                       suspected backend bug), fixed clock — BUILT (ops-e2e v1 + B-4
                       amendments; NOT part of the original plan — added by DoR gate)
  RundownScreen:       channel lanes + positioned blocks + day pills + inspector embed
                       — BUILT (B-1/B-2; /ops/planner URL id per ADR-014)
  RightsScreen:        stat tiles + rights matrix + validity bars — BUILT (B-3;
                       isSettled loading state; ON-DEM column reserved per AS-8)
  registrySelectors:   pure registry projection — BUILT (registry-selectors v1.1; sibling to
                       selectors.ts, TD-25; buildRegistryIndex/projectRegistryRows/
                       linkedSummaryOf/registryFacetCounts/registryToolbarCounts +
                       linkedRecordsOf hop resolver + linkedRecordListPlan; SOURCE from
                       externalRefs first-key, STATUS token, index-once)
  useRegistryData:     quiet 4-way parallel fetch { sports,competitions,teams,players,
                       isSettled, refresh } — BUILT (v1; useContracts idiom, isSettled on
                       all-four-settled, refresh for C-4 post-create)
  useLinkedRecords:    lazy per-selection linked-record fetch — BUILT (C-3; per-kind endpoints,
                       quiet-fail, two-part stale guard: per-run active + selection-keyed
                       payload anti-flash)
  RecordInspector:     registry's OWN 320px inspector (NOT EventInspector — Rule-of-Two watch)
                       — BUILT (RecordInspector v1.1; provenance/attrs/LINKED hops/REMARKS +
                       kind-gated remark editor via onSaveRemark→saveNotes; key=record.id)
  RegistryCreateModal: create modal, 4 kinds per-kind fields — BUILT (registry-create v1;
                       synchronous single-flight latch, 409 dup vs generic, no optimistic
                       append, server-implied MANUAL provenance)
  RegistryScreen:      toolbar/facets/table + ?record selection + inspector embed + create
                       modal — BUILT (C-2..C-5; zero derivation, all from registrySelectors;
                       STATUS token→var map is occurrence-two of the RecordInspector copy)
  opsUrlState:         + useOpsRecord (?record) — BUILT (ops-selection v2; 3rd useOpsSearchParam
                       caller, opaque ids, inherits all v1 semantics)
  SyncScreen:          job cards + merge review queue — planned (placeholder; EPIC D detailed
                       2026-07-06 — syncSelectors + useSyncData + merge-decision write path)

Components (existing, consumed — do not modify):
  AppProvider (events/sports/competitions + socket), services/* (27 APIs),
  utils/crewConflicts.ts (FIXED twice by ops work: parseEventWindow ISO-datetime bug had
  conflict detection silently OFF for API-loaded data, A-3-T1; display-string variant of
  the same defect, A-4-T0), backend/src/routes/import/*, teamsApi/playersApi

Key ADRs: ADR-012 shell strategy · ADR-013 theming · ADR-014 deep-linking (all Accepted 2026-07-02, docs/governance/adr/)

Contract snapshots (docs/governance/contracts/): ops-tokens v3 · useOpsTheme v1 ·
OpsShell v1 · ops-selection v2 · ops-selectors v3 · EventInspector v1 (amended) ·
ops-e2e v1.1 (stateful registry store) · rundown-layout v1 · useContracts v1 ·
registry-selectors v1.1 · useRegistryData v1 · RecordInspector v1.1 · registry-create v1

Backend (ONLY change in the whole initiative — additive): registry create routes
(sports/competitions/teams/players POST) map Prisma P2002 → 409 'already exists'
(C-4-T0, mirrors crewMembers/savedViews; the list routes gained additive _count/
teamLinks embeds at C-1-T0). No schema/migration changes.

Open architect decisions parked at the EPIC B retro: ADR-014 amendment (carry ?day/?event
across tab switches — currently deep-link only) · backend broadcastSlots.ts inclusive-lte
day window (midnight slot returned for two days — suspected bug, e2e models half-open)

Active TD (pre-existing, relevant):
  TD-23: ui/Btn.tsx vs ui/Button.tsx duplication — do NOT import either into ops/ until consolidated
  TD-24: Event/Contract @deprecated fields (channel, duration, boolean rights) — ops code must
         consume platforms[] and BroadcastSlot, never the deprecated fields
  TD-25: Event.participants is free text — Registry LINKED uses repo relations, not participants
  TD-27: VITE_OPS_REDESIGN is build-time only — rollback = env change + REDEPLOY; e2e must
         run a two-build matrix until/unless a runtime override lands

Current Mode: DELIVERY (retained at EPIC A/B/C retros — EPIC C shipped the first write paths
under full governance and the DoR gates paid off 3×; EPIC D's irreversible merge decisions
argue even harder to keep it)

Open E-2 designer notes (EPIC C): --registry-* STATUS token family (currently reuses
--status-approved/--alert-warning/--text-shell-3) · sport-icon + per-kind create fields
beyond the design's name-only modal · provenance shows the SOURCE CODE not the full name
(no name map) · registry row-click keyboard a11y (clickable div)
```

---

## 7. Backlog

### Conventions
Branch `feature/[STORY-ID]-slug` · commits `[type]([scope]): summary` · IDs: EPIC A/B/…, story A-1, task A-1-T1.
Feature flag for all user-facing work: **`opsRedesign`** (default OFF).
Model routing per Core §6 noted per task (`Opus` = judgment, `Sonnet` = generation from spec, `Haiku` = checklist verification).

---

## EPIC A — Ops Shell + SCHEDULE (Tracer Bullet)

- **Objective:** A flagged `/ops` shell with working theming and one fully functional screen (SCHEDULE + Inspector) wired to live data — the thin slice proving tokens → shell → services → derived state → inspector.
- **Tracer Bullet?:** YES
- **Mode:** DELIVERY
- **DoD additions:** (1) With `opsRedesign` ON, `/ops/schedule` renders real events grouped by day with correct derived Rights/Crew words; (2) theme toggle swaps palettes < 100ms with no FOUC and persists across reload; (3) flag OFF → zero change to existing app (bundle-split verified).
- **Business Value:** Planners see channel, editorial status, rights clearance and crew health in one glance (today: 3 screens). Success metric: a planner answers "is Wednesday's Champions League broadcast fully clear?" from one screen.
- **Risk:** Med — light palette on legacy tokens may have contrast gaps → mitigation: A-1 includes a contrast audit task gate. Med — derived Rights Status thresholds wrong → mitigation: AS-4 stakeholder AC review.
- **SLOs:** `Ops Schedule – initial render < 1.5s p95 @ 500 events over 1 week` · `Theme toggle – palette swap < 100ms p99`.
- **Glossary:** Ops Shell, Screen, Inspector, Facet, Editorial Status, Rights Status, Crew Health, Ops Theme.
- **ADRs:** ADR-012, ADR-013, ADR-014.
- **Smoke Test Story:** A-5.
- **Runbook:** `docs/runbooks/ops-shell.md` (A-5 deliverable): flag off = rollback; symptoms: blank /ops (check flag + lazy chunk), wrong statuses (check contracts fetch), theme stuck (clear localStorage key `planza.opsTheme`).

---

### Story A-1 — Ops theme tokens + OpsThemeProvider
**As a** production planner **I want** the Ops palette in dark and light with a persistent toggle **so that** I can work in the control room (dark) and in daylight offices (light) without re-configuring.

Business Value 3 · Priority 5 · Size **M** · DoR: **READY** (ADR-013 accepted)
INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given the app loads with no stored preference, When `/ops` renders, Then the dark palette applies (`--bg #090B0D` family) and `<html>` has no `data-theme` attribute.
- Given dark mode, When I click `☀ LIGHT`, Then all ops surfaces re-render with light values within 100ms and `data-theme="light"` is set.
- Given I chose light, When I reload, Then light persists (localStorage `planza.opsTheme`).
- Given the existing (non-ops) app with flag OFF, When tokens ship, Then no existing screen changes appearance (regression: existing token values untouched; ops adds new vars + a scoped light override block).
- Error flow: Given localStorage is unavailable, Then toggle still works for the session and no error surfaces.

**Interfaces:** `OpsThemeProvider` → `useOpsTheme(): { theme: 'dark'|'light', toggle(): void }`. Token contract = README §Design Tokens table mapped onto `tokens.css` var names (mapping doc is a deliverable).
**TD considerations:** none expected; any hard-coded hex → TD item.
**Test data:** none. **Idempotency:** n/a (local write).

- **A-1-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-02**
  Goal: Extend `src/styles/tokens.css` with the Ops palette — dark values as new/updated vars, light values under `[data-theme="light"]`, plus fixed semantic sets (status/alert/channel/kind colors) as vars; document the design-token → CSS-var mapping table in `docs/ops-token-map.md`.
  TDD: (1) failing style-contract test (render probe asserting computed values for both themes) (2) implement (3) refactor.
  Deliverables: token test → `tokens.css` diff → `ops-token-map.md`.
  Pull Gate: confirm ADR-013 approved; confirm no existing component reads a var being repurposed (grep).
  Hand-off: **Contract Snapshot `ops-tokens v1`** (var names + both values).
  Unblocks: A-1-T2, A-2-T1.
- **A-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-02**
  Goal: `OpsThemeProvider` + `useOpsTheme` + toggle persistence + FOUC guard (inline head script or pre-hydration attribute set).
  TDD: hook unit tests (default, toggle, persistence, storage-unavailable) first.
  Feature Flag: rendered only inside ops shell (flag-gated by A-2).
  Pull Gate: `ops-tokens v1` snapshot matches.
  Hand-off: Contract Snapshot `useOpsTheme v1`. Unblocks: A-2-T1.
- **A-1-T3** · Hat **FEATURE** · Model **Haiku** · Confidence High · ✅ **DONE 2026-07-02** (39 AA failures flagged → architect items F-1..F-5 in `docs/ops-contrast-audit.md`; **F-1..F-5 resolved by A-1-T4**)
  Goal: Contrast audit — verify all README token pairs (text-on-surface, chip 13%-alpha combos, status words on `--pn`) meet WCAG AA in both themes; output pass/fail table; failures become follow-up items for the Architect (do not silently adjust final-intent colors — flag them).
  Deliverables: `docs/ops-contrast-audit.md`. Unblocks: END OF STORY SEQUENCE.
- **A-1-T4** · Hat **FEATURE** · Model **Sonnet** · Amendment (architect decisions 2026-07-02 on F-1..F-5) · ✅ **DONE 2026-07-02**
  Goal: Contrast remediation — semantic sets become theme-aware (light overrides in the `[data-theme="light"]` block; "identical in both themes" rule dropped by architect decision); `--text-shell-3` AA-adjusted both themes; light `--accent-shell-fg` → dark text; dark `--kind-staff` (+ tint) minimally shifted. Values derived programmatically (HSL lightness search, hue/sat locked, ≥4.6 text / ≥3.1 non-text) — all derived values pending designer sign-off (`docs/ops-token-map.md`).
  TDD: contract-test expectations updated first (red) → `tokens.css` (green) → audit re-run.
  Deliverables: `tokens.css` diff → `tokens.opsTheme.test.ts` restructure → `docs/ops-contrast-audit.md` v2 (0 FAIL) → **ops-tokens v2** → ADR-013 Amendment. Legacy vars untouched (AC-4); no component changes.

---

### Story A-2 — Ops shell: chrome, tabs, routing, flag
**As a** planner **I want** the `PLANZA/OPS` shell with 5 tabs behind a flag **so that** the redesign is reachable at `/ops` without touching the current app.

Business Value 3 · Priority 5 · Size **M** · DoR: **READY** (ADR-012 accepted) · INVEST all ✓

**AC:**
- Given flag OFF, When I visit `/ops`, Then I'm redirected to `/dashboard` and no ops chunk loads.
- Given flag ON, When I visit `/ops`, Then I land on `/ops/schedule`: 48px chrome, brand (mono 700, `/OPS` in accent), 5 tabs, pulsing LIVE badge, theme toggle.
- Given flag ON, When I click a tab, Then the URL becomes `/ops/<tab>` and the active tab shows accent bg + `--af` text; unbuilt tabs render a placeholder panel.
- Given the SYNC tab, When pending merge candidates exist, Then the tab reads `SYNC [n]` (wired for real in EPIC D; shell exposes a badge slot now).
- Given `/ops/schedule?event=<id>`, When the shell mounts, Then selection state hydrates from the URL (ADR-014).

**Interfaces:** `<OpsShell>` layout route; `useOpsSelection(): { eventId, setEventId }` (URL-backed); tab registry `OPS_TABS: {id, label, badge?}[]`.
**Idempotency:** n/a.

- **A-2-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-02** (TD-27: build-time flag; RR7 splat-relative-nav rule in OpsShell v1)
  Goal: Shell component + `/ops/:tab` lazy routes in `App.tsx` + `opsRedesign` flag gate + chrome per README layout constants + placeholder screens.
  TDD: routing/flag tests first (flag off redirect; tab activation; lazy split).
  Pull Gate: ADR-012 approved; `useOpsTheme v1` snapshot.
  Hand-off: Contract Snapshot `OpsShell v1` (routes, tab registry, badge slot).
  Unblocks: A-2-T2, A-3-T2.
- **A-2-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-02** (replace-semantics judgment call recorded in ops-selection v1; UX re-check at EPIC E)
  Goal: `useOpsSelection` URL-backed selection + `useOpsDay` (selected day) via `useSearchParams`; unit tests for hydrate/update/back-button.
  Pull Gate: ADR-014 approved.
  Hand-off: Contract Snapshot `ops-selection v1`. Unblocks: A-3-T2, A-4-T1, END OF STORY SEQUENCE.

---

### Story A-3 — SCHEDULE screen: facet rail + day-grouped table
**As a** planner **I want** the week's events as a dense table with sport facets and per-row STATUS / RIGHTS / CREW words **so that** I spot risk (expiring rights, crew conflicts) without opening each event.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY** · INVEST all ✓

**AC:**
- Given events for the visible week, When SCHEDULE renders, Then rows group under day headers (`MON 2 MARCH`, `--p2` bg) in time order with the README's 6-column grid.
- Given an event whose competition's contract expires within 90 days, Then RIGHTS shows `EXPIRING` in `#E5A13C`; no contract → `MISSING` in red; negotiation status → `NEGOTIATION`. (AS-4)
- Given `detectCrewConflicts` reports a conflict for an event, Then CREW shows `CONFLICT` red; unassigned required role → `OPEN` amber; else `OK` green.
- Given I click sport facet `Football (3)`, Then only football events show and the facet gets `--p2` bg + accent border; counts always reflect the unfiltered week.
- Given I click a row, Then it selects (`--p2` + inset accent bar) and `?event=` updates.
- Alt: empty week → empty-state panel; events without competition → RIGHTS `MISSING`.

**Interfaces:** consumes `AppProvider` events/sports/competitions + `contractsApi`; **`ops/selectors.ts`**: `deriveRightsStatus(event, contracts, now): RightsStatus`, `deriveCrewHealth(event, techPlans, conflicts): CrewHealth`, `groupEventsByDay(events, week)`.
**TD:** if contracts aren't already in AppProvider, fetch in-screen and record TD if duplicated later (Rule of Three).
**Test data:** fixture week: 7 events across 5 sports covering every Rights/Crew status permutation (reuse for A-4, B-1, A-5).

- **A-3-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (threshold logic) · Confidence High · ✅ **DONE 2026-07-02** (adversarial review caught 3 blockers incl. pre-existing crewConflicts prod bug — fixed upstream; covering-preference rule PROVISIONAL in ops-selectors v1)
  Goal: Pure derived-status selectors (`deriveRightsStatus`, `deriveCrewHealth`, `groupEventsByDay`) — no React.
  TDD: full permutation table as failing tests first (this is the core-domain logic of the EPIC — max rigor, ≥80% branch coverage).
  Pull Gate: `Contract.platforms[]`/`validUntil` shapes vs `types.ts`; `detectCrewConflicts` signature vs `utils/crewConflicts.ts`.
  Hand-off: Contract Snapshot `ops-selectors v1`. Unblocks: A-3-T2, A-4-T1, B-3-T1.
- **A-3-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-02** (ops-tokens v3 rights/crew aliases; CHANNEL cell mostly `—` until B-1 slot resolution — known)
  Goal: Facet rail + table markup per README §1 (grids, type scale, hover/selected states) + wiring to selectors, selection, and facet filter.
  TDD: interaction tests first (filter, select, group headers, status words).
  Pull Gate: `OpsShell v1`, `ops-selection v1`, `ops-selectors v1` snapshots.
  Unblocks: A-4-T1, END OF STORY SEQUENCE.

---

### Story A-4 — Event Inspector
**As a** planner **I want** a persistent inspector for the selected event showing rights, crew (with per-role state) and tech plans **so that** I can assess readiness without leaving the schedule.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** · INVEST all ✓

**AC:**
- Given a selected event, Then the 320px inspector shows LIVE/DELAYED badge, editorial status word, title, mono meta line, RIGHTS section (dot + status + `until <date>`), CREW section (role rows with ok/open/conflict dots + right-aligned status word), TECH PLANS chips + dashed `+ PLAN` ghost affordance (links to existing SportsWorkspace).
- Given the selected event has a crew conflict, Then a red callout box states the conflict (from `groupConflictsByPerson` detail).
- Given no selection, Then the inspector shows a quiet empty state.
- Given selection changes (row click or URL), Then the inspector updates without full-screen re-render.

- **A-4-T0** *(added by DoR gate 2026-07-02: v1 selectors provably insufficient for RIGHTS "until date")* · Hat **FEATURE** · ✅ **DONE 2026-07-02** — `ops-selectors v2` (deriveRightsInfo, deriveCrewRoles, filterConflictsToEvent) + crewConflicts display-string fix. NOTE: B-3-T1's hand-off renumbers to ops-selectors **v3**.
- **A-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-03** — `EventInspector v1` (shared 320px pane, props-driven) + ScheduleScreen mount; Contract Snapshot `docs/governance/contracts/EventInspector.md`.
  Goal: `EventInspector` component per README §1 inspector spec, consuming `ops-selectors v1` + `ops-selection v1`; conflict callout wired to `groupConflictsByPerson`.
  TDD: render-state tests first (each section per fixture permutation).
  Pull Gate: snapshots above; verify tech-plan chips shape vs `techPlans` service.
  Hand-off: Contract Snapshot `EventInspector v1` (props) — reused by Rundown in B-1.
  Unblocks: A-5-T1, B-1-T2, END OF STORY SEQUENCE.

---

### Story A-5 — EPIC A smoke test + runbook
**As a** reviewer **I want** an E2E smoke test and a runbook **so that** the tracer bullet is verifiably deployable and rollbackable.

Size **M** *(re-estimated S→M 2026-07-03: e2e framework introduction + two build profiles)* · DoR: **READY** (2026-07-03 — the v1 premise "existing e2e stack" was FALSE, repo has none; story was **NOT READY** until the framework decision was resolved: **Playwright** `@playwright/test`, architect/user decision 2026-07-03)

**Data/clock strategy (decided 2026-07-03):** network interception — Playwright routes serve `opsFixtureWeek`-shaped API payloads; browser clock pinned via Playwright's clock API to `FIXTURE_NOW_DAYTIME` (2026-03-04T10:00Z); deep-link `?day=2026-03-02` selects the fixture week. **Trade-off recorded:** this does NOT exercise the real backend — recorded against EPIC A DoD "live data" in the runbook's known limitations.

**AC (Gherkin, per DoR gate 2026-07-03):**
- Given the flag-ON build and an authenticated session, When I visit `/ops`, Then I'm redirected to `/ops/schedule`; and with `?day=2026-03-02` the fixture week renders: day groups incl. rows for the 9 in-week events, with comp-102's row showing `EXPIRING`.
- Given the fixture week, When I click a named sport facet (known fixture count), Then the filtered row count equals that facet's count.
- Given the fixture week, When I click event e3's row, Then the URL gains `?event=3` and the inspector shows the event title + a red conflict callout containing the `YYYY-MM-DD HH:MM`-shaped detail (pins the A-4-T0 display fix).
- Given clean localStorage, Then `<html>` has NO `data-theme`; When I toggle the theme and reload, Then `html[data-theme="light"]` persists (localStorage per `useOpsTheme v1`).
- Given the flag-OFF build and an authenticated session, When I visit `/ops`, Then I land on `/dashboard` (NOT merely "redirects" — landing on `/login` would mask an auth regression) AND the ops lazy chunk is never requested (network-level assertion deferred to A-5 per OpsShell v1 §Resolved ambiguities #4; verifies EPIC A DoD "bundle-split verified").

- **A-5-T0** *(added by DoR gate 2026-07-03: "existing e2e stack" premise false — Playwright chosen)* · Hat **PREPARATORY** · Model **Sonnet** · Confidence Med · ✅ **DONE 2026-07-03** — Playwright 1.61 + chromium; two Vite-mode build profiles (`.env.e2e-on|off`, ports 4181/4182); full `/api/*` interception importing `opsFixtureWeek`; token-seed auth (no login flow); clock pinned; harness proven green in BOTH profiles; Contract Snapshot `docs/governance/contracts/ops-e2e.md`.
  Goal: Playwright infrastructure — install `@playwright/test`; `playwright.config.ts` with TWO projects/profiles (flag-on build `VITE_OPS_REDESIGN=true` and flag-off build — the flag is a build-time Vite env, no runtime toggle, TD-27); auth session setup (seeded test user login → storage state); route-interception fixtures serving `opsFixtureWeek`-shaped API payloads; clock pinned to `FIXTURE_NOW_DAYTIME` (2026-03-04T10:00Z).
  TDD: prove the harness first — one trivial spec green in BOTH profiles (authenticated load + one intercepted fixture round-trip) before A-5-T1 starts.
  Pull Gate: `OpsShell v1`, `EventInspector v1`, `ops-selectors v2`, `useOpsTheme v1` snapshots; TD-27 wording constraint (build-time flag → two builds, never a runtime toggle); fixture inventory (event/competition IDs, facet counts) vs `opsFixtureWeek.ts`.
  Hand-off: Contract Snapshot **`ops-e2e v1`** (npm scripts, profiles, fixture strategy + the recorded live-data trade-off).
  Unblocks: A-5-T1.
- **A-5-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-03** — `e2e/smoke.flag-on.spec.ts` (ACs 1–4) + `e2e/smoke.flag-off.spec.ts` (AC-5 incl. the ops-chunk network assertion); A-5-T0 harness specs absorbed; runbook `docs/runbooks/ops-shell.md` (first OPS-INITIATIVE runbook — structure sets precedent for `docs/runbooks/`; pre-existing repo runbooks live at `docs/governance/runbook-*.md`); 5/5 green in both profiles.
  Goal: Smoke spec implementing the ACs above (run under both A-5-T0 profiles) + `docs/runbooks/ops-shell.md` — the ops initiative's first runbook (structure sets precedent; card originally said "repo's FIRST" — corrected at the A-5-T1 review: `docs/governance/runbook-*.md` pre-exist). Sections: purpose/scope · flag procedure (`VITE_OPS_REDESIGN`, build-time; **rollback = env change + REDEPLOY, stated honestly per TD-27**) · verification (smoke scenario as a manual checklist) · symptom table (blank `/ops` → flag/lazy chunk; wrong rights words → contracts fetch; theme stuck → clear localStorage key) · known limitations (RBAC parity deferred to E-3; theme localStorage-only; E2E intercepts network — real-backend gap vs EPIC A DoD "live data") · stub headings §rundown / §rights for EPIC B.
  TDD: AC-ordered spec written first (red on the flag-on profile) → assertions green in both profiles → runbook verification checklist derived from the passing spec.
  Pull Gate: `ops-e2e v1` + `OpsShell v1`, `EventInspector v1`, `ops-selectors v2`, `useOpsTheme v1` snapshots; TD-27 wording constraint; fixture inventory vs `opsFixtureWeek.ts` (e3 / comp-102 / facet counts asserted literally).
  Unblocks: **EPIC A RETRO** (Phase Summary + Architecture Memory update + mode check per BB §10), END OF STORY SEQUENCE.

---

### EPIC A — Retro (2026-07-03, per §10.4 / BB §10)

**Phase Summary.** Tracer bullet COMPLETE — all 5 stories done, all EPIC A DoD additions verified:
(1) `/ops/schedule` renders real events with derived Rights/Crew words (unit-pinned in selectors +
e2e AC-1); (2) theme toggle + persistence (e2e AC-4; <100ms/FOUC pinned at A-1); (3) flag OFF →
zero change, bundle split verified at the network level (e2e AC-5 — ops chunk never requested).
Shipped across 9 commits: A-1/A-2/A-3 merged to main (PRs #6, #9, #8); A-4/A-5 on
`feature/A-4-event-inspector` (`55dc20f`, `fdc9c4a`, `124a202`, `0668638`, `5262cd7`, `e9cc8a9`).
Test base: 445 unit/interaction tests (23 files) + 5 e2e ACs across two flag-profile builds;
`tsc -b` clean. 7 contract snapshots published (see §6). SLOs not yet measured against targets —
carry to EPIC B (rundown day-switch SLO makes a natural first measurement point).

**Found-work highlights (value beyond plan).** Ops selector work surfaced and fixed TWO dormant
production bugs in `utils/crewConflicts.ts` (conflict detection silently OFF for API-loaded data;
same defect in display strings) — the tracer bullet paid for itself before shipping a screen.
DoR gates added two unplanned-but-necessary T0 tasks: A-4-T0 (v1 selectors provably could not
produce the RIGHTS until-date) and A-5-T0 (the "existing e2e stack" premise was FALSE — Playwright
harness introduced by architect decision 2026-07-03).

**Waste/cycle notes.** (1) The A-5 card shipped with an unverified premise ("existing e2e stack")
and a stale READY mark — one full re-gate + user decision loop mid-story; lesson: DoR for smoke
stories must verify tooling EXISTS, not assume it. (2) Review chains produced findings on every
task (naming 1 MAJOR + test-quality 2 MAJOR at A-4-T1; 1 MAJOR each at A-5-T1) — all applied
pre-commit, zero post-commit rework; the chain is earning its cost. (3) Fixture week + interception
reuse meant A-5 wrote zero new test data.

**Debt candidates raised during A-4/A-5 (register has uncommitted parallel-session edits — record
these when it frees up):** double conflict scan in ScheduleScreen (unify when B-1 becomes the
second consumer); second `contractsApi.list` consumer extraction moment arrives with B-1;
e2e TS not typechecked by `tsc -b`; e2e profile builds serial/un-cached (~45s/run); theme-toggle
e2e selector keys on the glyph label (testid candidate, one-line OpsShell change); live-backend
smoke gap recorded in runbook §known limitations; full vitest suite occasionally flaky under
process contention (pre-existing DynamicEventForm timing tests).

**Mode check: DELIVERY retained.** The initiative remains user-facing, flagged, multi-session work
on a production codebase; nothing observed in EPIC A argues for loosening governance. EPIC B starts
at B-1-T1 with the AS-3 BroadcastSlot coverage pull gate (SPIKE if <90%); AS-4 threshold formulas
remain PROVISIONAL pending the rights-windows track (ADR-015).

---

## EPIC B — RUNDOWN (Planner) + RIGHTS

- **Objective:** The two remaining monitoring surfaces that derive purely from existing event/contract data: the per-channel day rundown with shared selection, and the rights tiles + matrix.
- **Tracer Bullet?:** NO
- **Mode:** DELIVERY
- **DoD additions:** (1) Rundown block positions are correct to the minute for the 05:00–24:00 axis incl. clamping rules; (2) selection is shared Schedule↔Rundown via URL; (3) Rights matrix numbers reconcile 1:1 with `contractsApi` data.
- **Business Value:** Channel managers see a day's broadcast load per channel at a glance; rights managers get contract health without opening contracts. Metric: rights team identifies all ≤90-day expiries from one screen.
- **Risk:** Med — AS-3 (lane channel derivation) → mitigation: pull-gate data check, SPIKE fallback. Low — timeline math edge cases → property-based tests.
- **SLOs:** `Ops Rundown – day switch < 200ms p95` · `Ops Rights – render < 1s p95 @ 100 contracts`.
- **Glossary:** Rundown, Rights Status (+ `NO CONTRACT` display variant), validity progress.
- **ADRs:** ADR-014 (shared selection).
- **Smoke Test Story:** B-4. **Runbook:** extend `ops-shell.md` (§rundown, §rights).

### Story B-1 — Rundown lanes + positioned blocks ✅ DONE 2026-07-04
**As a** channel manager **I want** one timeline lane per channel with positioned event blocks **so that** I see each channel's day rundown and collisions instantly.

Business Value 3 · Priority 4 · Size **L** · DoR: **READY** (re-gated 2026-07-04: AS-3 pull gate CLOSED — see Assumptions Ledger; DoR check found 8 unpinned premises, all pinned below) · INVEST all ✓

**AC:**
- Given events on the selected day, Then each renders in its channel's lane at `left=(startMin−300)/1140`, `width=max(duration,80min)/1140` (%), channel color at 15% alpha + 3px left border, two-line content per README §2.
- Given an event before 05:00 or past 24:00, Then the block clamps to the axis and is flagged in a title tooltip (edge AC; geometry pins below).
- Given a block is clicked, Then `?event=` updates and the shared `EventInspector` opens (Rundown embeds the inspector, same as Schedule).
- Given the selected event has a crew conflict, Then the block gets a 1px `--alert-danger` outline; selected → accent outline.
- Given a day with zero events, Then the axis renders with an empty-state panel (no lanes) — mirrors A-3's empty-week AC.
- Alt: event with no resolvable channel → rendered in an `UNASSIGNED` overflow lane (visible, never dropped) — flagged as data quality signal.

**Pinned decisions (DoR re-gate 2026-07-04 — write tests to these):**
1. *Geometry:* block = intersection of the event window with the axis `[300,1440]`, both edges (start-day owns the event per `getDateKey`; overnight events render clamped at 24:00, never on the next day). The 80-min width floor applies AFTER intersection, then the right edge re-clamps to 1440 (floor yields at the boundary). Fully-off-axis events render as a floored sliver pinned at the nearer axis edge, tooltip-flagged (never dropped — mirrors the UNASSIGNED rule). Property test: ∀ blocks, `0 ≤ left ∧ left+width ≤ 100%`.
2. *Window source (TD-24):* `startMin`/duration derive slot-first from the resolved `BroadcastSlot` window; fallback = event window via the sanctioned accessors (`effectiveDurationMin`, never `Event.duration`/deprecated fields). Divergent slot-vs-event windows: slot wins (the broadcast reality the Rundown depicts) — one fixture case pins this.
3. *Day default:* `?day` absent/invalid → Rundown defaults to today, resolved screen-side through the `now` prop seam (keeps fixture/e2e clock pinning working); `?day=<ISO>` overrides. B-1 is complete and demoable without B-2's pills.
4. *Fetching (Rule of Three):* `schedulesApi.listSlots({date})` per selected day; contracts/techPlans in-screen duplicating the ScheduleScreen pattern (2nd occurrence — TD entry now; extraction triggers at the 3rd consumer, B-3, as a PREP task there). Conflict scans: ONE memoized `detectCrewConflicts` + ONE `groupConflictsByPerson` pass per screen feeding BOTH block outlines and the inspector (EventInspector v1 obligation).
5. *Same-lane overlap:* NO sub-lane splitting in v1 (design shows 64px single-row tracks). Deterministic paint order — sort `startMin` asc, then id; later-starting block on top — and every block carries a title tooltip, so an occluded block stays discoverable. Sub-row stacking = UX follow-up candidate at the EPIC B retro.
6. *Lane inventory:* lanes = channels with ≥1 event on the selected day, in channel service order; `UNASSIGNED` appended only when non-empty.
7. *Unmapped channel colors:* README fixed colors cover Eén/Canvas/VRT MAX only; unmapped channels (Ketnet, VRT MAX Sport, Radio 1) and the UNASSIGNED lane use a neutral fallback (`--text-shell-3` at 15% alpha + border) — extending ops-tokens with real channel vars is an E-2/designer item, not B-1 scope. Channel color from the Channel record's `color` field stays DATA (A-3 precedent).
8. *Test data:* `opsFixtureWeek` carries no BroadcastSlot/Channel payloads yet — B-1-T1 extends it ADDITIVELY with slot fixtures incl. one clamped, one same-lane overlap, one slot-vs-event divergence, and one unresolvable-channel case (A-5 e2e interception inherits them for B-4).

- **B-1-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High (was Med — AS-3 resolved) · ✅ **DONE 2026-07-04** — `src/components/ops/rundownLayout.ts` (sibling module; ops-selectors v2 byte-stable) + 21 tests incl. seeded property sweep; fixture ADDITIVE extension (FIXTURE_CHANNELS/FIXTURE_SLOTS + makeChannel/makeSlot); Contract Snapshot `docs/governance/contracts/rundown-layout.md`.
  Goal: Pure lane/position selectors: `resolveChannel(event, slots, channels)`, `layoutRundown(events, slots, channels, day): Lane[]` implementing pins 1/2/5/6.
  TDD first: minute-precision positioning table + property test (pin 1) + fixture extension (pin 8).
  Pull Gate: ~~AS-3 data check~~ ✅ CLOSED 2026-07-04 (slot coverage 57% is a seed artifact; slot-first + `event.channel`-relation fallback = 100%, see Assumptions Ledger).
  Hand-off: Contract Snapshot `rundown-layout v1`. Unblocks: B-1-T2.
- **B-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-04** — RundownScreen replaces the placeholder (root testid `ops-screen-planner` kept per OpsShell contract); pins 3/4/7 implemented (channels via `channelsApi.list()` — recorded; contracts in-screen = 2nd occurrence, B-3 extraction trigger marked in code); selected-wins outline precedence (from the design HTML); EventInspector v1 embedded; 21 interaction tests. **STORY B-1 COMPLETE.**
  Goal: Rundown screen markup: axis ticks, lanes, blocks, legend row, `EventInspector v1` embed; fetching per pin 4, day default per pin 3, empty-day AC.
  TDD: interaction tests (select, outline states, unassigned lane, empty day).
  Pull Gate: `rundown-layout v1`, `EventInspector v1`. Unblocks: B-2-T1, END OF STORY SEQUENCE.

### Story B-2 — Day pills + shared day state ✅ DONE 2026-07-04
**As a** channel manager **I want** MON–SUN day pills with event counts **so that** I move through the week without leaving the rundown.

Size **S** · Priority 3 · DoR: **READY**

- **B-2-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-04** — pill row on RundownScreen (component-local — Rule of Two; counts via reused `groupEventsByDay`, active accent per design HTML, right label `WED 4 MARCH 2026`); PRE-COMMIT PREP unit (Rule of Three TRIGGERED): shared `src/components/ops/dayLabels.ts` `formatOpsDay` extracted from ScheduleScreen/EventInspector under green tests. 8 pill tests + 6 formatter pins. **STORY B-2 COMPLETE.**
  Goal: Day pill row (counts, active accent state, right-aligned date label) bound to `useOpsDay` (URL-backed, shared with Schedule's week context).
  TDD: count + navigation tests. Pull Gate: `ops-selection v1`.
  Unblocks: B-4-T1, END OF STORY SEQUENCE.

### Story B-3 — Rights tiles + matrix ✅ DONE 2026-07-04
**As a** rights manager **I want** contract-health tiles and a competitions × platforms matrix **so that** expiring/missing rights are visible before they bite.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** (re-gated 2026-07-04: reconciliation universe + 8 further premises pinned below; pull gate run — real `platforms[]` vocabulary is exactly `['linear','on-demand','radio']`) · INVEST all ✓

**AC (amended at the 2026-07-04 re-gate):**
- Given all contracts + competitions + events, Then 4 tiles show counts (VALID / EXPIRING / IN NEGOTIATION / MISSING) as a FOLD over the matrix rows' DERIVED statuses — MISSING covers all three derivation causes (no contract row for an event-bearing competition, picked status `'none'`, lapsed `validUntil`), same derivation as Schedule/Inspector; reconciliation tiles == matrix aggregation is an identity by construction (T2 pins it plus a property test: ∀ events, `deriveRightsStatus(event, contracts, now)` === the event's competition-row status).
- Given a contract with `platforms[]`, Then LINEAR/MAX/RADIO/ON-DEM cells show accent `●` (has right) or `--text-shell-3` `·`.
- Given `validUntil`, Then validity shows `Until <date>` + 3px progress bar: red <15% term remaining, amber <50%, green else (unrounded comparisons); `NO CONTRACT` rows show the red status word and no bar.
- Edge: contract without `validFrom` → bar suppressed, date shown.

**Pinned decisions (DoR re-gate 2026-07-04 — write tests to these):**
1. *Platform → column mapping:* `linear→LINEAR`, `on-demand→MAX` (backend derives `'on-demand'` from legacy `maxRights`; VRT MAX is the OTT service; the design demo never lights ON-DEM), `radio→RADIO`; **ON-DEM renders `·` for all rows** (reserved — see AS-8). Unknown platform values light NO column and are logged once (not dropped silently). Note: "MAX" as a column label is VRT/tenant vocabulary — E-2/designer note, not B-3 scope.
2. *Row universe:* matrix rows = competitions with ≥1 contract row ∪ competitions with ≥1 event (ALL events, no date scoping — date-scoping deferred to the AS-4 threshold session). ONE row per competition = its GOVERNING contract (pickGoverningContract semantics — fixture comp 109 renders successor id 10). Dangling `competitionId` (no Competition record) → row with fallback label `COMPETITION #<id>`, never dropped.
3. *Competition-scoped core:* extract `deriveCompetitionRightsInfo(competitionId, contracts, now)` inside `selectors.ts`; `deriveRightsInfo` delegates (event → `event.competitionId`) — A-3 permutation rows stay the pin for both. Status words on this screen are DERIVED only, never stored `contract.status` (seed contract 4 stores `'expiring'` but derives MISSING at a lapsed clock — correct).
4. *Validity progress:* `pct = clamp((validUntilEndOfDayMs − now) / (validUntilEndOfDayMs − toEpochMs(validFrom)), 0, 1)`, returned UNROUNDED (null = no bar); thresholds compare unrounded; pct 0 ⇔ lapsed (bar disappears exactly when the word flips). Null for absent/garbage `validFrom` OR `validUntil`, degenerate `validFrom ≥ validUntil`; future `validFrom` clamps to 1. Text variants (design HTML): NEGOTIATION → `In negotiation`; no-agreement MISSING → `No agreement in place`; open-ended VALID → `Until —`.
5. *Row note:* governing contract's `notes` (10px line), omitted when empty/no contract. *Row order:* severity-first (MISSING, EXPIRING, NEGOTIATION, VALID), then competition name asc.
6. *`now` seam:* `RightsScreen({ now = new Date() })` — the only impure edge, same as siblings; no `Date.now()` in selectors.
7. *Loading:* empty-state/skeleton until the first `contractsApi.list()` resolution (contracts are this screen's PRIMARY data — the everything-MISSING pre-fetch flash is not acceptable here); the `loaded` flag lands in the FEATURE unit, keeping the PREP behavior-preserving.
8. *Fixtures:* additive `FIXTURE_COMPETITIONS` + `makeCompetition` (fixture contracts reference comp ids 101–110 that exist nowhere yet); existing exports byte-stable.
9. *Root testid:* keep `ops-screen-rights` (OpsShell contract, B-1 precedent).

- **B-3-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-04** — ops-selectors v3 (deriveCompetitionRightsInfo extraction with A-3/A-4 suites byte-unchanged as the behavior pin; deriveRightsMatrix/Tiles; deriveValidityProgress + deriveValidityBand threshold single source); additive FIXTURE_COMPETITIONS incl. 107 'Quiet G' exclusion pin; 23 tests.
  Goal: Pure selectors `deriveRightsTiles(contracts, competitions, events, now)`, `deriveValidityProgress(contract, now)`, `deriveRightsMatrix(...)` (or equivalent row derivation) + the pin-3 `deriveCompetitionRightsInfo` extraction; reuse `deriveRightsStatus` thresholds — single source for the 90-day rule (AS-4).
  TDD first (threshold boundary table + pin-4 edge table).
  Pull Gate: ✅ RUN 2026-07-04 — `platforms[]` = `['linear','on-demand','radio']`; mapping pinned (pin 1).
  Hand-off: **`ops-selectors v3`** snapshot (the v2 changelog pre-records this renumber). Unblocks: B-3-T2.
- **B-3-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High · ✅ **DONE 2026-07-04** — PREP unit: `useContracts(): { contracts }` strictly behavior-preserving (Schedule/Rundown refactored, their suites byte-unchanged; snapshot `docs/governance/contracts/useContracts.md` v1). FEATURE unit: additive `isSettled` hook extension (review-renamed from `loaded` — promise-spec term, flips on success OR failure) + RightsScreen (tiles + matrix per README §3; pin-7 skeleton incl. failure path; NO CONTRACT variant; bar rule `progress > 0` from the design HTML); 16 interaction tests. **STORY B-3 COMPLETE.**
  Goal: PRE-COMMIT PREP unit (B-2-T1 precedent, separate REFACTORING commit): extract `useContracts()` to `src/components/ops/useContracts.ts` — behavior-preserving quiet fetch (Schedule + Rundown refactored under green tests; 3rd consumer = the trigger B-1 pin 4 pre-authorized). Then FEATURE: Rights screen markup (tiles grid + matrix grid per README §3), hook extended to `{ contracts, loaded }` for pin 7.
  TDD: reconciliation test (tiles == matrix aggregation) + the pin-1 property test.
  Unblocks: B-4-T1, END OF STORY SEQUENCE.

### Story B-4 — EPIC B smoke test ✅ DONE 2026-07-04
- **B-4-T1** · Hat **FEATURE** · Model **Sonnet** · Size **S** · ✅ **DONE 2026-07-04** — `e2e/smoke-epic-b.flag-on.spec.ts` (full journey with literal geometry/tile/bar assertions; interception extended with `/api/channels` + date-window-honoring `/api/broadcast-slots`; E2E_COMPETITIONS → shared FIXTURE_COMPETITIONS); runbook §rundown/§rights filled; 6/6 e2e green. Retro note: tab NavLinks drop `?day`/`?event` (deep-link workaround in the spec).
  Goal: E2E: schedule → select event → switch to RUNDOWN → same event selected + outlined → switch day via pills → RIGHTS tab → tile counts match seeded contracts. Extend runbook.
  Unblocks: **EPIC B RETRO**, END OF STORY SEQUENCE.

### EPIC B — Retro (2026-07-04, per §10.4 / BB §10)

**Phase Summary.** EPIC B COMPLETE — all 4 stories done in one day on `feature/B-1-rundown-lanes`
(11 commits, stacked on the EPIC A branch/PR #10): B-1 Rundown lanes (`00572ae` rundown-layout v1
+ `210141c` screen), B-2 day pills (`77d0222` PREP + `9c129ae`), B-3 rights (`3ba6f72` PREP +
`584a324` ops-selectors v3 + `c8d28d6` useContracts PREP + `e942796` screen), B-4 smoke
(`7c58c6a`), plus two DoR re-gate commits (`f462798`, `21f8428`). Test base 445 → **551** vitest
(under the new repo-wide TZ pin) + e2e 5 → **6** (EPIC B cross-screen journey), `tsc -b` clean
throughout. Contracts: rundown-layout v1 · useContracts v1 · ops-selectors v3 · ops-e2e amendments.

**DoD additions check:** (1) minute-precise positions incl. clamping — unit property sweep +
e2e clamp literals ✓. (3) rights numbers reconcile 1:1 — reconciliation-by-construction fold +
∀-events property + e2e tile/bar literals ✓. (2) selection shared via URL — **mechanism ✓, UX
partial**: OpsShell tab NavLinks drop `?day`/`?event`, so cross-screen selection works via deep
links only. OPEN RETRO DECISION → ADR-014 amendment candidate: carry ops params across tab
switches (small change, needs the architect).

**Process notes.** (a) DoR re-gates before B-1 and B-3 pinned 8 + 9 premises and caught a
reconciliation AC that would have contradicted the Schedule screen — zero mid-task stalls
followed; the A-5 lesson (verify premises) is now the working method. (b) Mutation probes became
a standard review-chain step and caught unenforced pins at B-1-T1 (3) and B-3-T1 (2) plus a
100x fraction-vs-percent naming landmine before any consumer existed. (c) Two Hats produced 4
clean REFACTORING commits (formatOpsDayLabel, deriveCompetitionRightsInfo, useContracts, plus
hunk-split staging) — the Rule-of-Three triggers pre-recorded in EPIC A all fired as predicted.
(d) The vitest TZ pin (`America/New_York`) retroactively made every date assertion able to fail
on TZ bugs; zero fragile tests surfaced.

**Found work / upstream questions (not fixed here):** backend `broadcastSlots.ts` day-window
uses inclusive `lte` — a midnight-UTC slot returns for BOTH adjacent days (suspected bug; e2e
interception deliberately models half-open and documents the divergence; needs a backend
decision). Slot wall-clock TZ semantics (rundownLayout reads slot UTC strings textually —
revisit at the first real slot payload, alongside `Channel.timezone`).

**Debt candidates awaiting a free `debt-register.md`:** contracts-duplication loop opened
B-1-T2 → closed B-3-T2 PREP (record the closed loop); e2e TS not typechecked by `tsc -b`; e2e
profile builds serial/un-cached; `isNoAgreement` selector boolean (v3.1, replaces the
validityLabel string discriminant); title-case contract-date formatter at occurrence two;
theme-toggle e2e selector testid; sub-lane stacking UX (overlap pair renders occluded per pin 5);
live-backend smoke gap; season label unwired (E-2/designer); rights matrix recompute per
events-socket update (check at E-1 SLO run).

**SLOs still unmeasured** (`day switch < 200ms p95`, `rights render < 1s p95 @ 100 contracts`)
— E-1 remains the measurement point. **Mode check: DELIVERY retained** — unchanged rationale;
EPIC C (Registry) introduces the first new WRITE paths (create/remarks), which if anything
argues for keeping full governance. Next per §10.4: expand **EPIC C** with `backlog-builder`
(AS-5 performer/staff verification is the first gate) — architect/user call.

---

## EPIC C — REGISTRY (sports CMS surface)

- **Objective:** The browsable/searchable sports repository over the merged teams-players backend: one table across sports/competitions/teams/players with kind facets and live search, a Record Inspector with provenance and linked-record hopping (deep-linkable via `?record`), plus the initiative's FIRST write paths — manual create (SOURCE: MANUAL) and protected remarks.
- **Tracer Bullet?:** NO
- **Mode:** DELIVERY (retained at the EPIC B retro — new write paths argue for keeping full governance)
- **Scope (AS-5, verified 2026-07-05):** Registry v1 = **sports / competitions / teams / players ONLY**. No Performer/Staff/Person entity exists (TechPlan crew names are free text, not entities); performer/staff Kinds are a deferred stub (C-6) gated on a product/schema decision. Facets, counters, create-modal chips and the linked graph all omit performer/staff.
- **DoD additions:** (1) No write fires twice on double-click / Enter+click / retry — a single-flight guard is unit-tested per write path; (2) creates send the MANUAL-record shape and the created record renders `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE` — the sync-overwrite protection itself is existing SERVER behavior (`ImportGovernanceService`, covered by backend tests): the UI-level DoD is honestly scoped to "right shape sent, right provenance rendered", NOT a UI re-proof of server semantics; (3) ALL person fixtures (unit + e2e) use ANONYMISED invented names — no real athletes (PII); (4) `?record` deep links round-trip: direct load hydrates the inspector, hops update the URL (ops-selection v2).
- **Business Value:** Editors browse and correct the whole sports repository from one surface instead of TeamsView plus per-entity navigation. Success metric: an editor finds any record and its related records in ≤ 2 clicks from `/ops/registry`, and creates a sync-protected manual record without leaving the screen.
- **Risk:** Med — linked-graph/search derivation cost at volume (squad sync jobs import 1,000+ players) → mitigation: index-once selectors (C-1 pin 7) + a C-1 perf probe; honest SLO measurement stays at E-1. Med — duplicate creates hit server unique constraints (e.g. `Player @@unique([tenantId, sportId, fullName, birthDate])`) → UI behavior pinned (C-4 AC: modal stays open, inline error, no phantom row). Med — design gaps (remark editor UX; `12 PEOPLE` counter assumed person Kinds) → display-honesty pins + designer notes for E-2. Low — 4-collection fetch fan-out → `useRegistryData` quiet-fetch pin (useContracts idiom).
- **SLOs:** `Ops Registry – initial render < 1.5s p95 @ 2,000 records` · `Registry search – keystroke → filtered table < 50ms p95 @ 2,000 records (client-side filter)` · `Registry inspector hop – linked-record click → inspector update < 100ms p95`.
- **Glossary:** Kind (v1 subset per AS-5), Record, Provenance; display terms: LINKED summary, `REMARKS · MANUAL`. §4 unchanged — its Kind row already carries the AS-5 synonym flag.
- **ADRs:** ADR-014 — `?record` was RESERVED in ops-selection v1; this EPIC delivers it as the additive **ops-selection v2** bump (same module `opsUrlState.ts`, per the contract's reserved-param row). No new ADRs required; AS-5 resolution lives in the Assumptions Ledger.
- **Smoke Test Story:** C-7. **Runbook:** extend `docs/runbooks/ops-shell.md` (add §registry).
- **Working method (proven in A/B, binding here):** DoR gate re-verifies each story's premises before start (backlog-health-advisor); pins below are written to be testable; derived logic in pure selectors under `src/components/ops/` (anti-smart-ui) — screens only render + wire; additive deep-frozen fixture extensions; Rule-of-Three extractions as separate REFACTORING/PREP commits; mutation probes in the review chain; `now`/data seams; ops-selectors v3 stays byte-stable (sibling-module rule, B-1 precedent).

### Story C-1 — Registry selectors + data hook (record projection, linked graph, search/facet)
**As a** sports editor **I want** one derived record universe over sports/competitions/teams/players with linked-record summaries **so that** the table, facets, counters and inspector all read from a single, tested projection.

Business Value 3 · Priority 4 · Size **M→L** · DoR: **READY** (pull gate RUN 2026-07-05 — it FAILED as written: link data does not ride the bulk lists; user decision same day = **HYBRID**, sign-off recorded: additive backend `_count`/current-team embeds via new C-1-T0 + lazy per-entity linked-record LISTS. ADR-012 note: backend additive, no legacy screens touched. Provenance fields verified riding the list payloads: `isManaged`, `externalRefs`, `canonical*Id`, `notes`, `status` all return — bare `findMany`, no `select`.) · INVEST all ✓

**AC (amended at the 2026-07-05 re-gate — HYBRID):**
- Given the four collections, When projected, Then every entity becomes a `RegistryRecord`: kind-scoped id (`<kind>:<dbId>` — numeric ids collide across tables), kind, display name, sport label, LINKED summary, SOURCE code, STATUS word.
- Given a selected record, Then its linked-record LIST resolves LAZILY (one call per selection via the existing endpoints: `/teams/:id/competitions`, `/players/:id/teams`, `/players?teamId=`, `/teams?competitionId=`); the sport→competitions arm stays client-derivable (competition.sportId rides the list). AS-5 graph — no staff arm.
- Given LINKED summaries (table column), Then they derive from the C-1-T0 list-payload embeds: sport → `N competitions` (existing `_count`), competition → `N teams` (new `_count.teamLinks`), team → `N linked records` (new `_count`: competitionLinks + current playerLinks), player → current-team name or `—` (new embedded current `teamLinks` team; unattached = `teamId` null).
- Given a query and an active facet, Then filtering composes AND — case-insensitive substring over name / sport label / detail; facet counts ALWAYS reflect the unfiltered universe (A-3 precedent).
- Given provenance fields, Then SOURCE is `MANUAL` for manual records, else the mapped code (`the_sports_db→TSDB`, `api-football→API-FB`, `football-data.org→FB-DATA`; unknown code → uppercased raw, never dropped silently).
- Given player status, Then STATUS is `ACTIVE` green / `INJURED` amber / `LOANED`·`RETIRED` neutral grey (design `decoEnt` fallback color); non-player kinds → `ACTIVE`.

**Pinned decisions (expansion gate 2026-07-05 — write tests to these):**
1. *Record ids:* `<kind>:<dbId>` composite — doubles as the `?record` value (ops-selection rule 5: opaque at hook level; unknown/malformed resolves to quiet no-selection screen-side).
2. *Linked graph source (TD-25):* repo relations ONLY — `TeamCompetition` for competition↔team, `PlayerTeam` for team↔player; NEVER `Event.participants` (free text).
3. *SOURCE at record level:* `MANUAL` when the record has no import lineage (per `ImportGovernanceService` semantics — manual origin / not `isManaged`), else the primary external source code. T1's pull gate verifies which fields the list APIs actually expose (`isManaged`, `externalRefs[].source`, field-level provenance) and pins the exact predicate — do NOT guess shapes.
4. *Search fields:* name + sport label + detail line (the design's name/sport/meta trio; `detail` = position/jersey for players, note/meta where present — whatever the projection exposes).
5. *Counters line:* real counts; the people segment reads `N PLAYERS` — the design's `12 PEOPLE` assumed person Kinds and would be dishonest under AS-5 (designer note for E-2).
6. *Canonical duplicates:* rows with a `canonicalPlayerId`/`canonicalTeamId` pointing elsewhere list AS-IS in v1 (dedup review is EPIC D's surface); LINKED derivation follows the row's own links only.
7. *Index once:* selectors take a prebuilt `RegistryIndex` (by-id, by-kind, sport→competitions adjacency; team/player adjacency maps DROPPED — those lists are lazy per the HYBRID decision) built in ONE memoized pass per data change; search/facet stay O(rows) over the index. A micro perf probe (2,000 synthetic records, generous wall-clock bound) pins linearity; the honest SLO measurement stays at E-1.
8. *Fixtures:* additive `FIXTURE_TEAMS` + `FIXTURE_PLAYERS` (+ `makeTeam`/`makePlayer`) in the shared fixture module, reusing FIXTURE_COMPETITIONS/sports; existing exports byte-stable; player names ANONYMISED (EPIC DoD 3). Coverage: unattached athlete, one MANUAL + each source code, injured/loaned status, a team in 2 competitions, a competition with 0 teams, a team with a `notes` remark (feeds C-3/C-5).

**Interfaces:** `src/components/ops/registrySelectors.ts` (sibling module — ops-selectors v3 byte-stable): `buildRegistryIndex(sports, competitions, teams, players): RegistryIndex` · `projectRegistryRows(index, { query, facet }): RegistryRow[]` · `linkedRecordSummary(index, recordId): string` (sync, from embeds) · `registryFacetCounts(index)` · `registryCounters(index)`; the LAZY linked-record LIST fetch plan (four endpoints above) is pinned here and consumed by C-3. Plus `src/components/ops/useRegistryData.ts`: quiet parallel fetch `{ sports, competitions, teams, players, isSettled, refresh() }` (useContracts v1 idiom; `refresh` pre-planned for C-4's post-create refetch; response shape pin: no pagination params → BARE array — unbounded fetch assumption recorded, E-1 revisits).

- **C-1-T0** *(added at the 2026-07-05 re-gate — HYBRID decision, user sign-off)* · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Additive backend list-payload embeds, no endpoint/verb changes: `competitions.ts` list `_count` gains `teamLinks`; `teams.ts` list gains `_count: { competitionLinks, playerLinks (isCurrent only) }`; `players.ts` list gains current `teamLinks` embed (`where isCurrent`, `select team { id, name }`). Backend route tests updated; frontend `types.ts` extended additively (`_count?`, `teamLinks?`).
  TDD: backend route tests for the new payload keys first (existing tests must stay green — additive keys only).
  Pull Gate: the HYBRID sign-off above; existing backend test suite green before/after.
  Hand-off: payload deltas recorded in `registry-selectors v1` §Depends-on. Unblocks: C-1-T1.
- **C-1-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (graph derivation) · Confidence High
  Goal: Pure selectors implementing pins 1–7 — no React (this is the core-domain derivation of the EPIC — max rigor, ≥80% branch coverage).
  TDD: projection + summary permutation tables as failing tests first; pin-7 probe; fixture extension (pin 8, shapes incl. the T0 embeds).
  Pull Gate: T0 payload shapes vs `types.ts`; player `status` enum values/casing verified in `backend/src/schemas/players.ts` BEFORE the color-map tests; TD-25 check.
  Hand-off: Contract Snapshot **`registry-selectors v1`**. Unblocks: C-1-T2, C-2-T2, C-3-T1.
- **C-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `useRegistryData` quiet-fetch hook (interface above; `isSettled` flips on success OR failure — useContracts precedent; `refresh()` refetches all four).
  TDD: hook unit tests (parallel fetch, settle-on-failure, refresh) first.
  Pull Gate: `useContracts v1` (naming/shape idiom consistency).
  Hand-off: Contract Snapshot **`useRegistryData v1`**. Unblocks: C-2-T2, END OF STORY SEQUENCE.

### Story C-2 — Registry toolbar + facet rail + table (+ `?record` selection)
**As a** sports editor **I want** the registry as a searchable, facet-filtered table with kind chips and provenance columns **so that** I find any record and see its origin and health at a glance.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** (consumes C-1 contracts; re-gate at start per working method) · INVEST all ✓

**AC:**
- Given records, When REGISTRY renders, Then the toolbar shows the 280px mono search input, live counters (`N SPORTS · N COMPETITIONS · N TEAMS · N PLAYERS` — C-1 pin 5) and the accent `+ NEW` button; the left rail shows BROWSE facets All records / Sports / Competitions / Teams / Players with counts (no performer/staff — AS-5).
- Given the table, Then columns are `NAME | TYPE | SPORT | LINKED | SOURCE | STATUS` on grid `minmax(220px,1fr) 110px 110px 150px 84px 78px` with a sticky header (design HTML — the README's `1fr` shorthand loses the min); TYPE = kind chip (mono 600 8.5px uppercase, `--kind-*` color on its 13%-alpha `-bg` tint — ops-tokens v3); SOURCE mono `--t3`; STATUS colored mono word.
- Given a typed query, Then rows filter as-you-type and compose AND with the active facet; facet counts stay unfiltered; active facet gets `--p2` bg + accent border (A-3 idiom).
- Given I click a row, Then it selects (`--p2` bg + `inset 2px 0 0 var(--ac)`) and `?record=<kind>:<id>` updates (ops-selection v2).
- Given data still loading, Then a quiet skeleton/empty-state renders until `isSettled` (registry data is this screen's PRIMARY data — B-3 pin-7 precedent, incl. the failure path).
- Alt: zero matches → empty-state row; search + facet kept (never auto-cleared).

**Pinned decisions:**
1. *Selection hook placement:* `useOpsRecord` lands HERE (T1) as the additive **ops-selection v2** bump — selection is the table's concern; C-3 consumes it for deep-link hydration and hopping. (Deliberate delta vs the old §8 outline, which parked the bump under C-3 — avoids C-2 shipping throwaway local selection state.)
2. *`+ NEW` is INERT in this story* — rendered per design but disabled with a title tooltip; C-4 wires it. Acceptable intra-EPIC state (flag OFF in prod).
3. *Root testid `ops-screen-registry`* kept — replace the OpsShell v1 placeholder in place (B-1 precedent).
4. *Search/facet state is component-local* (design parity); only `record` is URL-backed — adding `q`/`facet` params would be an ADR-014 amendment, parked with the tab-params retro item.

- **C-2-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Additive `useOpsRecord(): { recordId: string | null, setRecordId(id: string | null): void }` for `?record` in `opsUrlState.ts` — inherits ALL v1 semantics (absent/empty → null; opaque ids; setters preserve unrelated params; REPLACE, never push).
  TDD: hook tests mirroring the v1 suite rows for the new param first.
  Pull Gate: `ops-selection v1` (the reserved-param row is the authorization; no rename, no semantics drift).
  Hand-off: Contract Snapshot **`ops-selection v2`** (additive bump). Unblocks: C-2-T2, C-3-T1.
- **C-2-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: RegistryScreen toolbar + facet rail + table markup per the design HTML, wired to `registry-selectors v1` + `useRegistryData v1` + `useOpsRecord`; pins 2–4.
  TDD: interaction tests first (search+facet compose, unfiltered counts, select → URL, skeleton/settle, empty state, SOURCE/STATUS cell words, inert `+ NEW`).
  Pull Gate: `registry-selectors v1`, `useRegistryData v1`, `ops-selection v2`, `OpsShell v1` (placeholder replacement), ops-tokens v3 `--kind-*` (+ `-bg` tints) present.
  Unblocks: C-3-T1, END OF STORY SEQUENCE.

### Story C-3 — Record Inspector: provenance, linked-record hopping, deep link
**As a** sports editor **I want** a record inspector showing provenance and clickable related records **so that** I can audit a record's origin and walk the graph (sport → competitions → teams → roster) without losing context.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** (re-gate at start) · INVEST all ✓

**AC:**
- Given a selected record, Then the 320px inspector shows: RECORD label, 44px icon tile (1px border, `--p2`), name (15px/600) + kind chip, provenance line (mono 9.5px `--t3`), attribute rows (76px mono key: TYPE / SPORT / COUNTRY (when present) / DETAIL (when present) / STATUS / SOURCE), a LINKED section of clickable related-record rows (icon, name, kind label — hover accent border), and the dashed `+ ADD REMARK` ghost.
- Given a MANUAL record, Then the provenance line reads `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE`; given a synced record, `SYNCED FROM <SOURCE>` — appending `· LAST SYNC <relative>` ONLY if the API exposes a sync timestamp (pin 2 — no fabricated freshness).
- Given I click a LINKED row, Then the inspector navigates to that record and `?record` updates (REPLACE — hops leave no history entries, ops-selection v1 rule 7).
- Given `/ops/registry?record=team:12` loaded directly, Then the row selects and the inspector shows the team; unknown/malformed id → quiet empty state, no crash (opaque-id rule).
- Given a record with a manual remark (`notes` non-empty), Then a `REMARKS · MANUAL` bordered note box renders above the ghost; else no box.
- Given no selection, Then a quiet empty state (EventInspector precedent).

**Pinned decisions:**
1. *NOT EventInspector:* EventInspector v1 is EVENT-scoped — Registry gets its own `RecordInspector`. This is the SECOND 320px-inspector-chrome occurrence → Rule of Two: do NOT extract shared panel chrome yet; record the watch item (trigger = a third inspector).
2. *Provenance display honesty:* the last-sync suffix renders only from a real field — T1's gate verifies what the APIs expose (AS-8 precedent: never light UI from data that doesn't exist).
3. *No derivation in the component* (anti-smart-ui): attribute/provenance/linked values come from the C-1 projection + `linkedRecordsOf`; conditional rows (COUNTRY/DETAIL) render only when the projection provides them (design `attrsOf`).
4. *`+ ADD REMARK` ghost is INERT here* — always rendered (design), wired by C-5.

- **C-3-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `RecordInspector` (props-driven, owns its 320px panel chrome — EventInspector idiom) + RegistryScreen embed + deep-link hydration + hop wiring (pins 1–4).
  TDD: render-state tests first — one per kind fixture, provenance variants (MANUAL / synced / synced-with-timestamp-if-exposed), remark box present/absent, hop (incl. URL REPLACE assertion), direct deep link, unknown id, empty state.
  Pull Gate: `registry-selectors v1` (`linkedRecordsOf`), `ops-selection v2`; provenance/sync-timestamp field verification (pin 2).
  Hand-off: Contract Snapshot **`RecordInspector v1`** (props). Unblocks: C-4-T1, C-5-T1, END OF STORY SEQUENCE.

### Story C-4 — Create modal (first write path: NEW ENTITY, MANUAL provenance, idempotent)
**As a** sports editor **I want** to create a manual record (kind + name) from the registry **so that** entities missing from the sync sources exist immediately and are protected from overwrite.

Business Value 3 · Priority 3 · Size **M** · DoR: **READY (conditional)** — T1's endpoint-inventory pull gate is BLOCKING; kind chips scope to verified create endpoints · INVEST all ✓

**AC:**
- Given I click `+ NEW`, Then the centered 430px modal renders over the `rgba(0,0,0,.55)` backdrop: `NEW ENTITY` label + ✕, kind chips with radio behavior (ONLY kinds with a verified create endpoint), name input, the note `CREATED RECORDS ARE SOURCE: MANUAL · PROTECTED FROM SYNC OVERWRITE`, CANCEL + accent CREATE.
- Given an empty/whitespace name, When I click CREATE, Then nothing happens (no request; modal stays — design no-op).
- Given a valid name, When I click CREATE, Then exactly ONE request fires (double-click / Enter+click pinned by a single-flight test) and on success: modal closes, name clears, search + facet reset, data refreshes, and the created record is selected in the inspector showing the MANUAL provenance line (design: create appends + clears filters + selects).
- Given the server rejects a duplicate (unique constraint — e.g. `Player @@unique([tenantId, sportId, fullName, birthDate])`), Then the modal STAYS OPEN with the name kept, an inline mono error in `--alert-danger` says the record already exists, no row is appended and the selection does not change.
- Given any other failure, Then an inline generic error renders and CREATE re-enables (retry is user-initiated, still single-flight).

**Pinned decisions:**
1. *Endpoint inventory IS the gate:* enumerate per kind which of `sportsApi`/`competitionsApi`/`teamsApi`/`playersApi` expose create; chips scope to those that do — a kind without a create endpoint gets NO chip (never a dead button) and a recorded TD/product item.
2. *Idempotency, honestly:* a client request key is generated per modal-open and sent IF the backend accepts an idempotency header/field (gate verifies); regardless, the UI-testable guarantee is the single-flight guard (ONE request per user intent) with server unique constraints as the duplicate backstop. Pin the ACTUAL duplicate status/error shape from the gate before writing the rejection test — do not guess 409.
3. *MANUAL provenance shape:* creates send the minimal manual-record payload; whether `source`/`isManaged` is explicit or server-implied for non-import writes is a gate output — pinned in the snapshot (EPIC DoD 2 honesty).
4. *Post-create:* `useRegistryData.refresh()` then `setRecordId('<kind>:<newId>')` — optimistic append REJECTED (provenance + LINKED derivation must come from the server row).
5. *Required fields beyond name:* player create likely requires `sportId` (it is in the unique key) — if the gate confirms, the modal gains a minimal sport select for the player kind ONLY (designer note for E-2; modal stays at design fidelity otherwise).

- **C-4-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (write-path + error contract) · Confidence **Med** (first write path; endpoint surface unverified until the gate)
  Goal: Create modal + write wiring implementing pins 1–5.
  TDD: interaction tests first — kind-chip radio, empty-name no-op, single-flight double-click, success flow (close/clear/refresh/select + provenance line), duplicate-rejection flow (status per gate), generic-failure re-enable.
  Pull Gate (BLOCKING): create-endpoint inventory per kind + duplicate-error status/shape + payload requirements (pins 1–3, 5) vs `src/services/*` and backend routes; `RecordInspector v1`, `useRegistryData v1`.
  Hand-off: Contract Snapshot **`registry-create v1`** (per-kind payload shapes + error contract + the idempotency mechanism actually available). Unblocks: C-7-T1, END OF STORY SEQUENCE.

### Story C-5 — Remarks: `+ ADD REMARK` → protected `notes`
**As a** sports editor **I want** to attach a manual remark to a record **so that** editorial knowledge lives on the record and survives nightly syncs (protected field).

Business Value 2 · Priority 2 · Size **S** · DoR: **READY (conditional)** — notes-endpoint gate at T1 · INVEST all ✓

**AC:**
- Given a record whose kind supports `notes` (gate: `Team.notes` and `Player.notes` exist, manual-only; sports/competitions per gate), When I click the ghost, Then it swaps for a bordered textarea + mono SAVE/CANCEL in the inspector idiom.
- Given text and SAVE, Then exactly ONE update fires (single-flight), the `REMARKS · MANUAL` box renders the saved text, and the ghost thereafter reads `EDIT REMARK`.
- Given CANCEL, Then the editor closes with no request.
- Given a kind without a notes path, Then NO ghost renders (never a dead affordance — C-4 pin-1 rule).
- Given the update fails, Then the editor stays open with an inline error.

**Pinned decisions:**
1. *Editor UX is a design gap* (design shows only the box + ghost): minimal inline textarea per the AC — designer review note for E-2.
2. *Ghost label:* `+ ADD REMARK` when no remark exists, `EDIT REMARK` when one does (v1 judgment call, designer note).
3. *Write semantics:* full-text last-write-wins update of `notes` via the kind's update endpoint — naturally idempotent; `notes` is the MANUAL-protected field (`ImportGovernanceService`), so this UI write IS the sanctioned manual path; server-side protection not re-proved at UI level (EPIC DoD 2).
4. *Concurrent edits:* out of scope v1 (no registry socket refresh; single-editor assumption) — recorded.

- **C-5-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence Med (endpoint semantics gated)
  Goal: Remark editor in `RecordInspector` + update wiring + refresh (pins 1–4).
  TDD: interaction tests first — ghost→editor, save→box + label flip, cancel no-request, single-flight, failure-stays-open, no-notes-kind renders no ghost.
  Pull Gate: notes-update route inventory per kind (which update endpoints accept `notes`; any governance guard flags) vs services/backend; `RecordInspector v1`.
  Hand-off: **`RecordInspector v1.1`** amendment (remark editor props/behavior). Unblocks: C-7-T1, END OF STORY SEQUENCE.

### Story C-6 — Performer/Staff Kinds — DEFERRED STUB (do not detail)
**As a** planner **I want** performers and staff as registry records **so that** non-team people (presenters, coaches, solo athletes) are browsable and linkable like everything else.

DoR: **NOT READY** — blocked on a PRODUCT/SCHEMA decision. AS-5 (verified 2026-07-05): no Performer/Staff/Person model exists anywhere; TechPlan crew names are free text. Introducing these Kinds means new Prisma models + import mapping + provenance rules — outside this UI initiative's scope. Prerequisites before detailing: (1) product decision that performers/staff become entities; (2) schema + import design (candidate venue: post-EPIC-E product session, alongside the cutover ADR); (3) §4 glossary Kind row update. Until then the UI deliberately omits the facets/chips/graph arms (C-1/C-2 pins). No tasks.

### Story C-7 — EPIC C smoke test + runbook §registry
**As a** reviewer **I want** an E2E journey over the registry including the create write path **so that** the initiative's first write surface is verifiably deployable and rollbackable.

Business Value 2 · Priority 3 · Size **M** (interception must gain stateful create/update emulation) · DoR: **READY** (gate MUST re-verify harness premises — the A-5 lesson)

**AC (flag-on profile; flag-off coverage carried by A-5):**
- Given `/ops/registry`, Then counters + facet counts match the registry fixture inventory (literal assertions); clicking the Teams facet filters to the fixture team count; typing an anonymised fixture player's name composes search + facet.
- Given a row click, Then `?record=<kind>:<id>` appears and the inspector renders the record; clicking a LINKED row hops the inspector and updates the URL; a direct load of that deep link restores the same state.
- Given `+ NEW`, Then creating a record (interception emulates the create per `registry-create v1` and appends to its in-memory store) closes the modal, clears filters, and the inspector shows the new record with the MANUAL provenance line; a scripted duplicate create renders the inline duplicate error with the modal open (emulated error shape per the same contract).
- Given the remark ghost on a fixture team, Then saving a remark renders the `REMARKS · MANUAL` box (emulated update).

**Pinned decisions:**
1. *Stateful interception:* the ops-e2e route layer gains an in-memory registry store (reset per test) so create/update round-trips are observable — recorded as an ops-e2e amendment; the real-backend gap (A-5 trade-off) now covers WRITES too — state it explicitly in the runbook's known limitations.
2. *PII:* e2e registry fixtures reuse the anonymised unit fixture families (EPIC DoD 3); a review-chain checklist step (Haiku) verifies no real athlete names anywhere in fixtures/specs.

- **C-7-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `e2e/smoke-epic-c.flag-on.spec.ts` implementing the ACs + the interception store (pin 1) + runbook `ops-shell.md` §registry — symptoms: empty registry → four fetches / `isSettled`; create fails → endpoint + duplicate shape per `registry-create v1`; remark not saving → protected-field guard/route; wrong SOURCE words → provenance predicate (C-1 pin 3); rollback = flag OFF + REDEPLOY (TD-27).
  TDD: AC-ordered spec red → green; runbook verification checklist derived from the passing spec (A-5 idiom).
  Pull Gate: `ops-e2e v1` (amended) + all EPIC C snapshots (`registry-selectors v1`, `useRegistryData v1`, `ops-selection v2`, `RecordInspector v1.1`, `registry-create v1`); fixture inventory vs the registry fixture families (counts asserted literally); PII check (pin 2, Haiku).
  Unblocks: **EPIC C RETRO** (Phase Summary + Architecture Memory update + flow data + mode check per BB §10 — then expand EPIC D), END OF STORY SEQUENCE.

### EPIC C — Expansion validator note (BB v5.1 §9, DELIVERY level, run 2026-07-05)

- **Structure/DAG:** C-1-T1 → {C-1-T2, C-2-T2, C-3-T1}; C-2-T1 (needs only ops-selection v1) → {C-2-T2, C-3-T1}; C-3-T1 → {C-4-T1, C-5-T1} → C-7-T1. No cycles; C-6 stub sits outside the DAG. Every detailed task has Hat, Model, TDD order, Pull Gate, Unblocks. ✓
- **Glossary:** Kind/Record/Provenance used as §4 defines them; the performer/staff deferral is consistent with the AS-5 flags already in §4/§5. ✓
- **Anti-bureaucracy (Core §5.3):** every task spec is shorter than its expected implementation (largest: C-2-T2 screen; smallest: C-2-T1 hook — still above overhead). C-1 selectors and C-2 screen kept separate because the projection has TWO consumers (table + inspector) — not an always-change-together pair; C-2-T1 kept inside C-2 rather than a micro-story. ✓
- **Writes:** both write paths carry single-flight tests + gate-pinned error contracts; PII fixture rule is an EPIC DoD addition; no schema changes/migrations in EPIC C. ✓
- **Honest deferrals:** performer/staff (C-6 stub, product-gated); remark-editor UX, `N PLAYERS` counter label and any extra create field → designer notes at E-2; server-side sync-overwrite protection explicitly NOT re-proved at UI level. ✓

### EPIC C — Retro (2026-07-06, per §10.4 / BB §10)

**Phase Summary.** EPIC C (Registry) COMPLETE — all 7 story units done in one day on
`feature/C-1-registry-selectors` (12 commits, stacked on the EPIC B branch/PR #11):
C-1-T0 backend embeds (`4b47ecc`), C-1-T1 registry-selectors v1 (`ee2648f`), C-1-T2
useRegistryData v1 (`b179682`), C-2-T1 ops-selection v2 (`7f8289d`), C-2-T2 RegistryScreen
(`c2f53ba`), C-3-T0 registry-selectors v1.1 (`43e56c8`), C-3-T1 RecordInspector v1
(`5c9d055`), C-4-T0 backend dup-409 (`06ada66`), C-4-T1 create modal registry-create v1
(`5eef8d8`), C-5-T1 remarks RecordInspector v1.1 (`d73f9f2`), C-7 smoke (`e182e9a`). Test
base 551 → **714** vitest + backend 341 → **349** + e2e 6 → **10** (EPIC C flag-on journey),
`tsc -b` clean throughout. Contracts: registry-selectors v1→v1.1 · useRegistryData v1 ·
ops-selection v1→v2 · RecordInspector v1→v1.1 · registry-create v1 · ops-e2e v1→v1.1.

**DoD additions check:** (1) no write fires twice — single-flight unit-pinned on BOTH paths
(create `isSubmittingRef`, remark `isSavingRef`; the create ref isolated via `fireEvent.submit`
bypassing the disabled button) ✓. (2) MANUAL provenance — create sends no `externalRefs` →
server-implied MANUAL → inspector renders `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE`,
asserted unit end-to-end (real RecordInspector) AND in the e2e create flow ✓; server
sync-protection NOT re-proved at UI level (honest scope) ✓. (3) all person fixtures anonymised
— Haiku PII check clean across unit + e2e ✓. (4) `?record` deep-link round-trips — unit
(hydrate/hop/unknown-id) + e2e (deep-link restore) ✓.

**Process notes.** (a) DoR re-gates earned their keep THREE times: C-1's linked-graph pull gate
FAILED (links don't ride bulk lists → N+1) → the **HYBRID** decision (additive `_count`/embed
via C-1-T0 + lazy per-selection lists); C-3 came back **NOT READY** (the frozen contract lacked
`linkedRecordsOf` + `notes`/`country`) → a C-3-T0 v1.1 prep task (A-4-T0/C-1-T0 precedent); C-4's
blocking endpoint gate found duplicate creates returned a generic 500 (P2002 unmapped) AND a
name-only modal only works for teams → architect chose backend-fix + all-4-kinds. Zero mid-task
stalls after each gate. (b) Mutation probes caught real unenforced pins every feature task —
C-1-T1 unknown-source fallback, C-3-T1's id-key anti-flash gate (documented but untested; the
`active`-guard test alone passed), C-4-T1's single-flight (ref redundant with the disabled button
under `fireEvent` — isolated via form-submit), C-5-T1's missing `key={record.id}` (cross-record
draft corruption). (c) **Review-tooling hazard discovered + fixed:** the mutation-probe auditor
reverted probes with `git checkout`, which DISCARDS uncommitted task work — hit twice (C-2-T1,
C-2-T2, both self-reconstructed + orchestrator-verified); from C-3 on, the auditor was told to
back up to scratchpad and never `git checkout` — no recurrence. (d) Naming reviews standardised
the ops boolean `is`-convention (`isActive`/`isSubmitting`/`isSavingRef`) and fixed public-API
names BEFORE contracts froze (registry-selectors renames, `LinkedRecordPayloads`, `remarkText`).

**Found work / upstream (not a defect of this epic):** backend registry create routes never
mapped Prisma P2002 → duplicate creates were 500s (fixed at C-4-T0, mirrors crewMembers/savedViews;
also fixes the legacy TeamsView create path). No sync-timestamp field exists on any list/record
payload → the design's `· LAST SYNC` provenance suffix is NOT renderable (dropped, pin 2 honesty).

**Debt candidates awaiting a free `debt-register.md`:** registry table rows + row-click are a
clickable `<div>` without keyboard a11y (role/tabIndex/onKeyDown) — a holistic ops-a11y pass
(Schedule/Rundown blocks likely share it); `STATUS_COLOR` token→var map duplicated RegistryScreen
+ RecordInspector (Rule-of-Two watch, extract at a third); 320px inspector chrome now TWICE
(EventInspector + RecordInspector) — Rule-of-Two watch, do NOT extract yet; C-1-T0 registry list
embed tests cover only the bare-array `findMany` branch (registry uses it; paginated branch
untested); create-modal cancel-during-submit still fires `onCreated` (the POST already succeeded —
defensible, E-2 note); `--registry-*` STATUS token family, sport-icon/federation + per-kind create
fields, and provenance SOURCE-code-vs-full-name → E-2 designer notes.

**SLOs still unmeasured** (`registry initial render < 1.5s p95 @ 2,000 records`, `search keystroke
< 50ms`, `inspector hop < 100ms`) — the C-1 perf probe pins linearity only; E-1 remains the honest
measurement point. **Mode check: DELIVERY retained** — EPIC C shipped the first write paths under
full governance and the gates paid off; EPIC D (Sync/dedup-merge — irreversible merge decisions on
canonical records) argues even harder for keeping it. Next per §10.4: expand **EPIC D** with
`backlog-builder`.

---

## EPIC D — SYNC (import health + merge review)

- **Objective:** The operations surface over the existing import pipeline: nightly-sync job-health cards and the MERGE REVIEW deduplication queue — the initiative's SECOND write surface (irreversible merge decisions on canonical records), rendered as pure UI over `backend/src/routes/import/*` with NO backend change expected for the read paths.
- **Tracer Bullet?:** NO
- **Mode:** DELIVERY (retained at the EPIC C retro — irreversible merge decisions argue even harder for full governance than EPIC C's creates)
- **Scope (verified 2026-07-06 against `mergeCandidates.ts` + `jobs.ts`):** SYNC v1 surfaces (1) job-health cards from `importsApi.listJobs` and (2) the merge-review queue from `importsApi.listMergeCandidates({status:'pending'})` with two terminal decisions — APPROVE MERGE (`approve-merge`) and KEEP SEPARATE (`create-new`). Backend enforces `entityType === 'event'` on every decision route ("Only event merge candidates are currently reviewable") → SYNC v1 is an EVENT-dedup surface; non-event candidates never reach a decision. `ignore` has no design surface (the design's 2-button footer is merge/keep) → OUT of SYNC v1 (legacy ImportView retains it). Dead-letter management, sources config, aliases and provenance stay in the legacy ImportView (ADR-012 — untouched; SYNC is the redesigned monitoring slice, not a full ImportView replacement — that reconciliation is an EPIC E cutover concern).
- **DoD additions:** (1) No merge decision fires twice per user intent — a single-flight guard is unit-tested per decision (create-new duplicating an event on re-decide is the specific hazard, see AS-7 finding); (2) after a decision the card's buttons are replaced by the terminal status line (`✓ MERGED INTO REGISTRY` / `KEPT AS SEPARATE RECORDS`) and the SYNC tab badge decrements — asserted unit + e2e; (3) ALL event/name fixtures (unit + e2e) use ANONYMISED invented data — no real athletes/fixtures (PII, EPIC C DoD 3 carried); (4) the merge diff table renders INCOMING vs CURRENT for a candidate with a `suggestedEntityId`, and a candidate with `suggestedEntityId === null` renders APPROVE MERGE disabled (create-only) — never a dead merge button.
- **Business Value:** Ops staff triage last night's sync health and clear the dedup queue from one screen, instead of the six-tab legacy ImportView. Success metric: an operator confirms all nightly jobs succeeded and resolves a merge candidate (with an INCOMING-vs-CURRENT field diff) in ≤ 2 clicks from `/ops/sync`.
- **Risk:** **High — re-decide is not idempotent server-side (AS-7 REFUTED, verified in `mergeCandidates.ts`): `approve-merge` re-runs the merge and `create-new` creates a SECOND event on a repeat call → mitigation: (a) UI single-flight guard per candidate + terminal button-replacement + pending-only listing so a decided candidate never re-appears; (b) a CONDITIONAL backend already-decided guard (D-3-T0) if the architect deems the residual multi-operator / stale-card risk unacceptable — gate-decided, mirrors C-4-T0.** Med — diff CURRENT values are not in the candidate payload (must resolve the suggested event) → mitigation: D-2 gate resolves the source (AppProvider events vs lazy fetch), mirrors C-1 HYBRID. Med — `confidence` is a Decimal-serialized string typed `number` → mitigation: explicit `Number()` coercion pinned + gate verifies scale vs `DeduplicationService`.
- **SLOs:** `Ops Sync – initial render < 1.5s p95 @ 50 jobs + 100 merge candidates` · `Merge decision – click → terminal status line < 300ms p95 (optimistic, excl. server round-trip)`. Honest measurement stays at E-1 (the initiative-wide SLO measurement point).
- **Glossary:** Sync Job, Merge Candidate, Merge Decision (§4 unchanged); display terms: **Job Card**, **Merge Card**, **Diff Table** (`FIELD | INCOMING | CURRENT`), **Confidence Band** (≥90 green / else amber — SYNC-specific, distinct from ImportView's 3-band), **Pending Count** (tab badge), terminal status lines `MERGED INTO REGISTRY` / `KEPT AS SEPARATE RECORDS`.
- **ADRs:** none new. ADR-012 (legacy ImportView untouched; SYNC is a parallel slice) governs the Rule-of-Three extraction tension (D-2-T0). ADR-014: SYNC has NO per-candidate URL selection in v1 (decisions are in-card, there is no SYNC inspector) — an additive `?candidate=` bump is parked if per-candidate deep-linking is later wanted.
- **Smoke Test Story:** D-4. **Runbook:** extend `docs/runbooks/ops-shell.md` (add §sync).
- **Working method (proven A→C, binding here):** DoR re-gate re-verifies each story's premises before start (backlog-health-advisor); pins written testable; derived logic in pure selectors under `src/components/ops/` (anti-smart-ui) — SyncScreen renders + wires only; additive deep-frozen fixtures (anonymised); the Rule-of-Three extraction is a separate PREPARATORY commit (Two Hats); single-flight for writes (registry-create v1 precedent); mutation probes in the review chain; `now`/data seams; ops-selectors v3 + registry-selectors v1.1 stay byte-stable (sibling-module rule).

### Story D-1 — Sync selectors + data hook + job cards + SyncScreen shell ✅ COMPLETE (af8fe5f, 8c6d0a5)
**As an** import operator **I want** the SYNC screen with nightly-sync job-health cards **so that** I see at a glance whether last night's imports succeeded or produced dead letters, without opening the six-tab ImportView.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** (jobs-list shape VERIFIED 2026-07-06: `GET /import/jobs` embeds `_count: { records, deadLetters }` + `source.code/name`; status enum `queued/running/completed/failed/partial` — no backend change) · INVEST all ✓

**AC:**
- Given jobs from `listJobs`, When SYNC renders, Then a `NIGHTLY SYNC · 02:00 CET` section label + one Job Card per recent job: status dot (completed→green, failed/partial→red/amber, queued/running→neutral), source name (mono 600 11px), meta line `<HH:MM> · OK · <N> RECORDS` on success or `<HH:MM> · <N> DEAD-LETTERS` when `_count.deadLetters > 0`.
- Given the SyncScreen mounts, Then it replaces the OpsShell `ops-screen-sync` placeholder in place (root testid `ops-screen-sync` kept — B-1 precedent); the MERGE REVIEW section renders its own quiet skeleton/empty-state until data settles (D-2 fills it).
- Given pending merge candidates load, Then the SYNC tab reads `SYNC [n]` via the OpsShell badge slot (A-2 AC-4: slot exposed since EPIC A) where n = pending count.
- Given data still loading, Then a quiet skeleton renders until `isSettled` (B-3 pin-7 / C-2 precedent, incl. the failure path).
- Alt: zero jobs → empty-state panel; a job with no `startedAt` → meta time falls back to `createdAt`.

**Pinned decisions (expansion gate 2026-07-06 — write tests to these):**
1. *Job-card derivation is pure:* `deriveJobCard(job): JobCard` (dot state, meta line, record/dead-letter count) lives in `src/components/ops/syncSelectors.ts` (new sibling module; ops-selectors v3 / registry-selectors v1.1 byte-stable). No derivation in the component.
2. *`NIGHTLY SYNC · 02:00 CET` is static copy* — the nightly schedule is not in any API; the label is presentational (designer note for E-2). Job-card TIMES are real (`startedAt ?? createdAt`, wall-clock rendered — the initiative's TZ seam, rundown precedent).
3. *Card set:* the N most recent jobs from `listJobs` (design shows 3; real = the list default). No per-source grouping in v1.
4. *Dead-letter count is per-job* from `job._count.deadLetters` (VERIFIED on the list payload) — NOT the global `metrics().totals.unresolvedDeadLetters`. Success meta uses `_count.records` (ImportView `job._count?.records` precedent) unless `statsJson.recordsProcessed` is present.
5. *Badge count source:* pending count = length of the pending candidate set loaded by `useSyncData` (single source — avoids a second endpoint / `metrics()` fan-out); the badge decrements as decisions land (D-3). Gate verifies the OpsShell v1 badge-slot mechanism (how a screen publishes its count to the tab).
6. *Fixtures:* additive `FIXTURE_JOBS` + `FIXTURE_MERGE_CANDIDATES` (+ `makeJob`/`makeMergeCandidate`) in the shared fixture module; existing exports byte-stable. Coverage: one completed job with records, one failed/dead-letter job, one running job; candidates spanning ≥90 and <90 confidence, one with `suggestedEntityId` + one null, one with a differing field (feeds D-2/D-3). Event/name data ANONYMISED (DoD 3).

**Interfaces:** `src/components/ops/syncSelectors.ts`: `deriveJobCard(job): JobCard` · `pendingCandidateCount(candidates): number` (merge-card derivation added in D-2). Plus `src/components/ops/useSyncData.ts`: quiet parallel fetch `{ jobs, candidates, isSettled, refresh() }` (useContracts/useRegistryData idiom; `refresh` pre-planned for D-3's post-decision refetch; both lists are bare arrays — unbounded fetch assumption recorded, E-1 revisits).

- **D-1-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Pure `syncSelectors.ts` job-card derivation + `pendingCandidateCount` (pins 1–4) — no React.
  TDD: dot-state + meta-line permutation table (each status × records/dead-letters) as failing tests first; `Number()` coercion on any Decimal-string field pinned.
  Pull Gate: `_count.deadLetters`/`_count.records` + `ImportJobStatus` values vs `services/imports.ts` + `jobs.ts` (VERIFIED — re-confirm shapes); TZ seam wording (rundown precedent).
  Hand-off: Contract Snapshot **`sync-selectors v1`**. Unblocks: D-1-T2, D-2-T0.
- **D-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `useSyncData` quiet-fetch hook (`isSettled` on both-settled — useRegistryData precedent; `refresh()` refetches both lists) + SyncScreen replacing the `ops-screen-sync` placeholder: `NIGHTLY SYNC` label + job cards + MERGE REVIEW skeleton + tab-badge wiring (pin 5).
  TDD: hook tests (parallel fetch, settle-on-failure, refresh) + screen interaction tests (job cards render, skeleton→settle, empty jobs, badge count) first.
  Pull Gate: `sync-selectors v1`, `OpsShell v1` (placeholder + badge slot), `useRegistryData v1` (idiom).
  Hand-off: Contract Snapshot **`useSyncData v1`**. Unblocks: D-2-T1, D-4-T1, END OF STORY SEQUENCE.

### Story D-2 — Merge review cards: shared-derivation extraction + diff table (read-only) ✅ COMPLETE (ad3fa5a, 0736cd0 scale-fix, 3f0b93c)
**As an** import operator **I want** each deduplication candidate as a card with an INCOMING-vs-CURRENT field diff and a confidence band **so that** I can judge a match before deciding — without hunting through the legacy Review tab's JSON blob.

Business Value 3 · Priority 4 · Size **M→L** · DoR: **READY (conditional)** — two BLOCKING gate outputs: (a) the ADR-012 extraction-tension call at D-2-T0 (does the PREP refactor legacy `ImportView.ReviewTab`, or defer that to EPIC E?); (b) at D-2-T1 the diff CURRENT-source resolution (AppProvider events vs lazy fetch) + the `confidence` scale/serialization — do NOT guess · INVEST all ✓

**AC:**
- Given a pending candidate, Then a Merge Card (max-width 960px, radius 8) renders: header = kind chip + incoming name + `→ MATCHES →` (mono `--t3`) + current name + confidence `<pct>% MATCH` (green ≥90, amber below) + `VIA <SOURCE>` (mapped source code).
- Given a `suggestedEntityId`, Then the Diff Table renders `FIELD | INCOMING | CURRENT` on grid `110px 1fr 1fr`, header row on `--p2`; INCOMING values that differ from CURRENT are amber; comparable fields come from `normalizedJson` (incoming) vs the resolved current event.
- Given `suggestedEntityId === null`, Then the card renders WITHOUT a CURRENT column (incoming-only), and later (D-3) APPROVE MERGE is disabled (create-only) — never a dead button (ImportView `disabled={!suggestedEntityId}` precedent).
- Given the decision footer, Then `KEEP SEPARATE` (ghost) + `APPROVE MERGE` (accent) render (INERT here — wired in D-3).
- Alt: current event not resolvable (outside the loaded set / lazy-fetch fails) → card shows incoming-only with a quiet "current not loaded" note, never a crash (UNASSIGNED-lane honesty precedent).

**Pinned decisions (expansion gate 2026-07-06 — write tests to these):**
1. **Rule-of-Three extraction (headline architectural decision):** merge-candidate derivation now has TWO consumers — legacy `ImportView.ReviewTab` (occurrence #1) and the new SyncScreen (#2). Per Core §5.5 this is the extract point. The extraction is **SELECTOR-ONLY** — the pure `deriveMergeCard(candidate, currentEvent?): MergeCard` (kind, incoming/current names, confidence percent + band, source code, diff rows with `changed` flags) lands in `syncSelectors.ts`. The decision-WRITE wiring is **NOT** extracted: the two consumers' post-decision UX diverges materially (ImportView removes-from-list + toast; SyncScreen terminal status line + `decided` map + single-flight) → extracting divergent wiring on first co-occurrence is a premature/leaky abstraction (Core §5). The write stays per-consumer (D-3, single-flight).
2. *ADR-012 tension (gate output):* a true PREP refactors the existing consumer, but ADR-012 mandates legacy ImportView stays untouched. **Recommended: D-2-T0 refactors ONLY the already-duplicated, behavior-preserving bits of `ImportView.ReviewTab` (confidence→percent, source-code display, kind chip) onto the shared selector under byte-stable tests (B-3-T2 useContracts precedent) — a deduplication, not a redesign, within ADR-012's spirit.** If the architect rules that touching legacy is out of bounds, the module ships consumed-by-SyncScreen-only and ImportView's migration becomes an EPIC E cutover item (recorded). Either way the PREP hat holds: the shared derivation is factored into its own tested commit before SyncScreen consumes it (no copy of ImportView's approach). The Diff-Table derivation is NEW (ImportView JSON-stringifies today) → it lands FRESH as FEATURE in D-2-T1, consumed only by SyncScreen in v1.
3. *Diff CURRENT source (gate output — mirrors C-1 HYBRID):* candidates are `entityType === 'event'` (backend-enforced), so CURRENT = the event with `id === suggestedEntityId`. Preferred source = AppProvider events (already loaded, zero-cost); if coverage is insufficient (suggested event outside the loaded window), a lazy per-card `eventsApi.get(suggestedEntityId)` — decide at the gate. CURRENT values are NOT in the candidate payload (VERIFIED: `listMergeCandidates` includes only `importRecord.source`).
4. *Confidence (gate output):* `confidence` is `Decimal(5,2)` → serialized as a STRING over JSON though typed `number`; the selector uses explicit `Number(confidence)` (never coercion-by-accident) and bands on `Math.round(Number(confidence) * 100) >= 90 → green else amber`. Scale is 0..1 (ImportView's `>= 0.8`/`* 100` confirm it) — but the gate re-verifies vs `DeduplicationService` before the band tests (C's "verify enum casing before color-map" discipline). Found-work flag: ImportView's `c.confidence >= 0.8` relies on string→number coercion (latent — record).
5. *Diff field set:* comparable canonical-event fields from `normalizedJson` (`sportName`, `competitionName`, `startsAtUtc`, `homeTeam`, `awayTeam`, `venueName`, `country`, `status`, `seasonLabel`, `stage` — per `isCanonicalImportEvent`) vs the Event entity's equivalents; the exact field mapping is pinned at the gate (only fields present on both sides render a row). `reasonCodes` are NOT shown in v1 (design omits them — designer note).
6. *Source-code map:* reuse the registry-selectors provenance convention (`the_sports_db→TSDB`, `api_football→API-FB`, `football_data→FB-DATA`; unknown → uppercased raw, never dropped) — verify the merge-source `code` vocabulary at the gate (import source codes may differ from the registry `externalRefs` keys).

- **D-2-T0** · Hat **PREPARATORY** · Model **Sonnet** · Confidence **Med** (ADR-012 carve-out is an architect call)
  Goal: Extract the already-duplicated merge-candidate derivation (confidence percent/band, source-code display, kind chip) into `syncSelectors.ts` as `deriveMergeCard` scaffolding; refactor `ImportView.ReviewTab`'s inline versions onto it under byte-stable behavior — OR (architect ruling) create the module consumed-by-SyncScreen-only and defer ImportView migration to E (pin 2).
  TDD: characterization tests pinning ReviewTab's current confidence/source rendering BEFORE the move (byte-stable); the extracted selector's unit tests green after.
  Pull Gate (BLOCKING): the ADR-012 extraction-tension call (pin 2) + `sync-selectors v1`; confirm ReviewTab's current behavior to preserve.
  Hand-off: **`sync-selectors v1.1`** amendment (`deriveMergeCard` derivation). Unblocks: D-2-T1.
- **D-2-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (diff derivation) · Confidence Med (CURRENT-source + confidence shape gated)
  Goal: NEW diff derivation (`deriveMergeDiff(normalizedJson, currentEvent) → rows + changed flags`, pin 5) added to `syncSelectors.ts` + Merge Card markup (header, `→ MATCHES →`, confidence badge, diff grid `110px 1fr 1fr`, amber changed-cells, inert footer) rendered into the SyncScreen MERGE REVIEW section; CURRENT resolution per pin 3.
  TDD: diff-row permutation (changed / unchanged / null-suggested / absent-field) + confidence band boundary (89/90) as failing tests first; current-not-resolvable fallback.
  Pull Gate (BLOCKING): diff CURRENT-source resolution + confidence scale/serialization (pins 3–4) vs `DeduplicationService`/a real payload; `sync-selectors v1.1`, `useSyncData v1`.
  Hand-off: **`sync-selectors v1.2`** (diff derivation) + Merge Card in the screen. Unblocks: D-3-T1, END OF STORY SEQUENCE.

### Story D-3 — Merge decisions (2nd write surface: APPROVE MERGE / KEEP SEPARATE, single-flight, AS-7) ✅ COMPLETE (25643a1, d97c11c)
**As an** import operator **I want** to approve a merge or keep records separate from the card **so that** the dedup queue clears and the decision is reflected immediately — without the queue re-firing the same decision.

Business Value 3 · Priority 3 · Size **M** · DoR: **READY (conditional)** — T0's idempotency gate is BLOCKING: the backend routes have NO already-decided guard (AS-7 REFUTED, VERIFIED in `mergeCandidates.ts`) — the architect decides whether a backend guard precedes the UI wiring · INVEST all ✓

**AC:**
- Given APPROVE MERGE on a candidate with a `suggestedEntityId`, When clicked, Then exactly ONE `approve-merge` request fires (double-click / Enter+click pinned by a single-flight test) and on success the footer buttons are replaced by a right-aligned `✓ MERGED INTO REGISTRY` (green) and the SYNC tab badge decrements.
- Given KEEP SEPARATE, When clicked, Then exactly ONE `create-new` request fires and on success the footer is replaced by `KEPT AS SEPARATE RECORDS` (`--t2`) and the badge decrements (`decided: Record<id,'merged'|'kept'>` per the design state).
- Given `suggestedEntityId === null`, Then APPROVE MERGE is disabled (create-only) with a title tooltip; KEEP SEPARATE stays enabled.
- Given a decision fails, Then an inline error renders on the card, the footer buttons re-enable (retry is user-initiated, still single-flight), and the badge does not change.
- Given a decided card, Then it is not re-decidable in-view (terminal status line, no live buttons); the pending-only listing means a refresh never re-surfaces it.

**Pinned decisions (expansion gate 2026-07-06 — write tests to these):**
1. *Decision → endpoint mapping (VERIFIED):* APPROVE MERGE → `approveMergeCandidate(id, suggestedEntityId)` (→ status `approved_merge`, design `'merged'`); KEEP SEPARATE → `createMergeCandidateEntity(id)` (`create-new` → status `create_new`, "both exist as separate records", design `'kept'`). `ignore` is NOT surfaced (out of SYNC v1 scope).
2. **AS-7 idempotency (REFUTED — the headline write pin):** `mergeCandidates.ts` has NO `status !== 'pending'` guard — `approve-merge` re-runs `manualMergeNormalizedEvent` and **`create-new` re-runs `manualCreateNormalizedEvent`, creating a DUPLICATE event, on a repeat call**. The UI-testable guarantee is the single-flight guard (ONE request per user intent — registry-create v1 `isSubmittingRef` precedent) + terminal button-replacement + pending-only listing. Routes return `{ message, candidate, event }` and validate `mergeDecisionSchema` on approve-merge only — pin the ACTUAL response/error shape from the gate before writing tests; do NOT guess.
3. *Optimistic vs refetch:* on success, mark `decided[id]` locally (design's terminal state) AND decrement the badge from the local pending set; a `useSyncData.refresh()` is OPTIONAL (background reconcile) — the decided card stays terminal regardless. No socket (C-5 pin-4 no-socket precedent).
4. *Confirmation:* merge decisions are irreversible on canonical records; v1 executes on click per the design (immediate, per-candidate) — a confirm step is a designer/E-3 note, NOT invented here.

- **D-3-T0** · Hat **PREPARATORY** (backend) · Model **Sonnet** · Confidence Med · **CONDITIONAL (gate output — mirrors C-4-T0)**
  Goal: IF the architect deems the re-decide hazard unacceptable (create-new duplicating an event), add an already-decided guard to `approve-merge`/`create-new`/`ignore` (`candidate.status !== 'pending'` → 409-style "already decided", additive; existing backend tests stay green). If the architect accepts the UI-only mitigation (single-flight + pending-only listing), this task is SKIPPED and the acceptance recorded.
  TDD: backend route test — a repeat decision returns the guard status, the first decision unaffected — first.
  Pull Gate (BLOCKING): the AS-7 finding + the architect ruling; existing import route suite green before/after.
  Hand-off: idempotency contract recorded in `merge-decision v1` §Depends-on. Unblocks: D-3-T1.
- **D-3-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (write-path + error contract) · Confidence Med (first merge write; re-decide gate)
  Goal: Wire APPROVE MERGE / KEEP SEPARATE decisions (pin 1) with per-candidate single-flight (pin 2), terminal status-line replacement, badge decrement, inline error + re-enable (pins 3–4).
  TDD: interaction tests first — single-flight double-click (both paths), success → status line + badge decrement, null-suggested → APPROVE disabled, failure → inline error + re-enable, decided card not re-decidable.
  Pull Gate (BLOCKING): decision response/error shape + idempotency mechanism (pin 2, D-3-T0 output) vs `mergeCandidates.ts` + `services/imports.ts`; `sync-selectors v1.2`, `useSyncData v1`, `OpsShell v1` (badge).
  Hand-off: Contract Snapshot **`merge-decision v1`** (endpoint mapping + single-flight + the error/idempotency contract actually available). Unblocks: D-4-T1, END OF STORY SEQUENCE.

### Story D-4 — EPIC D smoke test + runbook §sync ✅ COMPLETE (eaeef5e)
**As a** reviewer **I want** an E2E journey over SYNC including a merge decision **so that** the initiative's second write surface is verifiably deployable and rollbackable.

Business Value 2 · Priority 3 · Size **M** (ops-e2e store gains merge-decision emulation) · DoR: **READY** (gate MUST re-verify harness premises — the A-5 lesson; the C-7 stateful store is the base)

**AC (flag-on profile; flag-off coverage carried by A-5):**
- Given `/ops/sync`, Then job cards render from the fixture jobs (literal status-dot + meta assertions incl. one dead-letter card); the SYNC tab reads `SYNC [n]` matching the pending fixture count.
- Given a merge candidate with a differing field, Then its card shows the `FIELD | INCOMING | CURRENT` diff with the changed field amber and the `<pct>% MATCH` band; a ≥90 candidate is green, a <90 amber.
- Given APPROVE MERGE, Then the card footer becomes `✓ MERGED INTO REGISTRY` and the tab badge decrements (interception emulates the decision + updates its in-memory store per `merge-decision v1`); a scripted KEEP SEPARATE yields `KEPT AS SEPARATE RECORDS`.
- Given a failing decision (emulated), Then the inline error renders and the buttons re-enable.

**Pinned decisions:**
1. *Stateful interception:* the ops-e2e route layer (C-7 registry store precedent) gains an in-memory merge-candidate store (reset per test) so decision round-trips + badge decrements are observable; the real-backend WRITE gap (A-5/C-7 trade-off) now covers merge decisions too — state it in the runbook §sync known limitations, including the AS-7 re-decide finding.
2. *PII:* SYNC e2e fixtures reuse the anonymised families (DoD 3); a Haiku review-chain step verifies no real athlete/fixture names.

- **D-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `e2e/smoke-epic-d.flag-on.spec.ts` implementing the ACs + the merge-decision interception store (pin 1) + runbook `ops-shell.md` §sync — symptoms: empty SYNC → jobs/candidates fetch + `isSettled`; decision fails → endpoint + shape per `merge-decision v1`; duplicate event after re-decide → the AS-7 finding (single-flight + pending-only listing; backend guard status per D-3-T0); wrong confidence band → the Decimal-string coercion (D-2 pin 4); rollback = flag OFF + REDEPLOY (TD-27).
  TDD: AC-ordered spec red → green; runbook checklist derived from the passing spec (A-5/C-7 idiom).
  Pull Gate: `ops-e2e v1.1` (amended) + all EPIC D snapshots (`sync-selectors v1.2`, `useSyncData v1`, `merge-decision v1`); fixture inventory (job/candidate counts) asserted literally; PII check (pin 2, Haiku).
  Unblocks: **EPIC D RETRO** (Phase Summary + Architecture Memory update + flow data + mode check per BB §10 — then expand EPIC E as HARDENING), END OF STORY SEQUENCE.

### EPIC D — RETROSPECTIVE (Phase Summary, completed 2026-07-09)

**Phase Summary.** EPIC D (SYNC) COMPLETE — all 4 stories done in one day on
`feature/C-1-registry-selectors` (8 commits, stacked on the EPIC C work): D-1-T1
sync-selectors v1 (`af8fe5f`), D-1-T2 useSyncData v1 + OpsShell v1.1 badge context
(`8c6d0a5`), D-2-T0 `mergeConfidencePercent` extraction (`ad3fa5a`), the confidence
SCALE FIX (`0736cd0`), D-2-T1 merge cards sync-selectors v1.2 (`3f0b93c`), D-3-T0 backend
409 guard (`25643a1`), D-3-T1 merge decisions merge-decision v1 (`d97c11c`), D-4 smoke +
ops-e2e v1.2 (`eaeef5e`). Test base **715 → 808** vitest (+93) + backend **349 → 355**
(+6, the D-3-T0 guard) + e2e **10 → 13** (EPIC D flag-on journey), `tsc -b` clean
throughout. Contracts: sync-selectors v1→v1.1→v1.2 · useSyncData v1 · OpsShell v1→v1.1
(badge-publish context) · merge-decision v1 · ops-e2e v1.1→v1.2.

**DoD additions check:** (1) no merge decision fires twice — a per-card SYNCHRONOUS
`isSubmittingRef` single-flight latch (unit-pinned via a same-tick native-click test that
isolates the ref from React's disabled re-render) AND a backend `status !== 'pending'` 409
guard (D-3-T0) that asserts the merge/create service is NOT re-called ✓. (2) after a
decision the footer is replaced by the terminal status line + the SYNC badge decrements —
asserted unit (SyncScreen) + e2e (`[3]→[2]→[1]`) ✓. (3) all event/name fixtures anonymised
(shared FIXTURE_* families; e2e reuse) ✓. (4) diff table renders INCOMING vs CURRENT for a
`suggestedEntityId`, and a null-suggested candidate renders APPROVE MERGE disabled
(create-only) — asserted unit + e2e ✓.

**Process notes.** (a) **DoR/pull re-gates caught a real latent bug + two architect calls.**
The D-2-T1 pull gate verified `MergeCandidate.confidence` against `DeduplicationService` +
`process.ts` and found the scale is **0..100, not 0..1** as the backlog assumed — ImportView's
legacy `Math.round(c.confidence * 100)` rendered `9500% match` (latent, few real candidates).
Architect ruled fix-everywhere → `0736cd0` (a `fix` commit separate from the D-2-T1 feature,
Two Hats). D-2-T0 (ADR-012 Rule-of-Three) verified the "shared" merge derivation was actually
THIN — only confidence→percent is byte-identical (band 3-vs-2, source raw-vs-mapped, kind chip
all diverge) → architect dedup'd only the percent, band/source/kind stay per-consumer. D-3-T0
(AS-7) verified `create-new` creates a DUPLICATE canonical event on re-decide → architect added
the additive 409 guard. Zero mid-task stalls after each gate. (b) **Mutation probes caught real
holes on EVERY feature task** — D-1-T1 the `!= null && !== ''` recordsProcessed guard (empty/null
→ wrong `0 RECORDS`); D-1-T2 the OpsShell badge clear/delete branch (D-3 seam) + the merge-review
empty note; D-2-T1 the Date-object DATE path under the behind-UTC TZ pin + the incoming-only
diff-chrome absence; **D-3-T1 the headline one — the single-flight latch was NOT actually tested**
(the double-click tests passed via React's `disabled` re-render; removing the ref survived) →
closed with a same-tick `act()` native-click test, the one finding worth blocking on for an
IRREVERSIBLE write surface; D-4 the status-dot COLOUR (AC-1 only counted dots). (c) The
review-tooling scratchpad-backup rule (never `git checkout` on uncommitted work) held with zero
recurrence across all D tasks. (d) Naming reviews fixed public-API names BEFORE the contract
froze: `meta`→`statusLine`, `dot`→`dotColor` (D-1-T1); `currentResolved`→`isCurrentResolved`,
`changed`→`isChanged` (D-2-T1); `submitting`→`isSubmitting` (D-3-T1) — the ops `is`-boolean
convention, again.

**Found work / upstream (not a defect of this epic):** ImportView.ReviewTab rendered
`9500% match` on a real 95-confidence candidate (confidence is 0..100, not 0..1) — FIXED via the
shared helper at `0736cd0` (the extraction preserved the bug byte-stably at D-2-T0, then the fix
corrected it, textbook Two Hats). `create-new`/`approve-merge` had NO already-decided guard →
re-decide duplicated a canonical event / re-ran the merge (AS-7 confirmed, guarded at D-3-T0). The
import-router `ensureImportSchemaReady` middleware ($queryRawUnsafe table probe) forces any import
route test to stub the schema probe — a shared-helper candidate if more import-route tests land.

**Debt candidates awaiting a free `debt-register.md`:** the D-3-T0 409-guard block is inline ×3
across the decision routes (Rule of Three now MET) — an `assertPending(candidate)` backend helper
if a 4th decision route appears; `ReviewTab` was made an additive export purely for the D-2-T0
characterization — remove it with the legacy screen at the EPIC E cutover; SYNC surfaces no
`ignore` decision (legacy ImportView retains it) — E cutover reconciliation; `dotColor` collapses
`queued`+`running`→neutral (no not-started vs in-progress distinction); the merge DIFF compares
only SPORT/COMPETITION/DATE/PARTICIPANTS because the thin `Event` entity has no
venue/country/status/home-away counterpart (INCOMING carries them — a richer CURRENT source is an
E item); the SYNC badge populates only on the FIRST Sync visit (no shell-level pre-visit count
fetch — pin 5 "single source"); `statsJson.recordsProcessed` key assumed, not confirmed against a
live job payload; `DOT_COLOR`/`BAND_COLOR` token→var maps are a Rule-of-Two watch vs RegistryScreen's
`STATUS_COLOR`.

**SLOs still unmeasured** (`Ops Sync initial render < 1.5s p95 @ 50 jobs + 100 candidates`,
`Merge decision click → terminal < 300ms p95`) — E-1 remains the honest measurement point; the
bare-array unbounded fetch (jobs default limit; candidates no pagination) is recorded there too.
**Mode check: DELIVERY retained** — EPIC D shipped the initiative's SECOND write surface
(irreversible merge decisions) and the gates paid off HARD (a 9500% latent bug + a duplicate-event
hazard + an untested single-flight latch, all caught). EPIC E is **HARDENING** (SLO measurement,
the deferred ImportView/ReviewTab migration from D-2-T0, TD-27 runtime-flag decision, cutover ADR).
Next per §10.4: expand **EPIC E** with `backlog-builder`.

### EPIC D — Expansion validator note (BB v5.1 §9, DELIVERY level, run 2026-07-06)

- **Structure/DAG:** D-1-T1 → {D-1-T2, D-2-T0}; D-1-T2 → {D-2-T1, D-4-T1}; D-2-T0 → D-2-T1 → D-3-T1; D-3-T0 (conditional) → D-3-T1 → D-4-T1. No cycles; every detailed task has Hat, Model, TDD order, Pull Gate, Unblocks. ✓
- **Glossary:** Sync Job / Merge Candidate / Merge Decision used as §4 defines them; the new display terms (Job Card, Merge Card, Diff Table, Confidence Band, Pending Count) are SYNC-local and consistent; the `ignore`-out-of-scope and non-event-out-of-scope decisions are honest reductions of the design, not invented features. ✓
- **Anti-bureaucracy (Core §5.3):** every task spec is shorter than its expected implementation (largest: D-2-T1 diff + card; smallest: D-3-T0 conditional backend guard — still above overhead). Selectors (D-1/D-2) kept separate from the screen because the derivation has two consumers (job cards + merge cards) and one is a Rule-of-Three extraction — not an always-change-together pair. ✓
- **Writes:** the merge decision carries a single-flight test + gate-pinned error contract; AS-7 is REFUTED and mitigated (UI single-flight + pending-only + a CONDITIONAL backend guard); PII fixture rule carried from EPIC C; the ONLY possible backend change (D-3-T0) is additive and architect-gated — flagged, not assumed. ✓
- **Honest deferrals:** `ignore` decision + dead-letter/sources/aliases/provenance stay in legacy ImportView (ADR-012); `NIGHTLY SYNC · 02:00 CET` label + `reasonCodes` + a merge-confirm step → designer/E-3 notes; `ImportView.ReviewTab` migration onto the shared selector → EPIC E cutover if not done in D-2-T0; per-candidate deep-linking parked (no SYNC inspector); SLOs measured at E-1. ✓

---

## EPIC E — HARDENING + cutover (verification, QA, TD servicing, cutover ADR)

- **Objective:** Close the initiative. No new features. Prove the redesign meets every SLO, is accessible and light-theme-clean across all 5 screens, is at least at RBAC/security parity with the legacy peers it replaces, has its accrued debt SERVICED (fix / schedule / accept-with-owner — no invisible debt), a complete runbook + a flag-rollout plan, and — the headline — an ARCHITECT ADR deciding old-screen deprecation/cutover (replace routes vs coexist), which INCLUDES the `ImportView.ReviewTab` → shared merge-selector migration D-2-T0 deferred. This is the FINAL epic; its exit is the cutover decision, not a new surface.
- **Tracer Bullet?:** NO (terminal epic).
- **Mode:** **HARDENING** (per Core §1 / BB §10 — set at the EPIC D retro). Governance delta vs DELIVERY: glossary FROZEN (§4 is closed — no new terms); DoR is Full INVEST **+ security**; Two Hats are **REFACTORING/PREPARATORY only** for structural work, **VERIFICATION** (analysis, no production code) for the audit/measurement tasks, and **FEATURE only** for the one cutover migration (E-6-T1) which is remediation-of-parity, not new capability; TDD is **all + perf/security tests**; **every HIGH TD item must carry a servicing decision** before the epic closes; pull gates verify **rollback**; the validator runs at **HARDENING level (Full + SLO-verified)**.
- **DoD additions:** (1) Every SLO in every EPIC (A–D) has a MEASURED number vs its target and a PASS/FAIL verdict — any FAIL is surfaced to the architect as a hard release gate, never silently accepted (E-1). (2) All 5 screens pass a WCAG-AA re-check in BOTH themes and are keyboard-operable (no clickable-`<div>` without role/tabIndex/onKeyDown) — VERIFIED against the built screens, not the token table (E-2). (3) The two write paths (registry create, merge decisions) pass a STRIDE re-check and `/ops/*` has a DOCUMENTED RBAC posture relative to its legacy peers (E-3). (4) Every debt item recorded as TEXT in the A–D retros is either entered in `debt-register.md` with a servicing decision or explicitly accepted with an owner — the "no invisible debt" rule (Core §5) is satisfied for the whole initiative (E-4). (5) The runbook covers all 5 screens + a flag-rollout plan honestly stated against TD-27's build-time constraint (E-5). (6) An accepted cutover ADR exists and the temporary `ReviewTab` export (`src/pages/ImportView.tsx`, D-2-T0 characterization scaffold) is removed OR its removal is scheduled by the ADR (E-6).
- **Business Value:** The initiative becomes SHIPPABLE with eyes open — a planner/ops lead can trust the redesign is as fast, as accessible, as secure and as governable as the screens it replaces, and the org has a decided path off the legacy screens. Success metric: the architect can make a go/no-go flag-flip decision from E-1..E-5 evidence + the E-6 ADR, with zero unknown SLOs, unowned debt, or undocumented RBAC gaps.
- **Risk:** Med — an SLO MISS at real volume (registry @2,000 records, sync bare-array fetches, schedule @500 events) forces a pagination/virtualization change late → mitigation: E-1-T0 builds the measurement harness FIRST and the unbounded-fetch risk is a pre-named architect gate, not a surprise. Med — RBAC parity turns out to require per-tab role gating the shell can't express cleanly → mitigation: E-3 surfaces the policy as an architect call before any code. Med — the cutover ADR could invalidate ADR-012's "legacy untouched" stance and pull in the full ImportView reconciliation (ignore/dead-letters/sources/aliases/provenance) → mitigation: E-6-T0 scopes the migration explicitly and E-6-T1 is the ONLY FEATURE task, gated on the ADR. Low — a11y remediation is behavior-additive under a flag (blast radius contained).
- **SLOs (CONSOLIDATED — this is the initiative's measurement point; E-1 verifies every one):**
  - Schedule initial render **< 1.5s p95 @ 500 events / 1 week** (EPIC A)
  - Theme toggle palette swap **< 100ms p99** (EPIC A)
  - Rundown day-switch **< 200ms p95** (EPIC B)
  - Rights render **< 1s p95 @ 100 contracts** (EPIC B)
  - Registry initial render **< 1.5s p95 @ 2,000 records** (EPIC C)
  - Registry search keystroke → filtered table **< 50ms p95 @ 2,000 records** (EPIC C)
  - Registry inspector hop → update **< 100ms p95** (EPIC C)
  - Sync initial render **< 1.5s p95 @ 50 jobs + 100 candidates** (EPIC D)
  - Merge decision click → terminal status line **< 300ms p95** (optimistic, excl. server round-trip) (EPIC D)
- **Glossary:** §4 FROZEN — no new terms. E introduces only measurement/process labels (SLO verdict, servicing decision, cutover) that are not domain terms.
- **ADRs:** **ADR-016 (NEW, E-6) — Ops old-screen deprecation/cutover** (the headline architect decision). Possible amendments surfaced (architect calls, not decided here): **ADR-014 amendment** (carry `?day`/`?event`/`?record` across tab switches — E-4), **ADR-013 amendment** if E-2 designer decisions add token families. ADR-012's "legacy untouched" stance is what ADR-016 revisits.
- **Verification Story / Smoke:** no NEW smoke journey — E re-runs the A–D e2e suite (13 specs, two flag profiles) as the regression gate and adds MEASUREMENTS + AUDITS, not features. E-5 folds the results into the runbook.
- **Runbook:** complete `docs/runbooks/ops-shell.md` (all five §schedule/§rundown/§rights/§registry/§sync sections exist post-D — E-5 verifies + adds §performance, §accessibility, §security-rbac, §rollout).
- **Working method (proven A→D, binding):** DoR re-gate re-verifies premises before start (backlog-health-advisor); audits produce PASS/FAIL tables with the finding, never a silent adjustment (A-1-T3 precedent — failures go to the ARCHITECT); every accrued debt item is written down before a decision is attached (Core "no invisible debt"); the ops `is`-boolean + sibling-module + additive-fixture conventions hold; the review chain (two-hats-enforcer → smell detectors → naming-reviewer → test-quality-auditor, scratchpad-backup never `git checkout`) runs on the one FEATURE task (E-6-T1); **architect gates are SURFACED with options, never decided in the backlog.**

> **ARCHITECT GATES in EPIC E (the backlog surfaces these; it does NOT decide them):**
> 1. **[HEADLINE] E-6-T0 — cutover strategy: REPLACE legacy routes vs COEXIST.** Whether ADR-012's "legacy untouched" stance ends now (flip `opsRedesign` default ON + deprecate ScheduleView/PlannerView/ContractsView/TeamsView/ImportView) or the two run in parallel indefinitely. This decides product direction + the scope of the ImportView reconciliation — an architect/product call, not an engineering one.
> 2. **E-1 — any SLO MISS is a hard release gate.** If a measured number fails its target, the architect decides ship-with-known-limitation vs block-until-fixed vs re-scope the target. The backlog measures and surfaces; it cannot pre-decide an acceptable regression on core UI.
> 3. **E-1 — pagination/virtualization decision for the unbounded bare-array fetches** (registry 4-way `useRegistryData`, sync `useSyncData` jobs+candidates — all no-pagination bare arrays, recorded C/D). Whether to add server pagination/client virtualization is a cost/architecture call gated on the E-1 numbers.
> 4. **E-3 — RBAC-parity policy call.** `/ops/*` is authenticated-only (`App.tsx`: `user ? <OpsShell/> : <Navigate to="/login">`); its legacy peers use `RequireRole` role sets (schedule/planner `admin|planner`, contracts `admin|contracts|planner`, teams `admin|planner|sports`, import `admin`). Which roles gate the ops shell, and at shell vs per-tab granularity, is a security-policy call for the architect.
> 5. **E-4 — TD-27 runtime-flag decision.** `VITE_OPS_REDESIGN` is BUILD-TIME (`src/flags.ts`) → rollback = env change + REDEPLOY. Whether to add a runtime override (LaunchDarkly-style / DB flag) or accept redeploy-rollback is an ops/architecture call that also shapes E-5's rollout plan.
> 6. **E-4 — ADR-014 amendment: carry `?day`/`?event`/`?record` across tab switches.** Currently deep-link-only (OpsShell NavLinks drop ops params — EPIC B retro). A small, architect-owned ADR amendment.
> 7. **E-4 — backend `broadcastSlots.ts` inclusive-`lte` day-window fix.** `plannedStartUtc.lte = dateEnd` (VERIFIED, line 32) returns a midnight-UTC slot for TWO adjacent days; the e2e models half-open and documents the divergence (EPIC B retro). Whether to change to a half-open `lt` window (and re-baseline any consumer) is a backend correctness call.
> *(Out of band: AS-4 rights-window threshold formulas remain PROVISIONAL on the domain-gaps track / ADR-015 — NOT an EPIC E gate; noted so E-2/E-3 do not re-open it.)*

### Story E-1 — Performance verification vs ALL SLOs
**As an** architect **I want** every EPIC's SLO measured against its numeric target at the specified volume **so that** the go/no-go flag decision rests on numbers, not hope, and any regression is a surfaced gate rather than a production surprise.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY (conditional)** — E-1-T0's measurement-methodology decision is BLOCKING (the repo has a Playwright harness with pinned-clock interception but NO perf-measurement rig; "we can just measure it" is an A-5-class premise that must be verified before E-1-T1). INVEST I✓ N✓ V✓ E✓ S✓ T✓
INVEST note: independently valuable (the SLO table stands alone), estimable once the rig exists, testable (each SLO is a numeric assertion).

**AC (Gherkin):**
- Given the 9 consolidated SLOs, When E-1 completes, Then a PASS/FAIL table records for each: target, measured p95/p99, volume, method, verdict — no SLO left "unmeasured" (the phrase carried in every A–D retro is retired here).
- Given a synthetic dataset at each SLO's stated volume (500 events / 100 contracts / 2,000 registry records / 50 jobs + 100 candidates), When the relevant screen renders/interacts, Then the measured number is captured reproducibly (fixed seed, fixed clock, documented percentile method).
- Given a MEASURED FAIL, Then it is written up as an architect gate item (root cause + candidate fix + cost) — NOT silently adjusted and NOT quietly re-targeted (A-1-T3 audit-honesty precedent).
- Given the unbounded bare-array fetches (registry 4-way, sync jobs+candidates), Then the E-1 report states the fetch size at which each SLO would breach and flags the pagination/virtualization decision to the architect (gate 3) — the C-1 perf probe pinned LINEARITY only; E-1 pins the CONSTANT and the ceiling.
- Alt: if a screen cannot be measured at target volume without production data the fixtures don't model, Then the gap is recorded as a measurement limitation (A-5 live-backend-gap honesty), not a false PASS.

**Pinned decisions (expansion gate — write measurements to these):**
1. *Measurement rig is E-1-T0's output, not assumed:* candidate = Playwright tracing / `performance.measure` marks around render+interaction in the flag-on profile, driven by synthetic fixtures scaled to SLO volume; the C-1 perf-probe pattern (synthetic N records, wall-clock bound) is the seed but it is a UNIT micro-probe, not a p95 rig — decide the real method at T0 before measuring.
2. *Selectors vs screen:* the pure-selector SLOs (search keystroke, inspector hop, merge-decision optimistic path) are measurable at the selector/interaction layer (deterministic, no network); the render SLOs need the screen mounted with data settled — measure each at its honest layer, documented.
3. *Percentile honesty:* p95/p99 over a documented sample count on a documented machine profile; a single-run number is labeled as such, never dressed as a percentile.
4. *No production data:* all volume synthesized from anonymised fixture factories (EPIC C/D DoD 3) scaled up — no real athletes/fixtures at 2,000 records.
5. *Bare-array ceiling:* for `useRegistryData`/`useSyncData` the report computes the record count at which the client-side filter/derive crosses each SLO — the input to gate 3.

**Interfaces:** none new (VERIFICATION epic). Output = `docs/ops-perf-verification.md` (SLO PASS/FAIL table + method + gate items) — the E-1 deliverable, structured like `docs/ops-contrast-audit.md`.

- **E-1-T0** *(added by DoR gate — "we can just measure it" premise unverified: repo has Playwright but no perf rig)* · Hat **PREPARATORY** · Model **Sonnet** · Confidence Med
  Goal: Stand up the perf-measurement rig — scaled synthetic fixtures (500 events / 100 contracts / 2,000 records / 50 jobs + 100 candidates via the existing anonymised factories), a measurement method per pin 1 (Playwright trace marks and/or a selector/interaction bench), fixed seed + clock, a documented percentile+machine profile. Prove it by measuring ONE SLO end-to-end (the registry render @2,000 is the hardest — good proof case) before E-1-T1 measures the rest.
  Verification order: rig produces a stable, repeatable number for the proof SLO first (variance documented) → only then is the rig trusted for the other 8.
  Pull Gate (BLOCKING): the measurement-methodology decision (pin 1); confirm the fixture factories scale to target volume without real PII (pin 4); confirm the flag-on build profile is the measurement target (TD-27 — build-time flag, use the flag-on profile, never a runtime toggle).
  Hand-off: rig + method documented in `docs/ops-perf-verification.md` §method. Unblocks: E-1-T1.
- **E-1-T1** · Hat **VERIFICATION** · Model **Opus** (SLO judgment — which misses gate the release, cost of each fix) · Confidence Med
  Goal: Measure all 9 SLOs on the E-1-T0 rig; produce the PASS/FAIL table; for each FAIL write root cause + candidate fix + cost as an architect gate item (gate 2); compute the bare-array ceilings and raise the pagination decision (gate 3).
  Verification order: measure → tabulate → for any FAIL, adversarially re-measure to rule out rig noise BEFORE escalating (a false FAIL wastes an architect gate) → escalate confirmed misses.
  Pull Gate: E-1-T0 rig trusted; each SLO's target/volume re-read from its EPIC header (this section's consolidated list is the index, the EPIC headers are the source).
  Hand-off: `docs/ops-perf-verification.md` complete (feeds E-5 runbook §performance + E-6-T0 cutover evidence). Unblocks: E-5-T1, E-6-T0, END OF STORY SEQUENCE.

### Story E-2 — Accessibility + light-theme QA across all 5 screens
**As an** ops user on assistive tech or in a daylight office **I want** every screen keyboard-operable and AA-clean in both themes **so that** the redesign is usable by everyone, not only mouse users in a dark control room.

Business Value 3 · Priority 4 · Size **L** · DoR: **READY** — the built screens exist to audit; remediation may surface designer-decision gates (accrued E-2 notes), flagged below. INVEST all ✓

**AC (Gherkin):**
- Given all 5 built screens, When audited for keyboard operability, Then every interactive element reachable by mouse is reachable + operable by keyboard: the clickable table rows (Registry, Schedule) and positioned blocks (Rundown) and job/merge cards (Sync) gain `role`/`tabIndex`/`onKeyDown` (Enter/Space) — the shared clickable-`<div>` pattern recorded in the C retro (VERIFIED: only `RegistryCreateModal.tsx` carries a11y attributes in `src/components/ops`; the row/block/card patterns do not).
- Given both themes on all 5 screens (not just the token table — TD-26's derived values were signed off at A-1-T4, but the SCREENS were not all built then), When contrast is re-checked, Then every text/status/chip pair meets WCAG AA; any FAIL becomes an architect/designer item (A-1-T3 idiom), never a silent shift of a final-intent color.
- Given focus, Then a visible focus indicator exists on every interactive element in both themes (focus-visible ring on the accent/`--p2` idiom).
- Given the accrued E-2 designer notes, Then each is either implemented (if purely presentational + decided) or recorded as a designer-sign-off gate: `--registry-*` STATUS token family (currently borrows `--status-approved`/`--alert-warning`/`--text-shell-3`) · channel color vars (Ketnet / VRT MAX Sport / Radio 1 — Rundown UNASSIGNED/unmapped lanes use a neutral fallback, B-1 pin 7) · sport-icon/federation + per-kind create fields · provenance SOURCE-code-vs-full-name (no name map — `· LAST SYNC` suffix already dropped, C retro) · `N PLAYERS` vs design's `12 PEOPLE` (AS-5 honesty) · copy: `MAX` / `NIGHTLY SYNC · 02:00 CET` / season-label · `reasonCodes` + a merge-confirm step (D notes).
- Alt: an a11y fix that would change layout/visual intent (not just add handlers) is deferred to a designer gate, not applied unilaterally.

**Pinned decisions:**
1. *Audit before remediation:* E-2-T1 produces a PASS/FAIL table across all 5 screens (keyboard + contrast + focus) FIRST; E-2-T2 only remediates confirmed, non-design-decision failures (the A-1-T3 → A-1-T4 audit-then-fix split).
2. **Rule-of-Three on the clickable row (extraction):** the clickable-`<div>` pattern appears on Registry rows, Schedule rows, Rundown blocks and Sync cards — 4 occurrences → PAST the Rule of Three. E-2-T2 extracts ONE accessible primitive (a shared `useRowActivation`/`<OpsClickableRow>` giving role/tabIndex/Enter-Space/focus-visible) and applies it, rather than four copies of the handler (Core §5 — extract at the third; here we are servicing an accrued, proven-repeated pattern).
3. *Contrast honesty:* re-run against the BUILT screens' actual rendered pairs (statuses on `--p2`, kind chips on 13%-alpha tints, merge amber-changed cells, confidence bands) — the token-table audit (A-1-T3) did not cover cell-in-context combinations that only exist now.
4. *Designer notes are DECISIONS, not silent edits:* token-family/color/copy items go to a single designer sign-off gate; the code changes only after sign-off (TD-26 precedent — derived values, then sign-off). Presentational-only + already-decided items (e.g. adding `role` to a row) proceed in E-2-T2.
5. *Flag-gated:* all remediation ships under `opsRedesign` (still OFF in prod until E-6) — a11y changes cannot regress the legacy screens.

**Interfaces:** possibly ONE new shared primitive `src/components/ops/OpsClickableRow.tsx` (or a `useRowActivation` hook) per pin 2 — sibling to existing ops components; contract snapshot if extracted. Output audit = `docs/ops-a11y-audit.md` (structured like `ops-contrast-audit.md`).

- **E-2-T1** · Hat **VERIFICATION** · Model **Haiku** (checklist audit — WCAG pairs, keyboard reachability, focus per screen) · Confidence High
  Goal: Full a11y + light-theme audit across all 5 screens — keyboard operability, contrast (both themes, in-context pairs), visible focus — as a PASS/FAIL table; enumerate every accrued designer note as an item with a proposed disposition (implement / designer-gate).
  Verification order: automated axe-style pass + manual keyboard walk per screen → tabulate → separate "just add handlers" fixes from "needs a design decision" items.
  Pull Gate: the built screens (all 5 exist post-D); ops-tokens v3 var names; the accrued E-2 note list from the A/B/C/D retros (this section's AC-4 is the consolidated index).
  Hand-off: `docs/ops-a11y-audit.md` (PASS/FAIL + designer-gate list). Unblocks: E-2-T2, E-2-T3.
- **E-2-T2** · Hat **PREPARATORY** *(extract shared accessible row primitive — Rule-of-Three serviced)* then remediate · Model **Sonnet** · Confidence Med
  Goal: Extract `OpsClickableRow`/`useRowActivation` (pin 2, behavior-preserving for mouse, ADD keyboard+focus) under green tests, then apply it to Registry/Schedule/Rundown/Sync interactive elements; fix the confirmed non-design contrast/focus failures from E-2-T1.
  TDD: characterization tests pinning current mouse-click behavior BEFORE the extraction (byte-stable click) → keyboard-activation tests (Enter/Space) + focus-visible → apply to each consumer with its interaction suite staying green.
  Pull Gate: `ops-a11y-audit.md` (which failures are non-design); the 4 consumer contracts (RegistryScreen, ScheduleScreen, RundownScreen, SyncScreen) — flag-gated (pin 5).
  Hand-off: Contract Snapshot `OpsClickableRow v1` (if extracted) + updated screens. Unblocks: E-6-T0 (a11y-clear evidence), END OF STORY SEQUENCE.
- **E-2-T3** · Hat **VERIFICATION** · Model **Sonnet** · Confidence Med
  Goal: Consolidate the designer-decision items (token families, channel color vars, copy, per-kind create fields, merge-confirm, `reasonCodes`) into ONE designer sign-off request; record each outcome as implemented-or-deferred; if any adds a token family, raise the ADR-013 amendment note.
  Verification order: package the designer-gate list from E-2-T1 → obtain sign-off decisions → record dispositions (no unilateral color/copy edits — pin 4).
  Pull Gate: `ops-a11y-audit.md` designer-gate list; ADR-013 (token-system single-source rule — no second token system).
  Hand-off: designer dispositions recorded (feeds E-4 debt servicing + E-6-T0). Unblocks: E-6-T0, END OF STORY SEQUENCE.

### Story E-3 — Security review: STRIDE re-check + RBAC parity
**As a** security-conscious architect **I want** a STRIDE re-check on the two ops write paths and a documented RBAC posture vs the legacy peers **so that** the redesign does not widen the attack surface or silently drop an authorization the old screens enforced.

Business Value 3 · Priority 5 · Size **M** · DoR: **READY (conditional)** — E-3-T2's RBAC-parity policy is an ARCHITECT gate (which roles, shell vs per-tab); the STRIDE re-check (E-3-T1) is unblocked. INVEST all ✓ · DoR **+security** (HARDENING).

**AC (Gherkin):**
- Given the two write paths — registry create (C-4: P2002→409, single-flight, server-implied MANUAL) and merge decisions (D-3: single-flight + D-3-T0 `status !== 'pending'` 409 guard) — When STRIDE-re-checked, Then Spoofing/Tampering/Repudiation/Info-disclosure/DoS/Elevation are each assessed against the delivered code and any residual is recorded (mitigated / accepted / gated).
- Given `/ops/*` authorization, When compared to its legacy peers, Then the gap is DOCUMENTED: ops is authenticated-only (`App.tsx`: `user ? <OpsShell/> : <Navigate to="/login">`), whereas ScheduleView/PlannerView are `RequireRole admin|planner`, ContractsView is `admin|contracts|planner`, TeamsView is `admin|planner|sports`, ImportView is `admin` — a viewer/lesser role that could NOT reach TeamsView or ImportView legacy CAN reach `/ops/registry` + `/ops/sync` (the write surfaces) today.
- Given the RBAC-parity policy decision (gate 4), Then E-3-T2 applies the chosen role guard to `/ops/*` (shell-level and/or per-tab) under tests, or records an explicit architect acceptance of authenticated-only with rationale.
- Given the merge-decision irreversibility (D-3 pin 4: executes on click, no confirm), Then whether a confirm step is a security requirement (vs the deferred designer note) is assessed here — a security call, not only UX.
- Alt: a residual security finding with no cheap mitigation is escalated as an architect gate (never accepted silently — no invisible risk).

**Pinned decisions:**
1. *STRIDE against delivered code, not the design:* re-read `mergeCandidates.ts` (the 409 guard as shipped at D-3-T0) and the registry create routes (P2002→409 at C-4-T0) — assess what EXISTS, and the multi-operator/stale-card residual AS-7 flagged.
2. **RBAC parity is the headline security item (gate 4):** the parity gap is VERIFIED in `App.tsx`; the FIX (role set + granularity) is an architect policy call. The likely parity set: registry ≈ TeamsView (`admin|planner|sports`), sync ≈ ImportView (`admin`), schedule/rundown ≈ `admin|planner`, rights ≈ `admin|contracts|planner` — but per-tab role gating inside a single `/ops/*` shell is a structural question (the shell renders all tabs; hiding/guarding a tab per role is new) — SURFACE it, do not decide.
3. *No new auth mechanism:* reuse `RequireRole` (the legacy peers' component) — parity means the SAME guard, not a new system (ADR-013 token-single-source spirit applied to auth).
4. *Tenant/RLS unchanged:* the initiative made ONE additive backend change (registry create 409 + list embeds); RLS/tenant isolation is out of scope here (owned by the mitigation-plan track) — noted so E-3 does not re-open it.

**Interfaces:** if the policy adds guards, `App.tsx` `/ops/*` route and/or OpsShell tab rendering gain `RequireRole` — no new component. Output = `docs/ops-security-review.md` (STRIDE table + RBAC parity matrix + decisions).

- **E-3-T1** · Hat **VERIFICATION** · Model **Opus** (threat judgment) · Confidence High
  Goal: STRIDE re-check on the two write paths against the delivered code + document the RBAC parity gap as a matrix (ops route vs each legacy peer's `RequireRole` set); assess the merge-confirm question as a security item (pin 1, AC-4).
  Verification order: read the shipped routes/guards → build the STRIDE table → build the RBAC parity matrix → list findings with proposed dispositions (mitigated/accept/gate).
  Pull Gate: `mergeCandidates.ts` (D-3-T0 guard as shipped), registry create routes (C-4-T0), `App.tsx` route guards + `RequireRole`.
  Hand-off: `docs/ops-security-review.md` (STRIDE + parity matrix + the gate-4 policy question framed). Unblocks: E-3-T2.
- **E-3-T2** · Hat **FEATURE** *(apply chosen RBAC guard — remediation to parity, flag-gated)* OR record acceptance · Model **Sonnet** · Confidence Med · **GATED on the architect's RBAC-parity policy (gate 4)**
  Goal: Apply the architect-decided role guard to `/ops/*` (shell-level and/or per-tab) with routing/role tests, OR record the explicit architect acceptance of authenticated-only with rationale in the security review. Apply any security-mandated confirm step only if the architect rules it security (else it stays a designer note).
  TDD: role-gate routing tests first (each role → allowed/blocked tabs per the decision; parity with the legacy peer asserted) → implement → e2e regression suite (13 specs) stays green under the flag-on profile.
  Pull Gate (BLOCKING): the RBAC-parity policy decision (gate 4); `RequireRole` semantics (pin 3); flag-gated (no legacy regression).
  Hand-off: `ops-security-review.md` finalized (decision + implementation/acceptance recorded — feeds E-5 runbook §security-rbac + E-6-T0). Unblocks: E-5-T1, E-6-T0, END OF STORY SEQUENCE.

### Story E-4 — TD servicing decisions (no invisible debt)
**As an** engineering lead **I want** every debt item accrued across A–D entered and given a servicing decision **so that** the initiative closes with no invisible debt and the architect can weigh each shortcut explicitly.

Business Value 2 · Priority 4 · Size **M** · DoR: **gated** — the servicing DECISIONS are architect calls (gates 5/6/7 below); the CONSOLIDATION of text-recorded debt into `debt-register.md` is unblocked. INVEST all ✓
INVEST note: valuable (closes the "awaiting a free debt-register" loop that every A–D retro left open), testable (each item has a written disposition).

**AC (Gherkin):**
- Given the debt items recorded as TEXT in the A/B/C/D retros ("debt candidates awaiting a free `debt-register.md`"), When E-4 completes, Then each is either a numbered entry in `debt-register.md` with a servicing decision (fix-now / schedule-with-trigger / accept-with-owner) or explicitly folded into an existing TD — the "no invisible debt" rule is satisfied for the whole initiative.
- Given the pre-existing ACTIVE ops TDs, When serviced, Then each carries a decision: **TD-23** (`ui/Btn` vs `ui/Button` — never imported into ops) — keep-avoiding or consolidate; **TD-24** (Event/Contract `@deprecated` fields — ops consumes `platforms[]`/`BroadcastSlot`) — accept-with-guard; **TD-25** (`Event.participants` free text — Registry LINKED uses repo relations) — accept-with-guard; **TD-27** (build-time flag) — the runtime-flag decision (gate 5). (Note: **TD-26** — light-theme AA-derived values — is already SETTLED (signed off 2026-07-02), so E-4 does NOT re-open it; the accrued items in AC-1 are the "TD-26/27 + others" the outline meant.)
- Given the parked architect decisions, Then each is surfaced for a servicing call: **ADR-014 tab-param-carry** (gate 6), **backend `broadcastSlots.ts` inclusive-`lte`** (gate 7), and the D-3-T0 `assertPending` Rule-of-Three helper (now MET — 3× inline guard), the `ReviewTab` temporary export removal (→ E-6), the `STATUS_COLOR`/`DOT_COLOR`/`BAND_COLOR` token-map Rule-of-Two watches, the bare-array unbounded fetches (→ E-1 gate 3).
- Given a HIGH-severity item, Then it MUST carry a servicing decision before the epic closes (HARDENING DoD); a LOW item may be accepted-with-owner.
- Alt: an item that turns out to be a real latent BUG (not just debt) is escalated separately, not buried as "accepted debt" (the D-2 `9500% match` precedent — bugs get fixed, not accepted).

**Pinned decisions:**
1. *Consolidate before deciding:* every text-recorded candidate is WRITTEN into `debt-register.md` (numbered) before a disposition is attached — the register has had uncommitted parallel-session edits all initiative; E-4 is the reconciliation point (do this when the register is free, per the retros' own instruction).
2. *Decision taxonomy:* fix-now (cheap + risky-if-left) / schedule-with-trigger (Rule-of-Three-style: "extract at the Nth", "fix at cutover") / accept-with-owner (documented residual). No item leaves E-4 as "candidate".
3. *Architect-gated items are SURFACED with a recommendation, decided by the architect:* TD-27 runtime-flag (gate 5), ADR-014 tab-param-carry (gate 6), broadcastSlots `lte` (gate 7). E-4 frames each with cost + recommendation; the architect rules.
4. *Cutover-coupled items point to E-6:* `ReviewTab` export removal and the full ImportView reconciliation are cutover-scoped — E-4 records the servicing decision as "at E-6 cutover", it does not remove them here.
5. *Verify before servicing:* re-confirm each pre-existing TD against code before writing a disposition (TD-24/25 guards may already be enforced by the sanctioned-accessor rule — check, don't assume).

**Interfaces:** none (governance task). Output = `docs/governance/debt-register.md` updates (numbered entries + dispositions) — the one file the whole initiative deferred. (This backlog task DESCRIBES that servicing; the register edit happens at execution time, not in this expansion.)

- **E-4-T1** · Hat **PREPARATORY** *(governance consolidation — no production code)* · Model **Opus** (servicing judgment + architect-gate framing) · Confidence Med
  Goal: Consolidate every text-recorded A–D debt candidate + the ACTIVE ops TDs into `debt-register.md` with a servicing decision each (pins 1–2); re-verify each against code (pin 5); frame gates 5/6/7 with cost + recommendation for the architect (pin 3); point cutover-coupled items at E-6 (pin 4); escalate any latent-bug-not-debt separately (AC-alt).
  Verification order: enumerate from the four retros → write each into the register → re-verify against code → attach disposition (or frame as a gate) → confirm no HIGH item is left undecided.
  Pull Gate: the A/B/C/D retro debt lists (the source index); `debt-register.md` current TD-23..29 state (TD-26 already SETTLED — do not re-open); `src/flags.ts` (TD-27), `App.tsx` (ADR-014), `backend/src/routes/broadcastSlots.ts` (gate 7) for re-verification.
  Hand-off: serviced `debt-register.md` + the three architect gate frames (feeds E-5 rollout §TD-27, E-6-T0 cutover). Unblocks: E-5-T1, E-6-T0, END OF STORY SEQUENCE.

### Story E-5 — Runbook completion + `opsRedesign` flag rollout plan
**As an** on-call operator **I want** a complete ops runbook and an honest flag-rollout plan **so that** enabling, verifying, and rolling back the redesign is a documented procedure, not tribal knowledge.

Business Value 2 · Priority 3 · Size **S→M** · DoR: **READY (conditional)** — consumes E-1 (SLO results), E-3 (RBAC decision), E-4 (TD-27 runtime-flag decision); the runbook prose is unblocked but the rollout plan cannot be honest until those land. INVEST all ✓

**AC (Gherkin):**
- Given `docs/runbooks/ops-shell.md` (all 5 screen sections exist post-D), When E-5 completes, Then it gains §performance (E-1 SLO table + known ceilings), §accessibility (E-2 posture + any residual), §security-rbac (E-3 role posture), and §rollout.
- Given the rollout plan, Then it states the `opsRedesign` enablement procedure HONESTLY against TD-27: `VITE_OPS_REDESIGN` is build-time → enabling AND rolling back = env change + REDEPLOY (no runtime kill-switch unless gate 5 added one); if gate 5 added a runtime override, the plan documents that path instead.
- Given the rollout plan, Then it defines the go/no-go criteria (E-1 SLOs PASS or accepted, E-2 a11y clear, E-3 RBAC decided, E-4 debt serviced, E-6 cutover ADR accepted) and the staged sequence (internal → pilot roles per E-3 → wider), with the rollback step at each stage.
- Given a symptom, Then the existing symptom tables (per screen) are complete and cross-referenced (blank `/ops` → flag/chunk; wrong statuses → selectors; theme stuck → localStorage; create/decision fails → the gate-pinned contracts; slow at volume → the E-1 ceilings).
- Alt: if an SLO is an accepted FAIL (gate 2 outcome), the runbook §performance records it as a KNOWN LIMITATION with the operating envelope, not omitted.

**Pinned decisions:**
1. *Honest against TD-27:* the rollout plan does NOT pretend a runtime kill-switch exists unless gate 5 created one — rollback = REDEPLOY is stated plainly (A-5/C-7/D-4 runbook precedent).
2. *Consumes, does not decide:* E-5 folds in E-1/E-3/E-4 OUTCOMES; it raises no new gates (if a consumed decision is still open, E-5 records the dependency, not a guess).
3. *Go/no-go is a checklist, not a date:* criteria are the E-1..E-4 + E-6 exit states, never a calendar mapping (Core — no story-to-days).
4. *Runbook is the single ops artifact:* extend `ops-shell.md`, do not fork a second runbook (A-5 set the precedent that ops runbooks live here).

**Interfaces:** none. Output = completed `docs/runbooks/ops-shell.md`.

- **E-5-T1** · Hat **VERIFICATION** *(documentation consolidation — no production code)* · Model **Sonnet** · Confidence High
  Goal: Complete `ops-shell.md` — add §performance (E-1), §accessibility (E-2), §security-rbac (E-3), §rollout (staged plan + go/no-go checklist + honest TD-27 rollback); verify the per-screen symptom tables are complete; record any accepted-FAIL SLO as a known limitation (pins 1–4).
  Verification order: gather E-1/E-2/E-3/E-4 outputs → draft each new section → cross-check every symptom against the shipped screens/contracts → the go/no-go checklist mirrors the E-1..E-6 exit states.
  Pull Gate: `docs/ops-perf-verification.md` (E-1), `ops-a11y-audit.md` (E-2), `ops-security-review.md` (E-3), the serviced `debt-register.md` TD-27 decision (E-4); `src/flags.ts` (build-time constraint wording).
  Hand-off: complete runbook (feeds E-6-T0 cutover ADR — the rollout plan is an ADR input). Unblocks: E-6-T0, END OF STORY SEQUENCE.

### Story E-6 — Cutover ADR + ImportView.ReviewTab migration (the headline architect decision)
**As an** architect **I want** a decided cutover strategy (replace legacy routes vs coexist) and the deferred ImportView.ReviewTab migration resolved **so that** the org has one path off the legacy screens and the temporary D-2-T0 scaffolding is retired.

Business Value 3 · Priority 5 · Size **L** · DoR: **gated** — E-6-T0 IS the architect decision (gate 1, the headline); it cannot be pre-decided, and E-6-T1 is entirely conditional on its ruling + on E-1..E-5 clearing. INVEST all ✓

**AC (Gherkin):**
- Given all of E-1..E-5 evidence (SLOs measured, a11y clear, security/RBAC decided, debt serviced, runbook + rollout complete), When E-6-T0 convenes, Then ADR-016 is written and accepted: REPLACE legacy routes (flip `opsRedesign` default ON + deprecate ScheduleView/PlannerView/ContractsView/TeamsView/ImportView per screen) vs COEXIST (both run behind the flag indefinitely) — with the per-screen cutover sequence and the flag-flip criteria.
- Given the SYNC↔ImportView overlap specifically, Then ADR-016 scopes the ImportView reconciliation: SYNC v1 surfaced job-health + event merge-review; ImportView still owns the `ignore` decision, dead-letters, sources config, aliases, provenance — the ADR decides whether these migrate to SYNC, stay in a slimmed ImportView, or block cutover (D retro honest-deferral).
- Given the D-2-T0 deferral, Then the ADR resolves the `ImportView.ReviewTab` → shared merge-selector migration: E-6-T1 migrates ReviewTab's remaining behavior onto the SyncScreen path (or the ADR-scoped subset) AND removes the temporary `ReviewTab` export (VERIFIED still present: `src/pages/ImportView.tsx:472 export function ReviewTab()` + its characterization test `ImportView.reviewtab.test.tsx`) — the D retro's "remove it with the legacy screen at the EPIC E cutover" item is closed here.
- Given the migration, When it lands, Then the full e2e regression suite (13 specs, two flag profiles) stays green and no legacy behavior is silently dropped (the ADR's deprecation list is explicit).
- Alt: if E-6-T0 rules COEXIST (no replacement now), Then E-6-T1 is reduced to the minimum debt-closing move — remove the temporary `ReviewTab` export by pointing legacy ReviewTab at the shared selector directly (retiring the scaffold without a full migration) — and the broader reconciliation is re-parked with an owner.

**Pinned decisions:**
1. **Cutover strategy is the architect's (gate 1):** the backlog SURFACES replace-vs-coexist with the E-1..E-5 evidence and the ADR-012 "legacy untouched" stance it revisits; it does NOT choose. This is product direction + blast-radius, not an engineering pick.
2. *ReviewTab export is DEBT to retire regardless (D retro):* the temporary additive export existed only for the D-2-T0 characterization; even under COEXIST it should be retired by pointing legacy at the shared `deriveMergeCard`/`mergeConfidencePercent` — E-6-T1 does at least this (AC-alt), the debt-closing floor.
3. *ImportView reconciliation scope is ADR output, not assumed:* whether `ignore`/dead-letters/sources/aliases/provenance migrate to SYNC is decided in E-6-T0; E-6-T1 implements exactly the ADR's scope — no scope creep into a full ImportView rewrite (anti-scope-creep guardrail).
4. *Cutover is LAST:* E-6 runs only after E-1 (perf), E-2 (a11y), E-3 (security/RBAC), E-4 (debt), E-5 (runbook/rollout) — you flip the default only once the redesign is verified equivalent-or-better on every axis. The DAG enforces this convergence.
5. *Two Hats on the migration:* E-6-T1 is the ONE FEATURE task; any pure refactor discovered mid-migration (e.g. finishing the `deriveMergeCard` unification) is a separate PREPARATORY commit, never mixed (Core §5 / the initiative's clean-commit record).

**Interfaces:** `docs/governance/adr/ADR-016-ops-cutover.md` (NEW — E-6-T0 deliverable). E-6-T1 touches `src/pages/ImportView.tsx` (remove the temporary export; migrate ReviewTab onto the shared selector) + possibly `SyncScreen`/`syncSelectors.ts` per the ADR scope — the FIRST intentional legacy-screen edit of the initiative (ADR-012's "untouched" stance ends here, by ADR-016).

- **E-6-T0** · Hat **VERIFICATION** *(architect decision session — produces the ADR, no production code)* · Model **Opus** (architecture/product judgment) · Confidence Med · **GATED — this IS architect gate 1 (the headline)**
  Goal: Convene the cutover decision on the E-1..E-5 evidence; write + accept ADR-016 (replace vs coexist, per-screen sequence, flag-flip criteria, ImportView-reconciliation scope, ReviewTab-export retirement plan).
  Verification order: assemble the E-1..E-5 exit states → frame replace-vs-coexist with blast radius + rollback → architect decides → ADR-016 records the decision + the E-6-T1 scope.
  Pull Gate (BLOCKING): E-1 SLOs measured (perf verification), E-2 a11y-clear, E-3 RBAC decided, E-4 debt serviced, E-5 runbook/rollout complete — the ADR needs all five as inputs; ADR-012 (the stance being revisited).
  Hand-off: **ADR-016** (accepted) with the E-6-T1 scope. Unblocks: E-6-T1.
- **E-6-T1** · Hat **FEATURE** *(ReviewTab migration + scaffold removal — the ONE feature task)* · Model **Sonnet** (spec) / review **Opus** (legacy-behavior-preservation contract) · Confidence Med · **CONDITIONAL on ADR-016 scope**
  Goal: Execute the ADR-016 migration scope: migrate `ImportView.ReviewTab`'s remaining behavior onto the SyncScreen/shared-selector path (or the ADR subset) and REMOVE the temporary `ReviewTab` export + its now-redundant characterization test (`ImportView.reviewtab.test.tsx`); under COEXIST, at minimum retire the export by pointing legacy at the shared selector (AC-alt). Apply the per-screen deprecation the ADR mandates (route changes / flag-default flip) if REPLACE.
  TDD: characterization tests pinning ReviewTab's current shipped behavior BEFORE any move (byte-stable — D-2-T0 idiom) → migrate → the full 13-spec e2e regression (two flag profiles) stays green → the ADR's deprecation list is asserted (removed routes redirect, no orphaned behavior).
  Pull Gate (BLOCKING): ADR-016 scope; `src/pages/ImportView.tsx:472` ReviewTab export + `ImportView.reviewtab.test.tsx` (the scaffold to retire); `syncSelectors.ts` shared derivation (`deriveMergeCard`/`mergeConfidencePercent`); the E-3 RBAC guards on `/ops/*` (cutover must not drop a legacy authorization — E-3 parity is a cutover precondition).
  Hand-off: retired scaffold + executed cutover scope; ADR-016 marked implemented. Unblocks: **EPIC E RETRO** (Phase Summary + final Architecture Memory update + initiative close per BB §10), END OF STORY SEQUENCE.

### EPIC E — Expansion validator note (BB v5.1 §9, HARDENING level, run 2026-07-09)

- **Structure/DAG:** E-1-T0 → E-1-T1; E-2-T1 → {E-2-T2, E-2-T3}; E-3-T1 → E-3-T2; E-4-T1 (standalone, architect-gated); then E-1-T1 + E-2-T2/T3 + E-3-T2 + E-4-T1 → E-5-T1 → E-6-T0 → E-6-T1 → EPIC E RETRO. The whole epic CONVERGES on E-6 (cutover is last — validator pin: no cutover task unblocks a verification task; DAG is acyclic and funnel-shaped). Every task has Hat, Model, verification/TDD order, Pull Gate, Unblocks. ✓
- **HARDENING conformance (BB §10 table):** no new feature STORIES — the only FEATURE tasks are E-2-T2 (a11y remediation, flag-gated), E-3-T2 (RBAC parity, flag-gated) and E-6-T1 (cutover migration) — each is remediation/parity/cutover, not new capability; the rest are VERIFICATION (analysis) or PREPARATORY (extraction/governance). Glossary FROZEN (§4 untouched). Every HIGH TD item gets a servicing decision (E-4 DoD). Pull gates verify rollback (E-5 §rollout, E-6 flag-flip). ✓
- **SLO-verified (HARDENING validator addition):** E-1 measures all 9 consolidated SLOs against their EPIC-header targets; unmeasured is retired as a phrase; misses are architect gates, not silent passes. ✓
- **Glossary:** no new domain terms; only process labels (SLO verdict, servicing decision, cutover) — consistent with §4 frozen. ✓
- **Anti-bureaucracy (Core §5.3):** each task spec is shorter than its expected artifact (largest: E-6-T1 migration + regression; the audits E-1-T1/E-2-T1/E-3-T1 produce tables longer than their card). No task over-decomposed — E-1 kept as measure-all-SLOs (one rig, one report) rather than 9 micro-tasks; E-4 kept as one servicing pass (the items always change the same register together). The clickable-row a11y fix is a Rule-of-Three EXTRACTION (4 occurrences), not four copies (Core §5). ✓
- **Architect gates surfaced, not decided:** 7 gates flagged (cutover strategy [headline], any-SLO-miss, pagination, RBAC parity, TD-27 runtime-flag, ADR-014 tab-param-carry, broadcastSlots `lte`) — each framed with options/cost, none pre-decided by the backlog. AS-4 threshold formulas explicitly kept OUT (domain-gaps track). ✓
- **Honest deferrals:** the full ImportView reconciliation (ignore/dead-letters/sources/aliases/provenance) is scoped BY the E-6 ADR, not assumed; ReviewTab-export retirement is the debt-closing floor even under COEXIST; TD-26 noted as already SETTLED (not re-opened); RLS/tenant isolation left to the mitigation-plan track. ✓

---

## 8. Roadmap EPICs (outline only — expand after EPIC A/B retros, per BB §1 depth rule)

### EPIC C — REGISTRY (sports CMS surface)
Expanded 2026-07-05, **COMPLETE 2026-07-06 (retro above)** — see §EPIC C detailed section.

### EPIC D — SYNC (import health + merge review)
**Expanded 2026-07-06 — see §EPIC D detailed section.** Pure UI over existing `backend/src/routes/import/*` (read paths need NO backend change: jobs list already embeds `_count.deadLetters`). Stories: D-1 sync selectors + data hook + job cards + SyncScreen shell · D-2 merge review cards (Rule-of-Three selector extraction + INCOMING/CURRENT diff table) · D-3 merge decisions (APPROVE MERGE→`approve-merge` / KEEP SEPARATE→`create-new`, single-flight; **AS-7 REFUTED — no server-side idempotency guard, conditional backend D-3-T0**) · D-4 smoke test. The existing `ImportView` Review tab is occurrence #1 for the merge derivation → D-2-T0 EXTRACTS the shared selector (ADR-012 legacy-untouched tension pinned as a gate call).

### EPIC E — HARDENING + cutover (Mode: HARDENING)
**Expanded 2026-07-09 — see §EPIC E detailed section.** No new features; verification, QA, TD servicing, and the cutover decision. Stories: E-1 perf verification vs all 9 consolidated SLOs (numeric thresholds; unbounded bare-array fetch ceilings) · E-2 a11y + light-theme QA across all 5 screens (clickable-`<div>` keyboard a11y as a Rule-of-Three extraction; A-1-T3 contrast follow-ups; accrued designer notes) · E-3 security review (STRIDE re-check on registry-create + merge-decision write paths; **RBAC parity — `/ops/*` is authenticated-only vs legacy `RequireRole` peers, VERIFIED gap, architect policy gate**) · E-4 TD servicing decisions (TD-23/24/25/27 + accrued retro debt; TD-26 already SETTLED; architect gates: TD-27 runtime-flag, ADR-014 tab-param-carry, backend `broadcastSlots` `lte`) · E-5 runbook completion + `opsRedesign` rollout plan (honest against TD-27 REDEPLOY-rollback) · E-6 **ADR-016: old-screen deprecation/cutover** (HEADLINE architect gate — replace routes vs coexist; INCLUDES the `ImportView.ReviewTab` → shared merge-selector migration + temporary-export removal D-2-T0 deferred). 7 architect gates surfaced; DAG funnels on E-6 (cutover last).

---

## 9. Validator Summary (BB v5.1 §9 — DELIVERY level)

- **Structure:** Dependencies form a DAG (A-1 ∥ start → A-2 → A-3 → A-4 → A-5; B-1/B-3 independent after A; verified no cycles). EPIC 1 is a tracer bullet ✓. Every task has Unblocks + Pull Gate ✓. Token budgets: largest task (A-3-T2) est. well under 15k output; no task > 1,500 LOC ✓.
- **Quality:** All stories pass DoR or carry an explicit gate (A-1/A-2 gated on ADR sign-off — marked READY-after-confirm). Every task declares one Hat; no mixed tasks ✓. TDD order explicit in every task ✓. Glossary enforced (Rundown vs PLANNER collision resolved) ✓. ADRs raised for all cross-cutting decisions ✓.
- **Testing:** Critical logic (selectors, layout math, theme persistence) unit-tested first; E2E smoke per EPIC (A-5, B-4) ✓. No schema changes in A/B (no migrations needed) ✓. External integration = existing internal APIs (contract shapes pull-gated) ✓.
- **Risk & Debt:** All Med risks mitigated; AS-1 High-impact assumption has an owner + blocking gate ✓. No PII in scope for A/B (person data arrives in EPIC C — anonymised fixtures required there, noted) ✓. TD-23/24/25 recorded ✓.
- **Operations:** SLOs per EPIC ✓. Runbook per EPIC ✓. `opsRedesign` flag on all user-facing work ✓. Write paths in A/B: theme preference only (local, idempotent); registry/merge writes deferred to C/D with idempotency noted ✓.
- **Economics:** Anti-bureaucracy check — task specs are shorter than expected implementations; A-1-T3 (audit) and B-2-T1 (pills) are the smallest tasks and still exceed DoR/DoD overhead ✓. Story A-3 kept as one story (selectors + table always change together — Core §5.4). No premature extraction: merge-candidate re-skin in EPIC D is the designated Rule-of-Three extraction point ✓.

**VERDICT: VALID — ADR-012/013/014 accepted 2026-07-02; EPIC A is fully READY for execution.**

---

## 10. How to execute with the ClaudeExtras toolkit

1. ~~**Architect (you):** confirm ADR-012/013/014 (§2).~~ ✅ Done 2026-07-02 — A-1/A-2 DoR fully READY.
2. **Per task, use `gpm-partner` agent** (`gpm-partner-agent-v2.md`): each task above maps 1:1 to a GPM prompt — component tasks are **ZAPs** (use GPM §4 ZAP template; the task's Goal/Interfaces/AC fill Requirements/Contract/Test Expectations), shell/route wiring is a **CIP**, and any restructuring discovered mid-flight becomes a **PREP** (never mixed into a FEATURE task). The agent runs DoR check → pull gate → TDD → DoD check → Contract Snapshot per its spec.
3. **Model routing** (Core §6): annotations per task above — Sonnet-class for all generation tasks, Opus-class review on A-3-T1 threshold logic and all retro/refinement sessions, Haiku-class for A-1-T3-style checklist verification and DoD checks.
4. **After each EPIC:** run the BB §10 retro — Phase Summary, updated Architecture Memory (§6), waste/cycle data, mode check — then expand the next roadmap EPIC (C after A/B) with `backlog-builder`.
5. **Optional pre-flight:** run `current-state-evaluator` scoped to `src/components/ui/` + `src/styles/` before A-1 if you want a deeper read on TD-23 (Btn/Button) and token hygiene before building on them.

**Suggested first session:** confirm ADRs → branch `feature/A-1-ops-theme-tokens` → gpm-partner executes A-1-T1 as a ZAP.
