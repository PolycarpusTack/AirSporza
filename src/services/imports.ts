import { api, API_URL, getStoredToken, ApiError } from '../utils/api'

function getAuthHeader(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface ImportSource {
  id: string
  code: string
  name: string
  kind: 'api' | 'file'
  priority: number
  isEnabled: boolean
  rateLimitPerMinute: number | null
  rateLimitPerDay: number | null
  lastFetchAt: string | null
  createdAt: string
  hasCredentials: boolean
  capabilities: {
    hasAdapter: boolean
    supportedScopes: Array<'sports' | 'competitions' | 'teams' | 'events' | 'fixtures' | 'live'>
    note?: string
  }
  configStatus: {
    status: 'ready' | 'missing_config' | 'no_adapter'
    hasCredentials: boolean
    canExecute: boolean
    missingConfig: string[]
  }
  rateLimitStatus: {
    minute: {
      limit: number | null
      used: number
      remaining: number | null
      resetAt: string | null
    }
    day: {
      limit: number | null
      used: number
      remaining: number | null
      resetAt: string | null
    }
    lastRequestAt: string | null
  }
  stats: {
    jobs: number
    deadLetters: number
    records: number
    sourceLinks: number
  }
}

export interface ImportJob {
  id: string
  sourceId: string
  entityScope: string
  mode: 'full' | 'incremental' | 'backfill'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial'
  statsJson: Record<string, unknown>
  errorLog: string | null
  cursor: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  source: {
    id: string
    code: string
    name: string
  }
  _count?: {
    records: number
    deadLetters: number
  }
}

export interface ImportMergeCandidate {
  id: string
  entityType: string
  suggestedEntityId: string | null
  confidence: number
  reasonCodes: string[]
  status: 'pending' | 'approved_merge' | 'create_new' | 'ignored'
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  importRecord: {
    id: string
    sourceId: string
    sourceRecordId: string
    entityType: string
    normalizedJson: Record<string, unknown> | null
    sourceUpdatedAt: string | null
    source: {
      id: string
      code: string
      name: string
    }
  }
}

export interface ImportDeadLetter {
  id: string
  sourceId: string
  sourceRecordId: string | null
  errorMessage: string
  errorType: string
  retryCount: number
  lastRetryAt: string | null
  nextRetryAt: string | null
  resolvedAt: string | null
  createdAt: string
  source: {
    id: string
    code: string
    name: string
  }
  job: {
    id: string
    entityScope: string
    status: string
  } | null
}

export interface ImportAliasRecord {
  id: string
  alias: string
  normalizedAlias: string
  source: {
    id: string
    code: string
    name: string
  } | null
  canonicalTeam?: {
    id: string
    primaryName: string
  }
  canonicalCompetition?: {
    id: string
    primaryName: string
  }
  canonicalVenue?: {
    id: string
    primaryName: string
  }
}

export interface FieldProvenanceRecord {
  id: string
  entityType: string
  entityId: string
  fieldName: string
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt: string | null
  importedAt: string
  source: {
    id: string
    code: string
    name: string
  } | null
}

export interface ImportMetrics {
  totals: {
    sources: number
    enabledSources: number
    pendingJobs: number
    completedJobs24h: number
    pendingReviews: number
    unresolvedDeadLetters: number
    manualSyncs24h: number
  }
  quality: {
    totalImportRecords: number
    totalLinkedRecords: number
    overallLinkCoverage: number
    reviewRate: number
    deadLetterRate: number
  }
  sources: Array<{
    id: string
    code: string
    name: string
    isEnabled: boolean
    priority: number
    lastFetchAt: string | null
    rateLimitStatus: ImportSource['rateLimitStatus']
    jobs: number
    records: number
    deadLetters: number
    quality: {
      linkCoverage: number
      deadLetterRate: number
    }
  }>
}

export const importsApi = {
  listSources: () =>
    api.get<ImportSource[]>('/import/sources'),

  updateSource: (id: string, data: Partial<Pick<ImportSource, 'isEnabled' | 'priority' | 'rateLimitPerMinute' | 'rateLimitPerDay'>>) =>
    api.patch<ImportSource>(`/import/sources/${id}`, data),

  listJobs: (params?: { limit?: number; status?: string; sourceCode?: string; entityScope?: string }) => {
    const search = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          search.append(key, String(value))
        }
      })
    }
    const query = search.toString()
    return api.get<ImportJob[]>(`/import/jobs${query ? `?${query}` : ''}`)
  },

  createJob: (data: { sourceCode: string; entityScope: string; mode?: 'full' | 'incremental' | 'backfill'; entityId?: string | number | null; note?: string }) =>
    api.post<{ message: string; job: ImportJob }>('/import/jobs', data),

  listMergeCandidates: (params?: { limit?: number; status?: string; entityType?: string }) => {
    const search = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          search.append(key, String(value))
        }
      })
    }
    const query = search.toString()
    return api.get<ImportMergeCandidate[]>(`/import/merge-candidates${query ? `?${query}` : ''}`)
  },

  approveMergeCandidate: (id: string, targetEntityId?: string | number | null) =>
    api.post<{ message: string; candidate: ImportMergeCandidate }>(`/import/merge-candidates/${id}/approve-merge`, {
      targetEntityId: targetEntityId ?? null,
    }),

  createMergeCandidateEntity: (id: string) =>
    api.post<{ message: string; candidate: ImportMergeCandidate }>(`/import/merge-candidates/${id}/create-new`, {}),

  ignoreMergeCandidate: (id: string) =>
    api.post<{ message: string; candidate: ImportMergeCandidate }>(`/import/merge-candidates/${id}/ignore`, {}),

  cancelJob: (id: string) =>
    api.post<{ message: string; job: ImportJob }>(`/import/jobs/${id}/cancel`, {}),

  retryJob: (id: string) =>
    api.post<{ message: string; job: ImportJob }>(`/import/jobs/${id}/retry`, {}),

  listDeadLetters: (params?: { limit?: number; sourceCode?: string; resolved?: 'true' | 'false' | 'all' }) => {
    const search = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          search.append(key, String(value))
        }
      })
    }
    const query = search.toString()
    return api.get<ImportDeadLetter[]>(`/import/dead-letters${query ? `?${query}` : ''}`)
  },

  replayDeadLetter: (id: string) =>
    api.post<{ message: string; job: ImportJob }>(`/import/dead-letters/${id}/replay`, {}),

  listAliases: (params: { type: 'team' | 'competition' | 'venue'; limit?: number; sourceId?: string }) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        search.append(key, String(value))
      }
    })
    return api.get<ImportAliasRecord[]>(`/import/aliases?${search.toString()}`)
  },

  createAlias: (
    type: 'team' | 'competition' | 'venue',
    data: { canonicalId: string; alias: string; sourceId?: string | null }
  ) => api.post<ImportAliasRecord>(`/import/aliases/${type}`, data),

  deleteAlias: (type: 'team' | 'competition' | 'venue', id: string) =>
    api.delete<{ message: string }>(`/import/aliases/${type}/${id}`),

  getProvenance: (entityType: string, entityId: string) =>
    api.get<FieldProvenanceRecord[]>(`/import/provenance/${entityType}/${entityId}`),

  metrics: () =>
    api.get<ImportMetrics>('/import/metrics'),

  uploadCsv: (file: File, sportId: number, competitionId: number): Promise<{ inserted: number; skipped: number; errors?: { row: number; message: string }[] }> => {
    const form = new FormData()
    form.append('file', file)
    form.append('sportId', String(sportId))
    form.append('competitionId', String(competitionId))
    return fetch(`${API_URL}/import/csv`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: form,
    }).then(r =>
      r.ok
        ? r.json()
        : r.json().then((e: { message?: string }) => Promise.reject(new ApiError(r.status, e.message ?? `HTTP ${r.status}`)))
    )
  },
}
