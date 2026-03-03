const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string
  ) {
    super(`API Error ${status}: ${message}`)
    this.status = status
    this.code = code
  }
}

export function getStoredToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token')
  }
  return null
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token')
  }
}

export function setToken(token: string | null) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }
}

function isAuthError(status: number): boolean {
  return status === 401
}

export class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_URL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' } = {}
  ): Promise<T> {
    const token = getStoredToken()
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const config: RequestInit = {
      method: options.method || 'GET',
      headers,
      ...options,
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, config)
    
    if (response.status === 204) {
      return undefined as T
    }

    if (!response.ok) {
      let errorMessage: string
      try {
        const errorData = await response.json()
        errorMessage = errorData.message || errorData.error || `HTTP ${response.status}`
      } catch {
        errorMessage = `HTTP ${response.status}`
      }
      
      if (isAuthError(response.status)) {
        clearToken()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }
      
      throw new ApiError(response.status, errorMessage)
    }

    const contentType = response.headers.get('Content-Type')
    if (contentType?.includes('application/json')) {
      return response.json()
    }
    
    return undefined as T
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) })
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

let apiInstance: ApiClient | null = null

export function getApi(): ApiClient {
  if (!apiInstance) {
    apiInstance = new ApiClient()
  }
  return apiInstance
}

export const api = {
  get: <T>(endpoint: string) => getApi().get<T>(endpoint),
  post: <T>(endpoint: string, data?: unknown) => getApi().post<T>(endpoint, data),
  put: <T>(endpoint: string, data?: unknown) => getApi().put<T>(endpoint, data),
  patch: <T>(endpoint: string, data?: unknown) => getApi().patch<T>(endpoint, data),
  delete: <T>(endpoint: string) => getApi().delete<T>(endpoint),
}
