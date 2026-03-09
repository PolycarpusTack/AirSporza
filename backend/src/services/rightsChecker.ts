/**
 * Unified Rights Checker
 *
 * Validates that an event/slot has the rights to broadcast on a channel,
 * checking: platform coverage, time windows, run limits, territory.
 *
 * Used by both conflictService (planner) and validation/rights (schedule).
 */
import type { Contract } from '@prisma/client'
import type { ValidationResult } from './validation/types.js'

interface RightsCheckInput {
  channelId?: number | null
  channelTypes?: string[]  // from channel.types[]
  startUtc?: Date | string | null
  endUtc?: Date | string | null
  territory?: string       // target territory to check
  currentRunCount?: number // existing runs for this contract
}

/**
 * Check rights for an event against a set of contracts.
 * Returns validation warnings/errors.
 */
export function checkRights(
  input: RightsCheckInput,
  contracts: Contract[],
): ValidationResult[] {
  const results: ValidationResult[] = []

  if (contracts.length === 0) return results

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

    // 3. Run limit check
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

    // 4. Territory check
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

    // 5. Contract expiry warning
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

/** Derive platforms array from legacy boolean fields */
function derivePlatformsFromLegacy(contract: Contract): string[] {
  const platforms: string[] = []
  if (contract.linearRights) platforms.push('linear')
  if (contract.maxRights) platforms.push('on-demand')
  if (contract.radioRights) platforms.push('radio')
  return platforms
}
