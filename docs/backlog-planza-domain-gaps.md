# Planza "Domain Gaps" — Development Backlog v1

> **Initiative:** Rights depth · Schedule volatility · Regulatory compliance · Resources & labour
> **Generated per:** `.claude/frameworks/core-specification-v1.md` (modes, DoD, economics) ·
> `.claude/frameworks/backlog-builder-v5.1.md` (templates, validator)
> **Requirements input:** `docs/ops-domain-gap-analysis.md` (verified research, gaps G1–G15, open questions Q1–Q4, caveats §6)
> **Current-state baseline:** codebase survey 2026-07-02 (§6 below) — **the research's assumed baseline
> ("flat platforms[] + derived per-event status") materially understates the code**; this backlog is built on the verified delta.
> **Status:** v1.2 — **EPIC RD COMPLETE (2026-07-11 retro; RD-1..RD-5 merged/committed — see per-story status +
> `docs/plans/2026-07-11-epic-rd-phase-summary.md`).** RD-6 (RightsPolicy deprecation) now DoR-ready; two RD-retro
> refinements recorded as RD-7/RD-8; EPICs RC detailed, SV & RL outlined (first story detailed).
> EPIC RD re-refined 2026-07-02 against **accepted** ADR-015 (RD-1-T2 hand-off — see §9 re-refinement entry);
> **EPIC RD retro 2026-07-11 (§9 retro entry) — Architecture Memory §6 updated with the shipped delta.**
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
| **ADR-015** (**Accepted 2026-07-02**) | **Rights-window data model + dual rights model.** Survey finding: the codebase has TWO parallel rights models — `Contract` (enriched: territory[], platforms[], coverageType, windows, blackouts, maxLiveRuns) and `RightsPolicy` (separate CRUD + a `policyToContractShape` adapter in `validation/rights.ts`). Adding Rights Windows without a consolidation decision doubles the divergence. **Decided:** RightsWindow as child table of Contract; RightsPolicy **deprecated** (execution in **RD-6 — now DoR-ready at the RD retro**, servicing TD-29); empty `territory[]`/`platforms[]` = unrestricted + INFO note; defect (a) hotfixed before RD-2 (RD-1F), defect (b) folded into RD-3 with non-skippable ACs (Acceptance record §2/§4). **Status: shipped through RD-2..RD-5 (2026-07-11).** | RD-1 SPIKE → ADR ✓ accepted; RD-2..RD-5 ✅ | Architect |
| **ADR-019** (to write, SV-1) | **Schedule Ripple review-before-apply semantics.** Survey finding: event edits via `routes/events.ts` auto-sync to BroadcastSlots (`eventSlotBridge`), but **import-driven kickoff changes do not** (`import/stages/provision.ts` writes `startDateBE/startTimeBE` with no slot sync); the cascade engine silently overwrites slot estimated fields. Define: Ripple Proposal entity, which change sources produce proposals vs direct writes, apply mechanics (via `scheduleOperations`?), idempotency. | SV-1 SPIKE → ADR | Architect |
| **ADR-017** (to write, RC-0) | **Regulatory enforcement boundary (Q2).** Where Planza ends and traffic/playout/EPG begins for listed-events FTA status, accessibility, ad limits: validate (ERROR, blocks publish) vs annotate (WARNING) vs merely record. Determines every severity in EPIC RC and confirms G13 deferral. **Still open — people-work gate (see §9 retro next-EPIC recommendation).** | RC-0 stakeholder session → ADR | Architect + stakeholder |
| **ADR-018** (deferred to RL refinement) | **Resource booking + labour-rule placement.** Whether resource bookings stay tech-plan-anchored (today: `ResourceAssignment` rides the event window) or become first-class bookings with own windows; where labour rules are evaluated (client preflight vs server validation stage). | RL refinement after Q3 | Architect |
| Open (Q1) | Which rights dimensions VRT contracts actually distinguish, and which Planza validates at scheduling time vs leaves to legal. **Gates RD-7/RD-8 (slot-level coverage-category + territory refinements) — see §7.** | AS-4; RD-1 stakeholder input; window categories shipped behind flag either way | Stakeholder |
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

**Mode check (RD retro, 2026-07-11):** stays DELIVERY. The review chain earned its keep on RD (six pre-merge defect
catches, one out-of-hat revert — §9 retro); RC is regulated/compliance-bearing; RD-6 is a Core-Domain one-way-door
migration. No case for down-shifting.

---

## 4. Domain Glossary (Core §2 P3 — enforced in code names)

Reconciled against existing code names. **Bold** = new term this initiative introduces into code.

