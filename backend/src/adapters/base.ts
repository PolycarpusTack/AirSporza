/**
 * Interface for inbound adapters that process webhooks from external systems.
 */
export interface InboundAdapter {
  name: string
  processWebhook(payload: unknown, tenantId: string): Promise<void>
}

/**
 * Interface for outbound adapters that push data to external systems.
 */
export interface OutboundAdapter {
  name: string
  push(data: unknown, tenantId: string): Promise<void>
}
