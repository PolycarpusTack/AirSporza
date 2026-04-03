import type { OutboundTemplate } from '../../types.js'

export const xmltvEpgTemplate: OutboundTemplate = {
  code: 'xmltv_epg',
  name: 'XMLTV EPG Feed',
  description: 'Electronic Program Guide in XMLTV format',
  direction: 'OUTBOUND',
  contentType: 'application/xml',
  payloadTemplate: `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="Planza" generator-info-url="https://planza.app">
{{#each events}}
<programme start="{{formatDate startDateBE "YYYYMMDDHHmmss" startTimeBE}}" stop="{{formatDate endDate "YYYYMMDDHHmmss" endTime}}" channel="{{channelId}}">
  <title lang="en">{{participants}}</title>
  <sub-title lang="en">{{competition.name}}</sub-title>
  <desc lang="en">{{sport.name}} - {{phase}}</desc>
  <category lang="en">{{sport.name}}</category>
  <episode-num system="planza">{{id}}</episode-num>
  {{#if isLive}}<live/>{{/if}}
</programme>
{{/each}}
</tv>`,
  defaultFieldMappings: [
    { sourceField: 'id', targetField: 'id' },
    { sourceField: 'participants', targetField: 'participants' },
    { sourceField: 'startDateBE', targetField: 'startDateBE' },
    { sourceField: 'startTimeBE', targetField: 'startTimeBE' },
    { sourceField: 'sport.name', targetField: 'sportName' },
    { sourceField: 'competition.name', targetField: 'competitionName' },
    { sourceField: 'channelId', targetField: 'channelId' },
    { sourceField: 'isLive', targetField: 'isLive' },
  ],
  samplePayload: '<?xml version="1.0"?><tv><programme start="20260315194500" channel="1"><title>RSC Anderlecht vs Club Brugge</title></programme></tv>',
}
