# RD-1 SPIKE — Rights model consolidation: findings memo

_Date: 2026-07-02 · Timebox: M · Hat: PREPARATORY · Output: draft ADR-015 (Proposed) + TD-29 + Q1 packet_
_All file/line references verified against the working tree on 2026-07-02._

## 1. End-to-end trace of both rights models

### Model 1 — `Contract` (the enforcement-connected model)
- **Schema:** `backend/prisma/schema.prisma:317` — status/validity lifecycle, deprecated legacy booleans, enriched
  scalars (`territory[]`, `platforms[]`, `coverageType String` — *not* the `CoverageType` enum, `maxLiveRuns`,
  `windowStartUtc/EndUtc`, `tapeDelayHoursMin`), `blackoutPeriods Json`, `seasonId`, **`RunLedger` FK relation**.
  Schema comment: *"Enriched rights fields (unified from RightsPolicy)"* — the field-level merge already happened;
  the `RightsPolicy` table was simply never retired.
- **Writers:** `routes/contracts.ts` CRUD (zod `contractSchema`; auto-derives `platforms[]` from legacy booleans on
  write) + `ContractForm.tsx`. ⚠ `blackoutPeriods` has **no writer anywhere** (no zod field, no route, no form, no
  seed) — read-only-in-practice.
- **Readers (all enforcement paths):** `rightsChecker.ts` `checkRights` (pure) ← `conflictService.ts:138` and draft
  validation stage 3; `checkRightsForEvent(s)` (DB, season-narrowing, RunLedger tally) ← `/rights/check[,/batch]` ←
  `useRightsCheck`; `getRightsMatrix` (source of `blackoutCount`) ← `/rights/matrix` ← `RightsMatrixPanel`;
  `loadRightsPolicies` (`routes/schedules.ts:15`) ← draft **validate** and **publish** (publish blocks on ERROR, 422).

### Model 2 — `RightsPolicy` (the enforcement-dead model)
- **Schema:** `schema.prisma:1593` — same exploitation fields but enum-typed (`CoverageType`, `Platform[]`
  UPPERCASE), uuid id, no status/validity, no blackouts, no RunLedger relation.
- **Writers:** `routes/rights.ts` CRUD (admin-only) + `RightsPoliciesPanel` + 3 seed rows.
- **Readers:** **only its own `GET /rights/policies` list.** Zero validation/checker/matrix consumers. Verified by
  grep: `prisma.rightsPolicy` appears exclusively in `routes/rights.ts`.

### The adapter chain (draft-validation stage 3) — a lossy round-trip, not a second model
The health-check framing "stage 3 is policy-driven" is itself imprecise. Verified flow:
`Contract` →(`loadRightsPolicies`, schedules.ts:15— lossy)→ thin DTO **named** `RightsPolicy`
(`validation/types.ts:11` — name-collides with the Prisma model but is *populated from Contract*)
→(`policyToContractShape`, `validation/rights.ts:84`)→ pseudo-`Contract` → `checkRights`.
What the round-trip destroys, per check:

| checkRights check | Status in draft validation today | Cause |
|---|---|---|
| Platform coverage | silently skipped | `platforms: []` hardcoded + legacy booleans `false`; *also* slot query includes `event` but not `channel` → `channelTypes = []` |
| Blackouts (`BLACKOUT_PERIOD` ERROR) | **never fires** | `blackoutPeriods` dropped by the DTO |
| Territory | dead | DTO keeps `territory[0]` only; input is `slot.channel?.territory` — channel not included AND `Channel` **has no `territory` field** (schema:1422) |
| Expiry warning | never fires | `status: 'valid'` hardcoded |
| Window bounds | works | only fields that survive intact |
| Run limits | **actively wrong** | `maxLiveRuns: c.maxLiveRuns ?? 0` turns "no limit" into "limit 0" → any FULL slot for a covered event yields false `MAX_RUNS_EXCEEDED` (ERROR → can 422-block publish); plus `existingRuns: []` hardcoded at both call sites — RunLedger never consulted in drafts |

