# CONTRACT SNAPSHOT: rights-checker v2

Version: 2 · Date: 2026-07-10 · Task: RD-3-T1 (pure window-aware `checkRights`) · ADR-015 §2/§4 · source: `backend/src/services/rightsChecker.ts` · consumers: RD-3-T2 wiring (`checkRightsForEvent`, draft validation) · smoke: RD-5

Pure, DB-free window-aware rights checking. The legacy scalar path is preserved
byte-identical behind a flag param (golden master, RD-1F baseline).

## Signature + flag-param semantics

```ts
checkRights(
  input: RightsCheckInput,
  contracts: Array<Contract & { rightsWindows?: RightsWindow[] }>,
  opts: { windowsEnabled?: boolean } = {},
): ValidationResult[]
```

- `opts.windowsEnabled` **falsy/default** → legacy scalar path, UNCHANGED. Existing
  callers `checkRights(input, contracts)` get zero behavior change (golden master).
- `opts.windowsEnabled === true` → window-aware path below.
- **The pure fn never reads env.** RD-3-T2 reads `env.RIGHTS_WINDOWS` and passes the
  boolean. The empty/`none-only` guards (`NO_VALID_CONTRACT`) are shared and identical
  in both paths.
- `Contract[]` is assignable to the param type (`rightsWindows?` is optional), so no
  caller signature churn.

## v2 input fields (additive to `RightsCheckInput`; caller-populated, never computed here)

| field | type | meaning |
|---|---|---|
| `runIntent` | string | the CoverageType category the slot represents (`LIVE\|DELAYED\|HIGHLIGHTS\|CLIP\|ARCHIVE`); **default `LIVE`** |
| `liveRunEndedAtUtc` | string \| null | actual LIVE end from the RunLedger (§4 step 1) |
| `scheduledEndUtc` | string \| null | event scheduled end = startUtc+durationMin (§4 step 2) |

Existing fields unchanged: `channelId`, `channelTypes[]`, `startUtc`, `endUtc`,
`territory`, `currentRunCount` (in v2 the caller passes the **per-category** tally).

## Window-aware algorithm (per applicable valid/expiring contract)

1. **No windows** (`rightsWindows` empty/absent) → `NO_WINDOWS` (INFO) **and** fall
   through to the full legacy scalar checks for that contract (pre-backfill guard).
2. Resolve window: `rightsWindows.find(w => w.category === runIntent)`. **None** →
   `WINDOW_CATEGORY_MISSING` (WARNING, remediation names the missing category); skip
   per-window checks (blackout + expiry still run).
3. Per-window checks (empty `territory[]`/`platforms[]` = **unrestricted** = no violation):
   - Platform: `channelTypes` ⊄ `window.platforms` (when non-empty) → `PLATFORM_NOT_COVERED` (WARNING)
   - Time: `startUtc` outside `window.windowStartUtc/EndUtc` → `OUTSIDE_RIGHTS_WINDOW` (WARNING)
   - Territory: `input.territory` ∉ `window.territory` (when non-empty) → `TERRITORY_BLOCKED` (ERROR)
   - Holdback (only when `holdbackHoursMin != null` AND `runIntent !== 'LIVE'`): see below
   - Run limit (per-category): `currentRunCount >= window.maxRuns` → `MAX_RUNS_EXCEEDED` (ERROR);
     `>= maxRuns-1` → `MAX_RUNS_NEAR` (WARNING); **null `maxRuns` = no limit** (RD-1F, skipped)
   - Unscoped: empty `territory[]` OR `platforms[]` on the matched window → `WINDOW_UNSCOPED` (INFO)
4. **Blackout** — contract-level (`contract.blackoutPeriods`), checked regardless of
   window → `BLACKOUT_PERIOD` (ERROR).
5. **Contract expiry** — `status==='expiring'` → `CONTRACT_EXPIRING` (WARNING), as today.

