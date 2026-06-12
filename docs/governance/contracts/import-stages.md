# CONTRACT SNAPSHOT: ImportStages

Version: 1 · Date: 2026-06-12 · Task: C-1 (consumed by EPIC G — Players)

## Module map (`backend/src/import/stages/`)

| Module | Public interface | Purpose |
|---|---|---|
| `shared.ts` | `loadJob(jobId)`, `JobWithSource`, `ImportJobCancelledError`, `deduplicationService`, `hashValue`, `normalizeName`, `scopeToRecordType`, `normalizeRecordType`, `readCount` | Dependency-light primitives; never imports other stages |
| `provision.ts` | `upsertCompetition(sourceId, tenantId, normalized)`, `upsertTeam(...)` (incl. CanonicalTeam→Team bridge), `upsertEvent(sourceId, tenantId, rawRecord, normalized)`, `manualCreateNormalizedEvent`, `manualMergeNormalizedEvent`, `formatDateOffset` | Canonical + operational entity projection. **EPIC G adds `upsertPlayer` HERE following the `upsertTeam` pattern** |
| `records.ts` | `upsertImportRecord(...)`, `writeDeadLetter(job, rawRecord, error)`, `getSourceCompetitionIds(sourceId)` | ImportRecord persistence + dead letters |
| `process.ts` | `processCompetitionRecord(job, ...)`, `processTeamRecord(...)`, `processEventRecord(...)` | Per-record pipeline: record persistence → provision. **EPIC G adds `processPlayerRecord` HERE** |
| `progress.ts` | `createProgressController(jobId, initialStats, workerId?)`, `ProgressController` | Heartbeat, stats, cancellation polling |
| `failure.ts` | `handleJobFailure(...)`, `writeSyncHistory(...)` | Retry classification/backoff, sync history |

`services/ImportJobRunner.ts` (330 ln) is the orchestrator only: `runImportJob`, `executeJob`,
`replayDeadLetter`, the `importTeams/Competitions/Events` loops. Route-facing exports
(`manualCreateNormalizedEvent`, `manualMergeNormalizedEvent`) are re-exported from the runner for
compatibility until C-2 splits `routes/import.ts`.

## Error shapes

Unchanged from pre-decomposition: stage functions throw; the orchestrator's run loop catches per
record (dead-letter via `writeDeadLetter`) and per job (`handleJobFailure` → retry or fail).
`ImportJobCancelledError` aborts the loop cleanly.

## Invariants (verified)

- Pure-move refactor: full backend suite (251 tests) green with **zero test edits**.
- No stage imports the orchestrator; `shared.ts` imports no stage (cycle-free).
- Dependency-direction fitness function covers `backend/src/import/**` (no route imports).

## Domain terms

Import Record, Canonical Team, Bridge (`upsertTeam` projection), Dead Letter, Provision.
