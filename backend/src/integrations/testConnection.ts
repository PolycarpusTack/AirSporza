import { URL } from 'url'
import dns from 'dns/promises'
import type { InboundTemplate, AuthConfig, FieldOverride } from './types.js'
import { decryptCredentials } from '../services/credentialService.js'
import { applyFieldMappings } from './fieldMapper.js'
import { logger } from '../utils/logger.js'

const BLOCKED_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^::1$/, /^fc00:/, /^fe80:/,
]

const BLOCKED_HOSTNAMES = ['metadata.google.internal', 'metadata.internal']

const MAX_RESPONSE_BYTES = 1_048_576 // 1MB
const TIMEOUT_MS = 10_000

export interface TestConnectionResult {
  status: 'success' | 'error'
  httpStatus?: number
  raw?: unknown
  mapped?: Record<string, unknown>
  durationMs: number
  error?: string
  truncated?: boolean
}

async function validateUrl(urlStr: string): Promise<void> {
  const url = new URL(urlStr)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are allowed')
  }
  if (BLOCKED_HOSTNAMES.includes(url.hostname)) {
    throw new Error('Connection to metadata endpoints is not allowed')
  }
  const { address } = await dns.lookup(url.hostname)
  if (BLOCKED_RANGES.some(r => r.test(address))) {
    throw new Error('Connection to private/internal networks is not allowed')
  }
}

function buildAuthHeaders(
  credentials: Record<string, unknown>,
  auth: AuthConfig
): Record<string, string> {
  switch (auth.scheme) {
    case 'api_key_header':
      return { [auth.headerName]: String(credentials.apiKey ?? '') }
    case 'api_key_query':
      return {} // query param handled in URL
    case 'bearer':
      return { Authorization: `Bearer ${credentials.bearerToken ?? ''}` }
    case 'basic': {
      const encoded = Buffer.from(`${credentials.username ?? ''}:${credentials.password ?? ''}`).toString('base64')
      return { Authorization: `Basic ${encoded}` }
    }
    case 'none':
      return {}
  }
}

function buildTestUrl(
  baseUrl: string,
  testEndpoint: string,
  credentials: Record<string, unknown>,
  auth: AuthConfig
): string {
  const url = new URL(testEndpoint, baseUrl)
  if (auth.scheme === 'api_key_query') {
    url.searchParams.set(auth.queryParam, String(credentials.apiKey ?? ''))
  }
  return url.toString()
}

async function readLimitedResponse(response: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) return { text: '', truncated: false }

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let truncated = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      truncated = true
      chunks.push(value.subarray(0, value.byteLength - (totalBytes - maxBytes)))
      reader.cancel()
      break
    }
    chunks.push(value)
  }

  const decoder = new TextDecoder()
  return { text: chunks.map(c => decoder.decode(c, { stream: true })).join(''), truncated }
}

const CREDENTIAL_PATTERNS = [
  /Bearer\s+\S+/gi,
  /(?:sk|tok|key|secret|password|auth)[_-]?\w{4,}/gi,
]

function sanitizeErrorMessage(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err)
  for (const pattern of CREDENTIAL_PATTERNS) {
    msg = msg.replace(pattern, '[REDACTED]')
  }
  return msg
}

export async function testInboundConnection(
  integration: { credentials: string | null; config: Record<string, unknown>; fieldOverrides: unknown },
  template: InboundTemplate,
): Promise<TestConnectionResult> {
  const start = Date.now()

  try {
    if (!integration.credentials) {
      return { status: 'error', error: 'No credentials configured', durationMs: Date.now() - start }
    }

    const credentials = decryptCredentials(integration.credentials)
    const baseUrl = (integration.config.baseUrl as string) || template.baseUrl
    const testUrl = buildTestUrl(baseUrl, template.endpoints.test, credentials, template.auth)

    await validateUrl(testUrl)

    const headers = buildAuthHeaders(credentials, template.auth)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(testUrl, { headers, signal: controller.signal })
      const { text, truncated } = await readLimitedResponse(response, MAX_RESPONSE_BYTES)

      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        raw = text.slice(0, 500)
      }

      const firstRecord = Array.isArray(raw) ? raw[0] : raw
      const mapped = firstRecord && typeof firstRecord === 'object'
        ? applyFieldMappings(
            firstRecord as Record<string, unknown>,
            template.defaultFieldMappings,
            (integration.fieldOverrides as FieldOverride[]) || []
          )
        : {}

      return {
        status: response.ok ? 'success' : 'error',
        httpStatus: response.status,
        raw: firstRecord,
        mapped,
        durationMs: Date.now() - start,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        truncated,
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    logger.warn('Test connection failed', { err })
    return {
      status: 'error',
      error: sanitizeErrorMessage(err),
      durationMs: Date.now() - start,
    }
  }
}
