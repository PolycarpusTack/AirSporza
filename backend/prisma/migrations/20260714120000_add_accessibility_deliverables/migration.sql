-- RC-2-T1 — Accessibility deliverables (subtitling T888 / audio description / VGT).
-- Idiom mirrors 20260713120000_add_listed_events: raw SQL (ADR-004/007), RLS
-- tenant_isolation in the SAME migration, rollback.sql alongside. Both enums are NEW
-- types (no ALTER TYPE ADD VALUE), so they are safe within this single migration tx.

-- CreateEnum
CREATE TYPE "AccessibilityType" AS ENUM ('T888', 'AUDIO_DESCRIPTION', 'VGT');

-- CreateEnum
CREATE TYPE "AccessibilityStatus" AS ENUM ('NOT_REQUIRED', 'REQUIRED', 'PLANNED', 'CONFIRMED', 'DELIVERED');

-- CreateTable
CREATE TABLE "AccessibilityDeliverable" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventId" INTEGER NOT NULL,
    "type" "AccessibilityType" NOT NULL,
    "status" "AccessibilityStatus" NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessibilityDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (one deliverable row per type per event)
CREATE UNIQUE INDEX "AccessibilityDeliverable_eventId_type_key" ON "AccessibilityDeliverable"("eventId", "type");

-- CreateIndex
CREATE INDEX "AccessibilityDeliverable_tenantId_idx" ON "AccessibilityDeliverable"("tenantId");

-- CreateIndex
CREATE INDEX "AccessibilityDeliverable_eventId_idx" ON "AccessibilityDeliverable"("eventId");

-- AddForeignKey
ALTER TABLE "AccessibilityDeliverable" ADD CONSTRAINT "AccessibilityDeliverable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (ON DELETE CASCADE — a deliverable belongs to its event)
ALTER TABLE "AccessibilityDeliverable" ADD CONSTRAINT "AccessibilityDeliverable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant_isolation ships in the SAME migration as the table (ADR-011 gate).
-- Byte-identical idiom to ListedEventCategory / RightsWindow / the existing tenant tables.
ALTER TABLE "AccessibilityDeliverable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AccessibilityDeliverable" USING ("tenantId" = (current_setting('app.tenant_id', true))::uuid);
