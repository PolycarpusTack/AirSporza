/**
 * Unified Rights Checker
 *
 * Validates that an event/slot has the rights to broadcast on a channel,
 * checking: platform coverage, time windows, run limits, territory,
 * blackout periods, and contract expiry.
 *
 * Three entry points:
 *
 *  - {@link checkRights} — pure-function validator. Used by conflictService
 *    and schedule validation where contracts are already in hand.
 *  - {@link checkRightsForEvent} — DB-backed variant that resolves the
 *    applicable contract(s) for an event (competition + optional season
 *    narrowing) and tallies actual RunLedger consumption instead of
 *    trusting a `currentRunCount` parameter.
 *  - {@link getRightsMatrix} — operator-facing per-contract summary with
 *    runs-used / days-to-expiry / platform coverage for the matrix UI.
 */
import type { Contract, PrismaClient, RightsWindow } from '@prisma/client'
import type { ValidationResult } from './validation/types.js'
import { prisma as defaultPrisma } from '../db/prisma.js'
import { loadContractRunTally } from './validation/runTally.js'
import { beClockToUtc } from '../utils/beClock.js'
import { env } from '../config/env.js'

interface RightsCheckInput {
  channelId?: number | null
  channelTypes?: string[]  // from channel.types[]
  startUtc?: Date | string | null
  endUtc?: Date | string | null
  territory?: string       // target territory to check
  currentRunCount?: number // existing runs for this contract (optional — if
                           //   omitted, callers can instead use
                           //   checkRightsForEvent which queries RunLedger)

  // --- RD-3 v2 window-aware fields (populated by the RD-3-T2 caller; the pure
  //     fn only reads them, never computes them) ---
  /** CoverageType category the slot represents (LIVE|DELAYED|HIGHLIGHTS|CLIP|ARCHIVE). Default LIVE. */
  runIntent?: string
  /** Actual LIVE-run end from the RunLedger (ADR-015 §4 step 1). */
  liveRunEndedAtUtc?: string | null
  /** Event scheduled end = startUtc + durationMin (ADR-015 §4 step 2). */
  scheduledEndUtc?: string | null
}

/** A contract with its RightsWindow rows attached (v2 path input). */
type ContractWithWindows = Contract & { rightsWindows?: RightsWindow[] }

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000

interface BlackoutPeriod {
  start: string   // ISO
  end: string     // ISO
  reason?: string
}

/**
 * Check rights for an event against a set of contracts.
 * Pure function — no DB access.
 *
 * @param opts.windowsEnabled  When falsy (default), runs the legacy scalar path
 *   UNCHANGED (golden-master byte-identical, RD-1F baseline). When true, runs the
 *   RD-3 window-aware path: resolves the applicable RightsWindow by `input.runIntent`
 *   and enforces per-window platform/time/territory/holdback/run-limit (ADR-015 §2/§4).
 *   The pure fn takes the flag as a param; it never reads env (RD-3-T2 passes it).
 */
export function checkRights(
  input: RightsCheckInput,
  contracts: ContractWithWindows[],
  opts: { windowsEnabled?: boolean } = {},
): ValidationResult[] {
  const results: ValidationResult[] = []

  // No contracts at all — flag missing coverage
  if (contracts.length === 0) {
    results.push({
      code: 'NO_VALID_CONTRACT',
      severity: 'ERROR',
      scope: ['rights'],
      message: 'No contract found for this competition',
    })
    return results
  }

  // Find applicable contracts (valid or expiring)
  const applicable = contracts.filter(c =>
    c.status === 'valid' || c.status === 'expiring'
  )

  if (applicable.length === 0) {
    results.push({
      code: 'NO_VALID_CONTRACT',
      severity: 'ERROR',
      scope: ['rights'],
      message: 'No valid or expiring contract found for this competition',
    })
    return results
  }

  for (const contract of applicable) {
    if (opts.windowsEnabled) {
      checkContractWindows(input, contract, results)
    } else {
      checkContractLegacy(input, contract, results)
    }
  }

  return results
}

/**
 * Legacy scalar per-contract checks — the pre-RD-3 body, unchanged. Preserved
 * verbatim so the flag-OFF path stays golden-master byte-identical (RD-1F).
 */