| Term | Definition | Existing code reconciliation |
|---|---|---|
| **Rights Window** | A temporal exploitation category on a Contract — one of `LIVE / DELAYED / HIGHLIGHTS / CLIP / ARCHIVE` — with its own territory, platforms, exclusivity, validity window, run limit and holdback. The unit rights verification operates on. | Absorbs today's *scalar* `Contract.coverageType` + `windowStartUtc/EndUtc` + `maxLiveRuns` (one value per contract). `CoverageType` enum already exists with 4 of the 5 values (`ARCHIVE` missing — add per ADR-015). **Shipped RD-2.** |
| Territory | Geographic scope of a right; drives geo-blocking and exclusivity. | **Exists**: `Contract.territory: string[]` + `TERRITORY_BLOCKED` check in `rightsChecker.ts`. Moved to per-window under ADR-015 (RD-2); slot/channel-level territory remains event-level pending RD-8. |
| **Exclusivity Tier** | `EXCLUSIVE / NON_EXCLUSIVE / OPEN_NET` qualifier on a Rights Window. | New (shipped RD-2). "Open net" is a *value* of this tier, not a separate entity. |
| Blackout | A contractual prohibition sub-window inside a contract's validity during which broadcast is forbidden. | **Exists**: `Contract.blackoutPeriods` (JSON) + `BLACKOUT_PERIOD` ERROR in `rightsChecker.ts`. ⚠ Synonym flag: the research folds "holdbacks/blackouts" together — code keeps them distinct. |
| **Holdback** | An earliest-release constraint on a Rights Window: content in this window may not run until N hours after the live end (e.g. delayed/on-demand embargo). NOT a Blackout. | Was `Contract.tapeDelayHoursMin` (stored, consumed by no validator). Now first-class per-window `holdbackHoursMin`, **enforced in checker v2 (RD-3)**. |
| Run / Run Ledger | One consumed exploitation of a right (LIVE/TAPE_DELAY/HIGHLIGHTS/CLIP…), tallied against a window's run limit. | **Exists**: `RunLedger` model, `RunType`/`RunStatus` enums. **Now tallied per category (RD-3)** on the ADR-015 §2 mapping, no longer LIVE-only. |
| Rights Status | Per-event/per-slot derivation over Rights Windows × Territory × Exclusivity — no longer a per-contract scalar. | Existing ops glossary term; redefined by this initiative. `deriveSlotRightsStatus` selector shipped RD-4 (`slot-rights v1`); ops `deriveRightsStatus` unaffected until it opts into `rights-matrix v2`. |
| **Listed Event** | An event matching a category of the Flemish events-of-major-importance list (besluit 28 May 2004), carrying a full-live-FTA obligation flag. | New. List is data (seeded, editable — AS-3), never hardcoded. |
| **Free-to-Air (FTA)** | Channel property: receivable without conditional access. Input to the Listed Event constraint. | New `Channel` field (RC-1); today only `platformConfig` JSON exists. |
| **Accessibility Deliverable** | Per-event required access service — `T888` (subtitling), `AUDIO_DESCRIPTION`, `VGT` (Flemish Sign Language) — each with lifecycle status. | New entity. Supersedes the dead stub read of `sportMetadata.hasSubtitles/hasAudioDescription` in `validation/regulatory.ts` (survey: no writer exists for those fields). |
| **Remit Coverage** | Accumulated per-sport / women's / G-sport output measured against beheersovereenkomst KPI targets. | New (read-only aggregation). KPI numbers provisional until AS-1 clears. |
| **Schedule Ripple** | The propagation of an event timing/metadata change through dependent BroadcastSlots, with review-before-apply. | ⚠ Synonym flag: research's "ripple" ≈ code's **cascade** — but they are NOT merged: `cascade/` stays the name of the existing court-chain retiming engine (one *source* of ripple); **Ripple** is the general change-propagation concept (feed-driven, manual, cascade-driven). New code uses Ripple; do not rename cascade. |
| **Ripple Proposal** | A reviewable, idempotent record of a proposed slot change set (source, before/after, confidence) awaiting accept/reject. | New (ADR-019). |
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
| AS-1 ⚠ **High-impact gate** | KPI numbers cited from the **2021-2025** beheersovereenkomst (99% T888, ≥90% online subtitling, 32 sports, 30% Sporza share, AD expansion) hold in the **2026-2030** agreement (signed July 2025). **No RC acceptance criterion referencing a KPI number is final until re-verified** (gap analysis caveat §6.3). **Still open — RC-0-T1 people-work.** | RC-2 AC thresholds, RC-3 targets | RC-0-T1 — blocking gate for RC-2/RC-3 DoR |
| AS-2 ⚠ **High-impact gate** | Planza's regulatory posture is **validate + annotate (WARNING), never block publish**, until ADR-017 decides otherwise (Q2: enforcement boundary vs traffic/playout). All RC validation severities are provisional WARNINGs. **Still open — RC-0-T2.** | All RC severities; G13 deferral | RC-0-T2 (ADR-017) |
| AS-3 | The Flemish listed-events list (2004, under parliamentary revision — caveat §6.4) is modelled as **seeded, editable data**, never as code constants; a list update is a data change, not a release. | RC-1 design | Inherent (design constraint) |
| AS-4 | Rights Window categories = existing `CoverageType` enum + `ARCHIVE`; VRT contracts meaningfully distinguish territory, exclusivity and live/delayed/highlights (Q1). If Q1 reveals fewer dimensions in practice, unused categories stay in the enum, unused validation stays flag-off — no rework. **Accepted-now path confirmed by architect (ADR-015 Acceptance record §3): Q1 is informative, not blocking — answers calibrate defaults, they do not gate RD-2..RD-5.** **RD retro note:** RD-2..RD-5 shipped without Q1; Q1 now gates RD-7/RD-8 (slot-level coverage-category + territory) — see §7. | RD-2/RD-3 scope (shipped); RD-7/RD-8 scope | Q1 packet `docs/plans/rd-1-q1-stakeholder-questions.md` (informative for RD-2..RD-5; a gate for RD-7/RD-8) |
| AS-5 | Studio / edit suite / facility become new `ResourceType` values only if Q3 confirms the ops team books them; the conflict-preflight mechanism (RL-1) is type-agnostic and ships regardless. | RL-1-T3 only | Q3 stakeholder answer |
| AS-6 | Remit coverage (RC-3) is **read-only reporting inside Planza** (aggregation + endpoint); whether it feeds an external pipeline or becomes system of record (Q4) changes consumers, not the aggregation. | RC-3 scope ceiling | Q4 stakeholder answer at RC retro |
| AS-7 | Ripple apply reuses the existing draft/operations machinery (`scheduleOperations` append + optimistic version, `eventSlotBridge` for auto-linked slots) rather than a new write path. | SV-2/SV-3 | SV-1 SPIKE + ADR-019 |
| AS-8 | Cascade-engine debt **TD-5/TD-12/TD-13/TD-14** (untested orchestrator, midnight anchoring, non-idempotent outbox key, split transactions) is serviced before SV builds on cascade outputs — SV-2+ carries a blocking pull gate on the `CASCADE_PREVIEW_PARITY` story from the debt register. | EPIC SV sequencing | SV-1 pull gate |
| AS-9 | New validation codes surface through the existing draft-validation UI and future ops screens; flags `rightsWindows` / `regulatoryCompliance` gate *emission* of new codes so flag-off = byte-identical validation output. Flags are build-time per TD-27 — runbooks must state rollback = redeploy honestly. **RD confirmed:** flag OFF byte-identical to the post-RD-1F baseline (golden master, RD-3). | All EPICs | Flag tests per task |
| AS-10 | **VRT is a test/first client, not the sole target** (ADR-015 Acceptance record §3): client-specific rights dimensions and (EPIC RC) regulatory obligations are **per-tenant configuration, not product constants**. Q1 answers calibrate defaults; they must not harden VRT-specific rules into the model. | RD dimension/enum design; EPIC RC rule modelling; RD-8 (channel territory is per-tenant config) | Design constraint (inherent); revisit at each client onboarding + RC DoR framing check |

---

## 6. Architecture Memory — Delta for this initiative

