# Planza "Domain Gaps" — Development Backlog v1

> **Initiative:** Rights depth · Schedule volatility · Regulatory compliance · Resources & labour
> **Generated per:** `.claude/frameworks/core-specification-v1.md` (modes, DoD, economics) ·
> `.claude/frameworks/backlog-builder-v5.1.md` (templates, validator)
> **Requirements input:** `docs/ops-domain-gap-analysis.md` (verified research, gaps G1–G15, open questions Q1–Q4, caveats §6)
> **Current-state baseline:** codebase survey 2026-07-02 (§6 below) — **the research's assumed baseline
> ("flat platforms[] + derived per-event status") materially understates the code**; this backlog is built on the verified delta.
> **Status:** v1.1 — EPICs RD & RC detailed; EPICs SV & RL outlined (first story detailed), expand after RD retro (BB v5.1 §10).
> EPIC RD re-refined 2026-07-02 against **accepted** ADR-015 (RD-1-T2 hand-off — see §9 re-refinement entry).
> **Parallel initiative:** `docs/backlog-planza-ops-redesign.md` (flag `opsRedesign`, `/ops/*`). **Non-collision rule:**
> this initiative touches **no** ops screen components (`src/components/ops/`, `src/pages/ops/`); all new capabilities are
> exposed as backend services + validation codes + pure frontend services/selectors with Contract Snapshots that ops
> screens can consume in *their* backlog's later stories.

---

## 1. Readiness Decision

**Health Score (BB v5.1 §5):**

| Dimension | Score | Notes |
|---|---|---|
| Clarity | 2/3 | Gap matrix G1–G15 is precise and adversarially verified, but stakeholder questions Q1–Q4 are unresolved and the research baseline was wrong about the codebase (corrected by survey §6) |
| Feasibility | 3/3 | Far stronger starting point than the research assumed: rights checker (territory/window/blackout/runs), 5-stage validation pipeline with a regulatory stage stub, cascade engine writing slot estimates, ChannelSwitch entity, client-side resource conflict detection all exist |
| Completeness | 2/3 | User journeys thin (research is capability-level, not flow-level); data models are candidate glossary terms, not schemas; enforcement boundary (Q2) and KPI numbers (caveat §6.3) unconfirmed |

**Total: 7/9 → PROCEED**, with explicit gates: no acceptance criteria touching beheersovereenkomst KPI numbers are
final until re-verified against the **2026-2030** agreement (AS-1), and EPIC RC severity semantics are gated on the
enforcement-boundary decision (Q2 → ADR-017). No High risk without mitigation (see EPIC risk tables).

Required design sections: Business Context ✓ (gap analysis §1), Architecture Overview ✓ (maps onto existing
services/validation pipeline — survey §6), Data Models ◐ (candidate terms §3 of gap analysis + existing schema),
APIs/Interfaces ✓ (existing `services/*`, `backend/src/routes/*`), User Journeys ◐ (implied by candidate epics §4).
2 sections partial, 0 missing → not `DESIGN INCOMPLETE`.

**STRIDE notes:** new write paths (rights windows, listed-event marking, accessibility deliverables, ripple proposals,
resource preflight) are all tenant-scoped; **every new table MUST ship a `tenant_isolation` RLS policy** (ADR-011 /
TD-22 precedent — this is a quality gate on every PREPARATORY schema task below). Labour rules attach constraints to
named crew members → personal-data adjacent → anonymised fixtures required (EPIC RL).

**Compliance audit:** this initiative *implements* compliance features (AVMSD art. 7/14, Mediadecreet art. 153,
Flemish besluiten). Caveat §6.5 of the gap analysis applies: legal obligations bind VRT, not the tool — Planza's
default posture is **validate + annotate, never silently block** until ADR-017 says otherwise.

---

## 2. Critical Gaps → Decisions Needed (ADRs)

| # | Gap | Resolution path | Owner |
|---|---|---|---|
| **ADR-015** (**Accepted 2026-07-02**) | **Rights-window data model + dual rights model.** Survey finding: the codebase has TWO parallel rights models — `Contract` (enriched: territory[], platforms[], coverageType, windows, blackouts, maxLiveRuns) and `RightsPolicy` (separate CRUD + a `policyToContractShape` adapter in `validation/rights.ts`). Adding Rights Windows without a consolidation decision doubles the divergence. **Decided:** RightsWindow as child table of Contract; RightsPolicy **deprecated** (execution in RD-6, servicing TD-29); empty `territory[]`/`platforms[]` = unrestricted + INFO note; defect (a) hotfixed before RD-2 (RD-1F), defect (b) folded into RD-3 with non-skippable ACs (Acceptance record §2/§4). | RD-1 SPIKE → ADR ✓ accepted | Architect |
| **ADR-016** (to write, SV-1) | **Schedule Ripple review-before-apply semantics.** Survey finding: event edits via `routes/events.ts` auto-sync to BroadcastSlots (`eventSlotBridge`), but **import-driven kickoff changes do not** (`import/stages/provision.ts` writes `startDateBE/startTimeBE` with no slot sync); the cascade engine silently overwrites slot estimated fields. Define: Ripple Proposal entity, which change sources produce proposals vs direct writes, apply mechanics (via `scheduleOperations`?), idempotency. | SV-1 SPIKE → ADR | Architect |
| **ADR-017** (to write, RC-0) | **Regulatory enforcement boundary (Q2).** Where Planza ends and traffic/playout/EPG begins for listed-events FTA status, accessibility, ad limits: validate (ERROR, blocks publish) vs annotate (WARNING) vs merely record. Determines every severity in EPIC RC and confirms G13 deferral. | RC-0 stakeholder session → ADR | Architect + stakeholder |
| **ADR-018** (deferred to RL refinement) | **Resource booking + labour-rule placement.** Whether resource bookings stay tech-plan-anchored (today: `ResourceAssignment` rides the event window) or become first-class bookings with own windows; where labour rules are evaluated (client preflight vs server validation stage). | RL refinement after Q3 | Architect |
| Open (Q1) | Which rights dimensions VRT contracts actually distinguish, and which Planza validates at scheduling time vs leaves to legal. | AS-4; RD-1 stakeholder input; window categories shipped behind flag either way | Stakeholder |
| Open (Q3) | Which non-crew resources ops books today and which conflicts hurt most. | AS-5; gates RL-1-T3 (new resource types) only — the preflight mechanism is type-agnostic | Stakeholder |
| Open (Q4) | Remit/accessibility KPI reporting pipeline: does Planza feed an existing pipeline or become system of record? | AS-6; RC-3 scoped read-only either way | Stakeholder |

**Deferred scope (recorded, not planned):**
- **G13 ad-break limits** — explicitly OUT pending Q2; AVMSD 20%/daypart enforcement is most plausibly a
  traffic/playout-layer concern (gap analysis flags this itself). Revisit at the RC retro with ADR-017 in hand.
- **G4 contract finance/amortisation** — priority Could; different bounded context (finance), no ops consumer identified.
- **G9 linked content** (league→season→event→highlights/interviews) — priority Should, but it multiplies the rights-window
  model; deliberately sequenced AFTER Rights Windows stabilise (RD retro decides whether it becomes EPIC 5).
- **Unresearched dimensions** (OB/connectivity booking, REMI, multi-feed days, regional opt-outs, EPG/DRM pipeline):
  need stakeholder input or a follow-up research pass first (gap analysis §2 note); do not seed stories from absence of evidence.

---

## 3. Execution Mode (Core §1)

**DELIVERY** for all EPICs in this backlog (per CLAUDE.md).

Rationale: validated production architecture, multi-year lifetime, and — decisively per Core §5.1 — **regulated,
compliance-bearing domain logic** (rights violations and legal obligations are expensive to get wrong, hard to fix
later, and mostly irreversible once schedules publish). Full governance: TDD on all logic, one Hat per task, feature
flags, TD tracking, pull gates.

Rigor calibration within DELIVERY: rights-window resolution, holdback math, listed-event/accessibility validation,
ripple apply mechanics = **max rigor** (Core Domain + regulatory). CRUD plumbing, seed data, reporting aggregation =
standard rigor. Nothing in this initiative is "cheap to redo" — there is no low-rigor tier here, only standard vs max.

---

## 4. Domain Glossary (Core §2 P3 — enforced in code names)

Reconciled against existing code names. **Bold** = new term this initiative introduces into code.

