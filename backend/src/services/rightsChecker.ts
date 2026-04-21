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
import type { Contract, PrismaClient } from '@prisma/client'
import type { ValidationResult } from './validation/types.js'
import { prisma as defaultPrisma } from '../db/prisma.js'

interface RightsCheckInput {
  channelId?: number | null
  channelTypes?: string[]  // from channel.types[]
  startUtc?: Date | string | null
  endUtc?: Date | string | null
  territory?: string       // target territory to check
  currentRunCount?: number // existing runs for this contract (optional — if
                           //   omitted, callers can instead use
                           //   checkRightsForEvent which queries RunLedger)
}

interface BlackoutPeriod {
  start: string   // ISO
  end: string     // ISO
  reason?: string
}

/**
 * Check rights for an event against a set of contracts.
 * Pure function — no DB access.
 */
export function checkRights(
  input: RightsCheckInput,
  contracts: Contract[],
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
    if (input.startUtc) {
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
    if (contract.status === 'expiring') {
      results.push({
        code: 'CONTRACT_EXPIRING',
        severity: 'WARNING',
        scope: ['rights', 'expiry'],
        message: `Contract #${contract.id} is expiring (until ${contract.validUntil?.toISOString().slice(0, 10) ?? 'unknown'})`,
      })
    }
  }

  return results
}

/**
 * DB-backed rights check for a single event. Resolves the applicable
 * contract(s) with season narrowing, tallies actual RunLedger usage,
 * and returns the same ValidationResult[] shape as {@link checkRights}.
 */
export async function checkRightsForEvent(
  eventId: number,
  opts: { db?: PrismaClient; territory?: string } = {},
): Promise<{ eventId: number; ok: boolean; results: ValidationResult[] }> {
  const db = opts.db ?? defaultPrisma

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
  // seasonId only applies when the event matches.
  const candidates = await db.contract.findMany({
    where: {
      tenantId: event.tenantId,
      competitionId: event.competitionId,
      OR: [
        { seasonId: null },
        ...(event.seasonId != null ? [{ seasonId: event.seasonId }] : []),
      ],
    },
  })

  // Actual run consumption — count LIVE runs logged in RunLedger for this
  // competition + season, for the contracts that made it into candidates.
  const contractIds = candidates.map(c => c.id)
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

  const startUtc = event.startDateBE && event.startTimeBE
    ? new Date(`${new Date(event.startDateBE).toISOString().slice(0, 10)}T${event.startTimeBE}:00Z`)
    : null

  const results = checkRights(
    {
      channelId: event.channelId,
      channelTypes: event.channel?.types ?? [],
      startUtc,
      territory: opts.territory,
      currentRunCount: runCount,
    },
    candidates,
  )

  const ok = !results.some(r => r.severity === 'ERROR')
  return { eventId, ok, results }
}

/** Batch variant — useful for the Planner event list badge render. */
export async function checkRightsForEvents(
  eventIds: number[],
  opts: { db?: PrismaClient; territory?: string } = {},
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
}>> {
  const db = opts.db ?? defaultPrisma
  const contracts = await db.contract.findMany({
    where: { tenantId },
    include: {
      competition: { select: { name: true } },
      season: { select: { name: true } },
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
