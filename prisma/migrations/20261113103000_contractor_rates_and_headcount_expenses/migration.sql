-- Migration: Contractor Rates Automation & Direct Labour Cost Management
-- Add Contractor Labour Rate Card to Party (in paise per day/shift)
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "dailyWageRate" DOUBLE PRECISION;
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "maleHelperWageRate" DOUBLE PRECISION;
ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "femaleHelperWageRate" DOUBLE PRECISION;

-- Add Rate Snapshots, Cost Breakdown & Source to WorkforceHeadcount
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "projectName" TEXT;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'CONTRACTOR';
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "skilledRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "skilledAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "maleRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "maleAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "femaleRate" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "femaleAmount" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "totalExpense" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "rateUnit" TEXT DEFAULT 'DAY';
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN DEFAULT false;
ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "WorkforceHeadcount_contractorName_idx" ON "WorkforceHeadcount"("contractorName");
CREATE INDEX IF NOT EXISTS "WorkforceHeadcount_source_idx" ON "WorkforceHeadcount"("source");