| Term | Definition | Existing code reconciliation |
|---|---|---|
| **Rights Window** | A temporal exploitation category on a Contract — one of `LIVE / DELAYED / HIGHLIGHTS / CLIP / ARCHIVE` — with its own territory, platforms, exclusivity, validity window, run limit and holdback. The unit rights verification operates on. | Absorbs today's *scalar* `Contract.coverageType` + `windowStartUtc/EndUtc` + `maxLiveRuns` (one value per contract). `CoverageType` enum already exists with 4 of the 5 values (`ARCHIVE` missing — add per ADR-015). |
| Territory | Geographic scope of a right; drives geo-blocking and exclusivity. | **Exists**: `Contract.territory: string[]` + `TERRITORY_BLOCKED` check in `rightsChecker.ts`. Moves to per-window under ADR-015. |
| **Exclusivity Tier** | `EXCLUSIVE / NON_EXCLUSIVE / OPEN_NET` qualifier on a Rights Window. | New. "Open net" is a *value* of this tier, not a separate entity. |
| Blackout | A contractual prohibition sub-window inside a contract's validity during which broadcast is forbidden. | **Exists**: `Contract.blackoutPeriods` (JSON) + `BLACKOUT_PERIOD` ERROR in `rightsChecker.ts`. ⚠ Synonym flag: the research folds "holdbacks/blackouts" together — code keeps them distinct. |
| **Holdback** | An earliest-release constraint on a Rights Window: content in this window may not run until N hours after the live end (e.g. delayed/on-demand embargo). NOT a Blackout. | Partially exists as `Contract.tapeDelayHoursMin` — **stored via CRUD but consumed by no validator** (survey). Becomes a first-class per-window field, enforced. |
| Run / Run Ledger | One consumed exploitation of a right (LIVE/TAPE_DELAY/HIGHLIGHTS/CLIP…), tallied against a window's run limit. | **Exists**: `RunLedger` model, `RunType`/`RunStatus` enums, tallied in `checkRightsForEvent` (LIVE only today). |
| Rights Status | Per-event/per-slot derivation over Rights Windows × Territory × Exclusivity — no longer a per-contract scalar. | Existing ops glossary term; its meaning is *redefined* by this initiative (gap analysis §3 note). Ops backlog's `deriveRightsStatus` selector is unaffected until it opts into `rights-matrix v2`. |
| **Listed Event** | An event matching a category of the Flemish events-of-major-importance list (besluit 28 May 2004), carrying a full-live-FTA obligation flag. | New. List is data (seeded, editable — AS-3), never hardcoded. |
| **Free-to-Air (FTA)** | Channel property: receivable without conditional access. Input to the Listed Event constraint. | New `Channel` field (RC-1); today only `platformConfig` JSON exists. |
| **Accessibility Deliverable** | Per-event required access service — `T888` (subtitling), `AUDIO_DESCRIPTION`, `VGT` (Flemish Sign Language) — each with lifecycle status. | New entity. Supersedes the dead stub read of `sportMetadata.hasSubtitles/hasAudioDescription` in `validation/regulatory.ts` (survey: no writer exists for those fields). |
| **Remit Coverage** | Accumulated per-sport / women's / G-sport output measured against beheersovereenkomst KPI targets. | New (read-only aggregation). KPI numbers provisional until AS-1 clears. |
| **Schedule Ripple** | The propagation of an event timing/metadata change through dependent BroadcastSlots, with review-before-apply. | ⚠ Synonym flag: research's "ripple" ≈ code's **cascade** — but they are NOT merged: `cascade/` stays the name of the existing court-chain retiming engine (one *source* of ripple); **Ripple** is the general change-propagation concept (feed-driven, manual, cascade-driven). New code uses Ripple; do not rename cascade. |
| **Ripple Proposal** | A reviewable, idempotent record of a proposed slot change set (source, before/after, confidence) awaiting accept/reject. | New (ADR-016). |
| **Contingency Schedule** | A pre-built alternative slot set for a volatile event day, switchable in one action with downstream propagation. | Partial: slot-level machinery exists (`fallbackEventId`, `conditionalTriggerUtc/TargetChannelId`, `OverrunStrategy.CONDITIONAL_SWITCH`, `ChannelSwitch` entity + confirm endpoint, `TRIGGER_THRESHOLD_MET` alert). The *schedule-level* pre-built alternate is new (SV-4). |
| Cascade | The existing court-chain retiming engine (`backend/src/services/cascade/`): recomputes estimated starts down a court's match order, writes `CascadeEstimate` + slot estimated fields. | **Exists** — tennis-flavored (`sportMetadata.court_id/order_on_court`). Generalization question belongs to SV-1 SPIKE. |
| Resource (Production Resource) | Bookable non-crew asset (`ob_van`, `camera_unit`, `commentary_team`, `production_staff`, `other`; studio/edit-suite/facility candidates pending Q3) with capacity, assigned to tech plans. | **Exists**: `Resource` + `ResourceAssignment` + client-side `detectResourceConflicts` (capacity-aware). ⚠ Synonym flag: research says "Production Resource" — code name stays **Resource**. |
| **Labour Rule** | Per-crew-member constraint set (max hours/period, min rest between assignments, day-off rules) evaluated at assignment time. | New. Extends Crew Health semantics (ops glossary) with a third input besides conflicts/openings. |
| Crew Health | Derived per event from crew assignments + conflicts: `OK / OPEN / CONFLICT`. | Existing (ops backlog glossary). RL-2 adds labour-rule warnings as a new contributor — same words, extended derivation, snapshot-versioned. |

**Synonym collisions flagged (do not use in code):** "Planner" (→ Rundown, per CLAUDE.md), "Production Resource"
(→ Resource), "ripple" for the cascade engine (→ Cascade), "blackout" for holdbacks (→ Holdback), "open net" as an
entity (→ Exclusivity Tier value `OPEN_NET`).

---

## 5. Assumptions Ledger

| ID | Assumption | Impact | Verify by |
|---|---|---|---|
| AS-1 ⚠ **High-impact gate** | KPI numbers cited from the **2021-2025** beheersovereenkomst (99% T888, ≥90% online subtitling, 32 sports, 30% Sporza share, AD expansion) hold in the **2026-2030** agreement (signed July 2025). **No RC acceptance criterion referencing a KPI number is final until re-verified** (gap analysis caveat §6.3). | RC-2 AC thresholds, RC-3 targets | RC-0-T1 — blocking gate for RC-2/RC-3 DoR |
| AS-2 ⚠ **High-impact gate** | Planza's regulatory posture is **validate + annotate (WARNING), never block publish**, until ADR-017 decides otherwise (Q2: enforcement boundary vs traffic/playout). All RC validation severities are provisional WARNINGs. | All RC severities; G13 deferral | RC-0-T2 (ADR-017) |
| AS-3 | The Flemish listed-events list (2004, under parliamentary revision — caveat §6.4) is modelled as **seeded, editable data**, never as code constants; a list update is a data change, not a release. | RC-1 design | Inherent (design constraint) |
| AS-4 | Rights Window categories = existing `CoverageType` enum + `ARCHIVE`; VRT contracts meaningfully distinguish territory, exclusivity and live/delayed/highlights (Q1). If Q1 reveals fewer dimensions in practice, unused categories stay in the enum, unused validation stays flag-off — no rework. **Accepted-now path confirmed by architect (ADR-015 Acceptance record §3): Q1 is informative, not blocking — answers calibrate defaults, they do not gate RD-2..RD-5.** | RD-2/RD-3 scope | Q1 packet `docs/plans/rd-1-q1-stakeholder-questions.md` (informative, not a gate); flag `rightsWindows` limits blast radius |
| AS-5 | Studio / edit suite / facility become new `ResourceType` values only if Q3 confirms the ops team books them; the conflict-preflight mechanism (RL-1) is type-agnostic and ships regardless. | RL-1-T3 only | Q3 stakeholder answer |
| AS-6 | Remit coverage (RC-3) is **read-only reporting inside Planza** (aggregation + endpoint); whether it feeds an external pipeline or becomes system of record (Q4) changes consumers, not the aggregation. | RC-3 scope ceiling | Q4 stakeholder answer at RC retro |
| AS-7 | Ripple apply reuses the existing draft/operations machinery (`scheduleOperations` append + optimistic version, `eventSlotBridge` for auto-linked slots) rather than a new write path. | SV-2/SV-3 | SV-1 SPIKE + ADR-016 |
| AS-8 | Cascade-engine debt **TD-5/TD-12/TD-13/TD-14** (untested orchestrator, midnight anchoring, non-idempotent outbox key, split transactions) is serviced before SV builds on cascade outputs — SV-2+ carries a blocking pull gate on the `CASCADE_PREVIEW_PARITY` story from the debt register. | EPIC SV sequencing | SV-1 pull gate |
| AS-9 | New validation codes surface through the existing draft-validation UI and future ops screens; flags `rightsWindows` / `regulatoryCompliance` gate *emission* of new codes so flag-off = byte-identical validation output. Flags are build-time per TD-27 — runbooks must state rollback = redeploy honestly. | All EPICs | Flag tests per task |
| AS-10 | **VRT is a test/first client, not the sole target** (ADR-015 Acceptance record §3): client-specific rights dimensions and (EPIC RC) regulatory obligations are **per-tenant configuration, not product constants**. Q1 answers calibrate defaults; they must not harden VRT-specific rules into the model. | RD dimension/enum design; EPIC RC rule modelling — listed-events/accessibility/remit obligations are tenant-configurable rule sets, VRT = first configuration | Design constraint (inherent); revisit at each client onboarding + RC DoR framing check |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza Domain Gaps
Updated: 2026-07-02

── CURRENT-STATE SURVEY (2026-07-02) — corrections to the research baseline ──

Rights (research said G1/G2/G3 "not covered"; reality is ◐/◐/◐):
  rightsChecker.ts (backend):  UNIFIED checker — platform coverage, time window,
    blackout periods (ERROR), run limits vs RunLedger (LIVE only), territory
    (ERROR), expiry (WARNING). Pure fn + DB-backed per-event + batch + matrix.
  routes/rights.ts + services/rights.ts:  policies CRUD, /rights/check,
    /rights/check/batch (territory param), /rights/matrix (runsUsed, expiry,
    severity, blackoutCount).
  validation/rights.ts (stage 3):  per-SLOT rights validation inside draft
    validation — slot-level checking EXISTS for drafts; the gap is the
    published/live schedule surface + window-category awareness.
  DUAL MODEL (new finding): Contract (enriched) AND RightsPolicy run in
    parallel, bridged by policyToContractShape() with hardcoded legacy
    booleans — consolidation decision needed (ADR-015).
  Stored-but-unconsumed: Contract.tapeDelayHoursMin (no validator reads it).
  CoverageType enum exists (LIVE/HIGHLIGHTS/DELAYED/CLIP) but is SCALAR per
    contract and IGNORED by the checker; RunLedger tallies LIVE only.
  TRUE DELTA G1-G5: window multiplicity + category-aware matching, exclusivity
    tier (incl. OPEN_NET), holdback enforcement, published-schedule slot check.

Volatility (research said G6 "not covered"; reality is ◐):
  cascade/ (engine, compute, estimator, alerts): court-chain retiming with
    advisory locks, writes CascadeEstimate + BroadcastSlot estimated fields
    in one tx; live-elapsed-aware; tennis-flavored (sportMetadata.court_id).
  alerts.ts: OVERRUN_WARNING/ELEVATED, TRIGGER_THRESHOLD_MET (conditional
    switch), WIDE_CASCADE_WINDOW.
  ChannelSwitch entity + confirm endpoint; slot fields conditionalTriggerUtc/
    TargetChannelId, fallbackEventId, OverrunStrategy (EXTEND/CONDITIONAL_
    SWITCH/HARD_CUT/SPLIT_SCREEN).
  eventSlotBridge: event edits via routes/events.ts auto-upsert linked slot
    (shouldSync on channelId/date/time/duration/status).
  THE GAP (verified): import/stages/provision.ts writes startDateBE/
    startTimeBE from feeds WITHOUT calling syncEventToSlot — feed-driven
    kickoff changes do NOT ripple to slots. No review-before-apply anywhere.
  DRIFT (new TD candidate): schemas/broadcastSlots.ts zod enum
    ['EXTEND','TRUNCATE','SWITCH'] diverges from the Prisma OverrunStrategy
    enum — API layer rejects values the DB and validators support.

