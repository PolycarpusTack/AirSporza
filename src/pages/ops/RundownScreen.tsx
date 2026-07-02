import { OpsPlaceholder } from './OpsPlaceholder'

/**
 * Rundown — per-channel day timeline (glossary: the design's "PLANNER" screen is
 * named Rundown in code to avoid colliding with the existing PlannerView).
 * URL stays /ops/planner — the tab id is ADR-014 public contract; only the
 * component name follows the glossary. Built in EPIC B, Story B-2.
 */
export function RundownScreen() {
  return <OpsPlaceholder tabId="planner" label="PLANNER" />
}
