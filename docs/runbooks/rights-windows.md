# Runbook: Rights Windows (EPIC RD)

Operational guide for the window-aware rights checker (RD-1..RD-5). Covers the flag,
what changes when it is ON, symptom→check triage, the known reachability limit, and
migration/rollback.

## Feature flag — `RIGHTS_WINDOWS_ENABLED`

- **Source:** `backend/src/config/env.ts` (`baseSchema`). Build-time (TD-27) — read once
  at process start.
- **Parsing:** ONLY the literal string `'true'` enables it
  (`z.string().optional().transform(v => v === 'true')`). `'false'`, `'0'`, empty, or
  unset → **OFF**. (Deliberately NOT `z.coerce.boolean()`, which would coerce `'false'`
  to `true` and silently enable the feature.)
- **Rollback = redeploy with the flag off/unset.** There is no runtime override (TD-27);
  disabling requires a redeploy with `RIGHTS_WINDOWS_ENABLED` unset or `=false`.
- **OFF = legacy scalar checker**, byte-identical to the post-RD-1F baseline (pinned by the
  golden master `backend/tests/rightsChecker-golden-legacy.test.ts` and the flag-OFF
  parity assertions). The legacy `loadRightsPolicies → policyToContractShape` adapter
  (TD-29) still runs the OFF path unchanged; its deletion is deferred to RD-6.

## What it does when ON

Window-aware checker v2 replaces the scalar path in:

- **Draft validate / publish** — `POST /api/schedule-drafts/:id/validate` and `.../publish`
  load contracts WITH `rightsWindows`, consult a **per-CATEGORY** CONFIRMED|RECONCILED
  RunLedger tally (defect-(b) fix — `existingRuns` from the ledger, no longer `[]`), and
  include the slot `channel` so platform checks go live.
- **Event checks** — `checkRightsForEvent` / `checkRightsForEvents` (`/rights/check`,
  `/rights/check/batch`) resolve the applicable window by category.
- **Channel-day slot check** — `GET /api/rights/check-slots?channelId=&date=` (RD-4).

**New validation codes (ON only):**

| code | severity | meaning |
|---|---|---|
| `WINDOW_CATEGORY_MISSING` | WARNING | no window matches the slot's run intent |
| `HOLDBACK_VIOLATION` | ERROR | starts before live-end + holdback (see KNOWN LIMIT) |
| `WINDOW_UNSCOPED` | INFO | matched window has empty territory OR platforms |
| `NO_WINDOWS` | INFO | contract has zero windows (pre-backfill guard) |
| `HOLDBACK_LIVE_END_UNKNOWN` | INFO | holdback applies but no ledger/scheduled live end |
| `MAX_RUNS_EXCEEDED` / `MAX_RUNS_NEAR` | ERROR / WARNING | per-window, per-category run limit |

**Slot-level codes (RD-4 `/rights/check-slots`):**

| code | severity | meaning |
|---|---|---|
| `SLOT_EVENT_MISSING` | INFO | slot has no linked event (nothing to check) |
| `SLOT_EVENT_UNRESOLVED` | WARNING | linked event could not be resolved (not a false all-clear) |

## KNOWN LIMIT — non-LIVE holdback is not reachable from real slots

**DELAYED / HIGHLIGHTS / CLIP window enforcement and `HOLDBACK_VIOLATION` are checker
CAPABILITY, not yet reachable end-to-end.** `BroadcastSlot` has no coverage-category
column, so `deriveRunIntent` resolves **every real slot to `'LIVE'`** intent
(`backend/src/services/validation/rights.ts`). Consequences:

- The **LIVE** window path IS enforced from real slots: platform / time-window /
  per-category **LIVE** run limit.
- Non-LIVE window checks + holdback only fire for an injected/synthetic run intent (used
  in unit tests), never from a production slot.
