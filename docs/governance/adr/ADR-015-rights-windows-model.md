# ADR-015: Rights Windows as children of Contract; RightsPolicy deprecated

**Status:** **Accepted** (2026-07-02, architect) — RD-2 gate cleared pending the AC re-refinement pass (RD-1-T2 hand-off)

## Acceptance record (architect decisions, 2026-07-02)

1. **Core model accepted as proposed:** RightsWindow as child table of Contract; RightsPolicy dispositioned
   **deprecate** (RD-6).
2. **Live defects:** defect (a) — `maxLiveRuns ?? 0` false `MAX_RUNS_EXCEEDED` — gets a **hotfix story before RD-2**,
   so the golden master pins correct null-semantics from the start. Defect (b) — `existingRuns: []`, drafts never
   consult the RunLedger — is **folded into RD-3 with explicit, non-skippable acceptance criteria** (RD-3 rewrites
   the tally path anyway; the ACs must assert drafts consult the ledger so the fix cannot silently drop out).
3. **Q1 timing:** accepted now with AS-4 marked; Q1 is informative, not blocking. **Product context recorded:** VRT
   is a *test/first client*, not the sole target — Planza will expand to other broadcasters. Therefore Q1 answers
   calibrate defaults; they must not harden VRT-specific rules into the model. Client-specific rights dimensions and
   (in EPIC RC) regulatory obligations are **per-tenant configuration**, not product constants.
4. **Empty-array semantics:** empty `territory[]`/`platforms[]` on a Rights Window = **unrestricted** (matches
   current checker behavior, preserves flag-OFF parity), and checker v2 emits an **INFO data-quality note** for
   unscoped windows so empty-because-unknown never becomes invisible permissiveness.

## Context

Planza has two parallel rights models (RD-1 spike, `docs/plans/rd-1-rights-model-spike.md`):

- **`Contract`** (`backend/prisma/schema.prisma:317`): status/validity lifecycle, enriched exploitation scalars
  (territory[], platforms[], coverageType, window, maxLiveRuns, tapeDelayHoursMin), `blackoutPeriods`, and the
  `RunLedger` FK. **Every enforcement path resolves from it**: `rightsChecker.ts` (pure + DB + matrix),
  `conflictService`, `/rights/check*`, and draft validation via `loadRightsPolicies` (`routes/schedules.ts:15`).
- **`RightsPolicy`** (`schema.prisma:1593`): the same exploitation fields, enum-typed — but **enforcement-dead**:
  its only reader is its own admin list endpoint. The schema comment on Contract ("unified from RightsPolicy")
  shows the field merge already happened; the table was never retired.
- Draft-validation stage 3 (`validation/rights.ts`) consumes a thin DTO *named* `RightsPolicy`
  (`validation/types.ts:11`) that is **loaded from Contract** and mapped back to a pseudo-Contract by
  `policyToContractShape` — a lossy round-trip that silently disables blackout/platform/territory/expiry checks in
  drafts and converts "no run limit" (`maxLiveRuns ?? 0`) into false blocking `MAX_RUNS_EXCEEDED` errors.

The Rights Depth EPIC (RD) needs multi-window, category-aware rights (`LIVE/DELAYED/HIGHLIGHTS/CLIP/ARCHIVE`) with
exclusivity tiers and enforced holdbacks. Adding windows without a consolidation decision would create a third
divergence (TD-29).

### Alternatives considered

1. **RightsWindow as child entity of Contract.** Chosen — see Decision. Entered the spike as a hypothesis and was
   tested against two genuine alternatives (D1 guard); chosen on connectivity evidence, not on the pre-written RD-2
   Gherkin.
2. **Windows on RightsPolicy; Contract deprecated as rights carrier.** Rejected: RightsPolicy has zero validation
   consumers, no status/validity lifecycle, no blackouts, and `RunLedger.contractId` points at Contract — every
   enforcement path plus the run ledger would need repointing. Maximum migration cost toward the least-connected model.
3. **New unified Rights aggregate replacing both** (`RightsGrant`). Rejected: migrates both models at once,
   contradicts the EPIC's risk mitigation ("ADR-015 decides disposition only"), and runs a *third* live model during
   transition — the exact failure RD-1 exists to prevent. Revisit only if Q1 invalidates Contract as the commercial
   envelope.
4. **Windows as JSON array on Contract** (like `blackoutPeriods`). Rejected: RD-3/RD-4 need per-window queries and
   per-category run tallies, RD-2 needs idempotent per-window CRUD with overlap 409s, and ADR-011 requires row-level
   RLS — all demand a real table.

## Decision

### 1. RightsWindow shape — child table of Contract

