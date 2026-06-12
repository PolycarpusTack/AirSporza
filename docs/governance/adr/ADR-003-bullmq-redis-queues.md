# ADR-003 — BullMQ on Redis for background job processing

**Status:** Accepted (backfilled 2026-06-12)

## Context

Outbox events (ADR-001) fan out to work that must not run on the request path: cascade
recomputation, alert generation, standings/bracket updates, Socket.IO fan-out, webhook delivery
with retries, integration pushes, plus the import pipeline. This needs durable queues, retries
with backoff, and per-job idempotency — without building a scheduler by hand.

## Decision

BullMQ over Redis (`backend/src/services/queue.ts`): factory functions `createQueue` /
`createWorker` (default concurrency 1, `maxRetriesPerRequest: null`, lazy connect) and seven
pre-defined queues — `cascade`, `alerts`, `standings`, `bracket`, `socketio`, `webhook`,
`integration`. Eight worker modules live in `backend/src/workers/` (the seven queue workers +
`outboxConsumer`), started by a **dedicated worker process** (`backend/src/worker.ts`) separate
from the API, alongside the import worker, with graceful SIGTERM/SIGINT shutdown. Dead-letter
patterns: outbox rows get `deadLetteredAt` at max retries (ADR-001); the import pipeline persists
failures to an `ImportDeadLetter` table with an operator replay endpoint
(`routes/import.ts` — `GET /dead-letters`, `POST /dead-letters/:id/replay`).

## Alternatives considered

- **pg-boss (Postgres-backed queue)** — one fewer stateful dependency, but weaker ecosystem for rate-limiting/repeatable jobs and ties queue throughput to the primary DB.
- **In-process `setInterval` jobs** — no durability, dies with the API process; already outgrown.
- **Cloud queues (SQS/Pub-Sub)** — vendor lock and network egress for a system that runs on docker-compose.

## Consequences

- Redis is a second stateful infrastructure dependency (compose service) — backup/monitoring story needed (EPIC D).
- BullMQ `jobId` dedup is the idempotency backbone the outbox relies on.
- Two processes to run and deploy (API + worker); a forgotten worker process = silently growing queues — `/metrics` golden signals (EPIC D) are the planned tripwire.
- Default concurrency 1 keeps ordering simple; raising it requires re-checking per-tenant assumptions.

**Review date:** 2026-12-12