A slot hitting >1 INFO trigger emits each distinct code (dedup by code+scope is the
caller's existing `deduplicateResults` behavior; the pure fn just emits distinct codes).

## Holdback resolution ORDER (ADR-015 §4) — never guess

liveEnd resolved in strict order: (1) `liveRunEndedAtUtc` if present → (2) else
`scheduledEndUtc` if present → (3) else `HOLDBACK_LIVE_END_UNKNOWN` (INFO), no violation.
If resolved: earliest = liveEnd + `holdbackHoursMin`×`MS_PER_HOUR`; `startUtc < earliest`
→ `HOLDBACK_VIOLATION` (ERROR, with `remediation` naming the earliest lawful start ISO).
**Boundary:** exactly at earliest = NO violation; one ms before = violation (`<`, half-open).

**NaN discipline (rights-enforcement safety):** a malformed/unparseable `liveEnd` OR
slot `startUtc` is treated as **unknown** → `HOLDBACK_LIVE_END_UNKNOWN` (INFO), never a
silent pass. (`NaN != null` is true, so without this guard `start < NaN === false` would
swallow the violation and report false "rights OK" — mirrors `checkBlackout`'s
`Number.isNaN` guard.) Ledger-actual strictly precedes scheduled (no `max()`): when a
ledger end is present, `scheduledEndUtc` is ignored even if later.

## New codes + severities (exact — from the RD-3 DoR refinement)

| code | severity | trigger |
|---|---|---|
| `WINDOW_CATEGORY_MISSING` | WARNING | no window matches `runIntent` |
| `HOLDBACK_VIOLATION` | ERROR | starts before liveEnd + holdback |
| `MAX_RUNS_EXCEEDED` | ERROR | per-category `currentRunCount >= window.maxRuns` |
| `MAX_RUNS_NEAR` | WARNING | per-category `currentRunCount >= window.maxRuns-1` |
| `TERRITORY_BLOCKED` | ERROR | territory not in non-empty window scope |
| `PLATFORM_NOT_COVERED` | WARNING | channel types not in non-empty window scope |
| `OUTSIDE_RIGHTS_WINDOW` | WARNING | start outside window bounds |
| `WINDOW_UNSCOPED` | INFO | matched window has empty territory OR platforms |
| `NO_WINDOWS` | INFO | contract has zero windows (legacy fallthrough) |
| `HOLDBACK_LIVE_END_UNKNOWN` | INFO | holdback applies but no ledger/scheduled live end |
| `BLACKOUT_PERIOD` / `CONTRACT_EXPIRING` / `NO_VALID_CONTRACT` | ERROR/WARNING/ERROR | unchanged from v1 |

## Scope — what is NOT in T1 (deferred to RD-3-T2)

Pure only: no DB, no env, no route wiring. `checkRightsForEvent`/draft-validation
wiring, the `RIGHTS_WINDOWS` env flag (`env.ts`), the per-category RunLedger tally
(RunType→category: `TAPE_DELAY→DELAYED`, CONTINUATION excluded, ARCHIVE has no RunType —
ADR-015 §2), and the defect-(b) `existingRuns` ledger fix are ALL RD-3-T2. This snapshot
is the pull-gate for that wiring.

## Verification

- Golden master (`rightsChecker-golden-legacy.test.ts`): **frozen-literal** full-message
  baseline (cross-checked char-identical against `git show main:…rightsChecker.ts` before the
  extraction) + `{code,severity,scope}` baseline + invariance (omitted opts ===
  `{windowsEnabled:false}`; attaching windows does not change flag-OFF output). Pre-existing
  `rightsChecker.test.ts` passes unchanged.
- Permutation table (`rightsChecker-windows.test.ts`): each code, each check pos/neg,
  holdback order + boundary + NaN guards + ledger-precedence (kills `max()` mutant) +
  LIVE-guard mutant, empty-scope unrestricted (territory AND platforms arms), multi-INFO,
  run limits, scope-tag assertions.
- Structure: the window path reads as a sequence of named helpers
  (`checkWindowPlatform`/`checkWindowTimeBounds`/`checkWindowTerritory`/`checkHoldback`/
  `checkWindowRunLimit`/`checkWindowUnscoped`); the legacy body shares only
  `checkBlackout`/`checkExpiry` — output byte-identical, proven by the frozen golden master.
- Branch coverage on the new pure path: **~95%**.
