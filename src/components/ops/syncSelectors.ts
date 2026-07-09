/**
 * SYNC job/candidate projection selectors (D-1-T1) — PURE functions, no React, no
 * fetching, no Date.now()/Math.random(). Sibling module to selectors.ts /
 * registrySelectors.ts, which stay byte-stable (sibling-module rule / TD-25).
 * Consumed by the Sync screen job list (D-1) + the merge-review queue (D-2/D-3).
 *
 * Convention (mirrors registrySelectors): the selector returns a SEMANTIC color
 * TOKEN (never a hex literal) — the COMPONENT maps the token to a CSS var
 * (anti-smart-ui). Assembled display strings (`statusLine`) are fully built here,
 * the same way registrySelectors returns finished `detail`/`linkedSummary` lines.
 *
 * TZ seam (the initiative's ONE ambient-TZ read, rundown precedent): the status
 * line's `time` is the WALL-CLOCK HH:MM of `startedAt ?? createdAt`, formatted with
 * `toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })` — en-GB
 * gives a 24h zero-padded clock, and with NO `timeZone` option it reads the
 * AMBIENT tz on purpose (tests pin TZ=America/New_York, so a `…T20:00:00Z`
 * instant reads `15:00`). This is the documented seam; every other value is
 * TZ-free.
 */
import type { ImportJob, ImportMergeCandidate } from '../../services'
import type { Competition, Event, Sport } from '../../data/types'

/** Semantic status dot token — the component maps it to a CSS var, never a hex. */
export type JobDotColor = 'green' | 'red' | 'amber' | 'neutral'

export interface JobCard {
  id: string
  /** job.source.name (pin 2) */
  sourceName: string
  /** semantic status-dot colour token from the status map (pin 1) */
  dotColor: JobDotColor
  /** fully assembled status line (pin 3): `HH:MM · …` — dead-letters OR success */
  statusLine: string
}

/**
 * status-dot colour map (pin 1): completed→green, failed→red, partial→amber,
 * queued and running→neutral (in-flight / not-yet-started carry no outcome colour).
 */
const DOT_COLOR_BY_STATUS: Record<ImportJob['status'], JobDotColor> = {
  completed: 'green',
  failed: 'red',
  partial: 'amber',
  queued: 'neutral',
  running: 'neutral',
}

/**
 * Wall-clock HH:MM (24h, zero-padded) in the AMBIENT tz — the D-1 TZ seam (see
 * header). Reads `startedAt ?? createdAt` so a not-yet-started job still shows a
 * time (pin 4).
 */