- **Per-category tally ISOLATION is real regardless:** a DELAYED (`TAPE_DELAY`) ledger run
  does NOT inflate the LIVE run count (proven with direct-Prisma CONFIRMED fixtures in
  `rightsWindow-pipeline.test.ts`). So enabling the flag cannot cause a delayed rerun to
  falsely consume a live-run limit.

Reaching non-LIVE enforcement needs a **slot-level coverage-category source** (a
BroadcastSlot column or a derivation) — a deferred RD-retro refinement, the same class as
slot-level territory (`Channel` has no territory field; ADR-015 Acceptance record §3).

The RD-5 smoke (`backend/tests/rd5-smoke-rights-windows.test.ts`) therefore demonstrates a
reachable **LIVE-window `MAX_RUNS_EXCEEDED`** (the defect-(b) headline) + a LIVE-window
`PLATFORM_NOT_COVERED`, not `HOLDBACK_VIOLATION`.

## Symptoms → checks

| Symptom | Check |
|---|---|
| Unexpected `WINDOW_*` / `HOLDBACK_*` codes after enabling | Inspect the contract's RightsWindow rows — the RD-2-T1 backfill creates exactly one window per contract mirroring its scalars. A missing/misscoped window explains `WINDOW_CATEGORY_MISSING` / `WINDOW_UNSCOPED`. |
| `NO_WINDOWS` (INFO) on a contract | Pre-backfill data guard — that contract has zero windows; it fell back to base scalar rights. Backfill (or create) a window. |
| `/rights/matrix` `windows[]` looks wrong | Reconcile against the backfill: window count should equal contract count; null `maxLiveRuns` → `maxRuns: null` (not 0). See `rightsWindow-backfill.test.ts`. |
| `/rights/check-slots` returns 400 | `channelId` must be a positive int; `date` must be `YYYY-MM-DD`; a corrupt `cursor` (non-uuid decode) → `400 invalid cursor`. Pass the server's `nextCursor` back verbatim. |
| A slot shows "all clear" but the event looks wrong | Look for `SLOT_EVENT_UNRESOLVED` (WARNING) — the linked event could not be resolved (not found / cross-tenant / dropped); it is NOT reported as CLEAR. |
| Run-limit never fires despite runs | Only CONFIRMED|RECONCILED RunLedger states are counted; the run-ledger API cannot create those states (TD-28). Confirmed runs are written by the reconciliation path, not the API. |
| Behavior changed unexpectedly | Confirm `RIGHTS_WINDOWS_ENABLED` — OFF must be byte-identical to legacy. If OFF differs, that is a regression, not expected. |

## Migration / backfill / rollback

- **Schema:** `RightsWindow` table + `ExclusivityTier` enum + `CoverageType.ARCHIVE`,
  migrations `20260710120000_add_rights_enums` (enums first — `ALTER TYPE ADD VALUE`
  cannot run in the same tx that uses it) then `20260710120001_add_rights_window` (table
  + RLS `tenant_isolation` + one-window-per-contract backfill).
- **Backfill:** exactly one window per existing contract, mirroring its scalars
  (`coverageType→category`, window bounds, territory/platforms as stored,
  `maxLiveRuns→maxRuns`, `tapeDelayHoursMin→holdbackHoursMin`, `exclusivity=NON_EXCLUSIVE`).
  Nulls preserved (no `?? 0`).
- **Migration rollback:** manual operator script at
  `backend/prisma/migrations/20260710120001_add_rights_window/rollback.sql` (forward-only
  repo per ADR-004/007 — no down-migrations; data rollback = pg_dump restore). It
  `DROP`s the `RightsWindow` table (and its RLS policy) and `ExclusivityTier`.
- **`ARCHIVE` enum value is NOT auto-droppable** — PostgreSQL cannot remove a single enum
  value. It is left in place by design (an unused dormant value is inert). A true schema
  reversal requires the pg_dump restore path (documented in `rollback.sql`).
- **Feature rollback (no schema change):** just set `RIGHTS_WINDOWS_ENABLED` off and
  redeploy — storage/backfill remain, the checker reverts to the legacy scalar path.
