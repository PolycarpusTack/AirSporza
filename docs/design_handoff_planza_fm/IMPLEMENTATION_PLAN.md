# Implementation Plan: Planza/FM

Phased plan for building the FM concept inside the existing SporzaPlanner repo, following its conventions: feature-flagged lazy shells (ADR-012), URL-carried selection (ADR-014), token-only styling (ADR-013), anti-smart-ui selectors, and the Rule of Three for extraction. Each phase ships independently behind the flag and ends with the existing test gates (`tsc --noEmit`, vitest suites, flag-on/off e2e smokes).

## Guiding decisions

- **New shell, not a rewrite.** Mount `FmShell` at `/fm/*` as a third route family beside legacy and `/ops`, behind a new `fmShell` flag. Reuse the OpsShell lazy-chunk + theme-guard pattern verbatim. The ops screens keep working; FM screens wrap and extend the same selectors and components.
- **Reuse before build.** `EventInspector`, `deriveRightsStatus/deriveCrewHealth`, `detectCrewConflicts`, `groupEventsByDay`, `useContracts`, `opsUrlState` and the token set are the foundation. New UI = composition around them.
- **URL is the state.** Extend the ops `?event/?day` params with `?sport/?comp/?team/?person` so CONTINUE deep-links, tabs carry context, and everything is shareable (ADR-014 amendment).

## Phase 0 — Foundations (small PRs, no visible UI)

- **0.1 Tokens.** Add `--channel-radio1: #B48EF5`, `--channel-sporza-app: #2FD6C3`, `--border-shell-soft: #1A2126`, light-theme derivations per the A-1-T4 method; update `docs/ops-token-map.md`. Guard: ops-tokens contract bump to v4.
- **0.2 Flag + shell skeleton.** `fmShell` flag; `FmShell` (sidebar + top bar + empty routes) mounted lazily at `/fm/*`; nav registry like `OPS_TABS` with a badge context (reuse `opsTabBadges` pattern). ADR for the third route family.
- **0.3 URL state.** Extend `opsUrlState` (or sibling `fmUrlState`) with the new params + tests.
- **0.4 Seed data.** Extend Prisma seed with bio/facts JSON on registry records (team, player), crew availability, and standings/fixtures fixtures for demo.

## Phase 1 — Inbox + CONTINUE (the FM loop)

- **1.1 ActionItem derivation.** New selector module `fmActionItems.ts`: derives typed items (CONFLICT from `detectCrewConflicts`, RIGHTS from contract expiry windows, UNPLACED from events without channel/slot, CREW from open required roles, FEED from RippleProposal/import deltas). Pure functions + tests; no fetching in components.
- **1.2 Home screen.** KPI tiles (counts from the same selectors), inbox list + detail pane, MARK RESOLVED (persisted per-user: new `actionItemState` table or notification read-state reuse).
- **1.3 CONTINUE.** Top-bar button: cursor over unresolved items → navigate to `item.target` route with params; toast component (one shared `FmToast`).
- **1.4 Create modal.** Global + NEW (top bar) and contextual entry points (team/athlete/competition screens) opening a kind-tabbed create modal. Reuses the existing `DynamicEventForm` field config for transmissions and `RegistryCreateModal` for registry kinds — the FM modal is a restyled shell around them, not new form logic. New transmission lands selected on the schedule board (unplaced tray when no channel chosen).
- **Gate:** e2e smoke — resolve a conflict from its deep link, watch the badge count drop; create a transmission and see it in the unplaced tray.

## Phase 2 — Schedule board upgrades

- **2.1 Unplaced tray.** Selector for unplaced events; tray UI; suggestion engine v1 = rules over channel load + rights validity + crew availability (backend endpoint `GET /api/schedule/suggestions?week=`); PLACE + AUTO-SUGGEST call the existing slot mutation APIs.
- **2.2 Inspector actions.** Channel chip row (channels via `channelsApi.list()`), ASSIGN FROM AVAILABLE CREW (uses conflict-free candidates from `groupConflictsByPerson` complement), OPEN MATCH DAY link. Extends `EventInspector` behind a prop, keeping the ops screens' render identical (contract EventInspector v2).
- **2.3 Conflict-aware rows.** Row tint + ⚠ from `deriveCrewHealth` — presentation only.
- **2.4 History + undo.** Client-side command stack over the existing mutation endpoints (each entry stores the inverse mutation); UNDO LAST + banner UNDO share it. Server-side undo is out of scope.
- **2.5 Cascade banner.** First UI surface for the `scheduleRipple` flag (SV-2): render RippleProposal as the banner sentence with accept/undo. Coordinates with the SV-3/SV-4 lanes — banner ships flag-gated.
- **Gate:** dnd/undo unit tests mirroring `PlannerView.undoRedo.test.tsx`; flag-on e2e placing both unplaced events.

## Phase 3 — Sports world (Registry → pages)

- **3.1 Data.** Relations already exist as registry kinds; add `GET /api/registry/:id/profile` returning facts, career, honours, related events; standings either from feed integration or manual admin entry (start manual).
- **3.2 Competitions screen.** Sport switcher + competition rail + standings/fixtures cards; league vs calendar layout keyed on competition type.
- **3.3 Team profile.** Facts, key people, upcoming/past broadcasts (events joined on team), contracts (contracts filtered by competition), reach chart (from existing viewing-stats source if present, else hide the card).
- **3.4 Athlete profile.** Bio/career/honours from profile payload; NEXT ON AIR = events joined on person; related-across-sports = registry links.
- **Gate:** navigation e2e: standings row → team → person → back with URL params intact.

## Phase 4 — Crew + Match Day

- **4.1 Crew screen.** Aggregation endpoint `GET /api/crew/availability?week=` built on tech-plan assignments + `detectCrewConflicts`; squad table with M–S strips; row click filters the schedule board to that person's events.
- **4.2 Match Day screen.** Per-event: rundown segments (new `rundownSegment` model or derive from tech plan phases), crew formation (positions from crew fields mapped to a per-sport layout template), resources (tech plan resources), distribution (event channels + simulcasts).
- **Gate:** crew conflict shown on the strip matches the schedule board's word for the same person/day.

## Phase 5 — Consolidation

- **5.1 Season calendar** (month grid over `groupEventsByDay` generalized to a month; pips colored by channel var).
- **5.2 Light theme** for the FM shell (OpsThemeProvider reuse).
- **5.3 Migration decision.** With FM stable behind the flag: ADR on retiring the legacy Planner/Sports views (the FM board + calendar cover them) and folding Ops tabs Rights/Registry/Sync into FM nav sections. Only after ops-stakeholder taste-test (mirrors the FEED=review gate in `docs/sv3-continue-prompt.md`).

## Sizing & sequencing

Phases 0–1 ≈ one epic (the loop is the value); 2 ≈ one epic (touches mutation paths — biggest risk, pairs with TD-32 servicing since the inspector actions need structured 409 bodies); 3 and 4 parallelizable; 5 last. Suggested order for a solo dev: 0 → 1 → 2 → 4.1 → 3 → 4.2 → 5.

## Risks

- **Two-shell period** (legacy + ops + fm) — mitigated by flag + shared tokens; set a retirement ADR date up front.
- **Undo over live APIs** — inverse-mutation stack can drift from server state under concurrent edits; scope to the session and invalidate on websocket event updates.
- **Suggestion quality** — rules v1 will misplace edge cases; keep suggestions as proposals (dashed style, explicit PLACE) never auto-commits.
- **Standings upkeep** — manual entry decays; treat the standings card as optional until a feed integration exists.
