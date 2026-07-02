# Planza "Ops" Redesign — Development Backlog v1

> **Generated per:** `C:\Projects\ClaudeExtras\core` framework —
> `core-specification-v1.md` (modes, DoD, economics) · `backlog-builder-v5.1.md` (templates, validator) ·
> `backlog-builder-agent-v2.md` (workflow) · `gpm-v2.1.md` (ZAP/CIP/PREP execution)
> **Solution design:** `docs/design_handoff_planza_ops/README.md` + `Planza App.dc.html` + screenshots
> **Current-state baseline:** codebase survey 2026-07-02 (see §6 Architecture Memory delta)
> **Status:** v1 — EPICs A & B detailed; EPICs C–E outlined, expand after EPIC A retro (BB v5.1 §10)

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
| AS-3 | Rundown lane channel comes from the event's `BroadcastSlot.channelId` (fallback: deprecated `Event.channel`); Eén/Canvas/VRT MAX exist in `channels` service | B-1 | Check slot coverage in seed/prod data during B-1 pull gate; SPIKE if <90% coverage |
| AS-4 ◐ provisional | Contract → Rights Status mapping: `EXPIRING` = `validUntil` within 90 days; `NEGOTIATION` = contract status field; `MISSING` = no contract for competition. **Stakeholder decision 2026-07-02: build A-3 with these standard formulas; contract start/end time/date formulas to be revisited in a dedicated session.** Mitigation: thresholds live in ONE place (`ops/selectors`, single source for the 90-day rule per B-3-T1 Abstraction Check) so the revisit is a cheap, test-pinned change | A-3 | Dedicated threshold-formula session (post-A-3) |
| AS-5 | "Performer" and "Staff" Kinds map to existing person-entities where present; if absent, Registry v1 ships with sports/competitions/teams/players only and performers/staff are an EPIC C follow-up story | C scope | EPIC C refinement |
| AS-6 | IBM Plex Sans/Mono already loaded (survey: configured in tailwind fonts) — no new font pipeline | A-1 | Trivial |
| AS-7 | Merge decisions call existing endpoints (`approve-merge` / `ignore`); idempotency handled server-side per existing routes | D | EPIC D pull gate |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza Ops Redesign
Updated: 2026-07-02

Components (new):
  OpsShell:            chrome + tabs + theme toggle + flag gate — planned
  OpsThemeProvider:    data-theme switch + persistence — planned
  ScheduleScreen:      facet rail + day-grouped event table — planned
  EventInspector:      shared inspector (Schedule + Rundown) — planned
  RundownScreen:       channel lanes + positioned blocks — planned
  RightsScreen:        stat tiles + rights matrix — planned
  RegistryScreen:      search/facets/table/inspector/create modal — planned
  SyncScreen:          job cards + merge review queue — planned
  ops/selectors:       pure derived-status functions (rightsStatus, crewHealth,
                       lanePosition, validityProgress, linkedRecords) — planned

