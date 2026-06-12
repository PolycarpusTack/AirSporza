# ADR-001 — Transactional Outbox for all async side effects

**Status:** Accepted (backfilled 2026-06-12)

## Context

API writes must trigger async side effects — socket fan-out, webhooks, cascade recomputation,
standings/bracket updates, integration pushes. Writing to Postgres and enqueueing to Redis in the
same request handler is a dual-write: if either side fails, state and notifications diverge
(lost webhooks, ghost cascades). A multi-tenant scheduling product cannot tolerate silently
dropped events.

## Decision

Every side-effect-producing write also inserts an `OutboxEvent` row **inside the same Prisma
transaction** (`backend/src/services/outbox.ts` — `writeOutboxEvent(tx, …)` takes the transaction
client; there is no non-transactional path). A polling consumer
(`backend/src/workers/outboxConsumer.ts`, 1–5 s interval) reserves batches of 50 with
`FOR UPDATE SKIP LOCKED`, priority-ordered (URGENT→LOW), and fans each event out to BullMQ queues
per a static `EVENT_ROUTING` map (~20 event types → 7 queues). Enqueueing happens *outside* the PG
lock; idempotency is guaranteed by BullMQ `jobId = ${idempotencyKey}:${queueName}`. Failures
increment `retryCount`; at `maxRetries` the row is dead-lettered (`deadLetteredAt`).

## Alternatives considered

- **Direct enqueue from request handlers** — simplest, but the dual-write problem this ADR exists to kill.
- **Postgres LISTEN/NOTIFY as the sole trigger** — a notify trigger exists (`add_outbox_notify_trigger.sql`) but notifications are lossy across restarts; polling remains the source of truth.
- **CDC (Debezium/logical replication)** — guaranteed capture, but heavy operational footprint for a solo-run system.

## Consequences

- At-least-once delivery: **every consumer must be idempotent** (jobId dedup covers the select-commit→mark-processed race window between consumer replicas).
- Event latency is bounded by the poll interval (5 s in `worker.ts`), acceptable for scheduling workflows.
- Holding no PG lock across Redis I/O keeps tail latency flat under queue backpressure (documented in the consumer).
- The outbox table grows; processed-row cleanup is an eventual operational task.
- New event types require touching the `EVENT_ROUTING` map — a deliberate single choke point.

**Review date:** 2026-12-12