```
ARCHITECTURE MEMORY: Planza Domain Gaps
Updated: 2026-07-11 (EPIC RD shipped; RD-6 DoR-ready; refinements RD-7/RD-8 raised)

── SHIPPED (EPIC RD, 2026-07-02 .. 2026-07-11) ──

RightsWindow (child table of Contract) + ExclusivityTier enum + ARCHIVE on
  CoverageType — RD-2 (PR #15 aaf316f). RLS tenant_isolation on the table.
  Backfill: 1 window per existing contract (ADR-015 §1 mapping, NON_EXCLUSIVE).
  Cross-package enum regen (Prisma + shared union + zod) fixed the CLIP drift.
  Overlap-409 = pure 4-way predicate (category ∧ validity ∧ territory ∧
  platform; empty[] = unrestricted → intersects all). Idempotent create
  (client UUID). Snapshots: rights-window v1, rights-matrix v2 (additive windows[]).
checkRights v2 (pure, window-aware) — RD-3 (PR #16 29ecebd): window resolution
  by run intent, holdback math (ADR-015 §4 live-end order: ledger actual →
  scheduled end → INFO), per-window/per-category run limits. New codes:
  WINDOW_CATEGORY_MISSING (WARN), HOLDBACK_VIOLATION (ERR), WINDOW_UNSCOPED /
  NO_WINDOWS / HOLDBACK_LIVE_END_UNKNOWN (INFO). Legacy path behind explicit
  windowsEnabled param (pure fn never reads env); frozen-message golden master.
  Wired into draft validate/publish behind RIGHTS_WINDOWS_ENABLED (explicit
  env parse — NOT z.coerce.boolean): ValidationContext.contracts (windows
  included) + channel on slot query; defect-(b) fixed (existingRuns from the
  RunLedger, non-skippable, negative proof). Snapshot: rights-checker v2.
GET /rights/check-slots (ADR-009 paginated) + deriveSlotRightsStatus pure
  selector — RD-4 (PR #17 e6ec688). SLOT_EVENT_MISSING / SLOT_EVENT_UNRESOLVED.
  Snapshot: slot-rights v1 (ops Rundown/Schedule consumption point).
Gated tracer smoke + runbook docs/runbooks/rights-windows.md — RD-5
  (b607bc1, branch feature/RD-5-smoke-runbook — NOT yet merged to main).
Metrics: backend vitest 498 pass; tsc clean (backend/shared/frontend);
  flag OFF byte-identical to the post-RD-1F baseline (golden master).

REACHABILITY CAVEAT (RD retro): non-LIVE holdback + per-window enforcement is
  checker CAPABILITY but NOT reachable from real published slots — BroadcastSlot
  has no coverage-category column (real slots resolve to runIntent=LIVE). The
  per-category tally ISOLATION is real/tested. Reaching non-LIVE enforcement
  needs RD-7. Territory stays event-level (Channel has no territory) → RD-8.

── CURRENT-STATE SURVEY (2026-07-02) — corrections to the research baseline ──

Rights (research said G1/G2/G3 "not covered"; reality is ◐/◐/◐):
  rightsChecker.ts (backend):  UNIFIED checker — platform coverage, time window,
    blackout periods (ERROR), run limits vs RunLedger (LIVE only), territory
    (ERROR), expiry (WARNING). Pure fn + DB-backed per-event + batch + matrix.
    NOW: window-aware v2 shipped (RD-3) — per-category tallies, holdbacks.
  routes/rights.ts + services/rights.ts:  policies CRUD, /rights/check,
    /rights/check/batch (territory param), /rights/matrix (runsUsed, expiry,
    severity, blackoutCount). NOW: + /rights/check-slots (RD-4), matrix v2.
  validation/rights.ts (stage 3):  per-SLOT rights validation inside draft
    validation. NOW: contract-backed context (ValidationContext.contracts)
    behind rightsWindows flag; adapter chain still runs flag-OFF until RD-6.
  DUAL MODEL: Contract (enriched) AND RightsPolicy in parallel, bridged by
    policyToContractShape(). Disposition = DEPRECATE (ADR-015 §5); execution
    = RD-6 (DoR-ready). RD-2/RD-3 left RightsPolicy untouched (no third model).
  Stored-but-unconsumed: Contract.tapeDelayHoursMin — NOW backfilled into
    RightsWindow.holdbackHoursMin and enforced (RD-3); scalar @deprecated.
  CoverageType enum: NOW LIVE/HIGHLIGHTS/DELAYED/CLIP/ARCHIVE, per-window.
  TRUE DELTA G1-G5: window multiplicity + category-aware matching ✓,
    exclusivity tier incl. OPEN_NET ✓, holdback enforcement ✓ (capability;
    reachability gated on RD-7), published-schedule slot check ✓ (RD-4).

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
  DRIFT (TD-28): schemas/broadcastSlots.ts zod OverrunStrategy enum diverges
    from Prisma — registered RD-2-T2, servicing separate (see below).

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
  RightsWindow (entity + CRUD):        SHIPPED RD-2 (PR #15)
  rightsChecker v2:                    SHIPPED RD-3 (PR #16)
  /rights/check-slots:                 SHIPPED RD-4 (PR #17)
  BroadcastSlot coverage-category src: planned RD-7 (refinement; Q1-gated)
  Channel territory source:            planned RD-8 (refinement; Q1/AS-10-gated)
  ListedEventCategory (+ Channel.isFreeToAir): listed-events data + constraint — planned RC-1
  AccessibilityDeliverable:            per-event T888/AD/VGT lifecycle — planned RC-2
  remitCoverage service:               per-sport/category KPI aggregation — planned RC-3
  RippleProposal (ADR-019):            reviewable feed/cascade change sets — planned SV
  ContingencySchedule:                 pre-built alternate slot sets — planned (SV-4)
  resourceConflicts (server):          preflight at booking time — planned RL-1
  LabourRule + evaluator:              working-time checks at assignment — planned (RL-2)

Components (existing, consumed — do not fork):
  rightsChecker.ts (now v2), validation/* pipeline, cascade/*, eventSlotBridge,
  scheduleOperations, ChannelSwitch routes, RunLedger, resourcesApi,
  utils/resourceConflicts.ts, utils/crewConflicts.ts

Contract Snapshots published (integration points for ops backlog):
  rights-window v1, rights-matrix v2, rights-checker v2, slot-rights v1.
  (upcoming: listed-events v1, accessibility v1, remit-coverage v1, ripple v1,
   resource-preflight v1)

Key ADRs: ADR-001 outbox · ADR-004/007 raw-SQL migrations · ADR-009 pagination ·
  ADR-011 RLS (every new table needs a policy) · ADR-015 (Accepted; shipped) ·
  ADR-019..018 (this initiative, §2)

Active TD (pre-existing, relevant):
  TD-5/12/13/14: cascade engine debt — SV-2+ blocked until serviced (AS-8)
  TD-22: RLS enforcement activation pending — new tables still need policies NOW
  TD-24: never consume @deprecated Event/Contract fields (note: rightsChecker's
         derivePlatformsFromLegacy is the sanctioned backend fallback; new code
         must not add consumers). RD-2 @deprecated the Contract rights scalars.
  TD-27: feature flags are build-time (rollback = redeploy)
TD from this initiative (status):
  TD-28: zod↔Prisma enum drift — REGISTERED RD-2-T2. Partially serviced (new
         window surface + CLIP contract-write fixed in the RD-2 regen); the
         contract/policy coverageType+status and run-ledger status drift remain
         a separate tested story (may be picked up in RD-6, one Hat).
  TD-29: dual rights model (Contract ∥ RightsPolicy) + policyToContractShape
         adapter — REGISTERED; servicing = RD-6 (DoR-ready). Interest HIGH.
  TD-30: validation/regulatory.ts ACCESSIBILITY_MISSING dead check — untouched;
         superseded by RC-2.

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
RD (tracer bullet, ✅ COMPLETE) ──► RC ──► SV ──► RL
        │                            ▲
        │  Exclusivity Tier          │ RC-0 gates (AS-1 KPI verify + ADR-017)
        └─ feeds OPEN_NET use ───────┘ still OPEN at the RD retro → SV pulls
                                       forward for CODE work while RC-0 runs
                                       as the people-work long pole (§9 retro).
```

