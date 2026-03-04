# Outbound Publishing — Design Document
**Date:** 2026-03-04
**Status:** Proposed
**Scope:** Push SportzaPlanner event data outbound to external systems

---

## Probleemstelling

SportzaPlanner ontvangt data van externe bronnen (via Import), maar stuurt momenteel niets terug
naar de buitenwereld. Productieplannen, uitzendschema's en live-statussen moeten echter ook
beschikbaar zijn voor andere VRT-systemen:

| Afnemer | Wat ze nodig hebben |
|---------|---------------------|
| VRT.be / VRT MAX website | Uitzendschema per sport/kanaal, live-links |
| Broadcast NAS / MAM | Videobestandsreferenties (WP/AIM nr.), SMPTE-duur |
| WFM / Workforce Management | Ploegsamenstelling, encoder-toewijzingen |
| Nieuwsdienst | Scorebord, winnaar na afloop |
| Externe partners (EBU leden) | Rights-gefilterde event feeds (enkel lineair/max/radio) |

---

## Architectuurkeuze: Webhook + Pull API

### Optie A — Push-only webhooks
- Planner stuurt HTTP POST naar geregistreerde endpoints bij elke wijziging
- Eenvoudig, lage latency
- Min: afnemers moeten een publiek endpoint hebben; retries bij downtime nodig

### Optie B — Pull API alleen
- Afnemers pollen `/api/publish/events` op hun eigen ritme
- Eenvoudigst te implementeren
- Min: hoge latency (pollen), geen garantie op onmiddellijk ophalen

### Optie C — Webhooks + Pull API + Event Log (Aanbevolen)
- **Webhooks**: push bij create/update/delete events, techPlan-wijzigingen
- **Pull endpoints**: gefilterde RSS/JSON feeds per kanaal of sport
- **Delivery log**: elke webhook-poging gelogd; afnemers kunnen missed events ophalen via cursored feed
- **Retry**: exponential backoff 3 pogingen; daarna naar dead-letter queue

Keuze: **Optie C** — combineert lage latency met betrouwbaarheid.

---

## Data Formats

### 1. JSON Event Feed (REST)
Basis voor VRT.be, intern gebruik:
```json
{
  "id": 42,
  "sport": { "id": 1, "name": "Football", "icon": "⚽" },
  "competition": { "id": 1, "name": "Jupiler Pro League", "season": "2025-26" },
  "participants": "Club Brugge vs Anderlecht",
  "startDateBE": "2026-03-03",
  "startTimeBE": "14:30",
  "linearChannel": "VRT 1",
  "linearStartTime": "14:20",
  "radioChannel": "Radio 1",
  "isLive": true,
  "isDelayedLive": false,
  "livestreamDate": "2026-03-03",
  "livestreamTime": "14:15",
  "videoRef": "WP-2026-0412",
  "winner": "Club Brugge",
  "score": "2-1",
  "duration": "01:47:33;12",
  "rights": {
    "linear": true,
    "max": true,
    "radio": true,
    "geo": "Belgium only",
    "sublicensing": false
  }
}
```

### 2. iCal/RFC 5545 Feed
Voor kalenderintegratie (Outlook, Teams):
- `VEVENT` per event met DTSTART, DTEND (afgeleid van startTimeBE + duration)
- SUMMARY = `participants` + kanaal
- DESCRIPTION = content + crew samenvatting
- URL = deep-link naar event in Planner

### 3. XML/NITF (optioneel, fase 2)
Voor traditionele broadcast-systemen (legacy MAM). Alleen nodig als het MAM-systeem geen JSON ondersteunt.

---

## Backend: Nieuwe API Routes

### Webhook management
```
POST   /api/publish/webhooks          # Registreer endpoint
GET    /api/publish/webhooks          # Lijst (admin)
DELETE /api/publish/webhooks/:id      # Verwijder
GET    /api/publish/webhooks/:id/log  # Delivery history
```

### Pull feeds
```
GET /api/publish/events               # Gefilterde event JSON feed
    ?channel=VRT+1                    # Filter op lineair kanaal
    ?sport=1                          # Filter op sport-id
    ?from=2026-03-01&to=2026-03-31    # Datumrange
    ?rights=linear                    # Enkel events met lineaire rechten
    &cursor=<opaque>                  # Paginering
    &format=json|ical                 # Outputformaat

GET /api/publish/events/:id           # Enkel event (voor cache-invalidation)
GET /api/publish/schedule             # Dagschema per kanaal (VRT.be use case)
GET /api/publish/live                 # Actuele live-events (polling-friendly)
```

### Delivery log
```
GET /api/publish/deliveries           # Alle webhook pogingen
    ?webhookId=&status=failed         # Filter op status
POST /api/publish/deliveries/:id/retry # Handmatige herpoging
```

---

## Webhook Payload

```json
{
  "event": "event.updated",
  "timestamp": "2026-03-04T14:00:00Z",
  "data": { /* Event object zoals hierboven */ },
  "signature": "sha256=<hmac>"
}
```

Eventtypen:
- `event.created`, `event.updated`, `event.deleted`
- `techPlan.created`, `techPlan.updated`
- `event.live.started`, `event.live.ended`
- `contract.expiring` (30/7/1 dagen voor vervaldatum)

