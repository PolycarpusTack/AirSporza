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
 * Merge-candidate confidence as a whole-number percent (D-2-T0 shared extraction).
 * `confidence` is a Decimal(5,2) in 0..1 serialised as a STRING typed `number` →
 * explicit Number() coercion (never coercion-by-accident). Math.round(Number(x)*100)
 * is OUTPUT-IDENTICAL to the legacy `Math.round(x*100)` (the `*` already coerced) —
 * this extraction is byte-stable, it just names + de-risks the coercion.
 * Shared by ImportView.ReviewTab (legacy) + SyncScreen's deriveMergeCard (D-2-T1).
 */
export function mergeConfidencePercent(confidence: number): number {
  return Math.round(Number(confidence) * 100)
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
