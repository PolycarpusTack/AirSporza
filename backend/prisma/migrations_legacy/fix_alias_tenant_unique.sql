-- Fix alias unique constraints to include tenantId
-- Without this, aliases from different tenants can collide

-- TeamAlias
ALTER TABLE "TeamAlias" DROP CONSTRAINT IF EXISTS "TeamAlias_sourceId_normalizedAlias_key";
ALTER TABLE "TeamAlias" ADD CONSTRAINT "TeamAlias_tenantId_sourceId_normalizedAlias_key"
  UNIQUE ("tenantId", "sourceId", "normalizedAlias");

-- CompetitionAlias
ALTER TABLE "CompetitionAlias" DROP CONSTRAINT IF EXISTS "CompetitionAlias_sourceId_normalizedAlias_key";
ALTER TABLE "CompetitionAlias" ADD CONSTRAINT "CompetitionAlias_tenantId_sourceId_normalizedAlias_key"
  UNIQUE ("tenantId", "sourceId", "normalizedAlias");

-- VenueAlias
ALTER TABLE "VenueAlias" DROP CONSTRAINT IF EXISTS "VenueAlias_sourceId_normalizedAlias_key";
ALTER TABLE "VenueAlias" ADD CONSTRAINT "VenueAlias_tenantId_sourceId_normalizedAlias_key"
  UNIQUE ("tenantId", "sourceId", "normalizedAlias");
