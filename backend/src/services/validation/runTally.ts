/**
 * RD-3-T2 — per-CATEGORY RunLedger tally for window-aware run limits (ADR-015 §2).
 *
 * The prior "1:1 RunType↔category" pull-gate assumption is VOID. Canonical mapping:
 *   LIVE→LIVE · TAPE_DELAY→DELAYED · HIGHLIGHTS→HIGHLIGHTS · CLIP→CLIP
 *   CONTINUATION → excluded (counts with its parent run; existing /run-ledger/count
 *   semantics) · ARCHIVE → no RunType source yet (open assumption 4).
 *
 * Only CONFIRMED|RECONCILED runs are tallied (the states checkers count). NOTE
 * (TD-28): the run-ledger API's zod status enum cannot create those states, so
 * tests must insert CONFIRMED rows directly via Prisma, never through the API.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * The single coverage-category vocabulary (mirrors the Prisma `CoverageType` enum,
 * incl. ARCHIVE). Typed in ONE place so the tally-key PRODUCER (runTally) and
 * CONSUMER (validateRights `tally.get`) share the vocabulary at compile time — a
 * typo/drift would otherwise be a silent zero-count (enforcement miss).
 */
export type CoverageCategory = 'LIVE' | 'HIGHLIGHTS' | 'DELAYED' | 'CLIP' | 'ARCHIVE'

const RUN_TYPE_TO_CATEGORY: Record<string, CoverageCategory | undefined> = {
  LIVE: 'LIVE',
  TAPE_DELAY: 'DELAYED',
  HIGHLIGHTS: 'HIGHLIGHTS',
  CLIP: 'CLIP',
  // CONTINUATION intentionally absent → excluded from tallies.
}

/** RunType → CoverageType category, or null when the run type has no tally source. */
export function runTypeToCategory(runType: string): CoverageCategory | null {
  return RUN_TYPE_TO_CATEGORY[runType] ?? null
}

export interface ContractRunTally {
  contractId: number
  category: CoverageCategory
  count: number
}

interface GroupRow {
  contractId: number | null
  runType: string
  _count: { _all: number }
}

/** Fold Prisma groupBy(contractId, runType) rows into per-(contract, category) counts. */
export function aggregateRunTally(rows: GroupRow[]): ContractRunTally[] {
  const byKey = new Map<string, ContractRunTally>()
  for (const row of rows) {
    if (row.contractId == null) continue
    const category = runTypeToCategory(row.runType)
    if (category == null) continue // CONTINUATION / unmapped → excluded
    const key = `${row.contractId}:${category}`
    const current = byKey.get(key) ?? { contractId: row.contractId, category, count: 0 }
    current.count += row._count._all
    byKey.set(key, current)
  }
  return [...byKey.values()]
}

/**
 * DB-backed per-category tally for a set of contracts (CONFIRMED|RECONCILED only).
 * No query when there are no contract ids.
 */
export async function loadContractRunTally(
  // Accepts a TransactionClient too (SV-2 ripple enrichment runs on the capture
  // tx via checkRightsForEvent) — additive widening, read-only, no runtime change.
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  contractIds: number[],
): Promise<ContractRunTally[]> {
  if (contractIds.length === 0) return []
  const rows = await db.runLedger.groupBy({
    by: ['contractId', 'runType'],
    where: {
      tenantId,
      contractId: { in: contractIds },
      status: { in: ['CONFIRMED', 'RECONCILED'] },
    },
    _count: { _all: true },
  })
  return aggregateRunTally(rows as unknown as GroupRow[])
}
