import Handlebars from 'handlebars'
import { createWorker } from '../services/queue.js'
import { prisma } from '../db/prisma.js'
import { decryptCredentials } from '../services/credentialService.js'
import { applyFieldMappings } from '../integrations/fieldMapper.js'
import { getTemplate } from '../integrations/templates/index.js'
import type { OutboundTemplate, FieldOverride, AuthConfig } from '../integrations/types.js'
import { logger } from '../utils/logger.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'
import { checkRateLimit } from '../integrations/rateLimiter.js'

const PUSH_TIMEOUT_MS = 10_000
const CIRCUIT_BREAKER_THRESHOLD = 10
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

// Sandboxed Handlebars instance
const hbs = Handlebars.create()

// Template cache
const compiledTemplates = new Map<string, HandlebarsTemplateDelegate>()

function getCompiledTemplate(templateCode: string, payloadTemplate: string): HandlebarsTemplateDelegate {
  let compiled = compiledTemplates.get(templateCode)
  if (!compiled) {
    compiled = hbs.compile(payloadTemplate, { strict: false })
    compiledTemplates.set(templateCode, compiled)
  }
  return compiled
}

function buildAuthHeaders(
  credentials: Record<string, unknown>,
  auth?: AuthConfig
): Record<string, string> {
  if (!auth) return {}
  switch (auth.scheme) {
    case 'api_key_header':
      return { [auth.headerName]: String(credentials.apiKey ?? '') }
    case 'bearer':
      return { Authorization: `Bearer ${credentials.bearerToken ?? ''}` }
    case 'basic': {
      const encoded = Buffer.from(`${credentials.username ?? ''}:${credentials.password ?? ''}`).toString('base64')
      return { Authorization: `Basic ${encoded}` }
    }
    default:
      return {}
  }
}

interface TriggerConfig {
  events?: string[]
  filters?: Record<string, unknown>
}

function isCircuitOpen(integration: { consecutiveFailures: number; lastFailureAt: Date | null }): boolean {
  if (integration.consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) return false
  if (!integration.lastFailureAt) return false
  return Date.now() - integration.lastFailureAt.getTime() < CIRCUIT_BREAKER_COOLDOWN_MS
}

async function logAndUpdateHealth(
  integrationId: string,
  tenantId: string,
  direction: 'OUTBOUND',
  status: 'success' | 'failed',
  httpStatus: number | null,
  error: string | null,
  durationMs: number,
  recordCount: number
) {
  await prisma.integrationLog.create({
    data: {
      integrationId,
      direction,
      status,
      requestMeta: {},
      responseMeta: httpStatus ? { httpStatus } : {},
      recordCount,
      errorMessage: error,
      durationMs,
    },
  })

  if (status === 'success') {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastSuccessAt: new Date(), consecutiveFailures: 0 },
    })
  } else {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastFailureAt: new Date(), consecutiveFailures: { increment: 1 } },
    })
  }
}

export function startIntegrationPushWorker() {
  return createWorker(
    'integration',
    async (job) => {
      const { _tenantId: tenantId, eventType, ...payload } = job.data
      if (!tenantId) return { skipped: true, reason: 'no_tenant' }

      await setTenantRLS(tenantId)

      const integrations = await prisma.integration.findMany({
        where: {
          tenantId,
          direction: { in: ['OUTBOUND', 'BIDIRECTIONAL'] },
          isActive: true,
        },
      })

      const results = await Promise.allSettled(
        integrations.map(async (integration) => {
          // Check circuit breaker
          if (isCircuitOpen(integration)) {
            logger.debug(`Skipping integration ${integration.id}: circuit open`)
            return { integrationId: integration.id, status: 'skipped' as const }
          }

          // Check trigger match
          const triggers = integration.triggerConfig as TriggerConfig
          if (!triggers.events?.includes(eventType)) {
            return { integrationId: integration.id, status: 'skipped' as const }
          }

          // Check rate limit
          if (!checkRateLimit(integration.id, integration.rateLimitPerMinute, integration.rateLimitPerDay)) {
            logger.info(`Rate-limited integration ${integration.id}`)
            await logAndUpdateHealth(integration.id, tenantId, 'OUTBOUND', 'failed', null, 'Rate limit exceeded', 0, 0)
            return { integrationId: integration.id, status: 'rate_limited' as const }
          }

          const start = Date.now()
          try {
            const template = getTemplate(integration.templateCode) as OutboundTemplate | undefined
            if (!template || template.direction !== 'OUTBOUND') {
              throw new Error(`Template '${integration.templateCode}' is not an outbound template`)
            }

            const mapped = applyFieldMappings(
              payload,
              template.defaultFieldMappings,
              (integration.fieldOverrides as FieldOverride[]) || []
            )
            const compiled = getCompiledTemplate(template.code, template.payloadTemplate)
            const rendered = compiled({ ...mapped, eventType, timestamp: new Date().toISOString() })

            const credentials = integration.credentials
              ? decryptCredentials(integration.credentials)
              : {}
            const targetUrl = (integration.config as Record<string, unknown>).targetUrl as string
            if (!targetUrl) throw new Error('No targetUrl configured')

            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': template.contentType,
                ...buildAuthHeaders(credentials, (template as any).auth),
              },
              body: rendered,
              signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
            })

            const durationMs = Date.now() - start
            const status = response.ok ? 'success' : 'failed'
            await logAndUpdateHealth(integration.id, tenantId, 'OUTBOUND', status, response.status, response.ok ? null : `HTTP ${response.status}`, durationMs, 1)
            return { integrationId: integration.id, status, httpStatus: response.status }
          } catch (err) {
            const durationMs = Date.now() - start
            const errMsg = err instanceof Error ? err.message : String(err)
            await logAndUpdateHealth(integration.id, tenantId, 'OUTBOUND', 'failed', null, errMsg, durationMs, 0)
            return { integrationId: integration.id, status: 'failed' as const, error: errMsg }
          }
        })
      )

      return { processed: results.length, results: results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', reason: String(r.reason) }) }
    },
    { concurrency: 3 }
  )
}