function checkContractLegacy(
  input: RightsCheckInput,
  contract: Contract,
  results: ValidationResult[],
): void {
  // 1. Platform coverage check (skip if no channel known)
  if (input.channelId && input.channelTypes && input.channelTypes.length > 0) {
    const platforms = contract.platforms.length > 0
      ? contract.platforms
      : derivePlatformsFromLegacy(contract)

    const uncovered = input.channelTypes.filter(t => !platforms.includes(t))
    if (uncovered.length > 0) {
      results.push({
        code: 'PLATFORM_NOT_COVERED',
        severity: 'WARNING',
        scope: ['rights', 'platform'],
        message: `Channel type(s) [${uncovered.join(', ')}] not covered by contract #${contract.id}`,
      })
    }
  }

  // 2. Time window check
  if (contract.windowStartUtc && contract.windowEndUtc && input.startUtc) {
    const start = new Date(input.startUtc)
    const winStart = new Date(contract.windowStartUtc)
    const winEnd = new Date(contract.windowEndUtc)
    if (start < winStart || start > winEnd) {
      results.push({
        code: 'OUTSIDE_RIGHTS_WINDOW',
        severity: 'WARNING',
        scope: ['rights', 'window'],
        message: `Event start is outside the rights window (${winStart.toISOString()} – ${winEnd.toISOString()})`,
      })
    }
  }

  // 3. Blackout period check — sub-windows inside the main contract window
  //    when broadcast is forbidden (e.g. exclusive simulcast lockout).
  checkBlackout(input, contract, results)

  // 4. Run limit check
  if (contract.maxLiveRuns != null && input.currentRunCount != null) {
    if (input.currentRunCount >= contract.maxLiveRuns) {
      results.push({
        code: 'MAX_RUNS_EXCEEDED',
        severity: 'ERROR',
        scope: ['rights', 'runs'],
        message: `Maximum live runs (${contract.maxLiveRuns}) exceeded — currently ${input.currentRunCount} used`,
      })
    } else if (input.currentRunCount >= contract.maxLiveRuns - 1) {
      results.push({
        code: 'MAX_RUNS_NEAR',
        severity: 'WARNING',
        scope: ['rights', 'runs'],
        message: `Approaching maximum live runs: ${input.currentRunCount}/${contract.maxLiveRuns}`,
      })
    }
  }

  // 5. Territory check
  if (input.territory && contract.territory.length > 0) {
    if (!contract.territory.includes(input.territory)) {
      results.push({
        code: 'TERRITORY_BLOCKED',
        severity: 'ERROR',
        scope: ['rights', 'territory'],
        message: `Territory "${input.territory}" is not covered by contract #${contract.id} (allowed: ${contract.territory.join(', ')})`,
      })
    }
  }

  // 6. Contract expiry warning
  checkExpiry(contract, results)
}

/**
 * RD-3 window-aware per-contract checks (ADR-015 §2/§4). Resolves the window whose
 * `category === input.runIntent` (default LIVE) and enforces its scoped rights.
 * Blackout + expiry stay contract-level (checked regardless of window).
 */
function checkContractWindows(
  input: RightsCheckInput,
  contract: ContractWithWindows,
  results: ValidationResult[],
): void {
  const windows = contract.rightsWindows ?? []
  const runIntent = input.runIntent ?? 'LIVE'

  // Alternate AC (pre-backfill data guard): a contract with no windows at all →
  // INFO note + the contract's base (scalar) rights checks (which also cover
  // blackout + expiry, so those are not re-run here).
  if (windows.length === 0) {
    results.push({
      code: 'NO_WINDOWS',
      severity: 'INFO',
      scope: ['rights', 'window'],
      message: `Contract #${contract.id} has no rights windows — verified against the contract's base rights instead (data-quality note)`,
    })
    checkContractLegacy(input, contract, results)
    return
  }

  // Blackout is a contract-level prohibition — checked regardless of the window.
  checkBlackout(input, contract, results)

  const window = windows.find(w => w.category === runIntent)
  if (!window) {
    results.push({
      code: 'WINDOW_CATEGORY_MISSING',
      severity: 'WARNING',
      scope: ['rights', 'window'],
      message: `No ${runIntent} rights window on contract #${contract.id}`,
      remediation: `Add a ${runIntent} window to contract #${contract.id}, or check the slot's run intent.`,
    })
    checkExpiry(contract, results)
    return
  }

  // The resolved window's scoped rights, read as a sequence of named checks.
  checkWindowPlatform(input, window, contract, runIntent, results)
  checkWindowTimeBounds(input, window, contract, runIntent, results)
  checkWindowTerritory(input, window, contract, runIntent, results)
  checkHoldback(input, window, contract, runIntent, results)
  checkWindowRunLimit(input, window, contract, runIntent, results)
  checkWindowUnscoped(window, contract, runIntent, results)

  checkExpiry(contract, results)
}

