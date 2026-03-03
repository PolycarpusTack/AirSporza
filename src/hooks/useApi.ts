import { useEffect, useState, useCallback } from 'react'
import { api } from '../utils/api'

interface UseApiOptions<T> {
  immediate?: boolean
  initialData?: T
}

interface UseApiReturn<T> {
  data: T | null
  loading: boolean
  error: Error | null
  execute: (...args: unknown[]) => Promise<T | null>
  setData: (data: T | null) => void
}

export function useApi<T>(
  endpoint: string | (() => string),
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const { immediate = true, initialData = null } = options
  
  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(async (..._args: unknown[]) => {
    setLoading(true)
    setError(null)
    
    try {
      const url = typeof endpoint === 'function' ? endpoint() : endpoint
      const result = await api.get<T>(url)
      setData(result)
      return result
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      return null
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [immediate, execute])

  return { data, loading, error, execute, setData }
}

export function useApiMutation<T, P = unknown>(
  mutationFn: (params: P) => Promise<T>
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(async (params: P): Promise<T | null> => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await mutationFn(params)
      setData(result)
      return result
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      return null
    } finally {
      setLoading(false)
    }
  }, [mutationFn])

  return { data, loading, error, mutate, setData }
}
