-- Add on-demand channel field to Event table
-- Run with: docker exec -i sporza-db psql -U sporza -d sporza_planner < add_on_demand_channel.sql

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "onDemandChannel" TEXT;