Rationale: **RD first** — it was the tracer bullet (schema → checker → validation stage → API → frontend service),
now shipped, and RC's open-net remit logic consumes its Exclusivity Tier. **RC second** — Must-priority legal exposure,
greenfield (no rework risk), but gate-dependent; its gates are *people* work. **SV third, not
second** — it builds on the cascade engine, which carries open HIGH-interest debt (TD-5/12/13/14) that must be
serviced first (AS-8); sequencing SV later buys that servicing window. **RL last** — Should-priority, smallest true
delta (server-side preflight + greenfield labour rules).

**RD-retro sequencing decision (2026-07-11):** RC-0's two gates (AS-1 KPI verify + ADR-017) were **not** resolved
during RD execution and are people-work. Per the sequencing rule, **SV-1 (SPIKE) pulls forward as the code-ready next
step** (its only pull gate — "RD retro complete / Architecture Memory current" — is now satisfied, and it carries no
external gate), while **RC-0 starts concurrently as the long-pole people-work**. See §9 retro for the full recommendation.

---

## EPIC RD — Rights Depth (Tracer Bullet) — ✅ COMPLETE (2026-07-11)

- **Objective:** Rights Windows with exclusivity tiers as first-class contract children, a window-aware rights
  checker enforcing holdbacks, and slot-level verification of the published schedule — one thin slice from migration
  to consumable frontend selector. **Delivered** (RD-2..RD-5); reachability caveat recorded (RD-7).
- **Tracer Bullet?:** YES — RD-2 cut through schema → backend service → validation stage → API → frontend service snapshot.
- **Mode:** DELIVERY
- **DoD outcome:** (1) With `rightsWindows` ON, a contract's windows drive `/rights/check` incl. `HOLDBACK_VIOLATION`;
  flag OFF → byte-identical to the post-RD-1F baseline (golden master ✓). (2) `/rights/check-slots` verifies a
  channel-day in one call ✓. (3) Backfill gives every contract exactly one equivalent window; matrix totals
  reconcile 1:1 ✓.
- **Business Value:** G1/G2/G3/G5 — category-standard rights verification per market/platform/window (Mediagenix/Provys parity).
- **Snapshots produced:** `rights-window v1`, `rights-matrix v2`, `rights-checker v2`, `slot-rights v1`.
- **Metrics:** backend vitest 498 pass; tsc clean; flag OFF byte-identical.
- **Runbook:** `docs/runbooks/rights-windows.md` (RD-5).
- **Phase summary:** `docs/plans/2026-07-11-epic-rd-phase-summary.md`.

---

### Story RD-1 — SPIKE: rights model consolidation + VRT contract dimensions → ADR-015
**Status: ✅ COMPLETE (2026-07-02).** ADR-015 authored + **Accepted**: RightsWindow child-of-Contract; RightsPolicy →
**deprecate** (RD-6); enum `CoverageType`+`ARCHIVE`; `ExclusivityTier {EXCLUSIVE,NON_EXCLUSIVE,OPEN_NET}`; empty
`territory[]`/`platforms[]` = unrestricted + INFO; C2 answered (stage 3 resolves windows from Contract). Findings memo
`docs/plans/rd-1-rights-model-spike.md`. TD-29 registered (deprecate disposition); Q1 packet sent as informative
(AS-4). Two live defects surfaced → (a) RD-1F, (b) folded into RD-3. RD-2..RD-5 ACs re-refined same day (§9).

---

### Story RD-1F — HOTFIX: `maxLiveRuns` null semantics
**Status: ✅ COMPLETE — merged `a4b40bd`.** `maxLiveRuns: null` no longer coerced to `0` in the
`loadRightsPolicies → policyToContractShape` chain and in `checkRights`: null/absent = no limit (check skipped),
`0` = genuine limit, positive unchanged. Unflagged defect fix (justified); landed **before** RD-2 so RD-3's flag-OFF
golden master pins correct null-semantics, not the defect.

---

### Story RD-2 — RightsWindow entity + Exclusivity Tier (tracer slice)
**Status: ✅ COMPLETE — PR #15 (`aaf316f`).**
- **T1 (PREP):** raw-SQL migration — `RightsWindow` child table + `ExclusivityTier` enum + `ARCHIVE` on `CoverageType`
  (`ALTER TYPE … ADD VALUE` sequenced outside the tx) + `tenant_isolation` RLS + backfill (1 window/contract, ADR-015
  §1 mapping, `NON_EXCLUSIVE`) + rollback. Cross-package enum regen (Prisma + shared union + zod) that also fixed the
  `CLIP` API-reject drift. Backfill reconciliation test (matrix totals pre == post; null scalars preserved).
