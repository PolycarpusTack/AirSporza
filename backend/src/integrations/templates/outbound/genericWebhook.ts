import type { OutboundTemplate } from '../../types.js'

export const genericWebhookTemplate: OutboundTemplate = {
  code: 'generic_webhook',
  name: 'Generic Webhook',
  description: 'Push event updates to any webhook URL as JSON',
  direction: 'OUTBOUND',
  contentType: 'application/json',
  payloadTemplate: `{
  "event": "{{eventType}}",
  "timestamp": "{{timestamp}}",
  "data": {
    "id": {{data.id}},
    "participants": "{{data.participants}}",
    "sport": "{{data.sport.name}}",
    "competition": "{{data.competition.name}}",
    "startDate": "{{data.startDateBE}}",
    "startTime": "{{data.startTimeBE}}",
    "channel": "{{data.channel.name}}",
    "status": "{{data.status}}",
    "isLive": {{data.isLive}}
  }
}`,
  defaultFieldMappings: [
    { sourceField: 'id', targetField: 'id' },
    { sourceField: 'participants', targetField: 'participants' },
    { sourceField: 'sport.name', targetField: 'sportName' },
    { sourceField: 'competition.name', targetField: 'competitionName' },
    { sourceField: 'startDateBE', targetField: 'startDate' },
    { sourceField: 'startTimeBE', targetField: 'startTime' },
    { sourceField: 'status', targetField: 'status' },
  ],
}
