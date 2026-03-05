-- CreateTable: crew_members
CREATE TABLE "crew_members" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "roles" JSONB NOT NULL DEFAULT '[]',
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: crew_templates
CREATE TABLE "crew_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "planType" TEXT,
    "crewData" JSONB NOT NULL,
    "createdById" VARCHAR(36),
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crew_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crew_members_name_key" ON "crew_members"("name");

-- CreateIndex
CREATE UNIQUE INDEX "crew_templates_planType_createdById_key" ON "crew_templates"("planType", "createdById");

-- AddForeignKey
ALTER TABLE "crew_templates" ADD CONSTRAINT "crew_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
