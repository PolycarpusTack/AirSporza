import { logger } from '../utils/logger.js'

/**
 * Field visibility enforcement (B-1, closes TD-6 on flag-on).
 * Contract: docs/governance/contracts/field-visibility-filter.md
 *
 * Semantics:
 *  - visibleByRoles [] -> visible to every authenticated role
 *  - role listed       -> visible
 *  - admin             -> always visible (management surface must stay complete)
 *  - unknown role entries are dropped with a warning; if dropping empties a
 *    non-empty list the field is RESTRICTED for non-admins (fail-closed)
 *  - flag off -> every function below is an identity/no-op at the call sites
 */

export type KnownRole = 'planner' | 'sports' | 'contracts' | 'admin'
const KNOWN_ROLES: ReadonlySet<string> = new Set(['planner', 'sports', 'contracts', 'admin'])

type VisibilityDef = { id: string; name?: string; visibleByRoles: string[] }

export function isFieldVisibilityEnforced(): boolean {
  return process.env.FIELD_VISIBILITY_ENFORCEMENT === 'true'
}

function isVisibleTo(def: VisibilityDef, role: string): boolean {
  if (role === 'admin') return true
  if (def.visibleByRoles.length === 0) return true

  const valid = def.visibleByRoles.filter(r => KNOWN_ROLES.has(r))
  if (valid.length !== def.visibleByRoles.length) {
    logger.warn(
      `field-visibility: unknown role(s) [${def.visibleByRoles.filter(r => !KNOWN_ROLES.has(r)).join(', ')}] ` +
      `on field '${def.name ?? def.id}' — treating unknown grants as restricted (fail-closed)`
    )
  }
  // Non-empty original list with no valid grants left -> fail closed.
  return valid.includes(role)
}

export function filterFieldDefs<T extends VisibilityDef>(defs: T[], role: string): T[] {
  return defs.filter(def => isVisibleTo(def, role))
}

export function restrictedFieldIds(defs: VisibilityDef[], role: string): Set<string> {
  return new Set(defs.filter(def => !isVisibleTo(def, role)).map(def => def.id))
}

type ValueBearing = {
  customFields?: unknown
  customValues?: Array<{ fieldId: string }>
}

/** Non-mutating: strips restricted customValues rows and customFields keys. */
export function stripRestrictedValues<T extends ValueBearing>(items: T[], restricted: Set<string>): T[] {
  if (restricted.size === 0) return items
  return items.map(item => {
    const out = { ...item }
    if (Array.isArray(out.customValues)) {
      out.customValues = out.customValues.filter(v => !restricted.has(v.fieldId))
    }
    if (out.customFields && typeof out.customFields === 'object' && !Array.isArray(out.customFields)) {
      out.customFields = Object.fromEntries(
        Object.entries(out.customFields as Record<string, unknown>).filter(([key]) => !restricted.has(key))
      )
    }
    return out
  })
}

/** Non-mutating: strips restricted keys from TechPlan.crew JSONB. */
export function stripRestrictedCrew<T extends { crew?: unknown }>(plans: T[], restricted: Set<string>): T[] {
  if (restricted.size === 0) return plans
  return plans.map(plan => {
    if (!plan.crew || typeof plan.crew !== 'object' || Array.isArray(plan.crew)) return plan
    return {
      ...plan,
      crew: Object.fromEntries(
        Object.entries(plan.crew as Record<string, unknown>).filter(([key]) => !restricted.has(key))
      ),
    }
  })
}

/** Convenience for route handlers: restricted ids for the requesting user, or
 *  null when enforcement is off / the user is admin (no shaping needed). */
export async function restrictionsForRequest(
  fetchDefs: () => Promise<VisibilityDef[]>,
  role: string | undefined
): Promise<Set<string> | null> {
  if (!isFieldVisibilityEnforced()) return null
  if (!role || role === 'admin') return null
  const defs = await fetchDefs()
  const restricted = restrictedFieldIds(defs, role)
  return restricted.size > 0 ? restricted : null
}
