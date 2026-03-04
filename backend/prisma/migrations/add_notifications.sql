CREATE TABLE "Notification" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT,
  "entityType"  TEXT,
  "entityId"    TEXT,
  "isRead"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