```prisma
model RightsWindow {
  id               String          @id @default(uuid()) @db.Uuid   // client-suppliable (idempotent create, RD-2)
  tenantId         String          @db.Uuid
  contractId       Int
  category         CoverageType                                    // reused enum, + ARCHIVE (see §2)
  exclusivity      ExclusivityTier @default(NON_EXCLUSIVE)         // see §3
  territory        String[]        @default([])                    // [] = unrestricted (inherit nothing to check)
  platforms        String[]        @default([])                    // lowercase channel-type vocabulary; [] = unrestricted
  windowStartUtc   DateTime?       @db.Timestamptz
  windowEndUtc     DateTime?       @db.Timestamptz
  maxRuns          Int?                                            // per-window run limit, tallied per category
  holdbackHoursMin Int?                                            // see §4
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  contract Contract @relation(fields: [contractId], references: [id])

  @@index([tenantId])
  @@index([contractId])
}
```

- RLS `tenant_isolation` policy ships in the same migration (ADR-011 gate).
- **Platform vocabulary:** windows use the lowercase distribution vocabulary (`linear`, `on-demand`, `radio`,
  `fast`, `pop-up`) that `checkRights` matches against `Channel.types`. The orphaned UPPERCASE `Platform` enum
  (business models, consumed by nothing) is NOT adopted; RD-6 defines the mapping when migrating policy rows.
- **Blackouts stay contract-level** (`Contract.blackoutPeriods`): a Blackout is a prohibition window on the
  contract; a Holdback is a per-window earliest-release constraint. The glossary distinction (Holdback ≠ Blackout)
  is preserved in the model.
- **Backfill (RD-2-T1):** every existing contract gets exactly one window mirroring its scalars
  (`coverageType→category`, window bounds, `territory`, `platforms` *as stored*, `maxLiveRuns→maxRuns`,
  `tapeDelayHoursMin→holdbackHoursMin`), `exclusivity = NON_EXCLUSIVE` (no source data — see Open assumptions).
  Empty `territory[]`/`platforms[]` mean "unrestricted", matching current checker behavior for those contracts.
  The contract scalars are then `@deprecated` (TD-24 pattern): readable for the flag-OFF path, no new consumers.

### 2. Enum decision — reuse `CoverageType`, add `ARCHIVE` (cross-package)

`RightsWindow.category` reuses the existing `CoverageType` enum extended with `ARCHIVE`
(`LIVE | HIGHLIGHTS | DELAYED | CLIP | ARCHIVE`). This is a **cross-package change** executed as one unit (RD-2-T1
scope note W4): Prisma enum (raw SQL `ALTER TYPE ... ADD VALUE` — note: cannot run inside a transaction block;
sequence it as its own migration statement per ADR-004/007) + `packages/shared/types.ts:122` TS union + **zod
schemas regenerated to the full value set**. The zod layer is currently *already* drifted (accepts only
`LIVE|DELAYED|HIGHLIGHTS`; `CLIP` is DB-valid but API-rejected) — same failure class as TD-28; fixed in the same
change so DB, shared types, and API validate identically.

`RunLedger.runType` does **not** map 1:1 to categories. Canonical mapping (RD-3 uses this; the pull-gate assumption
"1:1" is void):

| RunType | Window category |
|---|---|
| LIVE | LIVE |
| TAPE_DELAY | DELAYED |
| HIGHLIGHTS | HIGHLIGHTS |
| CLIP | CLIP |
| CONTINUATION | counts with its parent run (excluded from tallies, existing `/run-ledger/count` semantics) |
| — (none) | ARCHIVE — no run type exists yet; adding one is deferred to RD-3 refinement (open assumption) |

### 3. Exclusivity tier

New enum `ExclusivityTier { EXCLUSIVE, NON_EXCLUSIVE, OPEN_NET }` (glossary §4: "open net" is a value of this tier,
not an entity). Default `NON_EXCLUSIVE`. Same cross-package rule as §2 (Prisma + shared + zod together). Exposed
additively on the matrix (`windows[]`, RD-2-T3); EPIC RC's open-net remit logic consumes the `OPEN_NET` value.

### 4. Holdback semantics (relation to `tapeDelayHoursMin`)

- **Definition (glossary):** content in a window may not start until N hours **after the live exploitation ends**.
  Distinct from Blackout (prohibition sub-window) — validation codes stay separate (`HOLDBACK_VIOLATION` vs
  `BLACKOUT_PERIOD`).
- **Field:** `RightsWindow.holdbackHoursMin Int?`; applies to non-LIVE categories. `Contract.tapeDelayHoursMin`
  (today written by CRUD, read by no validator) is backfilled into it and deprecated.