/** Window platform coverage — empty `window.platforms` = unrestricted (no check). */
function checkWindowPlatform(
  input: RightsCheckInput, window: RightsWindow, contract: Contract,
  runIntent: string, results: ValidationResult[],
): void {
  if (!(input.channelId && input.channelTypes && input.channelTypes.length > 0 && window.platforms.length > 0)) return
  const uncovered = input.channelTypes.filter(t => !window.platforms.includes(t))
  if (uncovered.length > 0) {
    results.push({
      code: 'PLATFORM_NOT_COVERED',
      severity: 'WARNING',
      scope: ['rights', 'platform'],
      message: `Channel type(s) [${uncovered.join(', ')}] not covered by the ${runIntent} window on contract #${contract.id}`,
    })
  }
}

/** Window validity bounds — slot start must fall within [windowStart, windowEnd]. */
function checkWindowTimeBounds(
  input: RightsCheckInput, window: RightsWindow, contract: Contract,
  runIntent: string, results: ValidationResult[],
): void {
  if (!(window.windowStartUtc && window.windowEndUtc && input.startUtc)) return
  const start = new Date(input.startUtc)
  const winStart = new Date(window.windowStartUtc)
  const winEnd = new Date(window.windowEndUtc)
  if (start < winStart || start > winEnd) {
    results.push({
      code: 'OUTSIDE_RIGHTS_WINDOW',
      severity: 'WARNING',
      scope: ['rights', 'window'],
      message: `Event start is outside the ${runIntent} rights window (${winStart.toISOString()} – ${winEnd.toISOString()})`,
    })
  }
}

/** Window territory — empty `window.territory` = unrestricted (no check). */
function checkWindowTerritory(
  input: RightsCheckInput, window: RightsWindow, contract: Contract,
  runIntent: string, results: ValidationResult[],
): void {
  if (!(input.territory && window.territory.length > 0)) return
  if (!window.territory.includes(input.territory)) {
    results.push({
      code: 'TERRITORY_BLOCKED',
      severity: 'ERROR',
      scope: ['rights', 'territory'],
      message: `Territory "${input.territory}" is not covered by the ${runIntent} window on contract #${contract.id} (allowed: ${window.territory.join(', ')})`,
    })
  }
}

/**
 * Holdback — a non-LIVE window may not start until N hours after the live
 * exploitation ends (ADR-015 §4). liveEnd resolution ORDER: (1) ledger actual
 * (`liveRunEndedAtUtc`) → (2) scheduled end (`scheduledEndUtc`) → (3) unknown
 * (INFO, never guess). Malformed timestamps are treated as unknown, not as a
 * pass — the same Number.isNaN discipline as checkBlackout — so bad data can
 * never silently swallow a HOLDBACK_VIOLATION.
 */
function checkHoldback(
  input: RightsCheckInput, window: RightsWindow, contract: Contract,
  runIntent: string, results: ValidationResult[],
): void {
  if (!(window.holdbackHoursMin != null && runIntent !== 'LIVE' && input.startUtc)) return

  let liveEnd: number | null = null
  if (input.liveRunEndedAtUtc) liveEnd = new Date(input.liveRunEndedAtUtc).getTime()
  else if (input.scheduledEndUtc) liveEnd = new Date(input.scheduledEndUtc).getTime()
  if (liveEnd != null && Number.isNaN(liveEnd)) liveEnd = null

  const start = new Date(input.startUtc).getTime()

  // No resolvable live end (absent OR malformed OR an unparseable slot start) →
  // data-quality note, no enforcement.
  if (liveEnd == null || Number.isNaN(start)) {
    results.push({
      code: 'HOLDBACK_LIVE_END_UNKNOWN',
      severity: 'INFO',
      scope: ['rights', 'holdback'],
      message: `Holdback applies to the ${runIntent} window on contract #${contract.id} but the live-exploitation end is unknown (no ledger run, no scheduled end, or an unparseable timestamp) — not enforced (data-quality note)`,
    })
    return
  }

  const earliest = liveEnd + window.holdbackHoursMin! * MS_PER_HOUR
  if (start < earliest) {
    const earliestIso = new Date(earliest).toISOString()
    results.push({
      code: 'HOLDBACK_VIOLATION',
      severity: 'ERROR',
      scope: ['rights', 'holdback'],
      message: `${runIntent} slot starts before the ${window.holdbackHoursMin}h holdback after live end (earliest ${earliestIso}) on contract #${contract.id}`,
      remediation: `Move the ${runIntent} slot to ${earliestIso} or later.`,
    })
  }
}

