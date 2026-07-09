# CONTRACT SNAPSHOT: sync-selectors

Version: 1.1 · Date: 2026-07-09 · Task: D-1-T1 (v1) + D-2-T0 (v1.1) · consumers: SyncScreen job list (D-1-T2), merge-review queue (D-2/D-3), legacy ImportView.ReviewTab (v1.1 shared helper)

**Changelog**
- **v1.1 (2026-07-09, D-2-T0 — architect-gated Rule-of-Three extraction):** ADDITIVE —
  v1 surface byte-stable. Adds the ONE byte-identical shared bit between the two
  merge-candidate consumers: `mergeConfidencePercent(confidence): number` =
  `Math.round(Number(confidence) * 100)`. Legacy `ImportView.ReviewTab` was refactored
  onto it (byte-stable, characterization-tested). **Gate ruling:** only the
  confidence→percent is shared; the confidence BAND (ImportView 3-band vs SYNC 2-band),
  SOURCE display (raw vs mapped), and KIND chip DIVERGE → stay per-consumer, NOT
  extracted. `deriveMergeCard`/diff derivation is D-2-T1 FEATURE (will consume this
  helper, not re-inline `*100`).

Pure SYNC-projection selectors — a NEW sibling module to `selectors.ts` /
`registrySelectors.ts` (both stay byte-stable; sibling-module rule / TD-25). No
React, no fetch, no `Date.now()`/`Math.random()`. Projects the import-pipeline
read models (`ImportJob`, `ImportMergeCandidate` from `src/services/imports.ts`)
into display shapes for the Sync screen. Follows the registrySelectors convention:
selectors emit SEMANTIC colour TOKENS (never hex); the component maps token → CSS
var (anti-smart-ui). Assembled display lines are fully built here (mirrors
`detail`/`linkedSummary`).

## Public interface

```ts
// src/components/ops/syncSelectors.ts
export type JobDotColor = 'green' | 'red' | 'amber' | 'neutral'   // semantic token, NEVER hex

export interface JobCard {
  id: string
  sourceName: string        // job.source.name (pin 2)
  dotColor: JobDotColor      // status-dot colour token (pin 1)
  statusLine: string         // assembled meta line (pin 3): `HH:MM · …`
}

export function deriveJobCard(job: ImportJob): JobCard
export function pendingCandidateCount(candidates: ImportMergeCandidate[]): number
export function mergeConfidencePercent(confidence: number): number  // v1.1 — 0..1 → 0..100 whole percent
```

## Behaviour pins (verified against services/imports.ts + backend/routes/import/jobs.ts)

- **dotColor map (pin 1):** `completed→green`, `failed→red`, `partial→amber`,
  `queued→neutral`, `running→neutral` (in-flight / not-yet-started carry no
  outcome colour).
- **statusLine (pin 3):**
  - `time` = wall-clock `HH:MM` (24h, zero-padded) of `startedAt ?? createdAt`,
    via `toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })`.
    **TZ seam:** no `timeZone` option → reads the AMBIENT tz on purpose (the
    initiative's one ambient-TZ read, rundown precedent). Tests pin
    `TZ=America/New_York`, so `…T20:00:00Z` reads `15:00`.
  - `job._count?.deadLetters ?? 0 > 0` → `` `${time} · ${N} DEAD-LETTERS` `` (the
    dead-letter branch WINS over success meta).
  - else → `` `${time} · OK · ${records} RECORDS` `` where `records` =
    `statsJson.recordsProcessed` **iff** it is present (`!= null && !== ''`) AND
    coerces to a finite `Number()` (Decimal-serialised-string safe), otherwise
    `job._count?.records ?? 0`. The `!= null && !== ''` guard avoids the
    `Number('')===0` / `Number(null)===0` trap that would mask a fallback.
- **pendingCandidateCount (pin 5):** count of candidates with
  `status === 'pending'`. Server pre-filters to pending; the by-status count is
  defensive and documents the D-3 decrement seam (a decided candidate drops out
  of the count without a refetch).

## Fixtures (additive to `__fixtures__/opsFixtureWeek.ts`, deep-frozen, anonymised — EPIC C DoD 3)

- Builders `makeJob(overrides & {id})`, `makeMergeCandidate(overrides & {id})`.
- `FIXTURE_JOBS`: one `completed` (records), one `failed` (`deadLetters > 0`), one
  `running` (no `startedAt` → time falls back to `createdAt`).
- `FIXTURE_MERGE_CANDIDATES`: spans ≥90 & <90 confidence, one `suggestedEntityId`
  set + one `null`, differing `normalizedJson.venue` (feeds D-2/D-3).
  `cand-high.confidence` is a Decimal-serialised STRING typed `number` (honest-data
  pin — exercises the D-2 `Number()` coercion seam).

## Depends-on / seams for later tasks

- **D-2:** `deriveMergeCard` derivation joins this module (v1.1). Confidence band /
  source-code map / diff-field set are gate-decided at D-2-T0/T1 — NOT pinned here.
- **D-2 gate flag:** `FIXTURE_MERGE_CANDIDATES[0].suggestedEntityId` is `'event:501'`
  (composite-style). The REAL `suggestedEntityId` format (raw `Event.id` vs
  composite) must be verified at the D-2 CURRENT-resolution gate; adjust the fixture
  then if it diverges.
- **D-3:** `pendingCandidateCount` is the badge source; the decrement is driven by
  the screen's `decided` map (badge = pending set minus decided).

## Found-work / debt candidates (TEXT — debt-register has uncommitted parallel-session edits)

- `statsJson.recordsProcessed` key name + Decimal-as-string serialisation are
  assumed from the D expansion, not confirmed against a live job payload — cross-check
  before D-2 leans on the same field.
- `dotColor` collapses `queued` and `running` to `neutral`; if the screen later needs
  to distinguish not-started from in-progress, the token type grows a fifth state.
