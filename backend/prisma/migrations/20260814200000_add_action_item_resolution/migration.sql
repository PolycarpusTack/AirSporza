-- FM1-4-T0 — ActionItemResolution: an acknowledgment overlay for fmActionItems
-- v1 (Contract Snapshot ActionItemResolution v1, Assumption AS-2 made concrete).
-- Idiom mirrors 20260723150000_add_ripple_proposal: raw SQL (ADR-004/007), RLS
-- tenant_isolation in the SAME migration (ADR-011), rollback.sql alongside.
--
-- Idempotency: resolve is idempotent by (tenantId, userId, itemKey) — the app
-- layer (FM1-4-T1) writes via upsert / ON CONFLICT DO NOTHING; the unique
-- constraint below is the DB-layer backstop. Re-resolving is a no-op, not an
-- error (no un-resolve affordance in FM-1).
--
-- Resolving does NOT filter/hide an item: it is an acknowledgment flag only.
-- An item whose underlying condition is actually fixed simply stops being
-- *derived* on a future load (FM1-3), independent of this flag.
--
-- `itemKey` is the fmActionItems v1 key format "<KIND>:<scope>:<id>[:<subscope>]"
-- (e.g. "CONFLICT:event:42") — plain TEXT, no fixed length guaranteed across
-- the five kinds (same precedent as RippleProposal.sourceChangeId).
--
-- `userId` is TEXT (not UUID) to match User.id's actual column type (User.id
-- is `String @id @default(uuid())` with no `@db.Uuid`, unlike Tenant.id).

-- CreateTable
CREATE TABLE "ActionItemResolution" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionItemResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (RLS query pathway — same convention as RippleProposal_tenantId_idx)
CREATE INDEX "ActionItemResolution_tenantId_idx" ON "ActionItemResolution"("tenantId");

-- CreateIndex (idempotency backstop: DB-level unique for the app-layer upsert)
CREATE UNIQUE INDEX "ActionItemResolution_tenantId_userId_itemKey_key" ON "ActionItemResolution"("tenantId", "userId", "itemKey");

-- AddForeignKey
ALTER TABLE "ActionItemResolution" ADD CONSTRAINT "ActionItemResolution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ON DELETE CASCADE — a resolution is a child of the acknowledging user)
ALTER TABLE "ActionItemResolution" ADD CONSTRAINT "ActionItemResolution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Byte-identical idiom to RippleProposal / TenantAccessibilityConfig / AccessibilityDeliverable.
ALTER TABLE "ActionItemResolution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActionItemResolution" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);
