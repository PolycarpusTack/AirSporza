CREATE TABLE "Resource" (
  "id"        SERIAL PRIMARY KEY,
  "name"      TEXT NOT NULL UNIQUE,
  "type"      TEXT NOT NULL,
  "capacity"  INT NOT NULL DEFAULT 1,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "notes"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "ResourceAssignment" (
  "id"          SERIAL PRIMARY KEY,
  "resourceId"  INT NOT NULL REFERENCES "Resource"("id") ON DELETE CASCADE,
  "techPlanId"  INT NOT NULL REFERENCES "TechPlan"("id") ON DELETE CASCADE,
  "quantity"    INT NOT NULL DEFAULT 1,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("resourceId", "techPlanId")
);
CREATE INDEX "ResourceAssignment_techPlanId_idx" ON "ResourceAssignment"("techPlanId");
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");
