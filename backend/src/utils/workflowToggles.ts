import { prisma } from '../db/prisma.js'

/**
 * Workflow toggle ids and their default values. Keep this list in sync
 * with {@link WorkflowTogglesPanel.tsx} on the frontend — the UI reads
 * its labels from the component, but the fallback defaults and the set
 * of valid ids live here.
 *
 * Only toggles with actual backend behaviour should default to true.
 * Toggles listed in {@link PLACEHOLDER_TOGGLES} render disabled in the
 * UI with a "Coming soon" badge and aren't read by any server code.
 */
export const WORKFLOW_TOGGLE_DEFAULTS: Readonly<Record<string, boolean>> = {
  auto_crew_template: true,
  // ── Below this line: UI-only placeholders for planned automations.
  //    Don't read these on the backend; they're here so the panel can
  //    render a consistent default if a tenant has never written the
  //    orgConfig.workflowToggles object.
  notify_tech_plan_incomplete: false,
  notify_crew_conflict: true,
  notify_event_change: false,
  auto_status_on_publish: false,
}

export const IMPLEMENTED_TOGGLES = new Set<string>(['auto_crew_template'])

/**
 * Read the workflowToggles object from the tenant's orgConfig app setting.
 * Returns an empty object when the setting is absent so callers can
 * default per-toggle via {@link isWorkflowToggleEnabled}.
 */
async function loadToggles(tenantId: string): Promise<Record<string, boolean>> {
  const setting = await prisma.appSetting.findFirst({
    where: { tenantId, key: 'orgConfig', scopeKind: 'global', scopeId: 'default' },
  })
  const value = setting?.value as { workflowToggles?: Record<string, boolean> } | null
  return value?.workflowToggles ?? {}
}

/**
 * Check whether a given workflow toggle is enabled for the tenant.
 * Unknown toggles default to false; known toggles fall back to the
 * constant in {@link WORKFLOW_TOGGLE_DEFAULTS} when the tenant hasn't
 * explicitly chosen a value.
 */
export async function isWorkflowToggleEnabled(
  tenantId: string,
  toggleId: keyof typeof WORKFLOW_TOGGLE_DEFAULTS,
): Promise<boolean> {
  const toggles = await loadToggles(tenantId)
  if (toggleId in toggles) return toggles[toggleId]
  return WORKFLOW_TOGGLE_DEFAULTS[toggleId] ?? false
}