/** Per-category run limit — null `maxRuns` = no limit (RD-1F semantics). */
function checkWindowRunLimit(
  input: RightsCheckInput, window: RightsWindow, contract: Contract,
  runIntent: string, results: ValidationResult[],
): void {
  if (!(window.maxRuns != null && input.currentRunCount != null)) return
  if (input.currentRunCount >= window.maxRuns) {
    results.push({
      code: 'MAX_RUNS_EXCEEDED',
      severity: 'ERROR',
      scope: ['rights', 'runs'],
      message: `Maximum ${runIntent} runs (${window.maxRuns}) exceeded for the window on contract #${contract.id} — currently ${input.currentRunCount} used`,
    })
  } else if (input.currentRunCount >= window.maxRuns - 1) {
    results.push({
      code: 'MAX_RUNS_NEAR',
      severity: 'WARNING',
      scope: ['rights', 'runs'],
      message: `Approaching maximum ${runIntent} runs: ${input.currentRunCount}/${window.maxRuns} on contract #${contract.id}`,
    })
  }
}

/**
 * Unscoped-window data-quality note — empty `territory[]` OR `platforms[]` means
 * unrestricted, so empty-because-unknown never becomes invisible permissiveness
 * (ADR-015 Acceptance record §4).
 */
function checkWindowUnscoped(
  window: RightsWindow, contract: Contract, runIntent: string, results: ValidationResult[],
): void {
  if (window.territory.length === 0 || window.platforms.length === 0) {
    results.push({
      code: 'WINDOW_UNSCOPED',
      severity: 'INFO',
      scope: ['rights', 'window'],
      message: `The ${runIntent} window on contract #${contract.id} has an empty territory or platform scope (treated as unrestricted) — verify this is intentional (data-quality note)`,
    })
  }
}

/** Blackout check — sub-windows where broadcast is forbidden. Contract-level. */
function checkBlackout(
  input: RightsCheckInput,
  contract: Contract,
  results: ValidationResult[],
): void {
  if (!input.startUtc) return
  const start = new Date(input.startUtc).getTime()
  const blackouts = parseBlackoutPeriods(contract.blackoutPeriods)
  for (const b of blackouts) {
    const bStart = new Date(b.start).getTime()
    const bEnd = new Date(b.end).getTime()
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue
    if (start >= bStart && start <= bEnd) {
      results.push({
        code: 'BLACKOUT_PERIOD',
        severity: 'ERROR',
        scope: ['rights', 'blackout'],
        message: b.reason
          ? `Event falls inside blackout period (${b.reason}) on contract #${contract.id}`
          : `Event falls inside a blackout period on contract #${contract.id} (${new Date(b.start).toISOString()} – ${new Date(b.end).toISOString()})`,
      })
    }
  }
}

/** Contract expiry warning. */
function checkExpiry(contract: Contract, results: ValidationResult[]): void {
  if (contract.status === 'expiring') {
    results.push({
      code: 'CONTRACT_EXPIRING',
      severity: 'WARNING',
      scope: ['rights', 'expiry'],
      message: `Contract #${contract.id} is expiring (until ${contract.validUntil?.toISOString().slice(0, 10) ?? 'unknown'})`,
    })
  }
}

/**
 * DB-backed rights check for a single event. Resolves the applicable
 * contract(s) with season narrowing, tallies actual RunLedger usage,
 * and returns the same ValidationResult[] shape as {@link checkRights}.
 */
