/**
 * RC-2-T2 — pure accessibility deliverable status state machine (no DB, no HTTP).
 * Single source of truth for the lifecycle walk
 *   REQUIRED → PLANNED → CONFIRMED → DELIVERED
 * plus the requirement toggle REQUIRED ↔ NOT_REQUIRED. Skips and backward steps are
 * illegal; DELIVERED is terminal. The routes return `allowedNextStatuses(current)` in
 * every 409 body so a client can recover without guessing (retry-safe optimistic guard).
 *
 * NOTE: undoing lifecycle progress (e.g. PLANNED → REQUIRED) is deliberately NOT
 * modelled — out of scope for RC-2-T2; an architect decision if ops needs it.
 */
import type { AccessibilityStatus, AccessibilityType } from '@prisma/client'

export const ACCESSIBILITY_TRANSITIONS: Readonly<Record<AccessibilityStatus, readonly AccessibilityStatus[]>> = {
  NOT_REQUIRED: ['REQUIRED'],
  REQUIRED: ['NOT_REQUIRED', 'PLANNED'],
  PLANNED: ['CONFIRMED'],
  CONFIRMED: ['DELIVERED'],
  DELIVERED: [],
}

/** The statuses reachable in ONE step from `from` — the 409 body payload. */
export function allowedNextStatuses(from: AccessibilityStatus): readonly AccessibilityStatus[] {
  return ACCESSIBILITY_TRANSITIONS[from]
}

/** True iff `from → to` is a legal single step (self-transitions are not). */
export function canTransitionAccessibility(from: AccessibilityStatus, to: AccessibilityStatus): boolean {
  return allowedNextStatuses(from).includes(to)
}

/**
 * True iff the step changes WHETHER the deliverable is required (into or out of
 * NOT_REQUIRED) rather than walking the delivery lifecycle. Used to close both doors
 * for T888 (its requirement is config policy — the RC-2-T1 defaulting — not per-event).
 */
export function isRequirementToggle(from: AccessibilityStatus, to: AccessibilityStatus): boolean {
  return from === 'NOT_REQUIRED' || to === 'NOT_REQUIRED'
}

/** One message for both closed T888 doors — policy lives here, not in the router. */
export const T888_REQUIREMENT_POLICY_MESSAGE =
  'T888 requirement is config policy (subtitling KPI defaulting), not per-event'

export type RequirementChange =
  | { kind: 't888-locked' }
  | { kind: 'create'; status: AccessibilityStatus }
  | { kind: 'noop' }
  | { kind: 'illegal' }
  | { kind: 'update'; status: AccessibilityStatus }

/**
 * Resolve a setRequirement request against the state machine. `currentStatus` is null
 * when the event has no row for the type (legacy, pre-RC-2-T1 defaulting) → 'create'.
 * `required=true` on any status past NOT_REQUIRED is a 'noop' — it IS required; the
 * lifecycle position carries the extra information and must not be reset.
 */
export function resolveRequirementChange(
  type: AccessibilityType,
  currentStatus: AccessibilityStatus | null,
  required: boolean,
): RequirementChange {
  if (type === 'T888') return { kind: 't888-locked' }
  const target: AccessibilityStatus = required ? 'REQUIRED' : 'NOT_REQUIRED'
  if (currentStatus === null) return { kind: 'create', status: target }
  if (currentStatus === target || (required && currentStatus !== 'NOT_REQUIRED')) return { kind: 'noop' }
  if (!canTransitionAccessibility(currentStatus, target)) return { kind: 'illegal' }
  return { kind: 'update', status: target }
}
