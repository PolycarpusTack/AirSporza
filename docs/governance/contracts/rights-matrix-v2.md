# CONTRACT SNAPSHOT: rights-matrix v2

Version: 2 · Date: 2026-07-10 · Task: RD-2-T3 (additive `windows[]`) · ADR-015 · source: `getRightsMatrix` (`backend/src/services/rightsChecker.ts`) · endpoint: `GET /api/rights/matrix` · smoke: RD-5

No `rights-matrix v1` snapshot existed; v2 captures the CURRENT row shape plus the
single additive field introduced by RD-2-T3. The change is **purely additive** — every
pre-existing field is byte-identical (asserted by `tests/rightsMatrix-windows.test.ts`
"additive-only" + the unchanged pre-existing suites).

## Row shape (one row per Contract, ordered `[competitionId asc, validUntil desc]`)

Pre-existing fields (UNCHANGED from the endpoint's prior behavior):

| field | type | notes |
|---|---|---|
| `contractId` | number | |
| `competitionId` | number | |
| `competitionName` | string | |
| `seasonId` | number \| null | |
| `seasonName` | string \| null | |
| `status` | string | `ContractStatus` |
| `platforms` | string[] | explicit `platforms[]`, else derived from legacy booleans |
| `territory` | string[] | |
| `coverageType` | string | contract scalar (plain string) |
| `runsUsed` | number | LIVE runs in `CONFIRMED\|RECONCILED` (contract-level rollup, no N+1) |
| `maxLiveRuns` | number \| null | null = no limit (RD-1F) |
| `windowStartUtc` | ISO \| null | contract scalar window bound |
| `windowEndUtc` | ISO \| null | contract scalar window bound |
| `validUntil` | ISO \| null | |
| `daysUntilExpiry` | number \| null | |
| `severity` | `'ok'\|'warning'\|'error'` | rolled from status/limit/expiry |
| `blackoutCount` | number | length of parsed `blackoutPeriods` |

## Additive field (v2) — `windows[]`

The contract's `RightsWindow` rows (RD-2), fetched via the SAME `db.contract.findMany`
`include` (`rightsWindows: { orderBy: { id: 'asc' } }` — deterministic order, no N+1) and
mapped per row:

| field | type | notes |
|---|---|---|
| `id` | string | uuid |
| `category` | string | `CoverageType` incl. `ARCHIVE` |
| `exclusivity` | string | `ExclusivityTier` — exposes `OPEN_NET` (EPIC RC consumer) |
| `territory` | string[] | `[]` = unrestricted |
| `platforms` | string[] | lowercase channel-type vocab; `[]` = unrestricted |
| `windowStartUtc` | ISO \| null | mirrors the row's existing ISO-string handling |
| `windowEndUtc` | ISO \| null | |
| `maxRuns` | number \| null | the per-window LIMIT (null = no limit) |
| `holdbackHoursMin` | number \| null | ADR-015 §4 |

A contract with no windows → `windows: []`.

## Deferred (NOT in v2) — per-window USED tally

`windows[]` exposes each window's `maxRuns` (the limit) ONLY. A per-window *used* count
(RunLedger tallied per category) is **RD-3's job**: the `RunType→category` mapping is
non-trivial (`TAPE_DELAY→DELAYED`, `CONTINUATION` excluded, no `ARCHIVE` RunType yet —
ADR-015 §2) and RD-3's pull-gate explicitly VOIDS the naive 1:1 mapping. The row-level
`runsUsed` remains the contract-level LIVE rollup it already was (unchanged).

## Flag / validation posture

- **Flag-independent:** this is an additive read exposure. The `rightsWindows` flag gates
  validation-code EMISSION (RD-3), not data. `getRightsMatrix` emits **no** validation
  codes (it returns matrix rows, not `ValidationResult`s) — unchanged in T3.

## Consumers

- `GET /api/rights/matrix` (`backend/src/routes/rights.ts`). NOTE: the ops B-3 rights view
  derives its grid from a FRONTEND `deriveRightsMatrix` selector over contracts, NOT this
  endpoint (verified) — but additive-only is upheld regardless.
- RD-5 smoke; EPIC RC open-net remit logic reads `windows[].exclusivity === 'OPEN_NET'`.

## Depends-on

- RD-2-T1 (`RightsWindow` table + enums, `30457f7`) · RD-2-T2 (`rights-window v1` CRUD,
  `aa3f5cb`). No new query cost — windows ride the existing contract `include`.