Components (existing, consumed — do not modify):
  AppProvider (events/sports/competitions + socket), services/* (27 APIs),
  utils/crewConflicts.ts, backend/src/routes/import/*, teamsApi/playersApi

Key ADRs: ADR-012 shell strategy · ADR-013 theming · ADR-014 deep-linking (all Accepted 2026-07-02, docs/governance/adr/)

Active TD (pre-existing, relevant):
  TD-23: ui/Btn.tsx vs ui/Button.tsx duplication — do NOT import either into ops/ until consolidated
  TD-24: Event/Contract @deprecated fields (channel, duration, boolean rights) — ops code must
         consume platforms[] and BroadcastSlot, never the deprecated fields
  TD-25: Event.participants is free text — Registry LINKED uses repo relations, not participants

Current Mode: DELIVERY
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
- **A-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `EventInspector` component per README §1 inspector spec, consuming `ops-selectors v1` + `ops-selection v1`; conflict callout wired to `groupConflictsByPerson`.
  TDD: render-state tests first (each section per fixture permutation).
  Pull Gate: snapshots above; verify tech-plan chips shape vs `techPlans` service.
  Hand-off: Contract Snapshot `EventInspector v1` (props) — reused by Rundown in B-1.
  Unblocks: A-5-T1, B-1-T2, END OF STORY SEQUENCE.

---

### Story A-5 — EPIC A smoke test + runbook
**As a** reviewer **I want** an E2E smoke test and a runbook **so that** the tracer bullet is verifiably deployable and rollbackable.

Size **S** · DoR: **READY**

- **A-5-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: E2E (existing e2e stack): flag ON → visit `/ops` → schedule renders fixture week → click facet → click row → inspector shows conflict callout → toggle theme → reload → light persists → flag OFF → `/ops` redirects. Write `docs/runbooks/ops-shell.md`.
  Unblocks: **EPIC A RETRO** (Phase Summary + Architecture Memory update + mode check per BB §10), END OF STORY SEQUENCE.

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

### Story B-1 — Rundown lanes + positioned blocks
**As a** channel manager **I want** one timeline lane per channel with positioned event blocks **so that** I see each channel's day rundown and collisions instantly.

Business Value 3 · Priority 4 · Size **L** · DoR: **READY** (pull gate AS-3) · INVEST all ✓

**AC:**
- Given events on the selected day, Then each renders in its channel's lane at `left=(startMin−300)/1140`, `width=max(duration,80)/1140` (%), channel color at 15% alpha + 3px left border, two-line content per README §2.
- Given an event before 05:00 or past 24:00, Then the block clamps to the axis and is flagged in a title tooltip (edge AC).
- Given a block is clicked, Then `?event=` updates and the shared `EventInspector` opens (Rundown embeds the inspector, same as Schedule).
- Given the selected event has a crew conflict, Then the block gets a 1px `#E5484D` outline; selected → accent outline.
- Alt: event with no resolvable channel → rendered in an `UNASSIGNED` overflow lane (visible, never dropped) — flagged as data quality signal.

- **B-1-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence Med (AS-3)
  Goal: Pure lane/position selectors: `resolveChannel(event, slots, channels)`, `layoutRundown(events, day): Lane[]` with clamping.
  TDD first: minute-precision positioning table + property test (blocks never overflow axis).
  Pull Gate: **AS-3 data check** — sample events' `BroadcastSlot` coverage; if <90%, stop and raise `SPIKE: channel derivation` (timebox S).
  Hand-off: Contract Snapshot `rundown-layout v1`. Unblocks: B-1-T2.
- **B-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Rundown screen markup: axis ticks, lanes, blocks, legend row, `EventInspector v1` embed.
  TDD: interaction tests (select, outline states, unassigned lane).
  Pull Gate: `rundown-layout v1`, `EventInspector v1`. Unblocks: B-2-T1, END OF STORY SEQUENCE.

### Story B-2 — Day pills + shared day state
**As a** channel manager **I want** MON–SUN day pills with event counts **so that** I move through the week without leaving the rundown.

Size **S** · Priority 3 · DoR: **READY**

- **B-2-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Day pill row (counts, active accent state, right-aligned date label) bound to `useOpsDay` (URL-backed, shared with Schedule's week context).
  TDD: count + navigation tests. Pull Gate: `ops-selection v1`.
  Unblocks: B-4-T1, END OF STORY SEQUENCE.

### Story B-3 — Rights tiles + matrix
**As a** rights manager **I want** contract-health tiles and a competitions × platforms matrix **so that** expiring/missing rights are visible before they bite.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** · INVEST all ✓

**AC:**
- Given all contracts, Then 4 tiles show counts (VALID / EXPIRING ≤90d / IN NEGOTIATION / MISSING = competitions with events but no contract) in semantic colors; counts reconcile with the matrix rows below.
- Given a contract with `platforms[]`, Then LINEAR/MAX/RADIO/ON-DEM cells show accent `●` (has right) or `--t3` `·`.
- Given `validUntil`, Then validity shows `Until <date>` + 3px progress bar: red <15% term remaining, amber <50%, green else; `NO CONTRACT` rows show the red status word and no bar.
- Edge: contract without `validFrom` → bar suppressed, date shown.

- **B-3-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Pure selectors `deriveRightsTiles(contracts, competitions, events)`, `deriveValidityProgress(contract, now)`; extends `ops-selectors v1` (Abstraction Check: reuse `deriveRightsStatus` thresholds — single source for 90-day rule).
  TDD first (threshold boundary table).
  Pull Gate: `platforms[]` values enumerated from real data (map to 4 columns; unknown platforms → logged, not dropped).
  Hand-off: `ops-selectors v2` snapshot. Unblocks: B-3-T2.
- **B-3-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Rights screen markup (tiles grid + matrix grid per README §3).
  TDD: reconciliation test (tiles == matrix aggregation).
  Unblocks: B-4-T1, END OF STORY SEQUENCE.

### Story B-4 — EPIC B smoke test
- **B-4-T1** · Hat **FEATURE** · Model **Sonnet** · Size **S**
  Goal: E2E: schedule → select event → switch to RUNDOWN → same event selected + outlined → switch day via pills → RIGHTS tab → tile counts match seeded contracts. Extend runbook.
  Unblocks: **EPIC B RETRO**, END OF STORY SEQUENCE.

---

## 8. Roadmap EPICs (outline only — expand after EPIC A/B retros, per BB §1 depth rule)

### EPIC C — REGISTRY (sports CMS surface)
The UI side of `docs/teams-players-repository-plan.md` (backend + `teamsApi`/`playersApi` already on main).
Stories (draft): C-1 registry selectors (`linkedRecords` graph: sport→competitions→teams→roster/staff, counts, search/facet compose) · C-2 toolbar + facet rail + table (kind chips, SOURCE/provenance column, STATUS) · C-3 Record Inspector with linked-record hopping + provenance line (`ImportGovernanceService` semantics) · C-4 create modal → `teamsApi`/`playersApi`/`sportsApi` (SOURCE: MANUAL, protected) — **idempotency:** client request key + server unique constraints · C-5 REMARKS (manual note on protected `notes` field) · C-6 performer/staff Kinds (pending AS-5 verification — may become SPIKE) · C-7 smoke test.
Key risk: AS-5 (performer/staff entities may not exist) — resolve in refinement before committing scope.

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
