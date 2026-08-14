# Planza/FM — Development Backlog v1

> **Generated per:** `.claude/frameworks/core-specification-v1.md` (modes, DoD, economics) ·
> `.claude/frameworks/backlog-builder-v5.1.md` (templates, validator) · `.claude/agents/backlog-builder.md` (workflow)
> **Solution design:** `docs/design_handoff_planza_fm/README.md` + `IMPLEMENTATION_PLAN.md` +
> `html/Design Notes.dc.html` + `screenshots/fm-01..09`
> **Structural template:** `docs/backlog-planza-ops-redesign.md` (prior initiative, CLOSED 2026-07-10 — same
> section shape, reused deliberately since ADR-012/013/014 and the whole ops component set are this
> initiative's foundation)
> **Current-state grounding:** codebase survey 2026-08-14 (selectors/components verified against
> `src/components/ops/*`, ADR-012/013/014 re-read, `tokens.css`, `backend/prisma/schema.prisma`,
> `docs/sv3-continue-prompt.md`, `docs/governance/debt-register.md` TD-32 — see §6 Architecture Memory)
> **Status:** v1 — EPIC FM-1 fully detailed, **DoR-READY** (ADR-020 ratified 2026-08-14; all four
> ADR-020/021/022/023 Accepted). EPICs FM-2..FM-5 outlined only, per BB §4 depth rule (≤ 2 EPICs
> initially).

---

## 1. Readiness Decision

**Health Score (BB v5.1 §5):**

| Dimension | Score | Notes |
|---|---|---|
| Clarity | 3/3 | Pixel-level spec matching the ops precedent: tokens, grids, type scale, per-screen interactions and state management are all quantified in the README; `IMPLEMENTATION_PLAN.md` supplies its own phased build order, reuse targets and named risks; `Design Notes.dc.html` supplies an exact current-vs-concept diff per area. |
| Feasibility | 2/3 | EPIC FM-1's dependencies are fully verified this session and real: `EventInspector`, `deriveRightsStatus`/`deriveCrewHealth`/`groupEventsByDay` (`src/components/ops/selectors.ts`), `detectCrewConflicts` (`src/utils/crewConflicts.ts`), `useContracts`, `opsUrlState`, ADR-012/013/014's patterns, and `ripple v1` (SV-2, merged) all exist and match the plan's description. Docked to 2/3 because later phases carry genuine new-build surface not yet designed at interface level: no `bio/facts JSON` field on `Team`/`Player` today (confirmed absent — additive migration needed, EPIC FM-3), no `rundownSegment` model (EPIC FM-4), no crew-availability aggregation endpoint (EPIC FM-4), and a suggestion/undo mechanism stated only as a risk-list sentence, not a design (ADR-021/023 drafted to close this). |
| Completeness | 2/3 | Open questions the design itself names and this backlog resolves via ADR or Assumption: route-family choice (ADR-020), undo scope (ADR-021), standings source (ADR-022), suggestion-engine approach (ADR-023), MARK RESOLVED persistence shape (Assumption AS-2, resolved without a full ADR), and the FM-1↔not-yet-built-screens navigation gap (Assumption AS-3, "interim bridge"). None of these block EPIC FM-1 except ADR-020. |

**Total: 7/9 → PROCEED.** No High risk without mitigation: the plan's own risk list (two-shell period, undo-over-live-APIs, suggestion quality, standings upkeep) is all Medium-with-stated-mitigation, and this backlog turns each stated mitigation into either a Proposed ADR (§2) or a pinned Assumption (§5) rather than leaving it as prose.

Required design sections present (BB v5.1 §11): Business Context ✓ (README overview + `Design Notes.dc.html` §01), Architecture Overview ✓ (maps to existing ops patterns per the plan's "guiding decisions"), Data Models ✓ (README §State Management + existing `schema.prisma`), APIs/Interfaces ✓ (existing `services/*` + the plan's named new endpoints), User Journeys ✓ (README §Interactions & Behavior), Domain Glossary — draft present in the design (`Design Notes.dc.html` build notes use "Action Item"/"CONTINUE" informally); this backlog formalizes it (§4).

STRIDE (light — internal ops tool, no new external-facing surface): the only new *data trust* question is the FEED action-item kind, which reads `RippleProposal` rows — but those already carry SV-2's own creation-time trust handling (advisory rights annotations, tenant isolation, idempotent capture); FM-1 only **reads** them, introducing no new boundary. Standings/reach numbers (EPIC FM-3) are internal, tenant-authenticated, manually-entered data — same trust level as any existing Registry edit, not a new external-data boundary (ADR-022 records this explicitly). No PII newly introduced in EPIC FM-1 (action items reference events/competitions/roles, not individuals beyond names already shown elsewhere in the app).

---

## 2. Critical Gaps → Decisions Needed (ADRs)

| # | Gap | Resolution | Owner |
|---|---|---|---|
| ADR-020 **Accepted** | **Route family / shell strategy** — design mounts FM at `/fm/*` as a third shell beside legacy and `/ops/*`; not licensed by ADR-012 as written (scoped to `/ops/*`). | New parallel flagged shell `FmShell` at `/fm/*`, flag `fmShell` (default OFF), reusing the `OpsShell` lazy-chunk + tab-registry + badge-context pattern verbatim (structurally, not by import — Rule of Three, 2nd occurrence). See `docs/governance/adr/ADR-020-fm-shell-strategy.md`. **Gates Story FM1-2's pull.** | Architect |
| ADR-021 **Accepted** | **Schedule-board undo scope** — the plan states "scope to the session" as a risk mitigation, never ratified. | Client-side inverse-mutation stack, session/tab-scoped, with a concrete stale-refusal rule (never apply an undo whose target drifted since capture). See `docs/governance/adr/ADR-021-fm-schedule-undo-scope.md`. Gates EPIC FM-2's undo/history story — **not** EPIC FM-1 (no mutation paths there). | Architect |
| ADR-022 **Accepted** | **Standings data source** — the plan's own text disagrees with itself ("start manual" vs "optional... until a feed integration exists"). | Manual admin entry v1, card explicitly labeled as manually-maintained with a last-updated line; feed integration deferred until a standings-bearing feed is confirmed to exist (not invented here). See `docs/governance/adr/ADR-022-fm-standings-data-source.md`. Gates EPIC FM-3 — **not** EPIC FM-1. | Architect |
| ADR-023 **Accepted** | **Suggestion-engine approach** — the plan proposes "rules v1" and separately flags misplacement risk; not yet a ratified decision shaping the suggestions endpoint's contract. | Deterministic rules engine (channel load + rights validity + crew availability), read-only endpoint, "never auto-commit" enforced structurally (suggested and manual placement share one mutation code path). See `docs/governance/adr/ADR-023-fm-suggestion-engine-approach.md`. Gates EPIC FM-2 Story 2.1 — **not** EPIC FM-1. | Architect |
| Open | **MARK RESOLVED persistence shape** — how a per-user "acknowledged" state is stored for a Action Item that is itself computed, not stored. | Resolved as **Assumption AS-2** (§5), not a full ADR: a small additive `ActionItemResolution` table (`tenantId, userId, itemKey, resolvedAt`), RLS in the same migration. Small, reversible, non-cross-cutting enough to not warrant architect gating before FM-1 starts — flagged for architect awareness, not blocking. | Backlog / Architect (FYI) |
| Open | **FM-1's navigation targets for screens not yet built** (Schedule board, Team/Athlete profile, etc.) | Resolved as **Assumption AS-3** (§5): the "interim bridge" — FM-1's CTAs and create-modal landings target the existing, stable `/ops/*` URL contract (ADR-014) until EPIC FM-2/FM-3 build native FM screens. | Backlog |
| Open | **Match Day "RUNDOWN" panel vs the Ops "Rundown" screen — a second glossary collision** the design itself doesn't flag. | Formalized in §4 Domain Glossary; code must not reuse the bare `Rundown`/`RundownScreen` symbol for the Match Day per-event segment panel. Gates EPIC FM-4, not FM-1. | Backlog |

---

## 3. Execution Mode (Core §1)

**DELIVERY** for all EPICs in this backlog, per `CLAUDE.md`'s standing declaration for this initiative.

Rationale: FM builds directly on a validated production architecture (the ops redesign's shell/theming/deep-linking/selector patterns, all merged and battle-tested), targets real planners, multi-year lifetime, and — from EPIC FM-2 onward — touches live mutation paths. Per Core §5.1 this is core business UI with a wide blast radius → full governance: TDD on all logic, Two Hats per task, feature flags, TD tracking, pull gates.

Rigor calibration within DELIVERY (Core §5.1, mirrors the ops backlog's own calibration): action-item derivation, the resolution idempotency path, and (from EPIC FM-2) undo/suggestion/rights-recheck logic = **max rigor** (expensive to get wrong, core-domain). Shell chrome, placeholder panels, and static markup = tests at smoke/interaction level, not pixel assertions.

---

## 4. Domain Glossary (Core §2 P3 — enforced in code names)

| Term | Definition |
|---|---|
| **FM Shell** | The FM app chrome: 216px sidebar (section labels OVERVIEW / PLANNING / SPORT / RESOURCES) + 52px top bar (date block, LIVE pill, `+ NEW`, CONTINUE), mounted at `/fm/*`, flag `fmShell` |
| **Screen** | One of FM's 8 destinations (Home, Schedule board, Season calendar, Competitions, Team profile, Athlete profile, Crew, Match Day). **Only Home is built in EPIC FM-1** — the rest render a placeholder panel until their owning EPIC lands |
| **Action Item** | A typed, **derived** (not stored) unit of open risk: `kind ∈ {CONFLICT, RIGHTS, UNPLACED, CREW, FEED}`, computed by `fmActionItems.ts` purely from existing ops selectors plus the `ripple v1` read endpoint; identified by a stable key `${kind}:${entityType}:${entityId}` |
| **Inbox** | The list of Action Items on Home, unresolved-first, resolved items dimmed with a ✓ prefix |
| **CONTINUE loop** | FM's core interaction: a cursor advancing through unresolved Action Items in priority order (`CONFLICT > RIGHTS > UNPLACED > CREW > FEED`), deep-linking each to its target screen with the entity preselected; empty queue → "ALL CLEAR" toast |
| **MARK RESOLVED** | Per-user acknowledgment of an Action Item, persisted in `ActionItemResolution`. It does **not** remove the underlying condition — an item stops being *derived* at all only when its condition is actually fixed elsewhere (e.g. reassigning the double-booked crew member) |
| **KPI Tile** | One of Home's 4 summary buttons (EVENTS THIS WEEK / CREW CONFLICTS / RIGHTS EXPIRING / UNPLACED EVENTS), deep-linking to the first open item of its kind |
| **Unplaced (Event)** | An event with no `channelId` **and** no linked `BroadcastSlot`. An Action Item kind from EPIC FM-1; a Schedule-board tray concept (with placement suggestions) from EPIC FM-2 onward |
| **Interim Bridge** | EPIC FM-1's deliberate, documented navigation choice (Assumption AS-3): Action Item CTAs and create-modal landings target the **existing** `/ops/*` screens via the stable ADR-014 URL contract, because FM's own Schedule board / Team / Athlete / Registry-equivalent screens don't exist until EPIC FM-2/FM-3 |
| **Cascade Banner** | *(EPIC FM-2)* Schedule board's rendering of a pending `RippleProposal` as an accept/undo banner — the first FM UI surface for the `scheduleRipple` flag; depends on EPIC SV's Story SV-3 being pulled (§8 FM-2 outline) |
| **Rights Status / Crew Health** | **REUSED unchanged** from the Ops Domain Glossary (`docs/backlog-planza-ops-redesign.md` §4) — FM introduces no new derivation for these, only new presentation surfaces |
| **Match Day** | *(EPIC FM-4)* Per-event production screen: rundown segments + crew-formation tactics board + resources + distribution |
| **Standings** | *(EPIC FM-3)* Manually-maintained competition league table, per ADR-022 |
| **History / Undo** | *(EPIC FM-2)* Session-scoped inverse-mutation stack, per ADR-021 — no server persistence |

**Synonym / collision flags:**
- **"Home" — no code collision.** The existing landing page is `DashboardView` at `/dashboard` (a different component, different route, different flag). FM's Home does not redesign `DashboardView` in place — it is a parallel concept reached through a different shell, the same relationship the ops redesign had between `ScheduleScreen` (`/ops/schedule`) and the legacy `ScheduleView`. Both coexist through the initiative; retirement is EPIC FM-5.3's call.
- **"Planner" — already resolved by the Ops backlog** (design word "PLANNER" → code term **Rundown**, avoiding collision with the legacy `PlannerView`). Still applies; unaffected by FM.
- **"Rundown" — a SECOND, previously unflagged collision, found this session.** The Ops glossary's "Rundown" means the day-timeline-across-channels **screen**. FM's Match Day design also has a panel labeled "RUNDOWN" meaning a **per-event segment list** (times/sources/durations) — same design word, different granularity, different screen. **Recommendation:** code must not reuse the bare `Rundown`/`RundownScreen` symbol for the Match Day panel; a `rundownSegment` Prisma model name is fine (schema-scoped, unambiguous), but the UI component needs a distinct name (e.g. `MatchSegmentTimeline`) — see EPIC FM-4 outline (§8).

---

## 5. Assumptions Ledger

| ID | Assumption | Impact | Verify by |
|---|---|---|---|
| AS-1 | ADR-020's shell-strategy pattern (parallel flagged `/fm/*` shell, structurally copied from `OpsShell`/`OPS_TABS`/`OpsTabBadgeContext`, not imported) is the correct reuse level — Rule of Three (Core §5.5) says do NOT extract a shared `createFlaggedShell` abstraction at the 2nd occurrence. | FM1-2 | ADR-020 ✓ Accepted |
| AS-2 ◐ resolved (backlog judgment, not an ADR — see §2) | MARK RESOLVED persists via a small additive `ActionItemResolution` table (`tenantId, userId, itemKey, resolvedAt`, unique on the triple, RLS same migration). Resolution is an acknowledgment overlay, never a filter on derivation. | FM1-4 | FM1-4-T0 migration review |
| AS-3 ◐ resolved (backlog judgment) | **Interim bridge:** every FM-1 CTA/create-modal landing targets `/ops/*` (stable ADR-014 URLs), not not-yet-built native FM screens. EPIC FM-2/FM-3 flip these to native FM routes once built — a route-string swap, not a rewrite. | FM1-4, FM1-5, FM1-6 | Pinned by the FM1-7 smoke test (asserts the real `/ops/schedule?event=` landing) |
| AS-4 ✅ verified this session | Space Grotesk / IBM Plex Sans / IBM Plex Mono are already loaded (`index.html` Google Fonts link) and already have token/tailwind aliases (`--font-head`, `--font-display`, `--font-mono`; `tailwind.config.ts` `sans`/`mono`/`head`). No new font pipeline needed — mirrors the ops backlog's AS-6. | FM1-1 | Trivial — grep-confirmed |
| AS-5 ✅ verified this session | FM-1's FEED action-item kind reads the **already-merged, always-live** `GET /api/ripple-proposals` (`ripple v1`, SV-2, PR #27) — independent of the `scheduleRipple` flag's own OFF-by-default posture, since SV-2's read surface ships unconditionally. FM-1 exposes **no** accept/reject (that's EPIC FM-2's Cascade banner, gated on SV-3's pull — see §8 FM-2 outline). This is a real, verified cross-epic dependency for FM-2, **not** a blocker for FM-1. | FM1-3 | Verified against `docs/sv3-continue-prompt.md` + ADR-019 this session |
| AS-6 ✅ verified this session | `Team`/`CanonicalTeam`/`Player` (`backend/prisma/schema.prisma`) have **no** bio/facts JSON field today (`Team.notes`/`Player.notes` are free-text editorial remarks, not structured facts). Adding one is a small additive migration — feasible, but genuinely EPIC FM-3 scope, not needed by FM-1. | FM-3 (not FM-1) | Schema grep this session |
| AS-7 ◐ resolved (scope-tightening judgment) | `--channel-radio1`/`--channel-sporza-app` are **deferred to EPIC FM-2** — Home renders no channel swatches (verified against `fm-01-home.png`); only `--border-shell-soft` is needed for FM-1's inbox row hairlines. Similarly, Phase 0.4's seed-data items (bio/facts JSON, crew availability, standings/fixtures) are **deferred to their consuming EPICs** (FM-3/FM-4) — none of FM-1's Home screen consumes them; adding unused seed fixtures now would be speculative (Core §5.3). | FM1-1, FM-2/3/4 | This session's screenshot review |
| AS-8 | TD-32 (frontend `ApiError` discards structured 409 bodies) stays **explicitly unserviced through EPIC FM-1** — no FM-1 surface consumes a structured 409 (the one write path, resolve, is idempotent-200-only, no conflict state). It becomes real at EPIC FM-2 (channel-reassignment conflicts) — flagged there, not fixed here, per the debt register's own "service with the FIRST UI consumer" rule, which EPIC FM-2 now is. | FM-2 (not FM-1) | `docs/governance/debt-register.md` TD-32 entry, re-read this session |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza/FM
Updated: 2026-08-14 (backlog generation — no execution yet, all components PLANNED)

Components (planned, EPIC FM-1 scope):
  FmShell:           sidebar + top bar + flag gate + placeholder panels — PLANNED (FM1-2;
                      structural copy of OpsShell v1's lazy-chunk + tab-registry + badge-context
                      shape, NOT an import — Rule of Three, 2nd occurrence)
  fmUrlState:         ?inbox=<key> only — PLANNED (FM1-2; sibling to opsUrlState, not an
                      extension of it — same Rule-of-Three reasoning; ?sport/?comp/?team/?person
                      explicitly deferred to the EPICs that consume them)
  fmActionItems:      pure derivation module composing ops/selectors.ts + detectCrewConflicts +
                      ripple v1 read — PLANNED (FM1-3; core-domain, max rigor)
  ActionItemResolution: small additive table + RLS — PLANNED (FM1-4-T0; Assumption AS-2)
  FmHomeScreen:       KPI tiles + inbox + detail pane + resolve wiring — PLANNED (FM1-4)
  FmToast / useContinue: shared toast + CONTINUE cursor — PLANNED (FM1-5)
  FmCreateModal:      kind-tabbed shell around DynamicEventForm + RegistryCreateModal — PLANNED
                      (FM1-6; no new form logic)
  fm-e2e:             Playwright — 2 NEW projects layered on the existing ops-e2e v1 harness
                      (flag-fm-on: VITE_FM_SHELL=true + VITE_OPS_REDESIGN=true; flag-fm-off) —
                      PLANNED (FM1-7)

Components (existing, consumed — do not modify):
  OpsShell / OPS_TABS / OpsTabBadgeContext (src/components/ops/OpsShell.tsx) — pattern reused
  structurally by FmShell, never imported (different shell, different flag, different mount).
  ops/selectors.ts: deriveRightsStatus, deriveCrewHealth, deriveCrewRoles, groupEventsByDay
  (ops-selectors v3) — imported directly by fmActionItems.ts, no threshold logic duplicated.
  utils/crewConflicts.ts: detectCrewConflicts — imported directly.
  useContracts, opsUrlState (NOT extended — fmUrlState is a sibling), EventInspector (structural
  precedent for EPIC FM-2's inspector, not consumed by FM-1), DynamicEventForm,
  RegistryCreateModal (both wrapped, not modified, by FmCreateModal).
  GET /api/ripple-proposals (ripple v1, SV-2, merged PR #27) — read-only consumption by
  fmActionItems.ts's FEED kind; no accept/reject touched by FM-1.

Key ADRs: ADR-020 FM shell/route strategy (**Accepted** 2026-08-14 — gates FM1-2) · ADR-021 undo
  scope (**Accepted** — gates EPIC FM-2, not FM-1) · ADR-022 standings source (**Accepted** —
  gates EPIC FM-3) · ADR-023 suggestion-engine approach (**Accepted** — gates EPIC FM-2 Story 2.1)
  · REUSED as-is:
  ADR-012 shell strategy (precedent, not directly applied — new ADR-020 covers /fm/*), ADR-013
  theming (FM-1 ships dark-only; OpsThemeProvider reuse deferred to EPIC FM-5.2), ADR-014
  deep-linking (the interim-bridge targets ARE ADR-014 URLs, verbatim).

Contract snapshots (planned, docs/governance/contracts/): fm-tokens v1 · FmShell v1 ·
  fmUrlState v1 · fmActionItems v1 · ActionItemResolution v1 · FmHomeScreen v1 · FmToast v1 ·
  useContinue v1 · FmCreateModal v1 · fm-e2e v1.

Active TD (pre-existing, relevant to FM):
  TD-27: build-time-only flags (opsRedesign precedent) — fmShell inherits the same convention
         (VITE_FM_SHELL, explicit string-compare, never z.coerce.boolean); rollback = env change
         + redeploy, stated honestly in FM1-7's runbook.
  TD-32: frontend ApiError discards structured 409 bodies — NOT touched by FM-1 (no structured-409
         consumer yet); becomes live at EPIC FM-2 (channel-reassignment conflicts) — flagged there.
  TD-28: overrunStrategy zod/Prisma drift — partially serviced at SV-3-T1 scope; irrelevant to FM
         unless/until EPIC FM-2's cascade banner touches slot writes (it doesn't — SV-3 owns that).

Current Mode: DELIVERY (declared at initiative start, CLAUDE.md; full governance from EPIC FM-1).
```

---

## 7. Backlog

### Conventions
Branch `feature/[STORY-ID]-slug` · commits `[type]([scope]): summary` · IDs: EPIC `FM-1`/`FM-2`/…,
story `FM1-1`/`FM1-2`/…, task `FM1-1-T1`. (Distinct from the single-letter EPIC convention used by
the ops-redesign and domain-gaps backlogs, since this initiative's EPICs are already named `FM-n`.)
Feature flag for all user-facing work in EPIC FM-1: **`fmShell`** (default OFF, build-time `VITE_FM_SHELL`).
Model routing per Core §6 noted per task (`Opus` = judgment, `Sonnet` = generation from spec, `Haiku` = checklist verification).

### Proposed EPIC sequencing (dependency-ordered)
**FM-1 → FM-2 → FM-3 → FM-4 → FM-5**, following the plan's own phase order at the EPIC granularity.
The plan's own finer-grained solo-dev suggestion ("0 → 1 → 2 → 4.1 → 3 → 4.2 → 5") interleaves Crew
(4.1) ahead of Sports World (3) — this backlog groups Crew+Match Day into one EPIC FM-4 for
Rule-of-Three economics (§8), but flags that interleaving as a call for the EPIC FM-1/FM-2 retro's
mode check (BB §10), not fixed here.

---

## EPIC FM-1 — Foundations + Inbox/CONTINUE Loop (Tracer Bullet)

- **Objective:** A flagged `/fm` shell (default OFF) with one fully working screen — Home: 4 KPI
  tiles, a typed action-item inbox, a detail pane, per-user MARK RESOLVED, the global CONTINUE
  loop, and the create modal — the thin slice proving tokens → shell → derived action-item
  selectors → inbox UI → cross-shell deep-link bridge into the existing `/ops/*` screens, with
  zero change to the existing app when the flag is off.
- **Tracer Bullet?:** YES
- **Mode:** DELIVERY
- **DoD additions:** (1) With `fmShell` ON, `/fm/home` renders real derived action items
  (CONFLICT/RIGHTS/UNPLACED/CREW/FEED) with correct KPI-tile counts from live selectors; (2)
  CONTINUE advances through unresolved items in priority order, each landing on a real screen
  with the entity actually selected (the interim bridge, AS-3), and shows "ALL CLEAR" on an empty
  queue; (3) MARK RESOLVED persists per-user across reload; (4) flag OFF → zero change to the
  existing app, bundle-split verified at the network level (mirrors ops A-5 AC-5).
- **Business Value:** One place aggregates every open risk (conflicts, expiring rights, unplaced
  events, open crew roles, pending feed-driven ripple changes) instead of four separate screens;
  CONTINUE turns "check everything" into "resolve the next thing." Success metric: a planner
  clears the week's action-item queue to zero using only Home + CONTINUE.
- **Risk:** Med — action-item derivation could drift from ops's own selectors if reimplemented →
  mitigation: FM1-3 imports `ops/selectors.ts` directly, no parallel threshold logic (reuses the
  ops backlog's own AS-4 90-day rights formula verbatim). Med — the interim bridge (AS-3) could
  break if EPIC FM-2 restructures ops screens → mitigation: bridge targets are the STABLE ADR-014
  URL contract, not internal ops component shapes.
- **SLOs:** `FM Home – action-item derivation < 800ms p95 @ 500 events/50 contracts/20 tech plans`
  · `CONTINUE – navigate + landing-screen selection hydrate < 300ms p99`.
- **Glossary:** FM Shell, Screen, Action Item, Inbox, CONTINUE loop, MARK RESOLVED, KPI Tile,
  Unplaced (Event, action-item kind only), Interim Bridge, Create Modal.
- **ADRs:** ADR-020 (gates Story FM1-2's pull). AS-2/AS-3/AS-4/AS-5/AS-7 govern the rest of the
  EPIC without needing separate ADRs.
- **Smoke Test Story:** FM1-7.
- **Runbook Link:** `docs/runbooks/fm-shell.md` (FM1-7 deliverable): flag off = rollback;
  symptoms: blank `/fm` (check flag + lazy chunk), wrong action items (check fixture/selector
  drift), resolve not persisting (check migration/RLS), broken CTA landing (interim-bridge URL
  contract check against ADR-014).

---

### Story FM1-1 — FM tokens (scoped to what Home actually renders)
**As a** planner **I want** the FM shell to render with the AA-audited ops token set plus only the
new tokens Home actually needs **so that** FM reads as a natural extension of the existing system,
not a new visual language, and no unused tokens ship ahead of the screens that need them.

Business Value 2 · Priority 4 · Size **S** · DoR: **READY** (pure CSS-var addition, no ADR blocks it)
INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given `tokens.css`, When `--border-shell-soft: #1A2126` is added (dark value only — light-theme
  derivation deferred to EPIC FM-5.2, since FM-1 ships no theme toggle), Then a style-contract test
  asserts the computed value and a grep confirms no existing selector already used that name.
- Given the FM Home screen uses `--font-head` (Space Grotesk) for KPI-tile numbers, Then no new
  font `<link>`/pipeline is added — `index.html` already loads Space Grotesk 300–700 and
  `tokens.css`/`tailwind.config.ts` already alias it (AS-4, verified).
- Given the ops-tokens contract, When FM-1 tokens ship, Then `docs/ops-token-map.md` gains an FM
  section and the contract bumps to **ops-tokens v4** (additive only).
- Explicitly OUT of scope: `--channel-radio1`/`--channel-sporza-app` (Home renders no channel
  swatches — verified against `fm-01-home.png`; these ship in EPIC FM-2, AS-7).

**Interfaces:** pure CSS var addition; no component contract.
**TD considerations:** none expected. **Test data:** none.

- **FM1-1-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: add `--border-shell-soft` to `tokens.css` `:root` (dark only, comment noting the deferred
  light value is deliberate); update `docs/ops-token-map.md` FM section; bump contract to
  ops-tokens v4.
  TDD: (1) failing style-contract test (2) implement (3) refactor.
  Abstraction Check: reuses the existing token-file semantic-set structure (A-1-T1 precedent); no
  new pattern.
  Pull Gate: grep confirms `--border-shell-soft` unused today.
  Hand-off: **Contract Snapshot `fm-tokens v1`** (the one new var + an explicit "does not include"
  list, so FM1-2/EPIC FM-2 know exactly what is and isn't here).
  Unblocks: FM1-2-T1, END OF STORY SEQUENCE.

---

### Story FM1-2 — FM shell: chrome, routing, flag
**As a** planner **I want** the `PLANZA/FM` shell reachable at `/fm` behind a flag **so that** the
redesign is usable without touching the current app or the existing Ops shell.

Business Value 3 · Priority 5 · Size **M** · DoR: **READY** (ADR-020 Accepted 2026-08-14 — same
conditional pattern the ops backlog used for A-1/A-2 against ADR-012/013/014) · INVEST all ✓

**AC:**
- Given flag OFF, When I visit `/fm`, Then I'm redirected to `/dashboard` and no fm chunk loads
  (network-level assertion, mirrors ops A-5 AC-5).
- Given flag ON, When I visit `/fm`, Then I land on `/fm/home`: 216px sidebar (brand block
  "PLANZA/FM", section labels), 52px top bar (date block, LIVE pill, `+ NEW`, CONTINUE with count
  chip).
- Given flag ON, When I click a not-yet-built nav item (Schedule board, Season calendar, Match
  day, Competitions, Teams, Athletes, Crew), Then it renders a placeholder panel (mirrors
  `OpsShell`'s unbuilt-tab precedent) — never a 404, never a crash.
- Given `/fm/home?inbox=<key>`, When the shell mounts, Then the inbox selection hydrates from the URL.
- Given unresolved CONFLICT/RIGHTS/UNPLACED/CREW items exist, Then the "Home" nav item shows the
  red count badge (reuses the `OpsTabBadgeContext` publish-up pattern, structurally — a sibling
  `FmNavBadgeContext`, not a shared import, Rule of Three).

**Interfaces:** `<FmShell>` layout route; `useFmSelection(): { inboxKey, setInboxKey }`
(`fmUrlState.ts`, sibling to `opsUrlState.ts`); nav registry `FM_NAV: {section, items:
{id,label,badge?}[]}[]`.
**Idempotency:** n/a.

- **FM1-2-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `FmShell` (`src/components/fm/FmShell.tsx`) + `/fm/*` lazy route in `App.tsx` (mirroring
  the `OpsShell` mount: `isFmShellEnabled()` in `src/flags.ts`, build-time `VITE_FM_SHELL`,
  explicit string-compare — never `z.coerce.boolean`) + sidebar/top-bar chrome per README shell
  spec + `FM_NAV` registry + placeholder panels + `FmNavBadgeContext`.
  TDD: routing/flag tests first (flag-off redirect + network-level chunk-not-requested assertion;
  nav activation; lazy split; placeholder panel).
  Abstraction Check: structural pattern copied from `OpsShell`/`OpsTabBadgeContext`/
  `isOpsRedesignEnabled` — NOT imported (2nd occurrence of "flagged lazy shell"; Rule of Three
  says do not extract a shared abstraction yet).
  Pull Gate: ADR-020 approved; `fm-tokens v1` snapshot.
  Hand-off: **Contract Snapshot `FmShell v1`** (mount point, `FM_NAV`, badge context, flag name).
  Unblocks: FM1-2-T2, FM1-4-T1.
- **FM1-2-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `fmUrlState.ts` → `useFmSelection()` (`?inbox=<key>` only — CONTINUE/create-modal targets
  in FM-1 navigate INTO `/ops/*` using its EXISTING `useOpsSelection`/ADR-014 contract at the
  destination, not a new FM param; `?sport/?comp/?team/?person` are explicitly NOT built yet —
  they arrive with the screens that consume them, avoiding speculative params with no reader,
  Core §5.3).
  TDD: hydrate/update/back-button unit tests first (mirrors `opsUrlState`'s test shape).
  Pull Gate: `FmShell v1`.
  Hand-off: **Contract Snapshot `fmUrlState v1`** (`?inbox` only; explicit deferred-params note).
  Unblocks: FM1-4-T1, END OF STORY SEQUENCE.

---

### Story FM1-3 — Action item derivation
**As a** planner **I want** every open risk across the schedule — conflicts, expiring rights,
unplaced events, open crew roles, and pending feed-driven ripple changes — computed as one typed
list **so that** Home can show it without re-deriving logic ops already built and proved correct.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY** · INVEST all ✓ (this is the EPIC's
core-domain logic — max rigor, mirrors the ops backlog's treatment of A-3-T1)

**AC (Gherkin):**
- Given `detectCrewConflicts` reports a conflict for an event this week, Then a CONFLICT action
  item is derived: `{kind:'CONFLICT', key:'CONFLICT:event:<id>', title, sub, targetRoute:
  '/ops/schedule', targetParams:{event:<id>}}`.
- Given `deriveRightsStatus` (`ops/selectors.ts`, the ops backlog's AS-4 90-day formula, **reused
  verbatim** — no new threshold logic) returns `EXPIRING` or `MISSING` for a competition with
  events this week, Then a RIGHTS action item is derived per affected competition.
- Given an event in the visible week has no `channelId` **and** no linked `BroadcastSlot`, Then an
  UNPLACED action item is derived (the predicate is deliberately narrower than "no slot" alone — a
  `channelId`-only event with no slot is the different, less urgent case the Ops Rundown screen
  already surfaces via its UNASSIGNED lane, mirroring the ops backlog's AS-3 slot-resolution
  precedent).
- Given `deriveCrewRoles`/`deriveCrewHealth` reports an OPEN required role for an event this week,
  Then a CREW action item is derived.
- Given `GET /api/ripple-proposals?status=PENDING` (`ripple v1`, SV-2, already merged and live
  regardless of `scheduleRipple`'s own OFF default — the read endpoint ships unconditionally)
  returns proposals for events this week, Then a FEED action item is derived per proposal —
  **read-only**: no accept/reject surface in FM-1 (that's EPIC FM-2's Cascade banner, gated on
  SV-3's pull — cross-epic dependency, not a blocker here, AS-5).
- Given the same event would independently qualify for two kinds (e.g. CONFLICT and UNPLACED),
  Then both items are derived — no merging (each is independently actionable/resolvable).
- Given no risk conditions exist this week, Then the derived list is empty (Home's "ALL CLEAR" state).
- Error flow: given the `ripple-proposals` fetch fails, Then FEED items are silently omitted for
  that render (fail-visible in console; never blocks the other four kinds — partial data beats no
  data, the `isSettled` pattern's spirit).

**Interfaces:** new pure module **`src/components/fm/fmActionItems.ts`**:
`deriveActionItems(events, contracts, techPlans, conflicts, rippleProposals, now): ActionItem[]`.
No fetching inside — same anti-smart-ui convention as `ops/selectors.ts`. `ActionItem =
{kind: 'CONFLICT'|'RIGHTS'|'UNPLACED'|'CREW'|'FEED', key: string, title: string, sub: string,
targetRoute: string, targetParams: Record<string,string>}`.
**TD:** none expected — pure composition over existing selectors; the only genuinely new predicate
(UNPLACED) gets full permutation coverage.
**Test data:** extend `opsFixtureWeek` (`src/components/ops/__fixtures__/opsFixtureWeek.ts`) with
one unplaced-event fixture and one pending-ripple-proposal fixture — additive, not a fork (Rule of
Three: this is the 2nd consumer outside `ops/`, still cheap to extend in place).

- **FM1-3-T1** · Hat **FEATURE** · Model **Sonnet** (composition) / review **Opus** (UNPLACED
  predicate + kind-independence judgment) · Confidence High
  Goal: `fmActionItems.ts` — `deriveActionItems` composing `deriveRightsStatus`,
  `deriveCrewHealth`/`deriveCrewRoles`, `detectCrewConflicts`, the new UNPLACED predicate, and the
  ripple-proposal mapping.
  TDD: full permutation table as failing tests first (one combination per kind, the two-kinds-
  same-event case, the empty-week case) — core-domain rigor, ≥80% branch coverage.
  Abstraction Check: imports `ops/selectors.ts` functions directly — the AS-4 90-day rule stays
  defined in exactly one place project-wide.
  Pull Gate: `ops-selectors v3` signature match (no drift since the ops backlog's last hand-off);
  `ripple v1` read-shape match.
  Hand-off: **Contract Snapshot `fmActionItems v1`**.
  Unblocks: FM1-4-T1, FM1-5-T1, END OF STORY SEQUENCE.

---

### Story FM1-4 — Home screen: KPI tiles + inbox + detail pane + MARK RESOLVED
**As a** planner **I want** Home to show four KPI tiles and a triage inbox with a detail pane,
where I can mark an item resolved **so that** I see the week's open risks in one glance and can
acknowledge the ones I've handled outside the app.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY** · INVEST all ✓

**AC:**
- Given derived action items, When Home renders, Then 4 KPI tiles show: EVENTS THIS WEEK (total,
  sub "n live productions"), CREW CONFLICTS (CONFLICT count, red if >0), RIGHTS EXPIRING (RIGHTS
  count, amber), UNPLACED EVENTS (UNPLACED count, amber) — each is a button deep-linking to the
  first open item of that kind (quiet/disabled at 0).
- Given the inbox list, Then rows show a kind-colored dot, kind word (mono, colored per README
  §1: CONFLICT `--alert-danger`, RIGHTS/UNPLACED `--alert-warning`, CREW `--status-ready`, FEED
  `--text-shell-2`), title, sub; resolved items render at 45% opacity with a ✓ prefix and sort last.
- Given I click a row, Then it selects (bg + inset teal bar, `?inbox=<key>` updates) and the detail
  pane shows: kind badge, title (Space Grotesk), body, a primary CTA (the interim bridge, AS-3)
  and a "MARK RESOLVED" ghost button.
- Given I click MARK RESOLVED, Then the item dims immediately (optimistic) and
  `POST /api/fm/action-items/resolve {itemKey}` persists it for the current user; on reload it is
  STILL shown, dimmed/✓ (resolution is an acknowledgment overlay, not a filter — an item whose
  underlying condition is actually fixed simply stops being *derived* on a future load,
  independent of this flag, per FM1-3).
- Given no selection, Then the detail pane shows a quiet empty state; given zero derived items,
  Then the inbox shows the "ALL CLEAR" state.
- Error flow: given the resolve POST fails, Then the optimistic dim reverts and a toast states the
  failure (no silent loss of the click).

**Interfaces:** `POST /api/fm/action-items/resolve {itemKey: string}` → `{resolvedAt: string}`,
idempotent (same key twice = 200, no duplicate). **`ActionItemResolution`** table (new, additive
migration): `id, tenantId, userId, itemKey, resolvedAt`, unique `(tenantId, userId, itemKey)`,
`tenant_isolation` RLS in the SAME migration (ADR-011).
**TD considerations:** none expected. **Test data:** `opsFixtureWeek` extension (FM1-3) + one
resolved-item fixture.
**Idempotency:** resolve is idempotent by `(tenantId, userId, itemKey)` — re-resolving is a no-op,
not an error (no un-resolve affordance in FM-1).

- **FM1-4-T0** · Hat **PREPARATORY** · Model **Opus** (schema shape judgment) · Confidence Med
  Goal: raw-SQL migration — `ActionItemResolution` table (shape above) + unique constraint +
  `tenant_isolation` RLS in the SAME migration (ADR-011) + rollback.
  TDD: migration structural-integrity test first.
  Pull Gate: no migration collisions; ADR-011 RLS checklist.
  Hand-off: **Contract Snapshot `ActionItemResolution v1`** (schema + idempotency semantics — this
  is Assumption AS-2 made concrete, deliberately kept small/reversible rather than a 5th ADR).
  Unblocks: FM1-4-T1.
- **FM1-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `POST /api/fm/action-items/resolve` route + `useFmActionItems()` hook (fetch fixture data
  + resolution state, merge, `isSettled`) + `FmHomeScreen` (KPI tiles + inbox + detail pane) per
  README §1 markup/interaction spec.
  TDD: render-state tests first (each KPI-tile permutation, inbox row states incl.
  resolved/selected, detail-pane empty/populated, resolve optimistic+revert).
  Pull Gate: `FmShell v1`, `fmUrlState v1`, `fmActionItems v1`, `ActionItemResolution v1` snapshots.
  Hand-off: **Contract Snapshot `FmHomeScreen v1`** (props/route only — all derivation lives in FM1-3).
  Unblocks: FM1-5-T1, FM1-6-T1, END OF STORY SEQUENCE.

**Resolved ambiguity (the interim bridge, applies to FM1-4 and FM1-5):** every action-item CTA
targets the EXISTING `/ops/*` screens (`/ops/schedule?event=<id>`) via the stable ADR-014 URL
contract, NOT a not-yet-built `/fm/schedule` — that screen doesn't exist until EPIC FM-2. This
keeps EPIC FM-1 a genuine end-to-end tracer bullet (CONTINUE lands on a REAL screen with the REAL
entity selected, verifiable in the smoke test) instead of a stub. EPIC FM-2 flips these targets to
native FM routes once built — a route-string swap, not a rewrite.

---

### Story FM1-5 — CONTINUE
**As a** planner **I want** a single button that jumps me to the next unresolved item in priority
order **so that** I can clear the queue without deciding what to look at next.

Business Value 3 · Priority 4 · Size **S** · DoR: **READY** · INVEST all ✓

**AC:**
- Given unresolved action items exist, When I click CONTINUE, Then I navigate to the FIRST
  unresolved item's `targetRoute`/`targetParams` (priority `CONFLICT > RIGHTS > UNPLACED > CREW >
  FEED`) and a toast announces it (kind + title, ~2.6s, matches README toast spec).
- Given I resolve that item and click CONTINUE again, Then I advance to the next unresolved item.
- Given the queue is empty, When I click CONTINUE, Then an "ALL CLEAR" toast shows and no
  navigation happens.
- Given the CONTINUE button, Then it always shows the current unresolved count as an embedded
  chip, updating live as items resolve.

**Interfaces:** `useContinue(): { advance(): void, unresolvedCount: number }` built on
`fmActionItems v1` output. `FmToast` shared component (bottom-center, matches README toast spec —
the FIRST toast component in the FM initiative; also reused by FM1-6 — built as its own module now
since two real callers already exist within this EPIC, not a speculative extraction).
**TD:** none expected.

- **FM1-5-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `FmToast` component + `useContinue()` hook + CONTINUE button wiring in `FmShell`'s top bar
  (count chip + click handler).
  TDD: hook unit tests first (priority order, advance, empty-queue ALL CLEAR, count updates) then
  toast render/timing tests.
  Pull Gate: `fmActionItems v1`, `FmHomeScreen v1` snapshots.
  Hand-off: **Contract Snapshot `FmToast v1`** + **`useContinue v1`**.
  Unblocks: FM1-6-T1, END OF STORY SEQUENCE.

---

### Story FM1-6 — Create modal
**As a** planner **I want** one global "+ NEW" action that creates a transmission, team, athlete,
or competition without leaving Home **so that** I don't have to know which of several existing
forms to open.

Business Value 2 · Priority 3 · Size **M** · DoR: **READY** · INVEST all ✓

**AC:**
- Given I click "+ NEW" in the top bar, Then a 540px centered modal opens with kind tabs
  (TRANSMISSION default / TEAM / ATHLETE / COMPETITION) per README §8b.
- Given the TRANSMISSION tab, Then the modal wraps the EXISTING `DynamicEventForm` field config —
  no new form-field logic (the FM modal is a restyled shell around it, per the plan's own §1.4
  instruction).
- Given the TEAM/ATHLETE/COMPETITION tabs, Then the modal wraps the EXISTING
  `RegistryCreateModal` per-kind field logic — same reuse rule.
- Given a successful TRANSMISSION create, Then I land on `/ops/schedule?event=<newId>` (interim
  bridge) — DRAFT status; if unplaced (no channel chosen), it also now appears as a new UNPLACED
  action item on the next Home load (closes the loop without EPIC FM-2's polished unplaced tray —
  see the Resolved ambiguity note below).
- Given a successful TEAM/ATHLETE/COMPETITION create, Then I land on `/ops/registry?record=<newId>`
  (interim bridge — native FM profile pages arrive in EPIC FM-3).
- Given CANCEL, Then the modal closes with no side effects.
- Error flow: given the underlying form/modal reports a validation or 409 error, Then it surfaces
  exactly as it does today in its existing host screen — no new error-handling logic invented here.

**Interfaces:** `FmCreateModal` — thin composition wrapping `DynamicEventForm` and
`RegistryCreateModal` behind kind tabs; no new mutation logic.
**TD:** none expected.

**Resolved ambiguity:** the design's literal "unplaced ones land in the tray with a suggestion"
(README §8b) presumes EPIC FM-2's Schedule board tray, which doesn't exist yet. FM-1 satisfies the
same underlying promise — the created event is visible and actionable — via the Home inbox's
UNPLACED action item instead. Recorded here as a deliberate, reasoned adaptation, not a silently
dropped requirement; EPIC FM-2 is the story that literally builds the tray.

- **FM1-6-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `FmCreateModal` (kind tabs + `DynamicEventForm`/`RegistryCreateModal` composition + FM
  token styling) + top-bar "+ NEW" entry point + post-create interim-bridge navigation.
  TDD: composition/interaction tests first (tab switch, each kind's create → correct
  interim-bridge landing, cancel, error passthrough).
  Pull Gate: `FmShell v1`; `DynamicEventForm`/`RegistryCreateModal` current contracts (grep for
  drift since the ops backlog's last hand-off).
  Hand-off: **Contract Snapshot `FmCreateModal v1`**.
  Unblocks: FM1-7-T1, END OF STORY SEQUENCE.

---

### Story FM1-7 — EPIC FM-1 smoke test + runbook
**As a** reviewer **I want** an E2E smoke test and a runbook **so that** the tracer bullet is
verifiably deployable and rollbackable.

Size **S** *(smaller than the ops equivalent A-5 — the Playwright harness, `ops-e2e v1`, already
exists; FM-1 adds a build profile + fixtures, not a framework)* · DoR: **READY** · INVEST all ✓

**Data/clock strategy:** reuse `ops-e2e v1`'s network-interception + pinned-clock approach; extend
`opsFixtureWeek` (FM1-3) rather than a new fixture set.

**AC (Gherkin):**
- Given a build profile with BOTH `VITE_FM_SHELL=true` AND `VITE_OPS_REDESIGN=true` (the interim
  bridge needs a real `/ops/schedule` to land on) and an authenticated session, When I visit
  `/fm`, Then I land on `/fm/home`; the fixture week's KPI tiles show the expected counts and the
  inbox lists the expected items incl. one of each kind.
- Given that build, When I click a CONFLICT item's CTA, Then I land on `/ops/schedule?event=<id>`
  with that event's inspector open (proves the interim-bridge contract end to end).
- Given that build, When I click MARK RESOLVED on an item then reload, Then it still renders
  dimmed/✓ (proves `ActionItemResolution` persistence).
- Given that build, When I click CONTINUE repeatedly, Then I advance through all fixture items in
  priority order and finally see the ALL CLEAR toast.
- Given that build, When I create a transmission with no channel via "+ NEW", Then a new UNPLACED
  action item appears on the next Home load.
- Given a `VITE_FM_SHELL=false` build (ops state irrelevant) and an authenticated session, When I
  visit `/fm`, Then I land on `/dashboard` AND the fm lazy chunk is never requested (mirrors ops
  A-5 AC-5's honesty about the network-level assertion).

- **FM1-7-T0** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: add a THIRD/FOURTH Playwright project to the existing `playwright.config.ts` — `flag-fm-on`
  (`.env.e2e-fm-on`: `VITE_FM_SHELL=true` + `VITE_OPS_REDESIGN=true`, new port) and `flag-fm-off`
  (`VITE_FM_SHELL=false`); extend the existing interception fixtures with FM's
  action-item/resolution/ripple-read routes.
  TDD: prove the new profiles boot green with one trivial spec before FM1-7-T1 starts (mirrors
  A-5-T0's own gate).
  Pull Gate: `ops-e2e v1` contract; `FmShell v1`, `fmActionItems v1`, `ActionItemResolution v1`,
  `FmToast v1`/`useContinue v1`, `FmCreateModal v1` snapshots.
  Hand-off: **Contract Snapshot `fm-e2e v1`** (new profiles + fixture additions, layered on `ops-e2e v1`).
  Unblocks: FM1-7-T1.
- **FM1-7-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: smoke spec implementing the ACs above + `docs/runbooks/fm-shell.md` (purpose/scope · flag
  procedure `VITE_FM_SHELL`, build-time, rollback = env change + redeploy, same honest TD-27
  framing as the ops runbook · verification checklist · symptom table (blank `/fm` → flag/chunk;
  wrong action items → selector/fixture drift; resolve not persisting → migration/RLS check;
  broken CTA landing → ADR-014 URL contract check) · known limitations (interim-bridge targets are
  `/ops/*`, not native FM screens, until EPIC FM-2/FM-3; e2e intercepts network, no real backend,
  same trade-off ops accepted) · stub headings for EPIC FM-2/FM-3/FM-4/FM-5.
  TDD: AC-ordered spec written first (red on `flag-fm-on`) → green in both new profiles → runbook
  checklist derived from the passing spec.
  Pull Gate: `fm-e2e v1` + all FM-1 snapshots above.
  Unblocks: **EPIC FM-1 RETRO** (Phase Summary + Architecture Memory update + mode check per BB
  §10), END OF STORY SEQUENCE.

---

## 8. Roadmap EPICs (outline only — expand after EPIC FM-1 retro, per BB v5.1 §4 depth rule)

### EPIC FM-2 — Schedule board upgrades (Phase 2)
**Objective:** FM's own Schedule board screen — table + 320px inspector (same anatomy as
`EventInspector`, extended behind a prop, contract `EventInspector v2`), UNPLACED tray with
rule-based slot suggestions (ADR-023), channel reassignment chips, conflict-tinted rows,
session-scoped undo/history (ADR-021), and the cascade banner as the first UI surface for
`scheduleRipple`. Once this screen exists, EPIC FM-1's interim-bridge targets flip from
`/ops/schedule` to `/fm/schedule`. **Mode:** DELIVERY · **Flag:** `fmShell` (same flag — this is
depth, not a new surface) · **Tracer Bullet?:** NO.
**Key risks:** **High — this is the plan's own named biggest risk** ("touches mutation paths").
Pair Story 2.2 (inspector actions) with **TD-32 servicing** (frontend `ApiError` discards
structured 409 bodies) — this is the FIRST FM surface consuming a structured 409 (a stale
channel-reassignment conflict), and the debt register's own servicing rule ("service with the
FIRST UI consumer") now points here. **Cross-epic pull gate, not a blocker:** Story 2.5 (Cascade
banner) depends on EPIC SV's Story SV-3 (review-before-apply service) being PULLED; SV-3 is
DoR-READY-but-UNPULLED, itself gated on the ops-stakeholder FEED=review taste-test (ADR-019 Open
assumption 2, `docs/sv3-continue-prompt.md`). This does not block the rest of EPIC FM-2 — only
Story 2.5 waits, pullable the moment SV-3 lands. ADR-021/ADR-023 Accepted 2026-08-14 — Stories
2.1/2.4 clear to pull once EPIC FM-2 itself is reached (still behind EPIC FM-1 in sequencing).

### EPIC FM-3 — Sports world (Phase 3)
**Objective:** Competitions/Teams/Athletes screens as drill-down views over existing Registry
kinds (sport/competition/team/player) — an additive `GET /api/registry/:id/profile` endpoint and,
per ADR-022, manually-maintained standings data. Adds a `bio/facts JSON` payload to `Team`/`Player`
(confirmed absent this session — small additive migration). **Mode:** DELIVERY · **Flag:**
`fmShell` · **Tracer Bullet?:** NO.
**Key risks:** Med — standings upkeep (ADR-022, accepted/disclosed). Low — the reach chart depends
on an existing viewing-stats source; if none is confirmed to exist, the plan's own fallback
applies ("hide the card") rather than inventing a metrics pipeline.

### EPIC FM-4 — Crew + Match Day (Phase 4)
**Objective:** Crew squad screen (`GET /api/crew/availability?week=`, aggregating
`detectCrewConflicts` + tech-plan assignments into an M–S availability strip) and the per-event
Match Day screen (rundown segments, crew-formation tactics board, resources, distribution).
**Naming note (§4):** Match Day's segment list is a DIFFERENT concept from the Ops "Rundown"
screen (day timeline across channels) despite both being called "RUNDOWN" in the design — do not
reuse the bare `Rundown`/`RundownScreen` symbol for the Match Day panel (recommend
`MatchSegmentTimeline`; `rundownSegment` as a Prisma model name is fine, schema-scoped and
unambiguous). **Mode:** DELIVERY · **Flag:** `fmShell` · **Tracer Bullet?:** NO.
**Key risks:** Med — the tactics-board per-sport position-layout template is unspecified beyond a
football-shaped default; needs a design follow-up or a documented single-template-first assumption
before Story 4.2 is pulled. **Sequencing note:** the plan's own suggested solo-dev order
interleaves 4.1 (Crew) BEFORE EPIC FM-3 and 4.2 (Match Day) AFTER; this backlog groups Crew+Match
Day into one EPIC for Rule-of-Three economics (both consume the same `detectCrewConflicts`
aggregation) — whoever expands this EPIC at the FM-1/FM-2 retro should re-examine pulling Story 4.1
ahead of EPIC FM-3, per the plan's own preference (a mode-check call, BB §10, not fixed here).

### EPIC FM-5 — Consolidation (Phase 5)
**Objective:** Season calendar (month grid generalizing `groupEventsByDay`), light theme for the FM
shell (`OpsThemeProvider` reuse — the deferred `--border-shell-soft`/FM-var light values from
FM1-1 land here), and the migration/cutover ADR retiring the legacy Planner/Sports views and
folding Ops tabs into FM nav — explicitly gated on an ops-stakeholder taste-test (mirrors the
FEED=review gate, `docs/sv3-continue-prompt.md`), matching ADR-016's own precedent (cutover
deferred to a hardening-stage decision informed by real usage). **Mode:** DELIVERY for 5.1/5.2;
5.3 is likely its own HARDENING-mode EPIC at expansion time (mirrors the ops redesign's EPIC E
shape) — not decided here. **Flag:** `fmShell` (5.1/5.2); 5.3's cutover is its own decision, not
flag-gated.
**Key risks:** Low for 5.1/5.2 (additive, well-precedented — reuses the ops backlog's own A-1-T4
light-theme derivation method directly). 5.3 is high-stakes but not high engineering risk — it's a
product/organizational decision gated on a taste-test, not a technical unknown.

---

## 9. Validator Summary (BB v5.1 §9 — DELIVERY level)

- **Structure:** DAG verified, no cycles: FM1-1 ∥ FM1-3 (independent starts) → FM1-2 (needs
  `fm-tokens v1`) → FM1-4 (needs `FmShell v1` + `fmActionItems v1` + its own FM1-4-T0 migration) →
  FM1-5 → FM1-6 → FM1-7. EPIC FM-1 is a tracer bullet ✓ (thin end-to-end slice: tokens → shell →
  selectors → screen → persistence → e2e). Every task has Unblocks + Pull Gate ✓. Token budgets:
  largest task (FM1-3-T1) is a permutation-table selector module, well under 15k output tokens; no
  task exceeds 1,500 LOC or touches >3 complex modules ✓.
- **Quality:** All 6 stories + smoke pass DoR-READY (FM1-2's ADR-020 gate cleared — Accepted
  2026-08-14, matching the ops backlog's own A-1/A-2 pattern). Every task declares one Hat;
  no mixed tasks ✓. TDD order explicit in every task ✓. Glossary enforced — both the "Planner"
  collision (inherited, resolved) and the newly-found "Rundown" collision (§4) are documented with
  a code-naming recommendation ✓. ADR-020 raised for the one EPIC FM-1-blocking cross-cutting
  decision; ADR-021/022/023 correctly scoped to their consuming EPICs, not forced onto FM-1 ✓.
- **Testing:** Core logic (`fmActionItems` derivation, resolution idempotency) unit-tested first;
  E2E smoke (FM1-7) reuses the proven `ops-e2e v1` harness rather than reinventing it. The one
  schema change (`ActionItemResolution`) has migration + rollback + RLS in the same migration
  (ADR-011) ✓. External integration = existing internal APIs + `ripple v1` (contract pull-gated) ✓.
- **Risk & Debt:** All Med risks carry a stated mitigation with an owner (§1, EPIC header). No PII
  newly introduced in EPIC FM-1 (STRIDE-light note, §1) — anonymised fixtures still apply per
  project convention. No new TD created by EPIC FM-1 (deferred scope items — channel tokens, seed
  data, light theme, TD-32 — are documented deferrals with a named landing EPIC, not silent debt;
  Core §5.2/§2 P4: "if it's not in a TD Item, it doesn't exist" — these ARE recorded, as scope
  notes with an owner-EPIC, which is the correct classification since nothing sub-standard is being
  shipped) ✓.
- **Operations:** SLOs stated per EPIC ✓. Runbook per EPIC (FM1-7) ✓. `fmShell` flag on all
  user-facing work in EPIC FM-1 ✓. Write paths: one (`resolve`), idempotent, documented ✓.
- **Economics (Core §5):** Anti-bureaucracy check — spot-checked the smallest task (FM1-1-T1): its
  spec is comparable in length to the one-line CSS-var diff it produces, at the acceptable edge
  (mirrors the ops backlog's own A-1-T3/B-2-T1 precedent of accepting the smallest tasks running
  close to the DoR/DoD floor, not below it). No premature extraction: `FmToast` is built once with
  two real callers already inside this EPIC (FM1-5, FM1-6) — a legitimate build, not a speculative
  one (Core §5.4). No over-decomposition: FM1-3's selector module and FM1-4's screen stay single
  tasks each because their sub-parts always change together (Core §5.4 Common Closure).

**VERDICT: VALID — ADR-020 Accepted 2026-08-14, all four EPIC-gating ADRs (020/021/022/023)
ratified. Health 7/9 → PROCEED. EPIC FM-1 is DoR-READY and cleared to pull in full.**

---

## 10. How to execute with the toolkit

1. **Architect:** confirm ADR-020 (§2) — this is the only EPIC-FM-1-blocking decision; FM1-1
   (tokens) and FM1-3 (action-item derivation) have no ADR dependency and can start in parallel
   while ADR-020 is under review. ADR-021/022/023 can wait until their gated EPICs (FM-2/FM-3) are
   expanded — do not gate FM-1 on them.
2. **Per task, use the `gpm-partner` agent:** each task above maps 1:1 to a GPM prompt — component
   tasks are **ZAPs** (the task's Goal/Interfaces/AC fill Requirements/Contract/Test Expectations),
   shell/route wiring is a **CIP**, and any restructuring discovered mid-flight becomes a **PREP**
   (never mixed into a FEATURE task, e.g. FM1-4-T0's migration stays PREPARATORY, separate from
   FM1-4-T1's FEATURE work).
3. **Model routing (Core §6):** annotations per task above — Sonnet-class for generation tasks,
   Opus-class review on FM1-3-T1's UNPLACED-predicate/kind-independence judgment and FM1-4-T0's
   schema shape, Haiku-class for any DoR/DoD checklist verification the human or orchestrator
   wants run separately.
4. **After EPIC FM-1:** run the BB §10 retro — Phase Summary, updated Architecture Memory (§6),
   waste/cycle data, mode check (incl. the FM-4 sequencing note, §8) — then expand EPIC FM-2 with
   `backlog-builder`, folding in ADR-021/023's outcomes.
5. **Optional pre-flight:** run a scoped `current-state-evaluator` over `src/components/fm/` once
   FM1-1/FM1-2 land, before FM1-3, to catch any drift between this backlog's assumed
   `ops/selectors.ts`/`crewConflicts.ts` signatures and the real code (the same discipline the ops
   backlog itself used before A-3).

**Suggested first session:** confirm ADR-020 → branch `feature/FM1-1-fm-tokens` → `gpm-partner`
executes FM1-1-T1 as a ZAP (independent of ADR-020, can start immediately); in parallel, branch
`feature/FM1-3-action-items` for FM1-3-T1 (also ADR-020-independent).
