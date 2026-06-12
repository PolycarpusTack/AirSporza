-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "canonicalTeamId" TEXT,
ADD COLUMN     "isManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sportId" INTEGER;

-- CreateTable
CREATE TABLE "TeamCompetition" (
    "id" SERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "teamId" INTEGER NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamCompetition_tenantId_competitionId_idx" ON "TeamCompetition"("tenantId", "competitionId");

-- CreateIndex
CREATE INDEX "TeamCompetition_teamId_idx" ON "TeamCompetition"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCompetition_teamId_competitionId_seasonId_key" ON "TeamCompetition"("teamId", "competitionId", "seasonId");

-- CreateIndex
CREATE INDEX "Team_tenantId_sportId_idx" ON "Team"("tenantId", "sportId");

-- CreateIndex
CREATE INDEX "Team_canonicalTeamId_idx" ON "Team"("canonicalTeamId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_canonicalTeamId_fkey" FOREIGN KEY ("canonicalTeamId") REFERENCES "CanonicalTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCompetition" ADD CONSTRAINT "TeamCompetition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