- **Live-end resolution order (checker v2, RD-3):** (1) `RunLedger` LIVE run `endedAtUtc` for the event (actual);
  (2) else the event's scheduled end (`startUtc + durationMin`) as planned estimate; (3) if neither exists, emit an
  INFO data-quality note instead of guessing (open assumption below).

### 5. RightsPolicy disposition — **deprecate** (not merge-further, not season-override)

- The field-level merge into Contract already happened; season-override capability is redundant (`Contract.seasonId`
  + season narrowing in `checkRightsForEvent` already exist; windows inherit it via their contract).
- **RD-2/RD-3 (this EPIC):** RightsPolicy untouched — no third model, adapter keeps running for the flag-OFF path.
- **RD-6 (scoped at RD retro):** freeze policy writes (CRUD → read-only or 410), migrate the existing rows into
  Contract windows (with the Platform-enum mapping), delete `policyToContractShape` + `loadRightsPolicies` + the
  DTO-named-`RightsPolicy` in `validation/types.ts` (name collision removed), drop table last. TD-29 tracks this.

### 6. C2 — stage 3 resolves Rights Windows **from Contract** (explicit answer)

Verified: stage 3's `context.rightsPolicies` is *itself loaded from Contract* (`loadRightsPolicies`,
`routes/schedules.ts:15`) through a lossy DTO; the Prisma `RightsPolicy` table has never been on the draft-validation
path. Therefore no policy-side path is needed for windows:

- **Flag `rightsWindows` ON:** the draft validate/publish routes load `Contract` rows **with `rightsWindows`
  included** (and `channel` on slots, so platform checks become live) and pass real contracts into `checkRights` v2;
  `ValidationContext` gains a `contracts` field alongside the legacy `rightsPolicies`.
- **Flag OFF:** the existing `loadRightsPolicies` → `policyToContractShape` chain runs unchanged (byte-identical
  output per the EPIC DoD — including its two known defects, see Consequences).
- This makes RD-5's `HOLDBACK_VIOLATION`-in-`validateDraft` smoke test implementable (RD-3-T2 wiring), and RD-6's
  adapter deletion is the flag-ON path becoming the only path.

## Consequences

- One rights model going forward; window multiplicity, exclusivity and holdback become schema, not footnotes.
- ~~The flag-OFF golden master **pins two live defects**~~ **Decided at acceptance (see Acceptance record §2):**
  defect (a) `maxLiveRuns ?? 0` is hotfixed *before* RD-2 so the golden master pins correct behavior; defect (b)
  `existingRuns: []` is fixed inside RD-3 with explicit ACs asserting drafts consult the RunLedger.
- Run-limit enforcement stays vacuous until the RunLedger lifecycle is fixed: the API's zod `status` enum
  (`RUNNING|COMPLETED|CANCELLED`) cannot express Prisma's `CONFIRMED|RECONCILED`, which are the only states checkers
  count — fold into TD-28's registration (memo §1, §5.7).
- `ALTER TYPE ... ADD VALUE` sequencing constraint on the migration (see §2).
- The UPPERCASE `Platform` enum becomes explicitly orphaned until RD-6 removes or maps it.
- RD-2..RD-5 ACs need re-refinement against this ADR (memo §5): backfill empty-array semantics, RunType mapping,
  channel include, smoke-test endpoint choice, zod regeneration.

## Open assumptions (C3 — timebox honored; do not treat as decided)

1. **AS-4 / Q1 pending:** VRT contracts meaningfully distinguish territory, exclusivity tier, open-net vs pay
   window, and live/delayed/highlights/clips at scheduling time. If fewer dimensions survive Q1, unused enum values
   stay dormant behind the flag (no rework). Q1 packet: `docs/plans/rd-1-q1-stakeholder-questions.md`.
2. **Exclusivity backfill default `NON_EXCLUSIVE`** — no source data exists; Q1 may reassign real tiers per contract.
3. **Holdback fallback** when no live run and no event duration exist: INFO data-quality note, no violation. May
   change after Q1.
4. **`ARCHIVE` RunType counterpart** deferred to RD-3 refinement (no tally source for ARCHIVE runs yet).
5. **Platform-enum → lowercase mapping** for RD-6 policy-row migration (proposal: `LINEAR→linear`, `OTT→on-demand`,
   others need stakeholder confirmation) — decided in RD-6, not here.
6. **Data-shape evidence is dev-seed only** (C1): 42 synthetic contracts, all `LIVE`, no windows/blackouts/limits.
   Real distributions requested via Q1; no acceptance criterion may cite the dev inventory as production evidence.

## Review date

RD retro (RD-6 scoping), or 2026-10-02 — whichever comes first.
