import { api } from '../utils/api'
import type { AccessibilityType, AccessibilityStatus } from '@planza/shared'

/**
 * RC-2-T2 — Accessibility deliverables per event (G11): T888 subtitling, audio
 * description, VGT. Status walks REQUIRED → PLANNED → CONFIRMED → DELIVERED (or
 * NOT_REQUIRED). Transitions carry expectedStatus (optimistic guard); the HTTP 409
 * body includes { currentStatus, allowedNext }, but the shared ApiClient currently
 * surfaces only status + message (TD-32) — recover by re-fetching list() until the
 * ApiError carries the body. T888 requirement is config policy (TODO-KPI defaulting),
 * not per-event: setRequirement is AD/VGT only.
 */
export interface AccessibilityDeliverable {
  id: number
  tenantId: string
  eventId: number
  type: AccessibilityType
  status: AccessibilityStatus
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

/** setRequirement is AD/VGT only — the backend 400s T888 (config policy). */
export type SwitchableAccessibilityType = Exclude<AccessibilityType, 'T888'>

export interface AccessibilityKpiEntry {
  type: AccessibilityType
  total: number
  /** Rows whose status is anything but NOT_REQUIRED (the KPI denominator). */
  requiredCount: number
  /** Rows with status DELIVERED (the KPI numerator). */
  deliveredCount: number
  /** deliveredCount / requiredCount * 100 (2 decimals); null when nothing is required. */
  coveragePct: number | null
  /** Config-read target (TODO-KPI provisional, AS-1); null = no target defined. */
  targetPct: number | null
}

export interface AccessibilityKpiReport {
  from: string
  to: string
  byType: AccessibilityKpiEntry[]
}

/**
 * RC-5 — per-tenant accessibility configuration (admin, AS-10). `effective` is what
 * the backend consumers apply (tenant override merged per field over the global
 * constant fallbacks); `override` is the raw stored row (null = no row; a null field
 * = "falls back to the constant"). PUT is a per-tenant upsert with PUT-replace
 * semantics: omitted/null fields CLEAR the override for that field.
 */
export interface EffectiveAccessibilityConfig {
  t888ExcludedSportIds: number[]
  kpiTargetPctByType: Record<AccessibilityType, number | null>
  unplannedLeadTimeDays: number
}

export interface AccessibilityConfigOverride {
  t888ExcludedSportIds: number[] | null
  kpiTargetPctByType: Partial<Record<AccessibilityType, number | null>> | null
  unplannedLeadTimeDays: number | null
}

export interface AccessibilityConfigResponse {
  effective: EffectiveAccessibilityConfig
  override: AccessibilityConfigOverride | null
}

export interface AccessibilityConfigInput {
  t888ExcludedSportIds?: number[] | null
  kpiTargetPctByType?: Partial<Record<AccessibilityType, number | null>> | null
  unplannedLeadTimeDays?: number | null
}

export const accessibilityApi = {
  /** The event's deliverable rows. */
  list: (eventId: number) =>
    api.get<AccessibilityDeliverable[]>(`/accessibility/events/${eventId}/deliverables`),

  /** Toggle REQUIRED ↔ NOT_REQUIRED for AD/VGT (idempotent; 409 when in-flight). */
  setRequirement: (eventId: number, type: SwitchableAccessibilityType, required: boolean) =>
    api.post<AccessibilityDeliverable>(`/accessibility/events/${eventId}/requirement`, { type, required }),

  /** One lifecycle step, guarded by expectedStatus (409 on stale/illegal; see TD-32 note). */
  transition: (id: number, status: AccessibilityStatus, expectedStatus: AccessibilityStatus) =>
    api.post<AccessibilityDeliverable>(`/accessibility/deliverables/${id}/transition`, { status, expectedStatus }),

  /** Coverage % per deliverable type over [from, to] (ISO dates), reconciling 1:1 with rows. */
  kpi: (from: string, to: string) =>
    api.get<AccessibilityKpiReport>(`/accessibility/kpi?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  /** The tenant's accessibility config (admin; 403 otherwise). Tenant-scoped server-side. */
  getConfig: () => api.get<AccessibilityConfigResponse>('/accessibility/config'),

  /** Per-tenant upsert (REPLACE semantics: omitted/null fields fall back to the constants). Admin. */
  replaceConfig: (input: AccessibilityConfigInput) =>
    api.put<AccessibilityConfigResponse>('/accessibility/config', input),
}