Regulatory (research said G10-G12 "not covered"; confirmed greenfield, BUT
  an insertion point exists):
  validation/ 5-stage pipeline (structural, duration, rights, regulatory,
    business) — stage 4 already runs WATERSHED_VIOLATION + a dead
    ACCESSIBILITY_MISSING stub reading sportMetadata.hasSubtitles/
    hasAudioDescription (no writer for those fields found).
  No listed-events concept, no FTA channel property, no deliverable entity,
    no remit aggregation. Genuinely greenfield on data model.

Resources & labour (research said G14/G15 "not covered"; G14 is ◐):
  Resource + ResourceAssignment (capacity, 5 types) + assign/unassign routes.
  src/utils/resourceConflicts.ts: CLIENT-SIDE capacity-aware conflict
    detection (post-TD-15 minutes-correct), + ResourceTimeline UI.
  THE GAP: no server-side preflight at booking time (assign endpoint books
    blind), assignments have no own window (ride the event window via tech
    plan), no studio/edit-suite/facility types (Q3).
  Labour rules: NOTHING exists (grep: no rest/working-time/maxHours concepts;
    CrewMember has roles/contact only). Greenfield confirmed.

── PLANNED COMPONENTS ──

Components (new):
  RightsWindow (entity + CRUD):        per-contract exploitation windows — planned
  rightsChecker v2:                    window-aware matching + holdback — planned
  /rights/check-slots:                 published-schedule slot verification — planned
  ListedEventCategory (+ Channel.isFreeToAir): listed-events data + constraint — planned
  AccessibilityDeliverable:            per-event T888/AD/VGT lifecycle — planned
  remitCoverage service:               per-sport/category KPI aggregation — planned
  RippleProposal (ADR-016):            reviewable feed/cascade change sets — planned
  ContingencySchedule:                 pre-built alternate slot sets — planned (SV-4)
  resourceConflicts (server):          preflight at booking time — planned
  LabourRule + evaluator:              working-time checks at assignment — planned (RL-2)