function jobWallClockTime(job: ImportJob): string {
  const iso = job.startedAt ?? job.createdAt
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Records processed (success meta): prefer `statsJson.recordsProcessed` when it
 * coerces to a finite number — statsJson is `Record<string, unknown>` and the API
 * may serialise a Prisma Decimal as a STRING, so we do NOT trust the type and
 * guard with Number(). Non-numeric / absent → fall back to `_count.records ?? 0`.
 */
function resolveRecordsProcessed(job: ImportJob): number {
  const raw = job.statsJson?.recordsProcessed
  if (raw != null && raw !== '') {
    const coerced = Number(raw)
    if (Number.isFinite(coerced)) return coerced
  }
  return job._count?.records ?? 0
}

/**
 * Projects an ImportJob into its display JobCard (pins 1–4). statusLine: when the
 * job carries dead-letters the line surfaces them (`HH:MM · N DEAD-LETTERS`);
 * otherwise the success line (`HH:MM · OK · N RECORDS`).
 */
export function deriveJobCard(job: ImportJob): JobCard {
  const time = jobWallClockTime(job)
  const deadLetters = job._count?.deadLetters ?? 0
  const statusLine =
    deadLetters > 0
      ? `${time} · ${deadLetters} DEAD-LETTERS`
      : `${time} · OK · ${resolveRecordsProcessed(job)} RECORDS`
  return {
    id: job.id,
    sourceName: job.source.name,
    dotColor: DOT_COLOR_BY_STATUS[job.status],
    statusLine,
  }
}

/**
 * Merge-candidate confidence as a whole-number percent (D-2-T0 shared extraction;
 * scale CORRECTED in the D-2-T1 pull-gate fix).
 *
 * VERIFIED SCALE (2026-07-09, against DeduplicationService + import/stages/process.ts):
 * `confidence` is a Decimal(5,2) already on a **0..100** scale — DeduplicationService
 * emits 100 (exact) / 95 (fingerprint) / 60 (unverified) / a fuzzy `score` compared to
 * 70-95 thresholds, and process.ts stores `result.confidence` DIRECTLY (no /100). The
 * value is serialised as a STRING typed `number` → explicit Number() coercion (never by
 * accident). The whole-number percent is therefore `Math.round(Number(confidence))` —
 * the raw value IS the percent (design: `92% MATCH`, band ≥90).
 *
 * This CORRECTS legacy ImportView.ReviewTab, which did `* 100` (rendering e.g. 9500%
 * for a real 95-confidence candidate — a latent bug, unnoticed because few real merge
 * candidates existed). Shared by ImportView.ReviewTab + SyncScreen's deriveMergeCard.
 */
export function mergeConfidencePercent(confidence: number): number {
  return Math.round(Number(confidence))
}

/**
 * Count of candidates still awaiting review (pin 5). The server pre-filters to
 * pending, but we count defensively by `status === 'pending'` — this documents
 * the D-3 decrement seam (an approved/ignored candidate drops out of the count
 * without a refetch).
 */
export function pendingCandidateCount(candidates: ImportMergeCandidate[]): number {
  return candidates.filter((candidate) => candidate.status === 'pending').length
}

/* ────────────────────────────────────────────────────────────────────────────
 * D-2-T1 — merge-review card + field-diff projection (sync-selectors v1.2).
 * The card compares an INCOMING import record (candidate.importRecord.
 * normalizedJson — a CanonicalImportEvent-shaped `Record<string, unknown>` whose
 * values are read DEFENSIVELY as `unknown`) against the CURRENT resolved Event
 * (from AppProvider; the component resolves it and passes it in — or null when the
 * suggested event isn't loaded / suggestedEntityId is null → an INCOMING-only card).
 *
 * Convention (mirrors deriveJobCard above + registrySelectors): PURE — no React,
 * no fetch, no Date.now()/Math.random(); returns a SEMANTIC band token (never a
 * hex) that the component maps to a CSS var (anti-smart-ui). Display strings are
 * fully assembled here.
 * ──────────────────────────────────────────────────────────────────────── */

/** 2-band confidence token (≥90 → green, else amber). Component maps token → CSS var. */
export type ConfidenceBand = 'green' | 'amber'

/** One comparable field: rendered ONLY when BOTH sides resolve to a non-empty string. */
export interface MergeDiffRow {
  field: string
  incoming: string
  current: string
  isChanged: boolean
}

export interface MergeCard {
  id: string
  /** candidate.entityType uppercased — the kind chip (e.g. 'EVENT'). */
  kindLabel: string
  /** homeTeam — awayTeam | participantsText | `sport · competition` | sourceRecordId (fallback chain). */
  incomingName: string
  /** resolved event.participants, or null when the current side is unresolved. */
  currentName: string | null
  confidencePercent: number
  band: ConfidenceBand
  /** SOURCE code mapped via MERGE_SOURCE_CODE_MAP (unknown → uppercased raw). */
  sourceCode: string
  suggestedEntityId: string | null
  /** false → INCOMING-only card (no CURRENT column; APPROVE stays create-gated on suggestedEntityId). */
  isCurrentResolved: boolean
  /** [] when isCurrentResolved is false. */
  diffRows: MergeDiffRow[]
}

/**
 * Import Source.code → display SOURCE code. MIRRORS registrySelectors' SOURCE_CODE_MAP
 * (same 3 values) but kept a SEPARATE constant (D-2 pin 6): the key-space here is the
 * import `Source.code` vocabulary, which may diverge from the externalRefs key-space the
 * registry maps. Unknown code → uppercased raw (never dropped silently).
 */
const MERGE_SOURCE_CODE_MAP: Record<string, string> = {
  the_sports_db: 'TSDB',
  api_football: 'API-FB',
  football_data: 'FB-DATA',
}

export function mergeSourceCode(code: string): string {
  return MERGE_SOURCE_CODE_MAP[code] ?? code.toUpperCase()
}

/** normalizedJson values are `unknown` — coerce to a string, never assume shape. */
function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * TZ-FREE date part `YYYY-MM-DD`. A string (ISO or date-only) is sliced to its
 * first 10 chars (no Date parse → no TZ shift). A Date is read via its LOCAL
 * calendar components (getFullYear/Month/Date) — the fixtures hold local-midnight
 * Date objects whose `toISOString()` would shift a day in TZs ahead of UTC; the
 * component read keeps the intended calendar day. Anything else → ''.
 */
function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

/** INCOMING participants: homeTeam — awayTeam when BOTH present, else participantsText. */
function incomingParticipants(normalizedJson: Record<string, unknown>): string {
  const home = stringOrEmpty(normalizedJson.homeTeam)
  const away = stringOrEmpty(normalizedJson.awayTeam)
  if (home && away) return `${home} — ${away}`
  return stringOrEmpty(normalizedJson.participantsText)
}

/**
 * The comparable field diff (D-2 pin 5): exactly 4 fields (SPORT, COMPETITION,
 * DATE, PARTICIPANTS). A row is emitted ONLY when BOTH sides resolve to a non-empty
 * string; `isChanged` is a string compare after normalization. A null normalizedJson
 * or a null currentEvent (unresolved current) → no rows.
 */
export function deriveMergeDiff(
  normalizedJson: Record<string, unknown> | null,
  currentEvent: Event | null,
  sports: Sport[],
  competitions: Competition[],
): MergeDiffRow[] {
  if (!normalizedJson || !currentEvent) return []

  const currentSport = sports.find((s) => s.id === currentEvent.sportId)?.name ?? ''
  const currentComp = competitions.find((c) => c.id === currentEvent.competitionId)?.name ?? ''

  const pairs: Array<{ field: string; incoming: string; current: string }> = [
    { field: 'SPORT', incoming: stringOrEmpty(normalizedJson.sportName), current: currentSport },
    { field: 'COMPETITION', incoming: stringOrEmpty(normalizedJson.competitionName), current: currentComp },
    { field: 'DATE', incoming: dateOnly(normalizedJson.startsAtUtc), current: dateOnly(currentEvent.startDateBE) },
    { field: 'PARTICIPANTS', incoming: incomingParticipants(normalizedJson), current: stringOrEmpty(currentEvent.participants) },
  ]

  return pairs
    .filter((p) => p.incoming !== '' && p.current !== '')
    .map((p) => ({ field: p.field, incoming: p.incoming, current: p.current, isChanged: p.incoming !== p.current }))
}

/**
 * INCOMING display name fallback chain: homeTeam — awayTeam (both present) →
 * participantsText → `sport · competition` (both present) → sourceRecordId (last
 * resort — never empty). A null normalizedJson skips straight to sourceRecordId.
 */
function deriveIncomingName(candidate: ImportMergeCandidate): string {
  const nj = candidate.importRecord.normalizedJson
  if (nj) {
    const home = stringOrEmpty(nj.homeTeam)
    const away = stringOrEmpty(nj.awayTeam)
    if (home && away) return `${home} — ${away}`
    const text = stringOrEmpty(nj.participantsText)
    if (text) return text
    const sport = stringOrEmpty(nj.sportName)
    const comp = stringOrEmpty(nj.competitionName)
    if (sport && comp) return `${sport} · ${comp}`
  }
  return candidate.importRecord.sourceRecordId
}

/**
 * Projects a merge candidate + its resolved current Event (or null) into a MergeCard.
 * `isCurrentResolved` is simply whether a currentEvent was supplied — an unresolved
 * current yields an INCOMING-only card (empty diff, null currentName). The APPROVE
 * gate is on `suggestedEntityId` (create-only when null), NOT on isCurrentResolved.
 */
export function deriveMergeCard(
  candidate: ImportMergeCandidate,
  currentEvent: Event | null,
  sports: Sport[],
  competitions: Competition[],
): MergeCard {
  const isCurrentResolved = currentEvent !== null
  const percent = mergeConfidencePercent(candidate.confidence)
  return {
    id: candidate.id,
    kindLabel: candidate.entityType.toUpperCase(),
    incomingName: deriveIncomingName(candidate),
    currentName: currentEvent ? stringOrEmpty(currentEvent.participants) : null,
    confidencePercent: percent,
    band: percent >= 90 ? 'green' : 'amber',
    sourceCode: mergeSourceCode(candidate.importRecord.source.code),
    suggestedEntityId: candidate.suggestedEntityId,
    isCurrentResolved,
    diffRows: isCurrentResolved ? deriveMergeDiff(candidate.importRecord.normalizedJson, currentEvent, sports, competitions) : [],
  }
}