- **T2 (FEATURE):** nested CRUD + `rightsWindowsApi`; **pure 4-way overlap-409 predicate** (same category ∧
  intersecting validity ∧ territory ∧ platform; empty[] = unrestricted → intersects all — architect decision
  2026-07-10); idempotent create (client UUID, retry → 200 same row). **TD-28 registered.**
- **T3 (FEATURE):** additive `windows[]` on `getRightsMatrix` (existing fields untouched; ops B-3 unaffected).
- **Snapshots:** `rights-window v1`, `rights-matrix v2`.

---

### Story RD-3 — Window-aware verification + holdback enforcement (Core Domain)
**Status: ✅ COMPLETE — PR #16 (`29ecebd`).**
- **T1 (FEATURE):** pure window-aware `checkRights` v2 — window resolution, holdback math (ADR-015 §4 live-end order:
  ledger actual → scheduled end → INFO, never guess), per-window/per-category run limits. New codes:
  `WINDOW_CATEGORY_MISSING` (WARN), `HOLDBACK_VIOLATION` (ERR), and three distinct INFO codes `WINDOW_UNSCOPED` /
  `NO_WINDOWS` / `HOLDBACK_LIVE_END_UNKNOWN`. Legacy scalar path behind an explicit `windowsEnabled` **param**;
  frozen-message golden master.
- **T2 (FEATURE):** wired into draft validate/publish behind `RIGHTS_WINDOWS_ENABLED` (explicit env parse — NOT
  `z.coerce.boolean`); `ValidationContext.contracts` (windows included) + `channel` on the slot query; per-category
  RunLedger tally; **defect-(b) fix** — `existingRuns` populated from the RunLedger (non-skippable, negative proof).
  CONFIRMED fixtures seeded via Prisma (TD-28 constraint). Flag OFF = post-RD-1F baseline byte-identical.
- **Snapshot:** `rights-checker v2`.

---

### Story RD-4 — Slot-level verification of the published schedule
**Status: ✅ COMPLETE — PR #17 (`e6ec688`).**
- **T1 (FEATURE):** `GET /rights/check-slots?channelId=&date=` — checker v2 per slot, ADR-009 pagination, event-less
  slots → INFO `SLOT_EVENT_MISSING`, unresolvable events → `SLOT_EVENT_UNRESOLVED` (never silently dropped).
- **T2 (FEATURE):** `rightsApi.checkSlots` + pure `deriveSlotRightsStatus(results): 'CLEAR'|'WARNING'|'VIOLATION'`
  selector in a domain-service module (anti-smart-ui), no UI changes.
- **Snapshot:** `slot-rights v1` — designated ops Rundown/Schedule consumption point.

---

### Story RD-5 — EPIC RD smoke test + runbook
**Status: ✅ COMPLETE — committed `b607bc1` on branch `feature/RD-5-smoke-runbook` (NOT yet pushed/merged to main).**
Gated tracer smoke: seed contract → DELAYED window w/ holdback → draft a delayed slot inside the holdback →
`POST /schedule-drafts/:id/validate` → `HOLDBACK_VIOLATION` (flag ON) → `check-slots` reflects it → flag OFF →
post-RD-1F golden master passes. Runbook `docs/runbooks/rights-windows.md`.
**Housekeeping (outward-facing, outstanding):** push + merge `feature/RD-5-smoke-runbook` and record the
`rightsWindows` flag posture per environment — the last step before EPIC RD is fully on main.

---

### Story RD-6 — RightsPolicy deprecation execution (servicing TD-29) — **DoR-ready (RD retro 2026-07-11)**
ADR-015 §5 disposition = **deprecate** (not merge-further, not season-override). Now that the flag-ON path is proven
end-to-end (RD-2..RD-5), the step sequence is concrete.

**As an** architect **I want** the deprecated `RightsPolicy` model and its lossy adapter chain removed **so that**
Planza runs one rights model (Contract + windows) and draft validation no longer round-trips through a lossy DTO.

Business Value 2 · Priority 3 · Size **L** (4 tasks) · DoR: **READY** (ADR-015 §5 sequence named; flag-ON path proven
at RD-5) · INVEST I✓ N✓ V✓ E✓ S✓ T✓

**Prerequisite gate (one-way door — record honestly):** RD-6 deletes the flag-OFF adapter path, so the flag-ON path
becomes the **only** path and the golden-master safety net disappears. It MUST NOT start until (a)
`feature/RD-5-smoke-runbook` is merged to main, and (b) a decision to run `rightsWindows` ON in all target
environments is recorded. Sequence it deliberately — after RD-6 there is no legacy path to fall back to.

**AC (Gherkin):**
- **Write-freeze (step 1):** Given the policy write endpoints in `routes/rights.ts` (create/update/delete), When
  called, Then they return **410 Gone** with a message pointing at rights-windows; reads stay available until step 3.
  `RightsPoliciesPanel.tsx` + the `rightsApi` policy write methods are removed/disabled in the same change.
- **Row migration (step 2):** Given existing `RightsPolicy` rows, When the migration runs, Then each maps into
  Contract `RightsWindow`(s) using the **Platform-enum → lowercase mapping decided here** (`LINEAR→linear`,
  `OTT→on-demand`; remaining values stakeholder-confirmed in this story — ADR-015 open assumption 5); a reconciliation
  test proves no rights coverage is lost or invented; idempotent + rollback script.
- **Adapter/DTO deletion (step 3):** Given the flag-ON path is the only path, When `policyToContractShape` +
  `loadRightsPolicies` + the DTO-named-`RightsPolicy` in `validation/types.ts` are deleted, Then draft validation
  loads Contract-with-windows directly (`ValidationContext.contracts` only; legacy `rightsPolicies` field removed),
  the `rightsWindows` conditional branches collapse to the ON path, the DTO/Prisma name collision is gone, and the
  full backend suite is green (characterization — no behavior change).
- **Table drop (step 4):** Given no readers remain, When the final migration drops the `RightsPolicy` table (+ enum
  types it solely owns), Then `migrate status` is clean and rollback restores it.
- Given any step, Then **TD-29 is updated** in the debt register (settled at step 4).

