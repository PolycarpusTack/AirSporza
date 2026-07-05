# Planza "Ops" Redesign — Development Backlog v1

> **Generated per:** `C:\Projects\ClaudeExtras\core` framework —
> `core-specification-v1.md` (modes, DoD, economics) · `backlog-builder-v5.1.md` (templates, validator) ·
> `backlog-builder-agent-v2.md` (workflow) · `gpm-v2.1.md` (ZAP/CIP/PREP execution)
> **Solution design:** `docs/design_handoff_planza_ops/README.md` + `Planza App.dc.html` + screenshots
> **Current-state baseline:** codebase survey 2026-07-02 (see §6 Architecture Memory delta)
> **Status:** v1 — EPICs A, B & C detailed (EPIC C expanded 2026-07-05 after the EPIC B retro); EPICs D–E outlined, expand after the EPIC C retro (BB v5.1 §10)

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
| AS-7 | Merge decisions call existing endpoints (`approve-merge` / `ignore`); idempotency handled server-side per existing routes | D | EPIC D pull gate |
| AS-8 (added 2026-07-04, B-3 re-gate) | The rights matrix ON-DEM column is RESERVED: real `Contract.platforms[]` has no value distinct from `'on-demand'`→MAX (legacy `maxRights` lineage), and the design demo never lights ON-DEM. It lights only when the domain model distinguishes a non-MAX on-demand right (candidate source: RightsPolicy `Platform` SVOD/AVOD) | B-3 display honesty | AS-4 threshold/stakeholder session (same venue) |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza Ops Redesign
Updated: 2026-07-04 (EPIC B retro)

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
                       matrix/tiles/validityProgress/Band); linkedRecords still planned
                       (EPIC C scope)
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
  RegistryScreen:      search/facets/table/inspector/create modal — planned (placeholder)
  SyncScreen:          job cards + merge review queue — planned (placeholder)

Components (existing, consumed — do not modify):
  AppProvider (events/sports/competitions + socket), services/* (27 APIs),
  utils/crewConflicts.ts (FIXED twice by ops work: parseEventWindow ISO-datetime bug had
  conflict detection silently OFF for API-loaded data, A-3-T1; display-string variant of
  the same defect, A-4-T0), backend/src/routes/import/*, teamsApi/playersApi

Key ADRs: ADR-012 shell strategy · ADR-013 theming · ADR-014 deep-linking (all Accepted 2026-07-02, docs/governance/adr/)

Contract snapshots (docs/governance/contracts/): ops-tokens v3 · useOpsTheme v1 ·
OpsShell v1 · ops-selection v1 · ops-selectors v3 · EventInspector v1 (amended) ·
ops-e2e v1 (amended) · rundown-layout v1 · useContracts v1

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

Current Mode: DELIVERY (retained at EPIC A retro 2026-07-03 and EPIC B retro 2026-07-04 —
EPIC C brings the first new write paths, full governance stays)
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

---

## 8. Roadmap EPICs (outline only — expand after EPIC A/B retros, per BB §1 depth rule)

### EPIC C — REGISTRY (sports CMS surface)
Expanded 2026-07-05 — see §EPIC C above (detailed section after the EPIC B retro).

### EPIC D — SYNC (import health + merge review)
Pure UI over existing `backend/src/routes/import/*`.
Stories (draft): D-1 job cards (`GET /jobs` + dead-letter counts; status dot semantics) · D-2 merge review cards (`GET /merge-candidates`, diff table with amber changed-fields, confidence badge ≥90 green) · D-3 merge decisions (`approve-merge` / `ignore` endpoints, optimistic status line, tab badge count live via socket or refetch; **idempotency** AS-7) · D-4 smoke test.
Note: existing `ImportView` Review tab already implements this flow — D-2/D-3 are a re-skin + relocation; Abstraction Check must evaluate extracting shared merge-candidate logic instead of duplicating (Core §5.5 Rule of Three: this IS the second occurrence → extract).

### EPIC E — HARDENING + cutover decision (Mode: HARDENING)
No new features. Stories (draft): E-1 perf verification vs all SLOs (numeric thresholds) · E-2 a11y + light-theme QA across all 5 screens (contrast audit follow-ups from A-1-T3) · E-3 security review (STRIDE re-check: registry create is the only new write path besides merge decisions; RBAC parity with old screens) · E-4 TD servicing decisions (TD-23/24/25 + any accrued) · E-5 runbook completion + `opsRedesign` flag rollout plan · E-6 **ADR: old-screen deprecation/cutover** (Architect decision — replace routes, or keep both).

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
