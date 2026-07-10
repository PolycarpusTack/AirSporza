/**
 * RD-2-T2 — pure Rights-Window overlap predicate (ADR-015; 4-way overlap rule
 * recorded in the RD-2 backlog block, architect 2026-07-10).
 *
 * Two windows on ONE contract overlap IFF ALL FOUR hold:
 *   (1) same category
 *   (2) intersecting validity period — half-open [start, end), null = unbounded
 *   (3) intersecting territory scope — empty [] = unrestricted (intersects all)
 *   (4) intersecting platform scope — empty [] = unrestricted (intersects all)
 * Disjoint on ANY dimension is NOT an overlap: same-category windows over disjoint
 * territories (BE vs NL) or platforms (linear vs on-demand) are legitimate.
 *
 * Pure and Prisma-agnostic: accepts DB rows (Date bounds) and request bodies
 * (ISO-string bounds) alike.
 */
export interface WindowLike {
  category: string
  territory: string[]
  platforms: string[]
  windowStartUtc?: Date | string | null
  windowEndUtc?: Date | string | null
}

function toMs(value: Date | string | null | undefined, unbounded: number): number {
  if (value == null) return unbounded
  return new Date(value).getTime()
}

/** Half-open [start, end) intersection; null start = -inf, null end = +inf. */
function periodsIntersect(a: WindowLike, b: WindowLike): boolean {
  const aStart = toMs(a.windowStartUtc, -Infinity)
  const aEnd = toMs(a.windowEndUtc, Infinity)
  const bStart = toMs(b.windowStartUtc, -Infinity)
  const bEnd = toMs(b.windowEndUtc, Infinity)
  return aStart < bEnd && bStart < aEnd
}

/** Empty scope = unrestricted, so it intersects every other scope. */
function scopesIntersect(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  return a.some(x => b.includes(x))
}

export function windowsOverlap(a: WindowLike, b: WindowLike): boolean {
  return (
    a.category === b.category &&
    periodsIntersect(a, b) &&
    scopesIntersect(a.territory, b.territory) &&
    scopesIntersect(a.platforms, b.platforms)
  )
}

/** Remediation message for a 409 — names the conflicting window id + the collision. */
export function overlapConflictMessage(existing: { id: string }, candidate: WindowLike): string {
  return (
    `Rights window overlaps existing window ${existing.id}: same category ` +
    `${candidate.category} with intersecting validity period, territory and platform ` +
    `scope. Narrow the territory, platforms, or validity window (or edit window ` +
    `${existing.id}) so the scopes no longer intersect.`
  )
}
