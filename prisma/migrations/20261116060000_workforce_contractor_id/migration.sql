-- AlterTable
ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkforceMember_contractorId_idx" ON "WorkforceMember"("organizationId", "contractorId");
