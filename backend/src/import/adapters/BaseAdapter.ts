import type { SourceCode, FetchWindow, RawSourceRecord, NormalizedCompetition, NormalizedTeam, CanonicalImportEvent } from '../types.js'

export interface ImportAdapter {
  sourceCode: SourceCode
  
  rateLimitConfig: {
    requestsPerMinute: number
    requestsPerDay: number
    burstLimit?: number
  }
  
  supportsIncremental: boolean
  
  fetchCompetitions(input: FetchWindow): Promise<RawSourceRecord[]>
  fetchTeams?(input: FetchWindow): Promise<RawSourceRecord[]>
  fetchFixtures(input: FetchWindow): Promise<RawSourceRecord[]>
  fetchLiveUpdates?(input: FetchWindow): Promise<RawSourceRecord[]>
  
  normalizeCompetition(raw: RawSourceRecord): NormalizedCompetition | null
  normalizeTeam?(raw: RawSourceRecord): NormalizedTeam | null
  normalizeFixture(raw: RawSourceRecord): CanonicalImportEvent | null
  
  getCursor(nextFromResponse: unknown): string | null
  
  classifyError(error: unknown): 'retryable' | 'rate_limited' | 'auth_failed' | 'data_error' | 'fatal'
  setThrottle(throttle: (() => Promise<void>) | null): void
}

export abstract class BaseAdapter implements ImportAdapter {
  abstract sourceCode: SourceCode
  abstract rateLimitConfig: { requestsPerMinute: number; requestsPerDay: number; burstLimit?: number }
  abstract supportsIncremental: boolean
  private throttleFn: (() => Promise<void>) | null = null
  
  abstract fetchCompetitions(input: FetchWindow): Promise<RawSourceRecord[]>
  abstract fetchFixtures(input: FetchWindow): Promise<RawSourceRecord[]>
  abstract normalizeCompetition(raw: RawSourceRecord): NormalizedCompetition | null
  abstract normalizeFixture(raw: RawSourceRecord): CanonicalImportEvent | null
  
  fetchTeams?(input: FetchWindow): Promise<RawSourceRecord[]>
  fetchLiveUpdates?(input: FetchWindow): Promise<RawSourceRecord[]>
  normalizeTeam?(raw: RawSourceRecord): NormalizedTeam | null
  
  getCursor(_nextFromResponse: unknown): string | null {
    return null
  }
  
  classifyError(error: unknown): 'retryable' | 'rate_limited' | 'auth_failed' | 'data_error' | 'fatal' {
    if (error instanceof Error) {
      if (error.message.includes('429')) return 'rate_limited'
      if (error.message.includes('401') || error.message.includes('403')) return 'auth_failed'
      if (error.message.includes('network') || error.message.includes('timeout')) return 'retryable'
    }
    return 'data_error'
  }

  setThrottle(throttle: (() => Promise<void>) | null): void {
    this.throttleFn = throttle
  }
  
  protected async fetchWithRetry<T>(
    fetchFn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (this.throttleFn) {
          await this.throttleFn()
        }
        return await fetchFn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const errorType = this.classifyError(error)
        
        if (errorType === 'fatal' || errorType === 'auth_failed') {
          throw error
        }
        
        if (errorType === 'rate_limited') {
          await new Promise(resolve => setTimeout(resolve, delayMs * 10))
        } else {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        }
      }
    }
    
    throw lastError
  }
}
