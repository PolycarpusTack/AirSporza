/**
 * RC-1-T2 — pure listed-event suggestion heuristic (no DB). Given an event's sport +
 * competition name and the tenant's ListedEventCategory rows, return ranked category
 * matches. Suggestions NEVER auto-bind — the route only returns them; a human
 * confirms (POST .../confirm).
 *
 * Heuristic (deliberately simple + documented):
 *  - sportId match is NECESSARY: a category for a different sport is never suggested.
 *  - Among sport matches, rank by token overlap between the event's competition name
 *    and the category name (descending). A sport match with ZERO overlap is STILL
 *    suggested (sport is the necessary signal) — it just ranks last.
 *  - Ties break by category id ascending → deterministic ordering.
 */
import type { ListedEventCategory } from '@prisma/client'

/** Minimum length for a "significant" name token (drops articles/short noise). */
const MIN_TOKEN_LENGTH = 3

export interface EventSuggestionInput {
  sportId: number
  competitionName?: string | null
}

/** Significant lowercase tokens, split on non-alphanumeric runs. */
function tokenize(value: string | null | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length >= MIN_TOKEN_LENGTH))
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const t of a) if (b.has(t)) count += 1
  return count
}

export function suggestListedCategories(
  event: EventSuggestionInput,
  categories: ListedEventCategory[],
): ListedEventCategory[] {
  const eventTokens = tokenize(event.competitionName)
  return categories
    .filter(c => c.sportId === event.sportId)
    .map(c => ({ category: c, score: overlapCount(eventTokens, tokenize(c.name)) }))
    .sort((a, b) => b.score - a.score || a.category.id - b.category.id)
    .map(scored => scored.category)
}
