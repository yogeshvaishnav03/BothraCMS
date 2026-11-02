-- Create MeasurementGroup
CREATE TABLE IF NOT EXISTS "MeasurementGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeasurementGroup_pkey" PRIMARY KEY ("id")
);

-- Create MeasurementSubgroup
CREATE TABLE IF NOT EXISTS "MeasurementSubgroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ROOM',
    "description" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeasurementSubgroup_pkey" PRIMARY KEY ("id")
);

-- Create MeasurementAttachment
CREATE TABLE IF NOT EXISTS "MeasurementAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "caption" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deleteReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "replacedById" TEXT,
    "replaceReason" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeasurementAttachment_pkey" PRIMARY KEY ("id")
);

-- Create MeasurementChangeRequest
CREATE TABLE IF NOT EXISTS "MeasurementChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousData" TEXT NOT NULL,
    "proposedData" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedByName" TEXT,
    "requestedRole" TEXT,
    "reviewedBy" TEXT,
    "reviewedByName" TEXT,
    "reviewerComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeasurementChangeRequest_pkey" PRIMARY KEY ("id")
);

-- Create MeasurementHistory
CREATE TABLE IF NOT EXISTS "MeasurementHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorRole" TEXT,
    "reason" TEXT,
    "diff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeasurementHistory_pkey" PRIMARY KEY ("id")
);

-- Alter MeasurementBookEntry
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "subgroupId" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "entryName" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "measurementType" TEXT DEFAULT 'WALL';
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "formula" TEXT DEFAULT 'AREA';
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "grossQuantity" DOUBLE PRECISION DEFAULT 1.0;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deduction" DOUBLE PRECISION DEFAULT 0.0;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "measurementDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedByName" TEXT;
ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "MeasurementGroup_organizationId_projectId_partyId_key" ON "MeasurementGroup"("organizationId", "projectId", "partyId");
CREATE INDEX IF NOT EXISTS "MeasurementGroup_organizationId_idx" ON "MeasurementGroup"("organizationId");
CREATE INDEX IF NOT EXISTS "MeasurementGroup_projectId_idx" ON "MeasurementGroup"("projectId");
CREATE INDEX IF NOT EXISTS "MeasurementGroup_partyId_idx" ON "MeasurementGroup"("partyId");

CREATE INDEX IF NOT EXISTS "MeasurementSubgroup_organizationId_idx" ON "MeasurementSubgroup"("organizationId");
CREATE INDEX IF NOT EXISTS "MeasurementSubgroup_groupId_idx" ON "MeasurementSubgroup"("groupId");

CREATE INDEX IF NOT EXISTS "MeasurementAttachment_organizationId_idx" ON "MeasurementAttachment"("organizationId");
CREATE INDEX IF NOT EXISTS "MeasurementAttachment_entryId_idx" ON "MeasurementAttachment"("entryId");

CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_organizationId_idx" ON "MeasurementChangeRequest"("organizationId");
CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_entryId_idx" ON "MeasurementChangeRequest"("entryId");
CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_status_idx" ON "MeasurementChangeRequest"("status");

CREATE INDEX IF NOT EXISTS "MeasurementHistory_organizationId_idx" ON "MeasurementHistory"("organizationId");
CREATE INDEX IF NOT EXISTS "MeasurementHistory_entryId_idx" ON "MeasurementHistory"("entryId");
CREATE INDEX IF NOT EXISTS "MeasurementHistory_action_idx" ON "MeasurementHistory"("action");

CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_groupId_idx" ON "MeasurementBookEntry"("groupId");
CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_subgroupId_idx" ON "MeasurementBookEntry"("subgroupId");
CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_isDeleted_idx" ON "MeasurementBookEntry"("isDeleted");
