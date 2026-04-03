export type TransformType =
  | 'date_format'
  | 'string_concat'
  | 'default_value'
  | 'alias_lookup'
  | 'json_path'
  | 'map_value'

export interface FieldMapping {
  sourceField: string
  targetField: string
  transform?: TransformType
  transformConfig?: Record<string, unknown>
  required?: boolean
}

export type FieldOverride = Omit<FieldMapping, 'required'>

export type AuthConfig =
  | { scheme: 'api_key_header'; headerName: string }
  | { scheme: 'api_key_query'; queryParam: string }
  | { scheme: 'bearer' }
  | { scheme: 'basic' }
  | { scheme: 'none' }

interface BaseTemplate {
  code: string
  name: string
  description: string
  defaultFieldMappings: FieldMapping[]
}

export interface InboundTemplate extends BaseTemplate {
  direction: 'INBOUND'
  auth: AuthConfig
  baseUrl: string
  endpoints: { competitions?: string; fixtures?: string; test: string }
  sampleResponse?: Record<string, unknown>
  rateLimitDefaults?: { requestsPerMinute: number; requestsPerDay: number }
}

export interface OutboundTemplate extends BaseTemplate {
  direction: 'OUTBOUND'
  contentType: string
  payloadTemplate: string
  samplePayload?: string
}

export type IntegrationTemplate = InboundTemplate | OutboundTemplate
