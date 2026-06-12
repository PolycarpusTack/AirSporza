CREATE TABLE "SavedView" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "context"     TEXT NOT NULL,
  "filterState" JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "SavedView_userId_name_idx" ON "SavedView"("userId", "name");