Components (existing, consumed — do not fork):
  rightsChecker.ts, validation/* pipeline, cascade/*, eventSlotBridge,
  scheduleOperations, ChannelSwitch routes, RunLedger, resourcesApi,
  utils/resourceConflicts.ts, utils/crewConflicts.ts

Key ADRs: ADR-001 outbox · ADR-004/007 raw-SQL migrations · ADR-009 pagination ·
  ADR-011 RLS (every new table needs a policy) · ADR-015..018 (this initiative, §2)

Active TD (pre-existing, relevant):
  TD-5/12/13/14: cascade engine debt — SV-2+ blocked until serviced (AS-8)
  TD-22: RLS enforcement activation pending — new tables still need policies NOW
  TD-24: never consume @deprecated Event/Contract fields (note: rightsChecker's
         derivePlatformsFromLegacy is the sanctioned backend fallback; new code
         must not add consumers)
  TD-27: feature flags are build-time (rollback = redeploy)
TD candidates raised by this survey (register on first touching story):
  TD-28: broadcastSlots zod OverrunStrategy enum drift vs Prisma enum
  TD-29: dual rights model (Contract ∥ RightsPolicy) + policyToContractShape
         adapter with hardcoded legacy booleans — serviced via ADR-015
  TD-30: validation/regulatory.ts ACCESSIBILITY_MISSING reads fields nothing
         writes (dead check) — superseded by RC-2

Current Mode: DELIVERY
```

---

## 7. Backlog

### Conventions
Branch `feature/[STORY-ID]-slug` · commits `[type]([scope]): summary` · EPIC IDs **RD / SV / RC / RL**
(distinct from the ops redesign's A–E — no ID collision). Stories RD-1…, tasks RD-1-T1.
Feature flags: **`rightsWindows`**, **`scheduleRipple`**, **`regulatoryCompliance`**, **`resourceGuards`** (all default OFF; build-time per TD-27).
Model routing per Core §6 noted per task (Opus = judgment, Sonnet = generation, Haiku = checklist).

### Proposed EPIC sequencing (dependency-ordered)

```
RD (tracer bullet) ──► RC ──► SV ──► RL
        │               ▲
        │  Exclusivity  │ RC-0 gates (AS-1 KPI verify + ADR-017) resolve
        └─ Tier feeds ──┘ during RD execution; if still blocked at the RD
           OPEN_NET use    retro, SV pulls forward ahead of RC (its SV-1
                           SPIKE has no external gate).
```

Rationale: **RD first** — it is the tracer bullet (schema → checker → validation stage → API → frontend service),
and RC's open-net remit logic consumes its Exclusivity Tier. **RC second** — Must-priority legal exposure, greenfield
(no rework risk), but gate-dependent; its gates are *people* work that runs concurrently with RD. **SV third, not
second** — it builds on the cascade engine, which carries open HIGH-interest debt (TD-5/12/13/14) that must be
serviced first (AS-8); sequencing SV later buys that servicing window. **RL last** — Should-priority, smallest true
delta (server-side preflight + greenfield labour rules).

---

## EPIC RD — Rights Depth (Tracer Bullet)

- **Objective:** Rights Windows with exclusivity tiers as first-class contract children, a window-aware rights
  checker enforcing holdbacks, and slot-level verification of the published schedule — one thin slice from migration
  to consumable frontend selector.
- **Tracer Bullet?:** YES — RD-2 cuts through schema → backend service → validation stage → API → frontend service snapshot.
- **Mode:** DELIVERY
- **DoD additions:** (1) With `rightsWindows` ON, a contract's windows drive `/rights/check` results incl.
  `HOLDBACK_VIOLATION`; flag OFF → validation output byte-identical to the **post-RD-1F baseline** (regression suite
  proves it; golden master recorded after RD-1F lands — ADR-015 Acceptance record §2).
  (2) `/rights/check-slots` verifies every published slot of a channel-day in one call. (3) Backfill gives every
  existing contract exactly one window equivalent to its scalar fields — matrix totals reconcile 1:1 pre/post.
- **Business Value:** G1/G2/G3/G5 — rights verification per market/platform/window is the category-standard
  capability (Mediagenix/Provys parity). Success metric: a rights manager can answer "may we run highlights of
  Saturday's race on VRT MAX on Sunday?" from data, not from reading the contract PDF.
- **Risk:** Med — dual rights model consolidation (TD-29) could balloon → mitigation: ADR-015 decides *disposition
  only*; actual RightsPolicy migration is its own later story, not smuggled into RD-2. Med — Q1 may invalidate window
  categories → mitigation: AS-4 (enum superset + flag). Low — backfill correctness → reconciliation test in RD-2-T1.
- **SLOs:** `Rights check-slots – p95 < 500ms @ 200 slots/day` · `Rights matrix v2 – p95 < 1s @ 100 contracts × 3 windows` · `Draft validation – rights stage adds < 150ms p95 @ 200-slot draft`.
- **Glossary:** Rights Window, Exclusivity Tier, Holdback, Blackout, Run, Rights Status.
- **ADRs:** ADR-015 (produced here — **Accepted 2026-07-02**, incl. Acceptance record), ADR-009 (pagination on new
  list endpoints), ADR-011 (RLS on new tables).
- **Smoke Test Story:** RD-5.
- **Runbook:** `docs/runbooks/rights-windows.md` (RD-5 deliverable): flag off = legacy checker path; symptoms:
  unexpected HOLDBACK/WINDOW codes (check window backfill row for that contract), matrix drift (run reconciliation
  script), check-slots 4xx (pagination params).

---

### Story RD-1 — SPIKE: rights model consolidation + VRT contract dimensions → ADR-015
`SPIKE: Research rights-window data model` — timeboxed **M**.

**As a** architect **I want** a decided data model for Rights Windows and a disposition for the dual
Contract/RightsPolicy situation **so that** RD-2 builds on one model instead of adding a third.

Business Value 3 · Priority 5 · Size **M** · DoR: **READY** · INVEST I✓ N✓ V✓ E✓ S✓ T✓ (spike variant)

**AC:**
- Given the survey findings (§6), When the spike concludes, Then ADR-015 records: RightsWindow shape (child of
  Contract), enum decision (`CoverageType` + `ARCHIVE`?), exclusivity tier values, holdback semantics
  (relation to `tapeDelayHoursMin`), and RightsPolicy disposition (merge / deprecate / season-override) with
  alternatives + consequences.
- Given Q1 is unanswered by then, Then ADR-015 marks dimension-usage assumptions explicitly (AS-4) rather than blocking.
- Findings memo ≤ 2 pages; rejected options recorded.

**Spike rules (DoR conditions C1–C3 + D1, health check 2026-07-02):**
- **C1 (data access):** name the environment for the contract-shape inventory at kickoff and confirm read access.
  If only synthetic/seed data is available, rescope that AC honestly to "schema + seed inventory + request for real
  distributions via Q1" — do not present seed distributions as production evidence.
- **C2 (explicit question):** ADR-015 MUST answer: *"From which model does draft-validation stage 3 resolve Rights
  Windows?"* Stage 3 today consumes only `RightsPolicy → policyToContractShape` (no windows); if windows live only on
  `Contract` children without a decided path for the policy-driven draft flow, RD-5's `HOLDBACK_VIOLATION` smoke test
  is unimplementable.
- **C3 (timebox exhaustion):** when the M timebox exhausts, ADR-015 ships with explicitly-marked open assumptions;
  the spike is never extended to chase certainty.
- **D1 (anchoring guard):** "RightsWindow as child of Contract" is a **hypothesis to test**, not a conclusion to
  rationalize. Evaluate ≥2 genuine alternatives with consequences; RD-2's pre-written Gherkin does not constrain the
  ADR outcome (see re-refinement step in RD-1-T2).

- **RD-1-T1** · Hat **PREPARATORY** · Model **Opus** · Confidence High
  Goal: Trace both rights models end-to-end (writers, readers, adapter), inventory real contract data shapes
  (territory/platform/coverage value distributions via read-only query — per C1), draft the RightsWindow model +
  2 alternatives, and answer C2 (stage-3 window resolution path) explicitly.
  Deliverables: findings memo `docs/plans/rd-1-rights-model-spike.md` → draft ADR-015.
  Pull Gate: none (first task). Unblocks: RD-1-T2.
- **RD-1-T2** · Hat **PREPARATORY** · Model **Opus** (architect review) · Confidence High
  Goal: Finalize `docs/governance/adr/ADR-015-rights-windows-model.md` (status **Proposed** — acceptance authority is
  the architect, per §2); register TD-29 (dual model) with servicing decision; send Q1 to stakeholder with the
  dimension inventory attached; **re-refine RD-2..RD-5 ACs against the accepted ADR-015** (W1: field names, enum
  values, and the RD-5 smoke path are pre-ADR drafts and go stale on any deviation) and scope RD-6 from the
  RightsPolicy disposition.
  Hand-off: **ADR-015 accepted** (blocking gate for RD-2) — ✓ accepted 2026-07-02; re-refinement executed same day
  (§9 entry).
  Unblocks: RD-1F-T1, END OF STORY SEQUENCE.

---

### Story RD-1F — HOTFIX: `maxLiveRuns` null semantics (defect (a) — pre-golden-master, per ADR-015 Acceptance record §2)
**As a** planner **I want** a contract with no run limit set (`maxLiveRuns: null`) to stop producing false
`MAX_RUNS_EXCEEDED` errors in draft validation **so that** publish is never 422-blocked by a limit nobody configured.

Business Value 3 · Priority 5 · Size **S** · DoR: **READY** (mandated at ADR-015 acceptance) · INVEST I✓ N✓ V✓ E✓ S✓ T✓

Defect (a), verified in the RD-1 memo (§1): `policyToContractShape` / the `loadRightsPolicies` DTO chain
(`backend/src/validation/rights.ts:84`, loader at `routes/schedules.ts:15`) maps `maxLiveRuns: c.maxLiveRuns ?? 0` —
"no limit set" becomes "limit 0", so any FULL slot for a covered event yields a false `MAX_RUNS_EXCEEDED` ERROR that
can 422-block publish.

**AC (Gherkin):**
- Given a contract with `maxLiveRuns: null` covering an event, When its draft is validated
  (`POST /schedule-drafts/:id/validate`) or published, Then **no** `MAX_RUNS_EXCEEDED` result is emitted for that
  contract (null = no limit → run-limit check skipped).
- Given a contract with `maxLiveRuns: 0` explicitly set, Then `MAX_RUNS_EXCEEDED` still fires — null and 0 are
  distinct values.
- Given a contract with a positive `maxLiveRuns`, Then existing run-limit behavior is unchanged (regression).

**Feature Flag: none — justified per Core §5.1:** this is a defect fix restoring the intended semantics of *current*
behavior, not a new user-facing capability; flagging it would make the false 422 the flag-OFF behavior and poison
RD-3's golden master. Rollback = revert commit (small, isolated diff; easy to undo → minimum ceremony).
**Golden-master implication (ADR-015 Acceptance record §2):** RD-3's flag-OFF golden master MUST be recorded AFTER
this story lands, so it pins correct null-semantics — never the defect. RD-2-T1 pull-gates on this story being merged.

- **RD-1F-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Fix null-semantics at the named sites: the `maxLiveRuns ?? 0` coercion in the `loadRightsPolicies` →
  `policyToContractShape` chain (`validation/rights.ts:84`, `routes/schedules.ts:15`) must preserve `null`, and the
  run-limit branch of `checkRights` in `rightsChecker.ts` must treat `null`/absent as "no limit" (skip the check)
  while keeping `0` as a genuine limit.
  TDD: (1) failing test FIRST reproducing the false block — draft validation of a contract with `maxLiveRuns: null`
  emits `MAX_RUNS_EXCEEDED` today; (2) minimal fix; (3) refactor. Cover null-vs-0 distinction + positive-limit
  regression.
  Pull Gate: ADR-015 accepted ✓ (Acceptance record §2 mandates this story before RD-2).
  Unblocks: RD-2-T1, END OF STORY SEQUENCE.

---

### Story RD-2 — RightsWindow entity + Exclusivity Tier (tracer slice)
**As a** rights manager **I want** contracts to carry one or more Rights Windows (category, territory, platforms,
exclusivity, validity, run limit, holdback) **so that** what may be scheduled per market/platform/window is data,
not a footnote.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY** (ADR-015 accepted 2026-07-02; RD-2-T1 pull-gates on
RD-1F merged) · INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given an existing contract with scalar rights fields, When the backfill migration runs, Then it owns exactly one
  RightsWindow mapped per ADR-015 §1 — `coverageType→category`, `windowStartUtc/EndUtc` bounds, `territory`/`platforms`
  *as stored*, `maxLiveRuns→maxRuns`, `tapeDelayHoursMin→holdbackHoursMin`, `exclusivity: 'NON_EXCLUSIVE'` (no source
  data — ADR-015 open assumption 2) — and `/rights/matrix` totals are unchanged (reconciliation test; caveat memo
  §5.4: `runsUsed` is 0 for all dev data — no CONFIRMED writer exists — so reconciliation is structural evidence
  only, NOT evidence of run-limit correctness).
- Given a backfilled or new window with empty `territory[]` or `platforms[]`, Then empty = **unrestricted** (nothing
  to check — ADR-015 Acceptance record §4, matching current checker behavior for those contracts). Window `platforms`
  use the **lowercase channel-type vocabulary** (`linear|on-demand|radio|fast|pop-up`) that `checkRights` matches
  against `Channel.types` — never the orphaned UPPERCASE `Platform` enum (ADR-015 §1).
- Given a contract, When I `POST /contracts/:id/rights-windows` with `{category: 'HIGHLIGHTS', exclusivity: 'NON_EXCLUSIVE', …}`,
  Then it persists with a client-supplied UUID id (idempotent retry → 200 same row, not duplicate) and appears in
  `GET /contracts/:id/rights-windows`.
- Given a window with `exclusivity: 'OPEN_NET'`, Then the matrix row exposes it (additive `windows[]` field).
- Error flow: overlapping identical-category windows on one contract → 409 with remediation message; unknown category → 400.
- Given `rightsWindows` flag OFF, Then windows are storable/readable but emit **no** new validation codes anywhere.

**Interfaces:** `rightsWindowsApi` (frontend service): `list(contractId)`, `create`, `update`, `delete`; backend
nested router under `contracts`. **Contract Snapshot `rights-window v1`** (type + endpoints + error shapes).
**TD:** TD-29 serviced per ADR-015 (RightsPolicy untouched here — no third model; deprecation executes in RD-6);
TD-28 registered formally at RD-2-T2. **Test data:** fixture contracts
covering every category × exclusivity permutation (reused by RD-3/RD-4/RD-5).
**Idempotency:** client-generated UUID + unique constraint; PUT is full-replace by id.
**Security/compliance:** tenant-scoped; **RLS `tenant_isolation` policy in the same migration** (ADR-011 gate).

- **RD-2-T1** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Raw-SQL migration (ADR-004/007): `RightsWindow` table per ADR-015 §1 + `ExclusivityTier` enum + `ARCHIVE`
  added to `CoverageType` + RLS policy + backfill (1 window per existing contract, field mapping per ADR-015 §1,
  `exclusivity NON_EXCLUSIVE`) + rollback script; Prisma model.
  **Migration sequencing (ADR-015 §2):** the enum additions are raw-SQL `ALTER TYPE ... ADD VALUE` and **cannot run
  inside a transaction block** — sequence each as its own migration statement outside the transactional part.
  TDD: (1) failing migration test (backfill reconciliation: matrix totals pre == post; every contract has ≥1 window;
  null scalars stay null on the window — no `?? 0` coercion, RD-1F semantics) (2) migration (3) refactor.
  Deliverables: migration + rollback → Prisma schema → backfill reconciliation test.
  Scope note (W4, per ADR-015 §2/§3): the enum changes are **cross-package** and move as one unit — Prisma enums +
  `packages/shared/types.ts:122` TS union + **zod schemas regenerated to the full value set** (this fixes the
  existing drift where `CLIP` is DB-valid but API-rejected — same failure class as TD-28, fixed in the same change
  so DB, shared types and API validate identically).
  Pull Gate: ADR-015 accepted ✓ (2026-07-02); **RD-1F merged** (golden-master ordering, Acceptance record §2);
  confirm no pending migration collisions on main.
  Unblocks: RD-2-T2.
- **RD-2-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Nested CRUD routes + zod schemas + `rightsWindowsApi` frontend service; overlap/duplicate 409 logic;
  idempotent create. **Register TD-28 formally** in `docs/governance/debt-register.md` (first touching story — memo
  §5.7): zod/Prisma enum drift covering `OverrunStrategy`, contract `status` (`expired|terminated` invalid vs
  Prisma), and the run-ledger zod `status` gap (`RUNNING|COMPLETED|CANCELLED` vs Prisma `CONFIRMED|RECONCILED` — the
  API can only create runs the checkers never count). Registration only; servicing beyond the RD-2-T1 enum
  regeneration is a separate story.
  TDD: route tests first (CRUD, idempotent retry, 409 overlap, 400 category, tenant isolation).
  Feature Flag: n/a for storage (data model is not user-facing); emission gating lands in RD-3.
  Hand-off: **Contract Snapshot `rights-window v1`**. Unblocks: RD-2-T3, RD-3-T1.
- **RD-2-T3** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Extend `getRightsMatrix` with additive `windows[]` (category, exclusivity, holdback, runs per window) —
  existing fields untouched so the ops backlog's B-3 consumer is unaffected.
  TDD: matrix shape tests first (additive-only assertion + reconciliation).
  Pull Gate: `rights-window v1`; verify ops backlog B-3 consumes `contractsApi` not `rightsApi.matrix` (survey says
  yes — re-check at execution).
  Hand-off: **Contract Snapshot `rights-matrix v2`**. Unblocks: RD-4-T2, END OF STORY SEQUENCE.

---

### Story RD-3 — Window-aware verification + holdback enforcement (Core Domain)
**As a** planner **I want** every rights check to resolve the *applicable window* (by run type/content segment) and
enforce holdbacks and per-window run limits **so that** a delayed rerun or highlights slot is validated against its
own right, not the live right.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY after RD-2** · INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given a contract with only a LIVE window, When a slot with a DELAYED-run intent is checked, Then
  `WINDOW_CATEGORY_MISSING` (WARNING) with remediation naming the missing category.
- Given a DELAYED window with holdback 24h and a live end at T, When a delayed slot starts before T+24h, Then
  `HOLDBACK_VIOLATION` (ERROR); at/after T+24h → no result. T resolves per ADR-015 §4, in order: (1) the event's
  `RunLedger` LIVE run `endedAtUtc` (actual) → (2) else the event's scheduled end (`startUtc + durationMin`) →
  (3) if neither exists, INFO data-quality note and no violation — never guess (ADR-015 open assumption 3).
- Given a window with `maxRuns: 2` and 2 CONFIRMED runs in the RunLedger for that window's category, When a third
  is checked, Then `MAX_RUNS_EXCEEDED` scoped to the window (and `MAX_RUNS_NEAR` at 1 remaining) — run tallies are
  **per category** on the ADR-015 §2 mapping (TAPE_DELAY→DELAYED; CONTINUATION excluded), no longer LIVE-only.
- **Defect-(b) fix — non-skippable (ADR-015 Acceptance record §2; architect: "nothing skipped"):** Given a window
  with `maxRuns: 2` and 2 CONFIRMED ledger runs in that category, When the **DRAFT is validated**
  (`POST /schedule-drafts/:id/validate` — not merely the event checked via `/rights/check`), Then
  `MAX_RUNS_EXCEEDED` — draft validation consults the RunLedger.
- **Defect-(b) fix — negative proof (non-skippable):** a test proves `existingRuns` in draft validation is populated
  **from the RunLedger query**, not today's hardcoded `[]` at both call sites (memo §1): with ledger runs present the
  violation fires; with the array forced empty it does not — a regression to `[]` fails the suite. These two ACs may
  not be dropped or deferred during implementation.
- Given a window with empty `territory[]`/`platforms[]`, Then those dimensions are **unrestricted** (no violation)
  and checker v2 emits an **INFO data-quality note** for the unscoped window (Acceptance record §4 —
  empty-because-unknown never becomes invisible permissiveness).
- Given `rightsWindows` flag OFF, Then the checker takes the legacy scalar path and emits exactly the **post-RD-1F
  baseline** codes (golden-master regression test — recorded AFTER RD-1F lands, Acceptance record §2).
- Alt: contract with no windows at all (pre-backfill data guard) → legacy path + `INFO` data-quality note.

**Interfaces:** `checkRights` v2 signature (adds `runIntent`/window resolution) — pure function, no DB.
**TD:** TD-28 registered at RD-2-T2 (memo §5.7); do not service the remaining drift here (separate Hat).
**Test data:** RD-2 fixture permutations + RunLedger fixtures per category.

- **RD-3-T1** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (holdback + resolution logic) · Confidence Med
  Goal: Pure `checkRights` v2 in `rightsChecker.ts`: window resolution (slot `contentSegment` + run intent →
  category), holdback math (live-end resolution order per ADR-015 §4: ledger actual → scheduled end → INFO note),
  per-window run limits, unscoped-window INFO data-quality note (Acceptance record §4), new codes; legacy path
  preserved behind flag param.
  TDD: full permutation table as failing tests FIRST (max rigor, ≥80% branch coverage) + golden-master legacy suite
  (recorded post-RD-1F — pins correct null-semantics).
  Pull Gate: `rights-window v1` shape; **adopt the ADR-015 §2 RunType→category mapping — the prior "1:1" assumption
  is VOID:** LIVE→LIVE, TAPE_DELAY→DELAYED, HIGHLIGHTS→HIGHLIGHTS, CLIP→CLIP; CONTINUATION counts with its parent
  run (excluded from tallies, existing `/run-ledger/count` semantics); ARCHIVE has **no** RunType yet — no tally
  source (ADR-015 open assumption 4, raise at RD retro).
  Hand-off: **Contract Snapshot `rights-checker v2`**. Unblocks: RD-3-T2.
- **RD-3-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Wire v2 per ADR-015 §6: with `rightsWindows` ON, the draft validate/publish routes load `Contract` rows
  **with `rightsWindows` included** and pass real contracts into checker v2 — `ValidationContext` gains a
  `contracts` field alongside the legacy `rightsPolicies`; per-category RunLedger tally in
  `checkRightsForEvent`/`checkRightsForEvents` AND in draft validation (defect-(b) wiring: `existingRuns` populated
  from the ledger); the **slot query must include `channel`** so platform checks go live (memo §5.5); batch endpoint
  unchanged in shape. Flag OFF: the legacy `loadRightsPolicies` → `policyToContractShape` adapter chain runs
  unchanged — byte-identical output (golden master recorded post-RD-1F).
  **Territory note (Acceptance record §3):** `Channel` has **no** `territory` field — do NOT invent one silently;
  territory checking stays scoped to what is modelable now (event-level input, as `checkRightsForEvent` takes today)
  and the slot-level territory source is recorded as a refinement item for the RD retro (per-tenant rights dimension
  — AS-10).
  TDD: DB-backed tests first (flag on/off parity, per-category tallies, draft-consults-ledger negative proof,
  channel include).
  Pull Gate: `rights-checker v2`; TD-29 servicing decision honored (RightsPolicy adapter still runs the flag-OFF
  path — do not break; deletion is RD-6).
  Unblocks: RD-4-T1, END OF STORY SEQUENCE.

---

### Story RD-4 — Slot-level verification of the published schedule
**As a** channel manager **I want** every published/live BroadcastSlot of a channel-day verified against rights in
one call **so that** rights violations surface on the schedule I actually broadcast, not only in draft validation.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY after RD-3** · INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given a channel and date, When I `GET /rights/check-slots?channelId=&date=`, Then each slot returns
  `{slotId, ok, results[]}` using checker v2 (windows, holdbacks, blackouts, runs, territory), paginated per ADR-009.
- Given a slot with no event, Then it is skipped with an INFO entry (never silently dropped).
- Given `rightsWindows` OFF, Then the endpoint serves legacy-checker results (shape identical).
- Given the frontend service, When `rightsApi.checkSlots(channelId, date)` resolves, Then the pure selector
  `deriveSlotRightsStatus(results): 'CLEAR'|'WARNING'|'VIOLATION'` maps severities — **selector lives in a domain
  service module, not in ops components** (anti-smart-ui; ops screens adopt it via their own backlog).

**Idempotency:** read-only. **Test data:** channel-day fixture with one slot per violation code.

- **RD-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `GET /rights/check-slots` route: slot query (channel-day), checker v2 per slot, pagination, INFO for
  event-less slots.
  TDD: route tests first (per-code fixtures, pagination, tenant isolation, flag parity).
  Pull Gate: `rights-checker v2`; ADR-009 pagination convention.
  Hand-off: endpoint schema into snapshot below. Unblocks: RD-4-T2.
- **RD-4-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: `rightsApi.checkSlots` + pure `deriveSlotRightsStatus` selector + unit tests; no UI changes.
  TDD: selector permutation tests first.
  Pull Gate: RD-4-T1 endpoint shape.
  Hand-off: **Contract Snapshot `slot-rights v1`** (endpoint + selector) — the designated consumption point for the
  ops Rundown/Schedule screens (their backlog, not this one).
  Unblocks: RD-5-T1, END OF STORY SEQUENCE.

---

### Story RD-5 — EPIC RD smoke test + runbook
**As a** reviewer **I want** an E2E smoke test and a runbook **so that** the tracer bullet is verifiably deployable
and rollbackable.

Size **S** · Priority 4 · DoR: **READY after RD-4**

- **RD-5-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: E2E: seed contract → add DELAYED window with holdback → draft a delayed slot inside holdback →
  `POST /schedule-drafts/:id/validate` returns `HOLDBACK_VIOLATION` (flag ON — stage 3 lives on the draft
  validate/publish routes; `/validate-slot` has **no** rights stage, memo §5.6, and is NOT a valid target for this
  smoke) → `check-slots` reflects it → flag OFF → legacy output golden-master (post-RD-1F baseline) passes.
  Write `docs/runbooks/rights-windows.md`.
  Unblocks: **EPIC RD RETRO** (Phase Summary + Architecture Memory update + mode check + expand SV or RC per gate
  status), END OF STORY SEQUENCE.

---

### Story RD-6 — RightsPolicy deprecation execution (scope fully at RD retro, per ADR-015 §5)
ADR-015 disposition decided: **deprecate** (not merge-further, not season-override). Servicing TD-29. The step
sequence is now named from ADR-015 §5; sizes, ACs and task split are expanded at the RD retro:
1. **Write-freeze policy CRUD** — `routes/rights.ts` policy write endpoints become read-only or 410.
2. **Migrate existing RightsPolicy rows into Contract windows** — requires the Platform-enum→lowercase mapping
   (ADR-015 open assumption 5: proposal `LINEAR→linear`, `OTT→on-demand`; remaining values need stakeholder
   confirmation — decided in this story, not before).
3. **Delete the adapter chain** — `policyToContractShape` + `loadRightsPolicies` + the DTO named `RightsPolicy` in
   `validation/types.ts` (name collision with the Prisma model removed); the flag-ON path becomes the only path
   (ADR-015 §6).
4. **Drop the `RightsPolicy` table last** (migration + rollback).
Placeholder added per health check 2026-07-02 (W2); step sequence named at ADR-015 acceptance (2026-07-02) — without
this story the disposition dangles and the dual model persists indefinitely.
DoR: **NOT READY** — expand at RD retro (post-RD-5, flag-ON path proven). Size TBD.

---

## EPIC RC — Belgian/EU Regulatory Layer

- **Objective:** Listed-events flagging with the full-live-FTA constraint, per-event accessibility deliverables with
  lifecycle status, and remit-coverage aggregation — all as data + validation codes + read endpoints (posture per AS-2:
  annotate, don't block, until ADR-017).
- **Tenant framing (AS-10 — ADR-015 Acceptance record §3):** the listed-events list, accessibility KPI targets and
  remit targets are **tenant-configurable rule sets**, not product constants — VRT/Flemish law is the *first
  configuration* (AS-3's data-not-code rule generalises per tenant; Q1/RC-0 answers calibrate the VRT configuration,
  they do not harden into the model). RC story ACs below are written against the VRT configuration; re-check framing
  at each RC story's DoR — ACs deliberately NOT rewritten in the 2026-07-02 re-refinement pass.
- **Tracer Bullet?:** NO
- **Mode:** DELIVERY
- **DoD additions:** (1) With `regulatoryCompliance` ON, a listed event scheduled without full-live FTA coverage
  yields `LISTED_EVENT_FTA` in draft validation; flag OFF → stage-4 output byte-identical to today. (2) Every
  broadcast event carries deliverable rows whose KPI aggregation reconciles with raw rows 1:1. (3) The listed-events
  list and KPI targets are data, changeable without deploy (AS-3).
- **Business Value:** G10/G11/G12 — legal obligations (Mediadecreet art. 153, AVMSD art. 7/14) currently invisible
  to planning. Success metric: compliance officer answers "which events on the Flemish list this month lack full-live
  FTA coverage, and what's our T888 coverage %?" from two endpoints.
- **Risk:** **High → mitigated by gate:** KPI numbers unverified against 2026-2030 agreement → AS-1 blocking gate
  (RC-0) before RC-2/RC-3 AC freeze. Med — enforcement boundary unknown → AS-2 (all severities WARNING until
  ADR-017). Med — listed list under revision → AS-3 (data-driven). Low — Q4 pipeline unknown → AS-6 (read-only ceiling).
- **SLOs:** `Draft validation – regulatory stage adds < 100ms p95 @ 200-slot draft` · `Remit coverage report – p95 < 2s @ 1 season of events` · `Accessibility KPI endpoint – p95 < 1s`.
- **Glossary:** Listed Event, Free-to-Air, Accessibility Deliverable, Remit Coverage.
- **ADRs:** ADR-017 (produced here), ADR-011 (RLS on new tables).
- **Smoke Test Story:** RC-4.
- **Runbook:** `docs/runbooks/regulatory-compliance.md` (RC-4): flag off = stage-4 legacy behavior; symptoms:
  unexpected LISTED_EVENT_FTA (check event's category match + channel FTA field), KPI drift (run reconciliation),
  list outdated (data update procedure, no deploy).

---

### Story RC-0 — Compliance baseline gate → ADR-017
`SPIKE: Verify KPI baseline + enforcement boundary` — timeboxed **S**.

**As a** product owner **I want** the 2026-2030 beheersovereenkomst KPI numbers verified and the enforcement
boundary (Q2) decided **so that** RC acceptance criteria are legally current and severities are grounded.

Business Value 3 · Priority 5 · Size **S** · DoR: **READY** (the *gate itself* is ready; RC-2/RC-3 HOLD on its output)

**AC:**
- Given the 2026-2030 agreement, When RC-0-T1 completes, Then AS-1 is resolved: each KPI (T888 %, online subtitling %,
  sports count, Sporza share, AD scope, open-net restraint wording) is recorded with the current number + article
  reference in the Assumptions Ledger, and RC-2/RC-3 ACs are updated.
- Given stakeholder input on Q2 (+ Q4 opportunistically), Then ADR-017 records the enforcement boundary
  (validate/annotate/record per check class) and confirms or lifts the G13 deferral.

- **RC-0-T1** · Hat **PREPARATORY** · Model **Haiku** (checklist verification) + human source access · Confidence Med
  (Low if the agreement text is not accessible → escalate to stakeholder immediately)
  Goal: KPI re-verification table (claimed 2021-25 value vs verified 2026-30 value vs delta) appended to the
  Assumptions Ledger; flag every changed number to the RC-2/RC-3 ACs.
  Unblocks: RC-0-T2, RC-2 DoR, RC-3 DoR.
- **RC-0-T2** · Hat **PREPARATORY** · Model **Opus** · Confidence Med
  Goal: Stakeholder session on Q2 (Q4 opportunistic) → author + accept
  `docs/governance/adr/ADR-017-regulatory-enforcement-boundary.md`; set final severities for RC-1-T3/RC-2-T3;
  confirm G13 deferral rationale in §2.
  Hand-off: **ADR-017 accepted**. Unblocks: RC-1-T3 severity freeze, END OF STORY SEQUENCE.

---

### Story RC-1 — Listed Events + full-live-FTA constraint (G10)
**As a** compliance officer **I want** events matched to the Flemish events-of-major-importance list and flagged
when scheduled without full live free-to-air coverage **so that** a legal obligation is visible at planning time,
not discovered after broadcast.

Business Value 3 · Priority 5 · Size **L** · DoR: **READY** (severity value provisional per AS-2 until ADR-017;
everything else unblocked) · INVEST I✓ N✓ V✓ E✓ S✓ T✓
Framing note (AS-10): the listed-events list is the *VRT/Flemish tenant configuration* of a generic listed-events
rule set — already data-not-code per AS-3, which satisfies the per-tenant constraint; ACs unchanged this pass.

**AC (Gherkin):**
- Given the seeded list (10 categories, 9 sports, per-category `fullLiveRequired` — besluit 28 May 2004), When an
  admin edits a category (AS-3), Then the change takes effect without deploy.
- Given an event whose sport/competition matches a listed category, When the event is saved, Then Planza *suggests*
  the match; a user confirms or dismisses (manual `listedCategoryId` assignment — suggestions never auto-bind).
- Given a confirmed listed event with `fullLiveRequired`, When draft validation runs and the event has no LIVE,
  full-segment slot on an FTA channel covering the event window, Then `LISTED_EVENT_FTA` (severity per ADR-017;
  provisional WARNING) with remediation naming the missing condition (no slot / not live / not FTA / partial).
- Given a channel, Then `isFreeToAir` is an explicit channel field (default false, set for Eén/Canvas-class channels
  in seed/config).
- Given `regulatoryCompliance` OFF, Then no new codes emit and registry behavior is unchanged.
- Alt: listed event on FTA but `contentSegment: 'CONTINUATION'` only → still flagged (full coverage required).

**Interfaces:** `listedEventsApi`: `listCategories()`, `updateCategory()`, `suggest(eventId)`, `confirm(eventId, categoryId)`,
`dismiss(eventId)`. **Contract Snapshot `listed-events v1`.**
**TD:** none expected. **Test data:** fixture list + events per remediation branch.
**Idempotency:** confirm/dismiss are idempotent by (eventId) upsert semantics.

- **RC-1-T1** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Migration: `ListedEventCategory` table (+ seed from besluit 2004), `Event.listedCategoryId` (nullable FK),
  `Channel.isFreeToAir boolean default false`; RLS policy; rollback.
  TDD: migration + seed integrity tests first (10 categories, flags correct per besluit).
  Pull Gate: no migration collisions; ADR-011 policy checklist.
  Unblocks: RC-1-T2.
- **RC-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Matching/suggestion service (sport + competition heuristics, pure fn) + CRUD/confirm/dismiss routes +
  `listedEventsApi`.
  TDD: suggestion heuristics permutation tests first; route tests (idempotent confirm, tenant isolation).
  Pull Gate: RC-1-T1 schema.
  Hand-off: **Contract Snapshot `listed-events v1`**. Unblocks: RC-1-T3.
- **RC-1-T3** · Hat **FEATURE** · Model **Sonnet** (spec) / review **Opus** (constraint semantics) · Confidence Med
  Goal: Stage-4 check `LISTED_EVENT_FTA`: for confirmed listed events, verify existence of a LIVE, FULL-segment slot
  on an FTA channel spanning the event window; remediation variants; behind `regulatoryCompliance`; register TD-30
  supersession note (stub stays until RC-2 replaces it).
  TDD: constraint permutation table first (no slot / non-FTA / non-live / CONTINUATION-only / compliant); flag-off
  golden-master for stage 4.
  Pull Gate: ADR-017 severity decision (if RC-0-T2 still open: ship as WARNING + TODO-ADR marker, record in ledger).
  Unblocks: RC-4-T1, END OF STORY SEQUENCE.

---

### Story RC-2 — Accessibility Deliverables per event (G11)
**As a** production planner **I want** each broadcast event to carry its required accessibility deliverables (T888
subtitling, audio description, VGT) with a lifecycle status **so that** the 99%* T888 KPI is planned per event
instead of reconstructed after the fact. (*number provisional — AS-1)

Business Value 3 · Priority 5 · Size **L** · DoR: **HOLD → READY when RC-0-T1 confirms KPI numbers** (structure is
ready; AC thresholds provisional) · INVEST I✓ N✓ V✓ E✓ S✓ T✓
Framing note (AS-10): deliverable types, defaulting policy and KPI targets are tenant configuration (VRT
beheersovereenkomst = first configuration, read from config per the KPI AC); ACs unchanged this pass.

**AC (Gherkin):**
- Given a new event with any broadcast slot, When it is created/bridged, Then a T888 deliverable row defaults to
  `REQUIRED` (policy: sport not excluded from the subtitling KPI); AD and VGT default `NOT_REQUIRED` and are
  switchable per event.
- Given a deliverable, Then its status walks `REQUIRED → PLANNED → CONFIRMED → DELIVERED` (or `NOT_REQUIRED`), each
  transition audited (who/when).
- Given draft validation with `regulatoryCompliance` ON, When an event's slot is within N days and a REQUIRED
  deliverable is not ≥ PLANNED, Then `ACCESSIBILITY_UNPLANNED` (WARNING) — this **supersedes** the dead
  `ACCESSIBILITY_MISSING` stub (TD-30 settled: stub removed in the same task, one Hat, because the stub is dead code
  with no behavioral consumers — verified in survey).
- Given the KPI endpoint, Then coverage % per deliverable type over a period reconciles 1:1 with raw rows, and the
  target number is read from config (AS-1).
- Error flow: status transition skipping states → 409 with allowed transitions.

**Interfaces:** `accessibilityApi`: `list(eventId)`, `setRequirement`, `transition(id, status)`, `kpi(period)`.
**Contract Snapshot `accessibility v1`.**
**Test data:** anonymised events only (no real crew/person names in fixtures).
**Idempotency:** transitions carry expected-current-status (optimistic guard) → retry-safe.

- **RC-2-T1** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Migration: `AccessibilityDeliverable` (eventId, type, status, updatedBy, timestamps) + RLS + rollback;
  defaulting hook on event/slot creation (`eventSlotBridge` + event routes — additive, no behavior change to slots).
  TDD: migration + defaulting tests first.
  Pull Gate: RC-0-T1 (KPI numbers → defaulting policy confirmed); no migration collisions.
  Unblocks: RC-2-T2.
- **RC-2-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: CRUD + transition state machine + audit fields + `accessibilityApi` + KPI aggregation endpoint (config-read
  target).
  TDD: state-machine permutation tests first; KPI reconciliation test.
  Pull Gate: RC-2-T1 schema.
  Hand-off: **Contract Snapshot `accessibility v1`**. Unblocks: RC-2-T3.
- **RC-2-T3** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Stage-4 `ACCESSIBILITY_UNPLANNED` check (lead-time N configurable) + **removal of the dead
  `ACCESSIBILITY_MISSING` stub** + flag gating + golden-master for flag-off.
  TDD: check tests first incl. lead-time boundaries.
  Pull Gate: `accessibility v1`; confirm stub truly has no consumers (grep codes in frontend).
  Unblocks: RC-4-T1, END OF STORY SEQUENCE.

---

### Story RC-3 — Remit coverage tracking (G12)
**As a** compliance officer **I want** output breadth per sport / women's competition / G-sport aggregated against
beheersovereenkomst targets **so that** remit KPIs are monitored during the year, not reconstructed for the VRM audit.

Business Value 2 · Priority 3 · Size **M** · DoR: **HOLD → READY when RC-0-T1 confirms the 32-sports/30%-share
numbers and Q4 clarifies the reporting consumer** (AS-6 caps scope at read-only regardless) · INVEST I✓ N✓ V✓ E✓ S✓ T✓
Framing note (AS-10): remit targets and classifications are tenant configuration (VRT beheersovereenkomst = first
configuration); ACs unchanged this pass.

**AC (Gherkin, provisional numbers marked \*):**
- Given competitions, Then each carries remit classification: sport (existing FK), `isWomens`, `isGSport`
  (competition-level fields; event inherits).
- Given a period, When I `GET /remit/coverage?from&to`, Then per-sport event counts + broadcast hours, women's and
  G-sport shares, and coverage vs the 32\*-sport breadth target return, reconciling 1:1 with events/slots.
- Given the open-net restraint (G5), Then the report cross-references RD's Exclusivity Tier: count of OPEN_NET
  acquisitions for cycling/cyclocross/football surfaces as an informational line (no judgment — that's a portfolio
  policy question for humans).
- Alt: unclassified competitions surface as a data-quality bucket (never silently excluded).

- **RC-3-T1** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Migration: `Competition.isWomens`/`isGSport` (default false) + backfill-by-list script scaffold + rollback;
  classification editable via existing competition routes.
  TDD: migration tests first.
  Pull Gate: RC-0-T1 numbers; no collisions. Unblocks: RC-3-T2.
- **RC-3-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Aggregation service (pure fn over events/slots/classifications + RD windows for the open-net line) +
  `GET /remit/coverage` + `remitApi`.
  TDD: aggregation reconciliation tests first (incl. unclassified bucket).
  Pull Gate: `rights-matrix v2` (open-net line); RC-3-T1 schema.
  Hand-off: **Contract Snapshot `remit-coverage v1`**. Unblocks: RC-4-T1, END OF STORY SEQUENCE.

---

### Story RC-4 — EPIC RC smoke test + runbook
Size **S** · Priority 4 · DoR: **READY after RC-1..RC-3**

- **RC-4-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: E2E: seed list → confirm a listed event → schedule it non-FTA → draft validation shows `LISTED_EVENT_FTA` →
  move to FTA live slot → code clears → T888 deliverable defaulted, transition to PLANNED → KPI endpoint reflects it →
  flag OFF → stage-4 golden-master passes. Write `docs/runbooks/regulatory-compliance.md`.
  Unblocks: **EPIC RC RETRO**, END OF STORY SEQUENCE.

---

## 8. Roadmap EPICs (outline — expand after RD/RC retros, per BB §4 depth rule)

## EPIC SV — Schedule Volatility (outline; SV-1 detailed)

- **Objective:** Feed-driven and cascade-driven changes propagate to BroadcastSlots through reviewable Ripple
  Proposals, and volatile event days get switchable Contingency Schedules — building on (not duplicating) the
  existing cascade engine, eventSlotBridge and ChannelSwitch machinery.
- **Mode:** DELIVERY · **Tracer Bullet?:** NO · **Flag:** `scheduleRipple`
- **Key risks:** High — builds on cascade debt TD-5/12/13/14 → **mitigation AS-8: SV-2+ pull-gate blocks until the
  debt register's `CASCADE_PREVIEW_PARITY` story is done.** Med — ADR-016 semantics (review-vs-auto) need stakeholder
  taste-testing → SV-1 SPIKE first.
- **SLOs (draft):** `Ripple proposal generation – < 5s p95 after feed import` · `Proposal apply – < 2s p95, atomic`.
- **Glossary:** Schedule Ripple, Ripple Proposal, Contingency Schedule, Cascade.

### Story SV-1 — SPIKE: ripple semantics + volatility machinery verification → ADR-016 (DETAILED)
`SPIKE: Research schedule-ripple semantics` — timeboxed **M**.

**As a** architect **I want** verified behavior of the existing volatility machinery and a decided Ripple Proposal
model **so that** SV-2/SV-3 wire into reality instead of assumptions.

Business Value 3 · Priority 4 · Size **M** · DoR: **READY** · INVEST spike-variant ✓

**AC:**
- Verified answers recorded (survey couldn't confirm behavior — SPIKE per backlog-builder rule): (a) who/what
  transitions `ChannelSwitch.executionStatus` beyond PENDING — is CONDITIONAL_SWITCH ever *executed* or only
  alerted (`TRIGGER_THRESHOLD_MET`)? (b) do `OverrunStrategy` values other than alerts have any runtime effect?
  (c) can the cascade engine generalize beyond `sportMetadata.court_id` chains (football kickoff-shift ≠ tennis
  court order)? (d) exact import-path event-update flow in `provision.ts` (confirmed: no `syncEventToSlot` call —
  quantify affected update volume).
- ADR-016 accepted: RippleProposal entity (source: FEED/CASCADE/MANUAL; before/after slot set; idempotency key =
  source change id), which sources auto-apply vs propose (per ADR-016 judgment), apply mechanics per AS-7,
  TD-28 (zod enum drift) servicing decision.

- **SV-1-T1** · Hat **PREPARATORY** · Model **Opus** · Confidence High
  Goal: Behavior verification (a)–(d) with characterization tests where cheap; findings memo.
  Pull Gate: RD retro complete (Architecture Memory current). Unblocks: SV-1-T2.
- **SV-1-T2** · Hat **PREPARATORY** · Model **Opus** · Confidence Med
  Goal: ADR-016 authored + accepted; SV-2..SV-5 expanded into full stories at the RD/RC retro with these findings.
  Hand-off: **ADR-016**. Unblocks: SV-2 (outline), END OF STORY SEQUENCE.

### Outlined stories (expand post-SV-1)
- **SV-2 — Feed-change capture → Ripple Proposals (G8):** `provision.ts` emits a RippleProposal when an imported
  kickoff/date change touches an event with linked slots (instead of today's silent event-only write); proposal
  carries affected-slot preview incl. downstream rights re-check (consumes `slot-rights v1`). Migration + RLS +
  outbox event (ADR-001). **Blocking pull gate: AS-8 cascade debt serviced.**
- **SV-3 — Review-before-apply service (G6/G8):** accept/reject endpoints; accept applies atomically via
  `scheduleOperations`/`eventSlotBridge` (AS-7), re-runs validation, records outcome; reject records rationale.
  Idempotent by proposal id. Frontend service + Contract Snapshot `ripple v1` for future ops Sync/Rundown surfacing.
- **SV-4 — Contingency Schedules (G7):** named pre-built alternate slot set per volatile event day; one-action
  switch executes via ChannelSwitch + slot swap in one transaction; EPG propagation stays downstream (per ADR-017
  boundary analogy — Planza records, playout executes).
- **SV-5 — Alerts surfacing service + smoke test:** expose `evaluateAlerts` results via API/socket as a consumable
  service (today they exist server-side only), E2E smoke: feed kickoff change → proposal → review → apply → slots
  moved + validation clean; runbook `docs/runbooks/schedule-ripple.md`.

## EPIC RL — Resources & Labour (outline; RL-1 detailed)

- **Objective:** Server-side conflict preflight at resource booking time (extending the proven crew/resource
  conflict pattern), and greenfield labour rules evaluated at crew assignment.
- **Mode:** DELIVERY · **Tracer Bullet?:** NO · **Flag:** `resourceGuards`
- **Key risks:** Med — Q3 unknown (which resources matter) → AS-5 caps it to the type list only. Med — labour rules
  touch personal data → anonymised fixtures, retention note, RBAC review in RL-2 DoR.
- **SLOs (draft):** `Resource preflight – < 300ms p95` · `Labour evaluation – < 300ms p95 per assignment save`.
- **Glossary:** Resource, Labour Rule, Crew Health.

### Story RL-1 — Server-side resource booking preflight (G14) (DETAILED)
**As a** production planner **I want** the resource assign endpoint to warn about capacity conflicts *before*
booking **so that** double-booked OB vans surface at booking time, not on the timeline afterwards.

Business Value 2 · Priority 4 · Size **M** · DoR: **READY** (mechanism is Q3-independent per AS-5) · INVEST I✓ N✓ V✓ E✓ S✓ T✓

**AC (Gherkin):**
- Given resource R (capacity 1) assigned to event A, When I `POST /resources/R/assign` for overlapping event B,
  Then the response includes `warnings: [RESOURCE_CAPACITY_CONFLICT{…}]` and the booking **still succeeds** unless
  `?enforce=true` (fail-visible, never fail-open — TD-18 lesson; blocking semantics deferred to ADR-018).
- Given `POST /resources/conflicts/check` with a hypothetical assignment set, Then conflicts return without writing
  (preflight for future UI).
- Given the client-side `detectResourceConflicts`, Then server and client agree on the same fixtures (shared
  characterization suite — the port is behavior-preserving; capacity/overlap math identical incl. the 90-min floor).
- Given `resourceGuards` OFF, Then assign responses are byte-identical to today (no `warnings` field).
- Alt: assignment whose event lacks date/time → INFO data-quality entry, no conflict evaluation (mirrors client).

**Interfaces:** extends `resourcesApi.assign` response (additive `warnings[]`); new `resourcesApi.checkConflicts`.
**Contract Snapshot `resource-preflight v1`.**
**Idempotency:** existing assign semantics unchanged; check endpoint is read-only.

- **RL-1-T1** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: Port `detectResourceConflicts` core to a shared/pure backend service with the client suite as
  characterization tests (behavior-preserving move; client util stays until a later consolidation decision —
  record TD if divergence risk materializes).
  TDD: characterization suite green on ported code FIRST.
  Pull Gate: `src/utils/resourceConflicts.ts` + test suite current on main.
  Unblocks: RL-1-T2.
- **RL-1-T2** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: Preflight in assign route (+ `enforce` param) + `POST /resources/conflicts/check` + `resourcesApi` extension,
  behind `resourceGuards`.
  TDD: route tests first (warn-not-block, enforce, flag-off parity, tenant isolation).
  Hand-off: **Contract Snapshot `resource-preflight v1`**. Unblocks: RL-1-T3, END OF STORY SEQUENCE (T3 optional-gated).
- **RL-1-T3** · Hat **FEATURE** · Model **Sonnet** · Confidence Low (**Q3-gated — do not pull until AS-5 resolves**)
  Goal: Extend `ResourceType` with confirmed types (candidates: `studio`, `edit_suite`, `facility`) + labels +
  migration.
  Pull Gate: Q3 stakeholder answer. Unblocks: END OF STORY SEQUENCE.

### Outlined stories (expand post-RD/RC retro)
- **RL-2 — Labour rules at assignment time (G15):** `LabourRule` per crew member (maxHoursPerWindow, minRestHours,
  maxConsecutiveDays — parameter set per WTD/CAO, values are tenant config not code); pure evaluator over a person's
  assignment windows (extends the `crewConflicts` window-math pattern); WARNING at tech-plan crew save + batch check
  endpoint; Crew Health derivation gains a `LABOUR` contributor (snapshot-versioned so the ops selector upgrade is a
  deliberate ops-backlog story). **PII:** person-linked constraint data — anonymised fixtures, retention decision in
  DoR, RBAC review. **ADR-018** decides placement before this story starts.
- **RL-3 — Smoke test + runbook:** E2E: book conflicting OB van → warning; assign crew violating min-rest → warning;
  flag-off parity. Runbook `docs/runbooks/resource-guards.md`.

---

## 9. Validator Summary (BB v5.1 §9 — DELIVERY level)

- **Structure:** Dependencies form a DAG (RD-1→RD-2→RD-3→RD-4→RD-5; RC-0 ∥ RD with RC-0→RC-2/RC-3 gates;
  RC-1-T1/T2 independent of RC-0; SV/RL outlined with explicit gates; no cycles). EPIC 1 (RD) is a tracer bullet ✓.
  Every detailed task has Unblocks + Pull Gate ✓. Token budgets: largest task (RD-3-T1) is a bounded pure-function
  extension with permutation tests — well under 15k/1,500 LOC ✓.
- **Quality:** Every story passes DoR or carries an explicit HOLD/READY-after-confirm (RC-2, RC-3 HOLD on AS-1;
  RL-1-T3 on Q3) ✓. One Hat per task; schema work is PREPARATORY, behavior is FEATURE; the RC-2-T3 stub removal is
  justified in-story (dead code, no consumers) rather than silently mixed ✓. TDD order explicit per task ✓. Glossary
  reconciled with 5 synonym collisions flagged (§4) ✓. ADRs raised for all cross-cutting decisions (ADR-015..018) ✓.
- **Testing:** Core logic (checker v2, listed-event constraint, deliverable state machine, aggregations,
  conflict port) unit-tested first; golden-master/flag-off parity suites guard every validation-pipeline change;
  E2E smoke per detailed EPIC (RD-5, RC-4; SV-5/RL-3 outlined) ✓. Every schema change has migration + rollback +
  flag + **RLS policy** (ADR-011 gate on all PREPARATORY tasks) ✓. External integrations: none new (feeds already
  ingested; ripple consumes existing import pipeline) ✓.
- **Risk & Debt:** All Med/High risks mitigated or gated with owner (AS-1/AS-2 are the High items — blocking gates,
  Owner: stakeholder + architect via RC-0) ✓. PII: labour rules flagged, anonymised fixtures + retention in RL-2
  DoR ✓. Survey shortcuts recorded as TD-28/29/30 candidates with servicing paths ✓. Assumptions Ledger present with
  High-impact items flagged ✓.
- **Operations:** SLOs per EPIC ✓. Runbook per EPIC ✓. Feature flags on all user-visible changes (validation-code
  emission counts as user-visible; storage does not) — TD-27 build-time caveat stated in runbook requirements ✓.
  Idempotency defined for every write path (UUID create, optimistic transitions, proposal ids, idempotent confirm) ✓.
- **Economics (Core §5):** Anti-bureaucracy — every detailed task's spec is shorter than its expected implementation;
  smallest tasks (RC-0-T1, RL-1-T3) still exceed DoR/DoD overhead ✓. Merges applied: RD-3 keeps resolution + holdback
  + run limits in one story (always change together); RC-2-T3 folds stub removal into the superseding check ✓.
  No premature abstraction: server/client resourceConflicts consolidation deliberately deferred past first
  duplication (Rule of Three) ✓. Depth rule: 2 EPICs detailed, 2 outlined with first story detailed ✓.

**Unresolved items (honest list):** (1) RC-2/RC-3 ACs contain provisional KPI numbers — cannot be finalized by this
validator; blocking gate RC-0-T1 owns them. (2) RC-1-T3 severity is provisional WARNING until ADR-017. (3) SV-2+
cannot be validated beyond outline until SV-1 verifies conditional-switch execution behavior and the cascade debt is
serviced (AS-8). These are encoded as gates, not ignored.

**VERDICT: VALID with gates — EPIC RD is fully READY for execution (RD-1 first); RC-0 should start concurrently.**

**Re-refinement entry — 2026-07-02 (RD-1-T2 hand-off; ADR-015 Accepted by architect):**
- **What changed:** New **Story RD-1F** (defect-(a) hotfix `maxLiveRuns ?? 0`, Size S, FEATURE, unflagged with
  written justification; gates RD-2-T1 so the golden master pins correct null-semantics — Acceptance record §2).
  **RD-2**: backfill AC rewritten to the ADR §1 field mapping (`coverageType→category`, `maxLiveRuns→maxRuns`,
  `tapeDelayHoursMin→holdbackHoursMin`, exclusivity default `NON_EXCLUSIVE`), empty `territory[]`/`platforms[]` =
  unrestricted (Acceptance record §4), lowercase platform vocabulary (not the orphaned `Platform` enum); RD-2-T1
  sequences `ALTER TYPE ... ADD VALUE` outside the transaction block and regenerates zod to the full enum set
  (existing `CLIP` drift fixed); TD-28 registration folded into RD-2-T2 incl. the run-ledger zod `status` gap
  (`RUNNING|COMPLETED|CANCELLED` vs `CONFIRMED|RECONCILED`). **RD-3**: absorbs defect (b) with two **non-skippable**
  ACs (draft validation consults the RunLedger; negative proof that `existingRuns` is ledger-fed, not `[]`); voided
  "1:1" pull-gate assumption replaced by the ADR §2 RunType→category mapping (TAPE_DELAY→DELAYED, CONTINUATION
  excluded, ARCHIVE has no RunType — open assumption 4); unscoped-window INFO note; holdback live-end resolution
  order (ledger actual → scheduled end → INFO, never guess); RD-3-T2 wiring per ADR §6 (`ValidationContext.contracts`,
  `channel` included in the slot query, flag-OFF adapter chain byte-identical; territory scoped to what is modelable
  — no invented `Channel.territory`, refinement item recorded per AS-10). **RD-5**: smoke pinned to
  `POST /schedule-drafts/:id/validate` (`/validate-slot` has no rights stage — memo §5.6). **RD-6**: 4-step
  deprecation sequence named from ADR §5 (write-freeze → row migration with Platform-enum mapping → adapter/DTO
  deletion → drop table); DoR stays NOT READY. **Ledgers:** §2 ADR row → Accepted 2026-07-02; AS-4 annotated
  (Q1 informative, not blocking); new **AS-10** (VRT = test/first client; per-tenant configuration) cross-referenced
  in the EPIC RC preamble + RC-1/RC-2/RC-3 framing notes (RC ACs untouched this pass).
- **Validator re-run (EPIC RD, DELIVERY level):** DAG intact — RD-1 → RD-1F → RD-2 → RD-3 → RD-4 → RD-5, RD-6 gated
  at retro, no cycles ✓ · tracer bullet unchanged (RD-2) ✓ · every task has Hat + TDD order + Pull Gate + Unblocks ✓
  · RD-1F flag omission explicitly justified (defect fix; delivery safety preserved via small revertible diff +
  golden-master ordering enforced in RD-2-T1's pull gate) ✓ · schema task still carries migration + rollback + RLS ✓
  · golden masters explicitly sequenced post-RD-1F everywhere they appear ✓ · defect-(b) ACs marked non-skippable so
  they cannot silently drop out in implementation ✓ · anti-bureaucracy: RD-1F spec shorter than its expected
  test+fix diff ✓ · glossary consistent (`maxRuns`/`holdbackHoursMin`/`category` follow ADR-015 field names; no new
  glossary terms introduced) ✓. **EPIC RD remains VALID — 7 stories (RD-1, RD-1F, RD-2..RD-6); RD-1F is the next
  executable story.**

---

## 10. How to execute with the toolkit

1. **Kick off two threads on day 1:** `gpm-partner` executes **RD-1-T1** (SPIKE); in parallel, schedule the RC-0
   stakeholder session (AS-1 KPI verification + Q2) — it is the long-pole gate for EPIC RC.
2. **Per task:** `backlog-health-advisor` (story DoR — will correctly HOLD RC-2/RC-3 until AS-1 clears) →
   `gpm-partner` (TDD execution) → review chain (`two-hats-enforcer` → smell detectors → `naming-reviewer` →
   `ubiquitous-language-guard` with §4 synonym list) → `test-quality-auditor`.
3. **Model routing** (Core §6): Opus for RD-1/SV-1 spikes, ADR authoring, RD-3-T1 + RC-1-T3 logic review; Sonnet for
   all generation tasks; Haiku for RC-0-T1 verification table and DoD checks.
4. **After EPIC RD:** BB §10 retro — Phase Summary, Architecture Memory update (§6), waste/cycle data, mode check —
   then expand RC (if gates cleared) or pull SV-1 forward; register TD-28/29/30 formally in
   `docs/governance/debt-register.md` if their touching stories ran.
5. **Ops-redesign coordination:** at each retro, publish the new Contract Snapshots (`slot-rights v1`,
   `rights-matrix v2`, `listed-events v1`, `accessibility v1`, `ripple v1`, `resource-preflight v1`) to the ops
   backlog owner — they are the designated integration points for ops screens; this backlog never edits `/ops/*` code.

**Suggested first session:** branch `feature/RD-1-rights-model-spike` → gpm-partner executes RD-1-T1; book the RC-0
stakeholder session the same day.
