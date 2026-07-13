-- RC-1-T1 — Listed-Events data model (events of major importance, besluit 28 May 2004).
-- Idiom mirrors 20260710120001_add_rights_window: raw SQL (ADR-004/007), RLS
-- tenant_isolation in the SAME migration, rollback.sql alongside.

-- CreateTable
CREATE TABLE "ListedEventCategory" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sportId" INTEGER NOT NULL,
    "fullLiveRequired" BOOLEAN NOT NULL,
    "besluitRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListedEventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListedEventCategory_tenantId_idx" ON "ListedEventCategory"("tenantId");

-- CreateIndex
CREATE INDEX "ListedEventCategory_sportId_idx" ON "ListedEventCategory"("sportId");

-- AddForeignKey
ALTER TABLE "ListedEventCategory" ADD CONSTRAINT "ListedEventCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListedEventCategory" ADD CONSTRAINT "ListedEventCategory_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Byte-identical idiom to RightsWindow / the ~48 existing tenant tables.
ALTER TABLE "ListedEventCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ListedEventCategory" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);

-- AlterTable: Event gains a nullable listed-category link. ON DELETE SET NULL — a
-- category delete must NOT delete its events, only unlink them.
ALTER TABLE "Event" ADD COLUMN "listedCategoryId" INTEGER;

-- CreateIndex
CREATE INDEX "Event_listedCategoryId_idx" ON "Event"("listedCategoryId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_listedCategoryId_fkey" FOREIGN KEY ("listedCategoryId") REFERENCES "ListedEventCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Channel gains a free-to-air flag (default false).
ALTER TABLE "Channel" ADD COLUMN "isFreeToAir" BOOLEAN NOT NULL DEFAULT false;
