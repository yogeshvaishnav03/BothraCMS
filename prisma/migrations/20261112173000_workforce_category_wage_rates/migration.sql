-- Add separate daily wage rates for Skilled Workers, Laborers & Helpers (Male), and Laborers & Helpers (Female)
ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "maleHelperWageRate" DOUBLE PRECISION;
ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "femaleHelperWageRate" DOUBLE PRECISION;
