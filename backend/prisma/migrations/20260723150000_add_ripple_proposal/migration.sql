-- SV-2-T1 — RippleProposal (ADR-019 §1): a reviewable, idempotent slot-change-set
-- capturing a proposed change to an event's linked BroadcastSlots (the G8 fix:
-- feed-driven schedule changes propose instead of silently staling slots).
-- Idiom mirrors 20260723120000_add_tenant_accessibility_config: raw SQL
-- (ADR-004/007), RLS tenant_isolation in the SAME migration (ADR-011),
-- rollback.sql alongside. Both enums are NEW types (no ALTER TYPE ADD VALUE),
-- so they are safe within this single migration tx.
--
-- Idempotency (ADR-019 §4, Open assumption 3 DECIDED here): `sourceChangeId` is a
-- CHANGE-FINGERPRINT — `feed:<eventId>:<sha256/32 over {eventId, sourceId,
-- sourceRecordId, normalized after-values of the 5 shouldSync trigger fields}>`
-- (composed in src/services/ripple/capturePayloads.ts, pinned by
-- ripple-capturePayloads.test.ts).
-- Tradeoff vs import-job-id+event-id composition: no job id is threaded to the
-- provision.ts capture seam, and a job-id key would make every later job carrying
-- an IDENTICAL change supersede an identical PENDING proposal (review-queue
-- noise). The fingerprint dedupes identical changes across jobs; accepted
-- limitation: a REJECTED proposal suppresses re-proposal of the byte-identical
-- change until a different change intervenes (treated as "already reviewed").
--
-- Unique is (tenantId, sourceChangeId): the same feed record imported under two
-- tenants produces the same sourceChangeId but two independent proposals (RD-2
-- idempotent-echo lesson — no cross-tenant dedupe, no leak).
--
-- `confidence` stays NULL in v1 — no feed-confidence source is wired; sourcing is
-- decided in-flight if/when one exists (stated, not silent).

-- CreateEnum (CASCADE/MANUAL exist for SV-3+; SV-2 must NEVER produce them —
-- pinned by negative tests: MANUAL auto-syncs via eventSlotBridge, CASCADE
-- auto-writes estimated* only, per ADR-019 §2.)
CREATE TYPE "RippleSource" AS ENUM ('FEED', 'CASCADE', 'MANUAL');

-- CreateEnum
CREATE TYPE "RippleStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "RippleProposal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventId" INTEGER NOT NULL,
    "source" "RippleSource" NOT NULL,
    "sourceChangeId" TEXT NOT NULL,
    "status" "RippleStatus" NOT NULL DEFAULT 'PENDING',
    "beforeSlots" JSONB NOT NULL,
    -- NOT an after-state mirror of beforeSlots: the review ENVELOPE
    -- { proposed[], manualReviewSlots[], rights } (Contract Snapshot ripple v1).
    "preview" JSONB NOT NULL,
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" UUID,
    "rationale" TEXT,

    CONSTRAINT "RippleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent create: retrying the same feed change echoes the same row)
CREATE UNIQUE INDEX "RippleProposal_tenantId_sourceChangeId_key" ON "RippleProposal"("tenantId", "sourceChangeId");

-- CreateIndex
CREATE INDEX "RippleProposal_tenantId_idx" ON "RippleProposal"("tenantId");

-- CreateIndex
CREATE INDEX "RippleProposal_eventId_idx" ON "RippleProposal"("eventId");

-- CreateIndex (review-queue list + the supersession lookup: PENDING per tenant)
CREATE INDEX "RippleProposal_tenantId_status_idx" ON "RippleProposal"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "RippleProposal" ADD CONSTRAINT "RippleProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ON DELETE CASCADE — a proposal is a child of its event, ADR-019 §1)
ALTER TABLE "RippleProposal" ADD CONSTRAINT "RippleProposal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Byte-identical idiom to TenantAccessibilityConfig / AccessibilityDeliverable.
ALTER TABLE "RippleProposal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RippleProposal" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);