export async function checkRightsForEvent(
  eventId: number,
  opts: { db?: PrismaClient; territory?: string; windowsEnabled?: boolean } = {},
): Promise<{ eventId: number; ok: boolean; results: ValidationResult[] }> {
  const db = opts.db ?? defaultPrisma
  // Flag read at the service boundary; the pure checker still takes a boolean.
  const windowsEnabled = opts.windowsEnabled ?? env.RIGHTS_WINDOWS_ENABLED

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      channel: { select: { id: true, types: true } },
    },
  })
  if (!event) {
    return {
      eventId,
      ok: false,
      results: [{
        code: 'EVENT_NOT_FOUND',
        severity: 'ERROR',
        scope: ['rights'],
        message: `Event ${eventId} not found`,
      }],
    }
  }

  // Contract candidate query with season narrowing. A contract with
  // seasonId=null covers the whole competition; one with a specific
  // seasonId only applies when the event matches. Flag ON also pulls windows AND
  // pre-filters status valid|expiring to MATCH the route path (buildWindowContext),
  // so both v2 feeds consider the same contract set. Flag OFF stays UNFILTERED —
  // checkRights filters internally and distinguishes "no contract" vs "no valid
  // contract" in NO_VALID_CONTRACT, which pre-filtering would change (byte-identity).
  const candidates = await db.contract.findMany({
    where: {
      tenantId: event.tenantId,
      competitionId: event.competitionId,
      OR: [
        { seasonId: null },
        ...(event.seasonId != null ? [{ seasonId: event.seasonId }] : []),
      ],
      ...(windowsEnabled ? { status: { in: ['valid', 'expiring'] } } : {}),
    },
    ...(windowsEnabled ? { include: { rightsWindows: true } } : {}),
  })
  const contractIds = candidates.map(c => c.id)

  const startUtc = event.startDateBE && event.startTimeBE
    ? beClockToUtc(event.startDateBE, event.startTimeBE)
    : null

  let results: ValidationResult[]
  if (windowsEnabled) {
    // Window-aware: per-CATEGORY tally (LIVE run intent at the event level; slot-level
    // category is an RD-retro refinement). currentRunCount = the LIVE-category tally.
    const tally = await loadContractRunTally(db, event.tenantId, contractIds)
    const liveCount = tally.filter(t => t.category === 'LIVE').reduce((s, t) => s + t.count, 0)
    const scheduledEndUtc = startUtc && event.durationMin != null
      ? new Date(startUtc.getTime() + event.durationMin * MS_PER_MINUTE).toISOString()
      : undefined
    results = checkRights(
      {
        channelId: event.channelId,
        channelTypes: event.channel?.types ?? [],
        startUtc,
        territory: opts.territory,
        currentRunCount: liveCount,
        runIntent: 'LIVE',
        scheduledEndUtc,
      },
      candidates,
      { windowsEnabled: true },
    )
  } else {
    // Legacy (flag OFF): LIVE-only run count, scalar checker path — UNCHANGED.
    const runCount = contractIds.length === 0
      ? 0
      : await db.runLedger.count({
          where: {
            tenantId: event.tenantId,
            contractId: { in: contractIds },
            runType: 'LIVE',
            status: { in: ['CONFIRMED', 'RECONCILED'] },
          },
        })
    results = checkRights(
      {
        channelId: event.channelId,
        channelTypes: event.channel?.types ?? [],
        startUtc,
        territory: opts.territory,
        currentRunCount: runCount,
      },
      candidates,
    )
  }

  const ok = !results.some(r => r.severity === 'ERROR')
  return { eventId, ok, results }
}

/** Batch variant — useful for the Planner event list badge render. */
export async function checkRightsForEvents(
  eventIds: number[],
  opts: { db?: PrismaClient; territory?: string; windowsEnabled?: boolean } = {},
): Promise<Record<number, { ok: boolean; results: ValidationResult[] }>> {
  const out: Record<number, { ok: boolean; results: ValidationResult[] }> = {}
  // Sequential is fine at typical planner page sizes (< 100 events). If this
  // becomes a hot path, batch the contract + run-count queries by competition.
  for (const id of eventIds) {
    const { ok, results } = await checkRightsForEvent(id, opts)
    out[id] = { ok, results }
  }
  return out
}

/**
 * Per-contract summary for the operator-facing Rights Matrix.
 *
 * Returns one row per contract with rights-relevant fields rolled up:
 * runs used so far, days until expiry, platforms, territories, status
 * severity bucket. Frontend renders as a grid.
 */
