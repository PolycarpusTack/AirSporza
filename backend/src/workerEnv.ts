/**
 * MUST be the first import of the worker entrypoint (ESM evaluates imports in
 * order). The worker process spans all tenants (outbox consumer, schedulers,
 * cascade) and therefore connects as the owner role even when the API runs as
 * the RLS-bound `planza_app` (ADR-011).
 */
import 'dotenv/config'

process.env.PLANZA_DB_ROLE = 'owner'
