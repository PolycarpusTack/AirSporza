import type { Integration } from '@prisma/client'
import { decryptCredentials } from '../../services/credentialService.js'
import { getTemplateOrThrow } from '../../integrations/templates/index.js'
import type { InboundTemplate } from '../../integrations/types.js'
import { createImportAdapter } from './index.js'

/**
 * Create an import adapter from an Integration record.
 * Decrypts credentials and delegates to existing createImportAdapter.
 */
export function createAdapterFromIntegration(integration: Integration) {
  const template = getTemplateOrThrow(integration.templateCode) as InboundTemplate

  const credentials = integration.credentials
    ? decryptCredentials(integration.credentials)
    : {}

  const config = {
    ...(integration.config as Record<string, unknown>),
    ...credentials,
  }

  // Build ImportSource-compatible shape for existing adapter factory
  return createImportAdapter({
    code: integration.templateCode,
    configJson: config as any,
  })
}