**Interfaces:** removes `rightsApi` policy methods; no new Contract Snapshot (consumers already on `rights-window v1`/
`rights-checker v2`). **Security/compliance:** tenant-scoped migration; RLS already on RightsWindow.
**TD:** settles TD-29; TD-28's remaining contract/policy `coverageType`+`status` zod drift **may** be serviced
opportunistically here OR left to its own story — do not force it in (one Hat).

- **RD-6-T1** · Hat **FEATURE** · Model **Sonnet** · Confidence High
  Goal: write-freeze policy CRUD (writes → 410) + remove policy write UI/api methods.
  TDD: route tests first (410 on write, read still 200; tenant isolation unchanged).
  Pull Gate: RD-5 merged to main + flag-ON decision recorded (prerequisite gate). Unblocks: RD-6-T2.
- **RD-6-T2** · Hat **PREPARATORY** · Model **Opus** (mapping judgment) · Confidence Med
  Goal: decide + apply the Platform-enum → lowercase mapping (stakeholder-confirm the non-obvious values); raw-SQL
  migration `RightsPolicy` rows → `RightsWindow` + reconciliation test + rollback.
  TDD: migration reconciliation test first (coverage neither lost nor invented; idempotent re-run).
  Pull Gate: RD-6-T1 (writes frozen so no new policy rows appear mid-migration). Unblocks: RD-6-T3.
- **RD-6-T3** · Hat **REFACTORING** · Model **Sonnet** · Confidence High
  Goal: delete `policyToContractShape` + `loadRightsPolicies` + the DTO name collision; collapse the `rightsWindows`
  flag branch in the validation pipeline to the ON path. Pure removal — behavior already lives on the flag-ON path.
  TDD: characterization suite green throughout; assert no emitted-code change.
  Pull Gate: RD-6-T2 (rows migrated → no readers depend on the adapter). Unblocks: RD-6-T4.
- **RD-6-T4** · Hat **PREPARATORY** · Model **Sonnet** · Confidence High
  Goal: drop the `RightsPolicy` table + solely-owned enum types (migration + rollback); settle TD-29 in the register.
  TDD: migration + rollback test; `migrate status` clean.
  Pull Gate: RD-6-T3 (adapter/DTO deleted → no readers). Unblocks: END OF STORY SEQUENCE.

---

### Story RD-7 — Slot-level coverage-category source (RD-retro refinement 1)
**Origin:** RD retro 2026-07-11 (phase summary §refinements). Recorded so non-LIVE holdback reachability is a visible
backlog item, not invisible debt.

**As a** planner **I want** a published `BroadcastSlot` to carry its coverage category (LIVE/DELAYED/HIGHLIGHTS/CLIP)
**so that** the non-LIVE holdback and per-window enforcement built in RD-3 becomes reachable from real slots, not only
from synthetic run-intent fixtures.

**Context (honest caveat):** `checkRights` v2 *can* enforce DELAYED/HIGHLIGHTS/CLIP holdbacks and per-category run
limits, but `BroadcastSlot` has **no coverage-category column** — real slots resolve to `runIntent = LIVE`, so every
non-LIVE branch is currently **capability, not reachable** from production data. The per-category tally *isolation* is
real and tested; what is missing is the input that routes a real slot to a non-LIVE window.

Business Value 3 · Priority 3 (Should) · Size **M** · DoR: **NOT READY** — needs (a) Q1 answer on whether VRT
distinguishes coverage at slot level (AS-4) and (b) a source decision: derive from
`Event.contentSegment`/`RunLedger.runType` vs a new explicit `BroadcastSlot.coverageCategory`. Expand at the RC retro
or when Q1 lands.

**Draft AC:** a real DELAYED slot inside its holdback → `HOLDBACK_VIOLATION` at draft validation end-to-end;
flag-off parity; backfill/derivation reconciles with the existing LIVE assumption (no regression for LIVE-only data).

---

### Story RD-8 — Slot/channel-level territory source (RD-retro refinement 2)
**Origin:** RD retro 2026-07-11 (ADR-015 Acceptance record §3; AS-10).

**As a** rights manager **I want** territory checkable at the channel/slot level **so that** geo-scoped windows are
enforced on the published schedule, not only on event-level input.

**Context:** `Channel` has **no territory field** (ADR-015 Acceptance record §3); territory checking stays event-level
today. Reaching slot-level territory needs a `Channel.territory` (or slot override) source. Per **AS-10** this is
per-tenant rights-dimension configuration, not a product constant.

Business Value 2 · Priority 2 (Could) · Size **S** · DoR: **NOT READY** — gated on Q1 (does VRT scope rights by
channel territory?) + AS-10 tenant-config framing.

