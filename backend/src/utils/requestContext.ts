import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  correlationId: string
}

/**
 * AsyncLocalStorage carrying per-request (or per-job) context.
 * Populated by the correlation middleware for HTTP requests and by
 * createWorker for BullMQ jobs that carry a `_correlationId`.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>()

/**
 * Correlation id of the current request/job, or undefined when called
 * outside any request/job context (e.g. startup code, cron loops).
 */
export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId
}