export async function getRightsMatrix(
  tenantId: string,
  opts: { db?: PrismaClient } = {},
): Promise<Array<{
  contractId: number
  competitionId: number
  competitionName: string
  seasonId: number | null
  seasonName: string | null
  status: string
  platforms: string[]
  territory: string[]
  coverageType: string
  runsUsed: number
  maxLiveRuns: number | null
  windowStartUtc: string | null
  windowEndUtc: string | null
  validUntil: string | null
  daysUntilExpiry: number | null
  severity: 'ok' | 'warning' | 'error'
  blackoutCount: number
  // RD-2-T3 (ADR-015): additive — the contract's RightsWindow rows. Exposes each
  // window's LIMIT (maxRuns) only; a per-window USED tally is deferred to RD-3
  // (RunType→category mapping + CONTINUATION exclusion). Every field above is
  // byte-identical to rights-matrix v1.
  windows: Array<{
    id: string
    category: string
    exclusivity: string
    territory: string[]
    platforms: string[]
    windowStartUtc: string | null
    windowEndUtc: string | null
    maxRuns: number | null
    holdbackHoursMin: number | null
  }>
}>> {
  const db = opts.db ?? defaultPrisma
  const contracts = await db.contract.findMany({
    where: { tenantId },
    include: {
      competition: { select: { name: true } },
      season: { select: { name: true } },
      // Deterministic order by id so matrix rows are stable across calls. No N+1:
      // windows arrive with the single contract findMany.
      rightsWindows: { orderBy: { id: 'asc' } },
    },
    orderBy: [{ competitionId: 'asc' }, { validUntil: 'desc' }],
  })

  // Pre-aggregate RunLedger counts per contract so we don't N+1.
  const ids = contracts.map(c => c.id)
  const runCounts = ids.length === 0
    ? []
    : await db.runLedger.groupBy({
        by: ['contractId'],
        where: {
          tenantId,
          contractId: { in: ids },
          runType: 'LIVE',
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        _count: { _all: true },
      })
  const runsByContract = new Map(
    runCounts.map(r => [r.contractId, r._count._all]),
  )

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  return contracts.map(c => {
    const runsUsed = runsByContract.get(c.id) ?? 0
    const daysUntilExpiry = c.validUntil
      ? Math.round((c.validUntil.getTime() - now) / dayMs)
      : null

    let severity: 'ok' | 'warning' | 'error' = 'ok'
    if (c.status === 'none' || c.status === 'draft') severity = 'warning'
    if (c.maxLiveRuns != null && runsUsed >= c.maxLiveRuns) severity = 'error'
    else if (c.maxLiveRuns != null && runsUsed >= c.maxLiveRuns - 1) severity = 'warning'
    if (daysUntilExpiry != null && daysUntilExpiry < 0) severity = 'error'
    else if (daysUntilExpiry != null && daysUntilExpiry <= 30 && severity !== 'error') severity = 'warning'

    const blackouts = parseBlackoutPeriods(c.blackoutPeriods)

    return {
      contractId: c.id,
      competitionId: c.competitionId,
      competitionName: c.competition.name,
      seasonId: c.seasonId,
      seasonName: c.season?.name ?? null,
      status: c.status,
      platforms: c.platforms.length > 0 ? c.platforms : derivePlatformsFromLegacy(c),
      territory: c.territory,
      coverageType: c.coverageType,
      runsUsed,
      maxLiveRuns: c.maxLiveRuns,
      windowStartUtc: c.windowStartUtc?.toISOString() ?? null,
      windowEndUtc: c.windowEndUtc?.toISOString() ?? null,
      validUntil: c.validUntil?.toISOString() ?? null,
      daysUntilExpiry,
      severity,
      blackoutCount: blackouts.length,
      windows: (c.rightsWindows ?? []).map(w => ({
        id: w.id,
        category: w.category,
        exclusivity: w.exclusivity,
        territory: w.territory,
        platforms: w.platforms,
        windowStartUtc: w.windowStartUtc?.toISOString() ?? null,
        windowEndUtc: w.windowEndUtc?.toISOString() ?? null,
        maxRuns: w.maxRuns,
        holdbackHoursMin: w.holdbackHoursMin,
      })),
    }
  })
}

/** Derive platforms array from legacy boolean fields */
function derivePlatformsFromLegacy(contract: Contract): string[] {
  const platforms: string[] = []
  if (contract.linearRights) platforms.push('linear')
  if (contract.maxRights) platforms.push('on-demand')
  if (contract.radioRights) platforms.push('radio')
  return platforms
}

/** Safely coerce the Json blackoutPeriods column into a typed array. */
function parseBlackoutPeriods(value: unknown): BlackoutPeriod[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((b): b is BlackoutPeriod =>
      typeof b === 'object' &&
      b !== null &&
      typeof (b as BlackoutPeriod).start === 'string' &&
      typeof (b as BlackoutPeriod).end === 'string'
    )
}
