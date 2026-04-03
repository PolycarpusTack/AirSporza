import type { IntegrationTemplate, InboundTemplate, OutboundTemplate } from '../types.js'
import { footballDataTemplate } from './inbound/footballData.js'
import { apiFootballTemplate } from './inbound/apiFootball.js'
import { theSportsDbTemplate } from './inbound/theSportsDb.js'
import { genericRestTemplate } from './inbound/genericRest.js'
import { xmltvEpgTemplate } from './outbound/xmltvEpg.js'
import { genericWebhookTemplate } from './outbound/genericWebhook.js'
import { jsonFeedTemplate } from './outbound/jsonFeed.js'

const TEMPLATES: IntegrationTemplate[] = [
  footballDataTemplate,
  apiFootballTemplate,
  theSportsDbTemplate,
  genericRestTemplate,
  xmltvEpgTemplate,
  genericWebhookTemplate,
  jsonFeedTemplate,
]

const templateMap = new Map(TEMPLATES.map(t => [t.code, t]))

export function getTemplate(code: string): IntegrationTemplate | undefined {
  return templateMap.get(code)
}

export function getTemplateOrThrow(code: string): IntegrationTemplate {
  const t = templateMap.get(code)
  if (!t) throw new Error(`Unknown integration template: ${code}`)
  return t
}

export function listTemplates(): IntegrationTemplate[] {
  return TEMPLATES
}

export function listInboundTemplates(): InboundTemplate[] {
  return TEMPLATES.filter((t): t is InboundTemplate => t.direction === 'INBOUND')
}

export function listOutboundTemplates(): OutboundTemplate[] {
  return TEMPLATES.filter((t): t is OutboundTemplate => t.direction === 'OUTBOUND')
}
