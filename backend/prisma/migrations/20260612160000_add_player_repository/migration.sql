-- CreateTable
CREATE TABLE "CanonicalPlayer" (
    "id" TEXT NOT NULL,
    "primaryName" TEXT NOT NULL,
    "countryCode" TEXT,
    "sportId" INTEGER NOT NULL,
    "birthDate" DATE,
    "photoUrl" TEXT,
    "primarySourceId" TEXT,
    "tenantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAlias" (
    "id" TEXT NOT NULL,
    "canonicalPlayerId" TEXT NOT NULL,
    "sourceId" TEXT,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "PlayerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "sportId" INTEGER NOT NULL,
    "canonicalPlayerId" TEXT,
    "fullName" TEXT NOT NULL,
    "shortName" TEXT,
    "countryCode" TEXT,
    "position" TEXT,
    "jerseyNumber" INTEGER,
    "birthDate" DATE,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "isManaged" BOOLEAN NOT NULL DEFAULT false,
    "externalRefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTeam" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "competitionId" INTEGER,
    "seasonId" INTEGER,
    "fromDate" DATE,
    "toDate" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanonicalPlayer_tenantId_idx" ON "CanonicalPlayer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalPlayer_sportId_primaryName_key" ON "CanonicalPlayer"("sportId", "primaryName");

-- CreateIndex
CREATE INDEX "PlayerAlias_normalizedAlias_idx" ON "PlayerAlias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "PlayerAlias_tenantId_idx" ON "PlayerAlias"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAlias_tenantId_sourceId_normalizedAlias_key" ON "PlayerAlias"("tenantId", "sourceId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "Player_tenantId_sportId_idx" ON "Player"("tenantId", "sportId");

-- CreateIndex
CREATE INDEX "Player_canonicalPlayerId_idx" ON "Player"("canonicalPlayerId");

-- CreateIndex
CREATE INDEX "Player_tenantId_idx" ON "Player"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_tenantId_sportId_fullName_birthDate_key" ON "Player"("tenantId", "sportId", "fullName", "birthDate");

-- CreateIndex
CREATE INDEX "PlayerTeam_tenantId_teamId_idx" ON "PlayerTeam"("tenantId", "teamId");

-- CreateIndex
CREATE INDEX "PlayerTeam_tenantId_competitionId_idx" ON "PlayerTeam"("tenantId", "competitionId");

-- CreateIndex
CREATE INDEX "PlayerTeam_playerId_idx" ON "PlayerTeam"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTeam_playerId_teamId_seasonId_key" ON "PlayerTeam"("playerId", "teamId", "seasonId");

-- AddForeignKey
ALTER TABLE "CanonicalPlayer" ADD CONSTRAINT "CanonicalPlayer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalPlayer" ADD CONSTRAINT "CanonicalPlayer_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalPlayer" ADD CONSTRAINT "CanonicalPlayer_primarySourceId_fkey" FOREIGN KEY ("primarySourceId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAlias" ADD CONSTRAINT "PlayerAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAlias" ADD CONSTRAINT "PlayerAlias_canonicalPlayerId_fkey" FOREIGN KEY ("canonicalPlayerId") REFERENCES "CanonicalPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAlias" ADD CONSTRAINT "PlayerAlias_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ImportSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_canonicalPlayerId_fkey" FOREIGN KEY ("canonicalPlayerId") REFERENCES "CanonicalPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTeam" ADD CONSTRAINT "PlayerTeam_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