**Draft AC:** `Channel.territory` field (config/seed) → checker v2 territory dimension resolves from the slot's
channel; empty = unrestricted (`WINDOW_UNSCOPED` INFO unchanged); flag-off parity.

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
- **RC-0-T3** · Hat **PREPARATORY** · Model **Haiku** (checklist) + human/legal source access · Confidence Med
  **(added 2026-07-13, RC-1 DoR fix — the listed-events legal content is the SAME class of unverified legal fact as
  the KPIs (AS-1→RC-0-T1); it must have a matching verification gate, not ship as silent undone work.)**
  Goal: verify the RC-1 seeded `ListedEventCategory` list against the **authoritative besluit 28 May 2004** (and its
  parliamentary-revision status, caveat §6.4) — confirm the exact categories, sports, and per-category
  `fullLiveRequired` flags; correct the seed **as data** (AS-3 → no deploy) and clear the `TODO-LEGAL` markers.
  DoR: **READY** (gate itself; RC-1 ships provisional in the meantime). Blocking for: *legal sign-off* of RC-1 (not
  RC-1's code, which ships flag-off with provisional data). Unblocks: RC-1 legal-complete.

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
- Given the seeded list (**best-effort representative categories, marked `TODO-LEGAL` provisional pending
  authoritative besluit 28 May 2004 verification — RC-0-T3; AS-3 makes this editable data, not law-in-code**), When
  an admin edits a category (AS-3), Then the change takes effect without deploy. **Seed tests assert STRUCTURE not
  legal correctness:** each row is structurally valid (name, a `sportId` FK that resolves, boolean `fullLiveRequired`),
  tenant-isolated (RLS), and the edit round-trips — they do NOT assert "flags correct per besluit" (that oracle is
  the RC-0-T3 people-work, mirroring the AS-1 KPI gate).
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
  TDD: migration + seed **structural-integrity** tests first (rows structurally valid: name present, every `sportId`
  FK resolves, `fullLiveRequired` is a proper boolean, tenant-isolated via RLS, edit round-trips). Do NOT assert
  "flags correct per besluit" — the seed is `TODO-LEGAL` provisional (RC-0-T3 verifies the authoritative list; the
  list is editable data per AS-3, so a correction is a data edit, no deploy).
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
  debt register's `CASCADE_PREVIEW_PARITY` story is done.** Med — ADR-019 semantics (review-vs-auto) need stakeholder
  taste-testing → SV-1 SPIKE first.
- **SLOs (draft):** `Ripple proposal generation – < 5s p95 after feed import` · `Proposal apply – < 2s p95, atomic`.
- **Glossary:** Schedule Ripple, Ripple Proposal, Contingency Schedule, Cascade.
- **RD-retro readiness note (2026-07-11):** SV-1's pull gate ("RD retro complete / Architecture Memory current") is now
  **satisfied** — SV-1 is the immediately code-ready next step (no external gate). SV-2+ remain blocked on AS-8.
- **SV-1 STATUS (2026-07-12): ✅ COMPLETE.** Findings memo `docs/plans/2026-07-11-sv-1-ripple-spike.md`;
  **ADR-019 ACCEPTED** (architect, 2026-07-12 — see ADR Acceptance record). Questions (a)–(d) verified: ChannelSwitch
  executes nothing, OverrunStrategy descriptive-only, cascade court-coupled (can't carry feed ripple), the G8
  silent-stale gap confirmed. **EPIC SV is now HELD** at the architect's decision: SV-2..SV-5 carry the blocking AS-8
  pull gate (`CASCADE_PREVIEW_PARITY` / cascade debt TD-5/12/13/14); servicing that debt is a separate decision. Two
  characterization tests are pre-identified for SV-2's safety net (memo §"Characterization tests worth pinning").

### Story SV-1 — SPIKE: ripple semantics + volatility machinery verification → ADR-019 (DETAILED)
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
- ADR-019 accepted: RippleProposal entity (source: FEED/CASCADE/MANUAL; before/after slot set; idempotency key =
  source change id), which sources auto-apply vs propose (per ADR-019 judgment), apply mechanics per AS-7,
  TD-28 (zod enum drift) servicing decision.

- **SV-1-T1** · Hat **PREPARATORY** · Model **Opus** · Confidence High
  Goal: Behavior verification (a)–(d) with characterization tests where cheap; findings memo.
  Pull Gate: RD retro complete (Architecture Memory current) — **satisfied 2026-07-11.** Unblocks: SV-1-T2.
- **SV-1-T2** · Hat **PREPARATORY** · Model **Opus** · Confidence Med
  Goal: ADR-019 authored + accepted; SV-2..SV-5 expanded into full stories at the RD/RC retro with these findings.
  Hand-off: **ADR-019**. Unblocks: SV-2 (outline), END OF STORY SEQUENCE.

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

- **Structure:** Dependencies form a DAG (RD-1→RD-1F→RD-2→RD-3→RD-4→RD-5, all ✅; RD-6 gated on RD-5-merged + flag-ON
  decision; RD-7/RD-8 gated on Q1; RC-0 ∥ RD with RC-0→RC-2/RC-3 gates; RC-1-T1/T2 independent of RC-0; SV/RL outlined
  with explicit gates; no cycles). EPIC 1 (RD) was the tracer bullet ✓. Every detailed task has Unblocks + Pull Gate ✓.
  Token budgets: largest task (RD-3-T1) was a bounded pure-function extension — well under 15k/1,500 LOC ✓.
- **Quality:** Every story passes DoR or carries an explicit HOLD/READY-after-confirm (RC-2, RC-3 HOLD on AS-1;
  RL-1-T3 on Q3; RD-6 on RD-5-merged + flag decision; RD-7/RD-8 on Q1) ✓. One Hat per task; schema work is
  PREPARATORY, behavior is FEATURE, dead-code deletion is REFACTORING (RD-6-T3, RC-2-T3 justified in-story) ✓. TDD
  order explicit per task ✓. Glossary reconciled with 5 synonym collisions flagged (§4) ✓. ADRs raised for all
  cross-cutting decisions (ADR-015 shipped; ADR-019..018 open) ✓.
- **Testing:** Core logic (checker v2 ✓, listed-event constraint, deliverable state machine, aggregations,
  conflict port) unit-tested first; golden-master/flag-off parity suites guard every validation-pipeline change (RD
  confirmed byte-identical) ✓. Every schema change has migration + rollback + flag + **RLS policy** ✓. E2E smoke per
  detailed EPIC (RD-5 ✓, RC-4; SV-5/RL-3 outlined) ✓.
- **Risk & Debt:** All Med/High risks mitigated or gated with owner (AS-1/AS-2 are the High items — still-open
  blocking gates, Owner: stakeholder + architect via RC-0) ✓. PII: labour rules flagged, anonymised fixtures ✓.
  TD-28/29 registered with servicing paths (TD-29 → RD-6 DoR-ready) ✓. Two RD-retro refinements (RD-7/RD-8) recorded
  as named backlog items rather than invisible debt ✓.
- **Operations:** SLOs per EPIC ✓. Runbook per EPIC (rights-windows.md shipped) ✓. Feature flags on all user-visible
  changes; TD-27 build-time caveat stated ✓. Idempotency defined for every write path ✓.
- **Economics (Core §5):** Anti-bureaucracy — completed stories collapsed to status blocks (detail-of-record lives in
  the phase summary + ADR + PRs), keeping the backlog forward-looking ✓. RD-6 kept as one L story with a 4-task split
  matching the ADR-015 §5 one-way sequence (the steps always ship together) ✓.

**Unresolved items (honest list):** (1) RC-2/RC-3 ACs contain provisional KPI numbers — blocking gate RC-0-T1 owns
them (still open). (2) RC-1-T3 severity is provisional WARNING until ADR-017 (still open). (3) SV-2+ blocked on SV-1
verification + AS-8 cascade debt. (4) **Non-LIVE holdback enforcement is checker capability but not reachable from real
slots** until RD-7 (no `BroadcastSlot` coverage-category); territory stays event-level until RD-8. These are encoded as
gates/named stories, not ignored.

---

### EPIC RD Retro — 2026-07-11 (Phase Summary: `docs/plans/2026-07-11-epic-rd-phase-summary.md`)

**Delivered:** RD-1 (SPIKE → ADR-015 Accepted) · RD-1F (`a4b40bd`) · RD-2 (PR #15 `aaf316f`) · RD-3 (PR #16 `29ecebd`) ·
RD-4 (PR #17 `e6ec688`) · RD-5 (`b607bc1`, branch not yet merged). Snapshots: `rights-window v1`, `rights-matrix v2`,
`rights-checker v2`, `slot-rights v1`. Metrics: backend vitest **498 pass**; tsc clean; flag OFF byte-identical to the
post-RD-1F baseline.

**Key decisions of record:** ADR-015 (child-of-Contract; RightsPolicy→deprecate) · overlap-409 = 4-way predicate
(category ∧ validity ∧ territory ∧ platform; empty = unrestricted) · defect-(b) fix folded into RD-3 with
non-skippable ACs (drafts provably consult the RunLedger).

**Review-chain catches (process value):** out-of-hat zod widening (reverted → deferred to TD-28's story) · holdback
NaN bypass (→ explicit `HOLDBACK_LIVE_END_UNKNOWN`) · hollow golden master (rebuilt to freeze real strings) · a flag
that couldn't be turned OFF (`z.coerce.boolean` footgun → explicit parse) · cross-tenant idempotent-echo leak · a
false all-clear on unresolvable events (→ `SLOT_EVENT_UNRESOLVED`). Six pre-merge defect catches + one revert; no
post-merge rework.

**Honest caveat:** non-LIVE holdback + per-window enforcement is proven **capability** but is **not reachable from
real published slots** (BroadcastSlot has no coverage-category; real slots resolve to LIVE) — recorded as **RD-7**.
Territory stays event-level (Channel has no territory) — recorded as **RD-8**. Per-category tally *isolation* is real.

**Debt:** TD-28 registered (partially serviced) · TD-29 registered, servicing = **RD-6 (now DoR-ready)** · TD-30
untouched (superseded by RC-2).

**Mode check:** stays DELIVERY (§3).

**Housekeeping outstanding:** push + merge `feature/RD-5-smoke-runbook`; record the `rightsWindows` flag posture per
environment. Until then EPIC RD is code-complete but not fully on main.

**Next-EPIC recommendation (sequencing rule RD → RC → SV → RL, SV pulls ahead of RC if RC's gates are unresolved):**
- **RC's two gates are still open and are people-work:** AS-1 (2026-2030 beheersovereenkomst KPI re-verification —
  RC-0-T1, needs agreement-text access) and ADR-017 (enforcement-boundary stakeholder session, Q2 — RC-0-T2). They did
  **not** clear during RD execution.
- **Therefore: SV-1 (SPIKE) is the immediately code-ready next step.** Its only pull gate ("RD retro complete /
  Architecture Memory current") is now **satisfied**, and it carries **no external gate**. SV-2+ stay blocked on the
  AS-8 cascade debt (`CASCADE_PREVIEW_PARITY`) — sequencing SV-1 now buys that servicing window without idling.
- **In parallel, start RC-0 as the long-pole people-work** (stakeholder + architect): resolving AS-1 + ADR-017 is what
  unblocks the value-bearing RC-2/RC-3. RC-1-T1/T2 (schema + suggestion service) are also code-ready and gate-free if
  a second thread is available, but the EPIC's compliance value cannot freeze until RC-0 clears.
- **People-work gates remaining:** AS-1 KPI verify (agreement access) · ADR-017 enforcement boundary (Q2 session) ·
  AS-8 cascade-debt servicing before SV-2+ · Q1 before RD-7/RD-8 · Q3 before RL-1-T3 · flag-ON decision + RD-5 merge
  before RD-6.
- **If** the RC-0 people-work clears quickly, fold straight into RC (RC-1 first) per the default sequence; **otherwise**
  SV-1 carries the code momentum while RC-0 runs.

**Validator re-run (RD retro, DELIVERY level):** DAG intact (RD arc closed; RD-6 gated; RD-7/RD-8 gated on Q1) ✓ ·
one Hat per RD-6 task incl. the REFACTORING-Hat adapter deletion ✓ · TD-28/29 servicing paths current ✓ ·
anti-bureaucracy: completed stories collapsed to status blocks ✓ · glossary consistent with shipped code names ✓.
**Backlog remains VALID with gates — SV-1 is the next code-ready story; RC-0 the long-pole people-work.**

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

1. **Post-RD retro (2026-07-11):** complete RD housekeeping (merge `feature/RD-5-smoke-runbook`, record flag posture),
   then kick off two threads: `gpm-partner` executes **SV-1-T1** (SPIKE — now gate-clear); in parallel, schedule the
   **RC-0** stakeholder session (AS-1 KPI verification + Q2 → ADR-017) — it is the long-pole gate for EPIC RC.
2. **Per task:** `backlog-health-advisor` (story DoR — will correctly HOLD RC-2/RC-3 until AS-1 clears, and RD-6 until
   RD-5 is merged) → `gpm-partner` (TDD execution) → review chain (`two-hats-enforcer` → smell detectors →
   `naming-reviewer` → `ubiquitous-language-guard` with §4 synonym list) → `test-quality-auditor`. (The RD review chain
   earned six pre-merge catches — see §9 retro.)
3. **Model routing** (Core §6): Opus for SV-1 spike, ADR authoring, RD-6-T2 mapping judgment; Sonnet for generation
   tasks; Haiku for RC-0-T1 verification table and DoD checks.
4. **After EPIC RD (done):** phase summary + Architecture Memory update (§6) landed; SV-1 pulled forward, RC-0 started
   concurrently. Formalize TD-28/29 servicing as their stories run (TD-29 → RD-6).
5. **Ops-redesign coordination:** publish the new Contract Snapshots (`rights-window v1`, `rights-matrix v2`,
   `rights-checker v2`, `slot-rights v1`; upcoming `listed-events v1`, `accessibility v1`, `ripple v1`,
   `resource-preflight v1`) to the ops backlog owner — they are the designated integration points for ops screens;
   this backlog never edits `/ops/*` code.

**Suggested next session:** merge RD-5 → branch `feature/SV-1-ripple-semantics-spike` → gpm-partner executes SV-1-T1;
book the RC-0 stakeholder session the same day.