**Signature**: HMAC-SHA256 over payload body met een per-webhook geheim. Afnemer verifieert via header `X-Planza-Signature`.

---

## Rights Filtering

Outbound feeds respecteren contractrechten:
- Event verschijnt alleen in de `max`-feed als de competitie een geldig contract heeft met `maxRights: true`
- `fee` en `notes` velden worden **nooit** doorgegeven in outbound feeds
- Geo-restricties worden als metadata meegestuurd; enforcement is verantwoordelijkheid van de afnemer

---

## Frontend: Publish Tab in ImportView / Settings

### Settings → Publish (nieuw tabblad)

**Webhooks paneel:**
```
[ + Register Webhook ]
URL: https://...         Secret: ••••••••    Events: [✓] event.* [✓] techPlan.*
Status: Active (23 deliveries, 0 failed)   [ View Log ] [ Delete ]
```

**Feeds paneel (read-only links):**
```
JSON Feed:  /api/publish/events?format=json   [ Copy ] [ Open ]
iCal Feed:  /api/publish/events?format=ical   [ Copy ]
Schedule:   /api/publish/schedule             [ Copy ]
```

**Delivery log:**
- Tabel: timestamp, webhook-URL, event-type, status (200 / 4xx / timeout), retry-count
- Bulk retry knop voor gefaalde leveringen

---

## Implementatiebatches

### Batch P1 — Backend: DB schema + pull feeds
Bestanden: `server/prisma/schema.prisma`, `server/routes/publish.ts`

- Voeg `WebhookEndpoint` model toe (id, url, secret, events[], isActive, createdAt)
- Voeg `WebhookDelivery` model toe (id, webhookId, eventType, payload, statusCode, attempts, deliveredAt)
- Implementeer `GET /api/publish/events` met filter/cursor/format=json|ical
- Implementeer `GET /api/publish/schedule` (gegroepeerd per kanaal per dag)
- Implementeer `GET /api/publish/live`

### Batch P2 — Backend: Webhook dispatch
Bestanden: `server/services/publishService.ts`, `server/hooks/eventHooks.ts`

- `publishService.dispatch(eventType, payload)`:
  - Laad alle actieve webhooks die het eventtype abonneren
  - Stuur HTTP POST met HMAC signature header
  - Log elke poging in `WebhookDelivery`
  - Exponential backoff retry (1s → 5s → 30s) via job queue (of simpel `setTimeout` als geen queue beschikbaar)
- Hook op Prisma middleware: na elke create/update/delete van Event of TechPlan → `publishService.dispatch()`
- Cron job: dagelijks check op contracts die binnen 30/7/1 dag vervallen → `contract.expiring` dispatch

### Batch P3 — Backend: Webhook CRUD API
Bestanden: `server/routes/publish.ts` (uitbreiden)

- `POST /api/publish/webhooks` — admin only
- `GET /api/publish/webhooks` — admin only
- `DELETE /api/publish/webhooks/:id` — admin only
- `GET /api/publish/webhooks/:id/log` — paginered
- `POST /api/publish/deliveries/:id/retry` — handmatige herpoging

### Batch P4 — Frontend: `publishApi` service
Bestand: `src/services/publish.ts` (nieuw)

```ts
export const publishApi = {
  listWebhooks: () => api.get<WebhookEndpoint[]>('/publish/webhooks'),
  createWebhook: (data) => api.post<WebhookEndpoint>('/publish/webhooks', data),
  deleteWebhook: (id) => api.delete(`/publish/webhooks/${id}`),
  getLog: (id, cursor?) => api.get<WebhookDelivery[]>(`/publish/webhooks/${id}/log`, { cursor }),
  listDeliveries: (filters?) => api.get<WebhookDelivery[]>('/publish/deliveries', filters),
  retryDelivery: (id) => api.post(`/publish/deliveries/${id}/retry`),
  getFeedUrl: (params) => `${API_URL}/publish/events?${new URLSearchParams(params)}`,
}
```

### Batch P5 — Frontend: Publish UI in Settings
Bestand: `src/pages/SettingsView.tsx`, `src/pages/AdminView.tsx`

- Voeg `publish` toe aan `AdminTab` type en `SECTIONS` array in SettingsView
- Nieuwe `PublishPanel` component in `src/components/admin/PublishPanel.tsx`:
  - Webhooks sub-tab: lijst + create form + log drawer
  - Feeds sub-tab: gegenereerde links met kopieerknop
  - Deliveries sub-tab: tabel met bulk-retry

---

## Verificatie

Na implementatie:
1. Registreer een webhook via de UI → controleer of de record in de DB staat
2. Maak een nieuw event aan → controleer of het webhook endpoint een POST ontvangt met correct HMAC header
3. Zet het endpoint tijdelijk offline → controleer retry-logica en delivery log status
4. Haal `/api/publish/events?format=ical` op → importeer in Outlook en verifieer VEVENT inhoud
5. Filter op `?channel=VRT+1` → verifieer dat enkel VRT 1-events terugkomen
6. Events met contract `maxRights: false` → mogen niet in `?rights=max` feed verschijnen