Additional dead ends: `/validate-slot` passes `rightsPolicies: []` → inline slot validation has **no** rights checks;
messages from pseudo-contracts read "contract #0".

### Enum/vocabulary drift inventory (cross-package evidence for the W4 scope note)
- `CoverageType`: Prisma enum `LIVE|HIGHLIGHTS|DELAYED|CLIP` (used by RightsPolicy only); `Contract.coverageType` is
  a plain `String`; shared TS type `packages/shared/types.ts:122` (4 values); **zod** (`schemas/rights.ts:9`,
  `schemas/contracts.ts:24`) allows only `LIVE|DELAYED|HIGHLIGHTS` — `CLIP` is DB-valid but API-rejected. `ARCHIVE`
  exists nowhere.
- Platforms: two incompatible vocabularies — Contract/Channel lowercase distribution types
  (`linear|on-demand|radio|fast|pop-up`, what `checkRights` matches against `Channel.types`) vs the Prisma
  `Platform` enum's UPPERCASE business models (`LINEAR|OTT|SVOD|AVOD|PPV|STREAMING`, consumed by nothing).
- `contractSchema.status` zod allows `expired|terminated` — **invalid** against Prisma `ContractStatus`
  (`valid|expiring|draft|none`): Prisma throws at runtime.
- `runLedgerCreateSchema.status` allows `RUNNING|COMPLETED|CANCELLED` — invalid vs Prisma `RunStatus`
  (`PENDING|CONFIRMED|RECONCILED|DISPUTED`). Consequence: the API can only ever create `PENDING` runs, while the
  checker/matrix count `CONFIRMED|RECONCILED` → **run limits are never consumed by API-created data**; matrix
  `runsUsed` is 0 in practice.
- `RunType` (`LIVE|CONTINUATION|TAPE_DELAY|HIGHLIGHTS|CLIP`) does **not** map 1:1 to window categories
  (`TAPE_DELAY`≠`DELAYED` naming, `CONTINUATION` counts with its parent, no `ARCHIVE`) — RD-3's pull-gate
  assumption is false; an explicit mapping goes into ADR-015.

## 2. Contract data-shape inventory (C1 — honestly rescoped)
**Environment:** local dev Postgres (`localhost:5433/sporza_planner`, from `backend/.env`), read-only SELECTs only.
**This is seeded/synthetic data, not production evidence** — no production or staging rights data is accessible from
this workstation. Findings therefore rescoped to *schema + seed inventory*; real distributions are requested via Q1
(see `docs/plans/rd-1-q1-stakeholder-questions.md`).

| Measure | Contract (n=42) | RightsPolicy (n=3, seed) |
|---|---|---|
| coverageType | 100% `LIVE` | 100% `LIVE` |
| territory | 100% `[]` | `[BE]`×2, `[BE,LU]`×1 |
| platforms | 100% `[]` (36/42 ride legacy booleans) | `[LINEAR,OTT]`×2, `[LINEAR]`×1 |
| window / holdback / blackouts / maxLiveRuns | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 2 |
| RunLedger rows | 0 | — |

Even in dev, the enriched Contract path is unexercised (`derivePlatformsFromLegacy` is the live path for all 42) and
`tapeDelayHoursMin` is written by CRUD but read by no validator — confirming the survey.

## 3. Hypothesis + alternatives (D1)

**A. RightsWindow as child of Contract** *(hypothesis — chosen)*. Contract keeps the commercial envelope
(status, validity, fee, competition/season scope, blackouts); 1..n windows carry the exploitation dimensions.
Evidence for: every enforcement path (checker, RunLedger FK, matrix, season narrowing, conflictService, draft loader)
already resolves from Contract; backfill is 1 row per contract; RightsPolicy's only assets (enum typing, uuid ids)
are portable to the new table. Consequence: RightsPolicy must be dispositioned or divergence doubles (TD-29).

