import { api } from '../utils/api'
import type { CoverageType, ExclusivityTier } from '@planza/shared'

/**
 * RD-2-T2 — Rights Windows (children of Contract). Mirrors contracts.ts service
 * shape. Storage is flag-independent; the `rightsWindows` flag gates validation
 * emission (RD-3), not CRUD. `category` is CoverageType (incl. ARCHIVE);
 * `platforms` uses the lowercase channel-type vocabulary (linear|on-demand|…).
 */
export interface RightsWindow {
  id: string
  contractId: number
  tenantId: string
  category: CoverageType
  exclusivity: ExclusivityTier
  territory: string[]
  platforms: string[]
  windowStartUtc: string | null
  windowEndUtc: string | null
  maxRuns: number | null
  holdbackHoursMin: number | null
  createdAt: string
  updatedAt: string
}

/** Writable fields; `id` is client-suppliable for idempotent create/retry. */
export type RightsWindowInput = Partial<
  Pick<
    RightsWindow,
    | 'id'
    | 'category'
    | 'exclusivity'
    | 'territory'
    | 'platforms'
    | 'windowStartUtc'
    | 'windowEndUtc'
    | 'maxRuns'
    | 'holdbackHoursMin'
  >
>

export const rightsWindowsApi = {
  list: (contractId: number) =>
    api.get<RightsWindow[]>(`/contracts/${contractId}/rights-windows`),

  create: (contractId: number, data: RightsWindowInput) =>
    api.post<RightsWindow>(`/contracts/${contractId}/rights-windows`, data),

  update: (contractId: number, windowId: string, data: RightsWindowInput) =>
    api.put<RightsWindow>(`/contracts/${contractId}/rights-windows/${windowId}`, data),

  delete: (contractId: number, windowId: string) =>
    api.delete<{ success: boolean }>(`/contracts/${contractId}/rights-windows/${windowId}`),
}
