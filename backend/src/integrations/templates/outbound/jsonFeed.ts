import type { OutboundTemplate } from '../../types.js'

export const jsonFeedTemplate: OutboundTemplate = {
  code: 'json_feed',
  name: 'JSON Feed',
  description: 'Push schedule data as a JSON payload to a REST endpoint',
  direction: 'OUTBOUND',
  contentType: 'application/json',
  payloadTemplate: `{
  "generated": "{{timestamp}}",
  "events": [
    {{#each events}}
    {
      "id": {{id}},
      "participants": "{{participants}}",
      "sport": "{{sport.name}}",
      "competition": "{{competition.name}}",
      "date": "{{startDateBE}}",
      "time": "{{startTimeBE}}",
      "channel": "{{channel.name}}",
      "status": "{{status}}",
      "live": {{isLive}}
    }{{#unless @last}},{{/unless}}
    {{/each}}
  ]
}`,
  defaultFieldMappings: [
    { sourceField: 'id', targetField: 'id' },
    { sourceField: 'participants', targetField: 'participants' },
    { sourceField: 'sport.name', targetField: 'sportName' },
    { sourceField: 'competition.name', targetField: 'competitionName' },
    { sourceField: 'startDateBE', targetField: 'date' },
    { sourceField: 'startTimeBE', targetField: 'time' },
    { sourceField: 'channel.name', targetField: 'channelName' },
    { sourceField: 'status', targetField: 'status' },
  ],
}