**B. Windows on RightsPolicy; Contract deprecated as rights carrier.** For: RightsPolicy is already enum-typed and
season-scoped; "policy" reads naturally as the rights aggregate. Against (decisive): the table is enforcement-dead
(zero validation readers); it lacks status/validity lifecycle, blackouts, and — hardest — `RunLedger.contractId`
FKs point at Contract; every consumer (checker, matrix, conflictService, `/rights/check*`, draft loader) would need
repointing plus a Contract-scalar freeze. Highest migration cost toward the model with the least connective tissue.
**Rejected.**

**C. New unified Rights aggregate replacing both** (e.g. `RightsGrant` with windows). For: cleanest end-state, no
legacy naming. Against (decisive): migrates *both* models at once, contradicts the epic's explicit mitigation
("ADR-015 decides disposition only; RightsPolicy migration is its own later story"), and creates a **third** live
model during the transition — the exact failure RD-1 exists to prevent. **Rejected.**

**D. Windows as JSON value-array on Contract** (like `blackoutPeriods`). Rejected: RD-3/RD-4 need per-window queries
and per-category run tallies (joins), RD-2 needs idempotent per-window CRUD + 409 overlap detection, and ADR-011
requires row-level RLS — all favor a real table.

## 4. C2 — from which model does stage 3 resolve Rights Windows?
**From Contract.** The Prisma `RightsPolicy` table was never on the draft-validation path (its namesake DTO is
Contract-fed), so no policy-side migration is needed for RD-5. Concrete path (ADR-015 §Decision): flag ON, the
draft loader loads `Contract` rows *with* `rightsWindows` included and passes real contracts into `checkRights` v2;
`ValidationContext` gains `contracts` alongside the legacy `rightsPolicies`; `policyToContractShape` +
`loadRightsPolicies` remain untouched as the flag-OFF path (byte-identical output per the EPIC DoD) and are deleted
in RD-6. This makes RD-5's `HOLDBACK_VIOLATION`-in-`validateDraft` smoke test implementable in RD-3-T2.

## 5. Items that must trigger RD-2..RD-5 re-refinement (beyond W1)
1. **Flag-OFF golden master will pin two live defects** (`maxLiveRuns ?? 0` false ERROR; `existingRuns: []`).
   Architect must decide: fix as a separate defect story *before* golden-mastering, or pin deliberately.
2. **RD-3-T1 pull gate is false**: RunLedger `runType` ↛ window categories 1:1 — adopt the ADR-015 mapping table.
3. **RD-2 backfill AC**: 42/42 dev contracts have `platforms: []` + legacy booleans — AC must define empty-array
   semantics on windows (proposed: `[]` = unrestricted/inherit) instead of "mirror platforms" verbatim.
4. **RD-2 matrix reconciliation** is trivially green (`runsUsed` is always 0 — no CONFIRMED writer exists); keep the
   test but don't read it as evidence of run-limit correctness.
5. **RD-3-T2 wiring must include `channel` in the slot query** (types; territory needs a source — `Channel` has no
   territory field: new field or check stays event-level) — flag-ON output changes beyond the new window codes.
6. **RD-5 smoke** must drive `/schedule-drafts/:id/validate` (not `/validate-slot`, which has no rights stage).
7. **zod enum regeneration** (CLIP missing; invalid contract statuses; RunStatus drift) — same failure class as
   TD-28; fold into TD-28's registration on the first touching story (RD-2-T2).

## 6. Open assumptions carried into ADR-015 (C3 — timebox honored)
Q1 dimension usage (AS-4); Platform-enum→lowercase mapping for RD-6 row migration; holdback reference point when no
live run exists; whether `ARCHIVE` needs a `RunType` counterpart; real contract-shape distributions (C1).
