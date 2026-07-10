# CONTRACT SNAPSHOT: sync-selectors

Version: 1.2 · Date: 2026-07-09 · Task: D-1-T1 (v1) + D-2-T0/scale-fix (v1.1) + D-2-T1 (v1.2) · consumers: SyncScreen job list + merge cards (D-1-T2/D-2-T1), merge decisions (D-3), legacy ImportView.ReviewTab (v1.1 shared helper)

**Changelog**
- **v1.2 (2026-07-09, D-2-T1):** ADDITIVE — v1/v1.1 surface byte-stable. Adds the
  merge-review card + field-diff projection (pure): `deriveMergeCard(candidate,
  currentEvent, sports, competitions): MergeCard`, `deriveMergeDiff(normalizedJson,
  currentEvent, sports, competitions): MergeDiffRow[]`, `mergeSourceCode(code)`, and
  types `ConfidenceBand` ('green'|'amber'), `MergeDiffRow` (field/incoming/current/
  `isChanged`), `MergeCard` (id, kindLabel, incomingName, currentName, confidencePercent,
  band, sourceCode, suggestedEntityId, `isCurrentResolved`, diffRows). **CURRENT source
  (pull-gate output):** AppProvider (`useApp` events/sports/competitions); resolve
  `events.find(e => String(e.id) === suggestedEntityId)` (bare-numeric id per
  DeduplicationService); unresolved/null → INCOMING-only card (empty diff, null
  currentName), never a crash. **Comparable field set (pin 5):** exactly SPORT /
  COMPETITION / DATE / PARTICIPANTS — the only fields the thin `Event` entity carries;
  a row renders only when BOTH sides are non-empty, `isChanged = incoming !== current`
  after TZ-free normalization. Band = `mergeConfidencePercent(...) >= 90 ? green : amber`
  (0..100 scale). Source map = `MERGE_SOURCE_CODE_MAP` (own copy of registry's, pin 6).
- **v1.1 (2026-07-09, D-2-T0 extraction + D-2-T1 pull-gate SCALE FIX):** Adds the
  shared merge-candidate `mergeConfidencePercent(confidence): number`. **Scale
  corrected:** confidence is VERIFIED 0..100 (DeduplicationService emits 100/95/60/score
  vs 70-95 thresholds; process.ts stores it directly) — the raw value IS the percent, so
  the helper is `Math.round(Number(confidence))` (NOT `*100`). This CORRECTS legacy
  `ImportView.ReviewTab`, which did `*100` (rendering e.g. 9500% for a 95-candidate — a
  latent bug the D-2-T0 byte-stable extraction initially preserved; the architect ruled
  fix-everywhere). ReviewTab consumes the helper → its display is now correct.
  **Gate ruling (extraction scope):** only the confidence→percent is shared; the
  confidence BAND (ImportView 3-band vs SYNC 2-band ≥90), SOURCE display (raw vs mapped),
  and KIND chip DIVERGE → stay per-consumer. `deriveMergeCard`/diff = D-2-T1 FEATURE
  (consumes this helper + bands on `mergeConfidencePercent(...) >= 90`).

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
export function mergeConfidencePercent(confidence: number): number  // v1.1 — 0..100 confidence → whole percent (raw value IS the percent)

// v1.2 — merge-review card + field diff
export type ConfidenceBand = 'green' | 'amber'   // ≥90 green else amber (semantic token, NEVER hex)
export interface MergeDiffRow { field: string; incoming: string; current: string; isChanged: boolean }
export interface MergeCard {
  id: string
  kindLabel: string          // candidate.entityType uppercased — kind chip
  incomingName: string       // homeTeam — awayTeam | participantsText | `sport · competition` | sourceRecordId
  currentName: string | null // resolved event.participants, null when unresolved
  confidencePercent: number
  band: ConfidenceBand
  sourceCode: string         // mapped VIA <CODE>
  suggestedEntityId: string | null
  isCurrentResolved: boolean // false → INCOMING-only card (no CURRENT column / diff)
  diffRows: MergeDiffRow[]   // [] when isCurrentResolved is false
}
export function mergeSourceCode(code: string): string
export function deriveMergeDiff(normalizedJson: Record<string, unknown> | null, currentEvent: Event | null, sports: Sport[], competitions: Competition[]): MergeDiffRow[]
export function deriveMergeCard(candidate: ImportMergeCandidate, currentEvent: Event | null, sports: Sport[], competitions: Competition[]): MergeCard
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
- `FIXTURE_MERGE_CANDIDATES`: spans ≥90 & <90 confidence (0..100 scale), one
  `suggestedEntityId` = `'1'` (a real `FIXTURE_EVENTS` id → CURRENT resolves; canonical
  `normalizedJson` with a DIFFERING participants field + matching sport/comp/date) +
  one `null` (INCOMING-only path). `cand-high.confidence` is a Decimal-serialised
  STRING `'95.00'` (honest-data pin — exercises the `Number()` coercion seam).

## Depends-on / seams for later tasks

- **D-2 (RESOLVED v1.2):** `deriveMergeCard`/`deriveMergeDiff` landed. CURRENT source =
  AppProvider `useApp` (events/sports/competitions); `suggestedEntityId` is a BARE
  numeric id string (`String(eventId)`, VERIFIED in DeduplicationService), resolved via
  `events.find(e => String(e.id) === suggestedEntityId)`. Confidence scale VERIFIED
  0..100. Comparable field set = SPORT/COMPETITION/DATE/PARTICIPANTS (the thin `Event`
  has no venue/country/status/home-away counterpart).
- **D-3:** `pendingCandidateCount` is the badge source; the decrement is driven by the
  screen's `decided` map (badge = pending set minus decided). The `MergeCardView`
  footer is INERT (D-3 wires APPROVE MERGE / KEEP SEPARATE + single-flight).

## Found-work / debt candidates (TEXT — debt-register has uncommitted parallel-session edits)

- `statsJson.recordsProcessed` key name + Decimal-as-string serialisation are
  assumed from the D expansion, not confirmed against a live job payload — cross-check
  before D-2 leans on the same field.
- `dotColor` collapses `queued` and `running` to `neutral`; if the screen later needs
  to distinguish not-started from in-progress, the token type grows a fifth state.
