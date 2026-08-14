/**
 * FM1-4-T1 — frontend client for the FM action-item resolution route
 * (backend/src/routes/fmActionItems.ts, Contract Snapshot `ActionItemResolution v1`).
 */
import { api } from '../utils/api'

export const fmActionItemsApi = {
  /** POST /api/fm/action-items/resolve {itemKey} — idempotent acknowledgment. */
  resolve: (itemKey: string) => api.post<{ resolvedAt: string }>('/fm/action-items/resolve', { itemKey }),

  /** GET /api/fm/action-items/resolutions — the current user's resolved item keys. */
  listResolutions: () => api.get<{ itemKeys: string[] }>('/fm/action-items/resolutions'),
}
