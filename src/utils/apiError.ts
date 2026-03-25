// ── Consistent API error handling ────────────────────────────────────────────

import { ApiError } from './api'

type ToastLike = { error: (msg: string) => void }

export function handleApiError(
  err: unknown,
  context: string,
  toast: ToastLike
): void {
  const message = err instanceof ApiError
    ? err.message
    : err instanceof Error
      ? err.message
      : 'An unexpected error occurred'
  toast.error(`${context}: ${message}`)
}
