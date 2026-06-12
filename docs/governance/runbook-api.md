# Runbook — API Operations

## Field visibility enforcement (`FIELD_VISIBILITY_ENFORCEMENT`)

**What it does (B-1, TD-6):** when `FIELD_VISIBILITY_ENFORCEMENT=true`, FieldDefinitions with a
non-empty `visibleByRoles` are withheld from other roles: the definition disappears from
`GET /api/fields`, the values disappear from `GET /api/events`(+`/:id`) (`customValues` rows and
`customFields` keys) and from tech-plan `crew` JSONB. Admin always sees everything.
`visibleByRoles: []` = visible to all. Unknown role entries are logged (`field-visibility:` warning)
and fail closed. Contract: `docs/governance/contracts/field-visibility-filter.md`.

**Enablement procedure:**
1. Set `FIELD_VISIBILITY_ENFORCEMENT=true` in `backend/.env`, restart API.
2. Watch logs for `field-visibility: unknown role` warnings → fix offending FieldDefinitions.
3. Spot-check one restricted field per section with a non-admin login.
4. Leave on. Rollback: set to `false` (or remove) — responses return to byte-identical prior shape.

**Symptom → action:** a user reports a field "disappeared" → check the def's `visibleByRoles`
vs their role (`GET /api/fields` as admin); empty-but-was-set lists indicate the fail-closed path —
check warnings.

**Known limitation:** the admin UI has no editor for `visibleByRoles` yet (set via API);
follow-up noted in B-1-T1 inventory.

## Pagination (ADR-009)

- **Opt-in:** list endpoints return legacy plain arrays until `limit`/`offset` is passed; then
  `{ data, pagination: { total, limit, offset } }`. Max `limit` 200 (400 above).
- **Exception:** import listings (`/api/import/records/unlinked|jobs|merge-candidates|dead-letters`)
  envelope only on `offset` (their `limit` predates the envelope; legacy consumers unchanged).
- Endpoints live: `/api/events` (order `startDateBE,startTimeBE,id`), `/api/teams` (`name,id`),
  the four import listings (`createdAt desc,id`).
- `INCREMENTAL_LOADING` (frontend flag, B-4-T3): first page eager, remainder background-merged;
  off = full-list fetch as before. Future `API_DEFAULT_PAGE_LIMIT` flips server defaults — do not
  enable before the frontend flag is on everywhere.

## Observability (EPIC D)

**Metrics (D-2):** scrape `GET /metrics` on the API port — no auth (standard Prometheus posture);
disable with `METRICS_ENABLED=false` (default on; checked per request, returns 404 when off).
Exposes prom-client process defaults plus:
- `http_request_duration_seconds{method,route,status}` — latency/traffic/errors; route labels use
  the matched Express pattern (ids collapsed to `:id`).
- `bullmq_queue_depth{queue}` — waiting+active+delayed+prioritized per queue (cascade, alerts,
  standings, bracket, socketio, webhook, integration).
- `outbox_events_unprocessed` — OutboxEvent rows with no `processedAt`/`deadLetteredAt`.
- `import_dead_letters_unresolved` — ImportDeadLetter rows with no `resolvedAt`.

Gauges refresh lazily at scrape time (2s timeout per backend call); if Redis/PG are unreachable the
scrape still returns 200 and a `metrics: failed to collect …` warning is logged.

**Correlation ids (D-1):** every request gets a correlation id — incoming `x-correlation-id`
header is honored (≤128 chars), otherwise a uuid is generated — and it is echoed on the response
header. Log lines carry it as a suffix only when a context is active:

```
2026-06-12 14:03:21 [info]: POST /api/events {"ip":"::1"} [cid=8f1c2d3e-…]
```

**Tracing request → webhook:** the id travels request → `OutboxEvent.payload._meta.correlationId`
→ BullMQ job data (`_correlationId`, stripped from the payload itself) → worker logs →
`X-Correlation-Id` header on webhook deliveries. To trace an incident: grab the cid from the
client/API response header, grep API + worker logs for `cid=<id>`, and ask the webhook consumer
for the `X-Correlation-Id` they received. Jobs/events created outside a request (cron, startup
resume, schedulers) have no cid and log/deliver without the suffix/header.
