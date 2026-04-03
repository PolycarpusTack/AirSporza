---
title: Import/Export Integration Hub
date: 2026-03-09
status: decided
---

# Import/Export Integration Hub

## What We're Building

A unified integration configuration system that turns Planza's Import page into a full **Integration Hub** — handling both inbound (API imports) and outbound (EPG feeds, federation pushes, generic REST exports) with:

1. **In-app credential management** — admins configure API keys, auth headers, and base URLs per source/destination directly in the UI (no more server-side DB edits)
2. **Template-based field mapping with visual overrides** — pre-built templates for common APIs; an override table lets admins remap or transform fields by clicking, not coding
3. **Outbound integrations** — event-driven push (via existing outbox pattern) + scheduled batch exports (cron), targeting EPG systems, federation APIs, and generic REST endpoints

## Why This Approach

### Template + Visual Override (not full drag-and-drop, not raw JSON)

- **Most sport APIs share 80-90% structure** — a football template maps `homeTeam`, `awayTeam`, `kickoff`, `venue` identically across football-data.org, API-Football, TheSportsDB
- **Full visual mapping builders are high effort, low ROI** for admin-only usage with 2-10 total integrations
- **JSON path configs are error-prone** without seeing real data
- **Hybrid gives the best balance**: pick template → test connection → see real response → override what's different

### Bidirectional (not import-only)

- The existing outbox + webhook infrastructure already handles event-driven fan-out
- Adding configurable destinations with field mapping reuses the same template/override pattern
- Scheduled exports use the existing `node-cron` pattern from ImportScheduler

### Admin-only (not self-service)

- Integration configuration is a low-frequency, high-impact activity
- Credential management requires trust — admin role restriction is appropriate
- Reduces UI complexity significantly

## Key Decisions

1. **Credential storage**: Extend `ImportSource.configJson` with structured credential fields (apiKey, authHeader, bearerToken, basicAuth). Store encrypted at rest. Display masked in UI. Same pattern for export destinations.

2. **Unified "Integration" model**: Rename/extend the concept beyond "ImportSource" to a single `Integration` model with `direction: 'inbound' | 'outbound' | 'bidirectional'`. Each integration has credentials, a template, field overrides, and a schedule.

3. **Template registry**: Code-maintained adapter templates define the default field mapping, auth scheme, and endpoint structure. Templates exist for:
   - **Inbound**: football-data.org, API-Football, TheSportsDB, generic REST, CSV
   - **Outbound**: XMLTV/EPG, generic REST webhook, JSON feed endpoint

4. **Field override table**: Stored in `Integration.fieldOverrides` (JSONB). Each override is:
   ```
   { sourceField: "response.match.homeTeam.name", targetField: "participants", transform?: "concat_vs" }
   ```
   UI shows a two-column table with sample data on the left, Planza fields on the right.

5. **Test Connection flow**: Button that executes a single API call (or receives a test payload for outbound), shows the raw response, and highlights which fields map to what via the current template + overrides.

6. **Outbound triggers**:
   - **Event-driven**: Hooks into existing OutboxEvent pattern. New outbox event types: `integration.push` routed to integration-specific queues.
   - **Scheduled**: Cron expressions via existing ImportScheduler pattern, extended to support export jobs.
   - **Configurable per integration**: Admin selects which entity changes trigger a push (e.g., "event status → approved", "schedule published").

7. **Export payload templates**: Outbound integrations define a response template (Handlebars or simple token replacement) that maps Planza fields to the target API's expected format.

## Scope Boundaries

### In scope (V1)
- Credential UI (create, edit, mask, test) for import sources
- Credential UI for new outbound destinations
- Template picker when adding a new integration
- Field override table with "Test Connection" preview
- Simple transforms: date format, string concat, default value, alias lookup
- Outbound push via outbox events (status changes, schedule publish)
- Scheduled batch export (cron)
- Admin-only access (Settings → Integrations)

### Out of scope (V1)
- OAuth2 flow (credential type = bearer token or API key only for V1)
- Visual drag-and-drop canvas mapper
- Self-service for non-admin users
- Pull-only API endpoints (Planza as a data provider)
- Real-time streaming (WebSocket-based live score push)
- Multi-step API chains (pagination in outbound, dependent calls)

## Open Questions

1. **Encryption**: Should credentials be encrypted at rest in PostgreSQL (pgcrypto) or application-level (node crypto)? pgcrypto is simpler but ties us to Postgres.

2. **Naming**: Rename ImportSource → Integration everywhere, or keep ImportSource for inbound and add ExportDestination for outbound? Unified model is cleaner but bigger migration.

3. **Existing adapters**: Refactor the 4 hardcoded adapters to use the template/override system, or keep them as-is and only use the new system for new integrations?

4. **Rate limiting for outbound**: Should outbound destinations have rate limit configuration like inbound sources do? (Probably yes for federation APIs with quotas.)

## Architecture Sketch

```
┌─────────────────────────────────────────────────┐
│                Settings → Integrations           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Sources  │  │ Destina- │  │  Schedules    │  │
│  │ (inbound)│  │  tions   │  │  (cron jobs)  │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
│  ┌────▼──────────────▼────┐   ┌──────▼───────┐  │
│  │  Credential Manager    │   │  Job Runner  │  │
│  │  (encrypted configJson)│   │  (import +   │  │
│  └────┬──────────────┬────┘   │   export)    │  │
│       │              │        └──────────────┘  │
│  ┌────▼────┐   ┌─────▼─────┐                    │
│  │Template │   │  Field    │                    │
│  │Registry │   │  Override │                    │
│  │(adapters│   │  Table    │                    │
│  │+ export │   │  (JSONB)  │                    │
│  │templates│   └───────────┘                    │
│  └─────────┘                                    │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Test Connection Panel                    │   │
│  │  [Sample Request] → [Raw Response] →     │   │
│  │  [Mapped Preview]                        │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
         │                          │
    ┌────▼────┐              ┌──────▼──────┐
    │ Inbound │              │  Outbound   │
    │ fetch + │              │  outbox +   │
    │ normalize│             │  push/batch │
    └─────────┘              └─────────────┘
```
