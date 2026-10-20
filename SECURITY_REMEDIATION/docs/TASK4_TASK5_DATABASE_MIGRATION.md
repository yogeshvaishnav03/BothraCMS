# Tasks 4 & 5: Database Persistence Migration

**Scope:** Convert Measurement Book and Workforce Headcount from JSON files to PostgreSQL  
**Impact:** Eliminates data loss on pod restart, enables transactional safety, prevents concurrent corruption  
**Effort:** 4-6 hours of implementation + testing

---

## TASK 4: Measurement Book → PostgreSQL

### Current Problem
```typescript
// src/services/measurement-book-service.ts
const STORAGE_FILE = path.resolve(process.cwd(), "storage", "data", "measurement-book.json");

function saveEntry(entry: MeasurementEntry) {
  const all = loadAllEntries();  // Load entire file
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  writeAtomic(all);  // Rewrite entire file
}
```

**Issues:**
- ❌ Entire file read/write on every operation (O(n) performance)
- ❌ Race condition if multiple requests hit same entry
- ❌ Atomic write doesn't prevent torn reads if process crashes mid-write
- ❌ No multi-record transaction (e.g., createEntry + auditLog must both succeed)
- ❌ Data lost on pod restart (ephemeral filesystem)

### Prisma Model Design

```prisma
model MeasurementBookEntry {
  id                String   @id @default(uuid())
  organizationId    String
  projectId         String
  partyId           String   // Subcontractor
  itemDescription   String
  unit              String   // SQM, CUM, RMT, NOS, TONNE
  count             Int
  length            Float
  breadth           Float?
  depth             Float?
  quantity          Float    // Calculated: count * length * breadth * depth
  unitRate          Int      // paise
  totalAmount       Int      // paise: quantity * unitRate
  
  status            String   @default("SUBMITTED") // DRAFT, SUBMITTED, VERIFIED, APPROVED, REJECTED, BILLED
  billId            String?  // Foreign key to Bill after conversion
  notes             String?
  
  createdBy         String   // userId
  createdByName     String?
  approvedBy        String?  // userId if APPROVED
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Relationships
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project           Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  party             Party         @relation(fields: [partyId], references: [id], onDelete: Cascade)
  bill              Bill?         @relation("MeasurementToBill", fields: [billId], references: [id])

  // Indexes for query performance
  @@index([organizationId])
  @@index([projectId])
  @@index([partyId])
  @@index([status])
  @@index([billId])
  @@index([createdAt])
}

// Update Bill model to reference Measurement Book
model Bill {
  // ... existing fields ...
  measurements      MeasurementBookEntry[] @relation("MeasurementToBill")
}
```

### Migration File

Create `prisma/migrations/{timestamp}_add_measurement_book_entries/migration.sql`:

```sql
-- Create MeasurementBookEntry table
CREATE TABLE "MeasurementBookEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "itemDescription" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "length" REAL NOT NULL,
  "breadth" REAL,
  "depth" REAL,
  "quantity" REAL NOT NULL,
  "unitRate" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "billId" TEXT,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdByName" TEXT,
  "approvedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  
  CONSTRAINT "MeasurementBookEntry_organizationId_fkey" 
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "MeasurementBookEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE,
  CONSTRAINT "MeasurementBookEntry_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE,
  CONSTRAINT "MeasurementBookEntry_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "Bill" ("id")
);

-- Create indexes
CREATE INDEX "MeasurementBookEntry_organizationId_idx" ON "MeasurementBookEntry"("organizationId");
CREATE INDEX "MeasurementBookEntry_projectId_idx" ON "MeasurementBookEntry"("projectId");
CREATE INDEX "MeasurementBookEntry_partyId_idx" ON "MeasurementBookEntry"("partyId");
CREATE INDEX "MeasurementBookEntry_status_idx" ON "MeasurementBookEntry"("status");
CREATE INDEX "MeasurementBookEntry_billId_idx" ON "MeasurementBookEntry"("billId");
CREATE INDEX "MeasurementBookEntry_createdAt_idx" ON "MeasurementBookEntry"("createdAt");

-- Update Bill table to add foreign key for measurements
ALTER TABLE "Bill" ADD COLUMN "measurementIds" TEXT;
```

### Service Implementation

Replace `src/services/measurement-book-service.ts`:

```typescript
import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { FinanceService } from "./finance-service";
import { roundQuantity, roundPaise } from "@/lib/financial-math";

export interface MeasurementEntry {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  itemDescription: string;
  unit: string;
  count: number;
  length: number;
  breadth?: number;
  depth?: number;
  quantity: number;
  unitRate: number;
  totalAmount: number;
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "REJECTED" | "BILLED";
  billId?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export class MeasurementBookService {
  /**
   * Create a new Measurement Book record
   * Uses database transaction for atomicity
   */
  static async createEntry(input: {
    organizationId: string;
    projectId: string;
    partyId: string;
    itemDescription: string;
    unit: string;
    count?: number;
    length?: number;
    breadth?: number;
    depth?: number;
    agreedRate: number;
    notes?: string;
    userId: string;
    role: Role;
  }): Promise<MeasurementEntry> {
    assertPermission(input.role, "projects:write");

    return await prisma.$transaction(async (tx) => {
      // Verify project belongs to organization
      const project = await tx.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) throw new Error("NotFound: Project not found or outside organization scope");

      // Verify subcontractor party belongs to organization
      const party = await tx.party.findFirst({
        where: { id: input.partyId, organizationId: input.organizationId },
      });
      if (!party) throw new Error("NotFound: Subcontractor party not found or outside organization scope");

      // Calculate quantity
      const count = Math.max(1, input.count || 1);
      const length = Math.max(1, input.length || 1);
      const breadth = Math.max(1, input.breadth || 1);
      const depth = Math.max(1, input.depth || 1);
      const quantity = roundQuantity(count * length * breadth * depth, 4);
      const totalAmount = roundPaise(quantity * input.agreedRate);

      // Create entry in database
      const entry = await tx.measurementBookEntry.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          partyId: input.partyId,
          itemDescription: input.itemDescription,
          unit: input.unit.toUpperCase(),
          count,
          length,
          breadth: input.breadth,
          depth: input.depth,
          quantity,
          unitRate: input.agreedRate,
          totalAmount,
          status: "SUBMITTED",
          notes: input.notes,
          createdBy: input.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create audit log in same transaction
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "MB_ENTRY_CREATED",
          entityType: "MEASUREMENT_BOOK",
          entityId: entry.id,
          afterJson: JSON.stringify(entry),
        },
      });

      return this.mapToInterface(entry);
    });
  }

  /**
   * Update status with transaction safety
   */
  static async updateStatus(input: {
    organizationId: string;
    entryId: string;
    status: "VERIFIED" | "APPROVED" | "REJECTED";
    notes?: string;
    userId: string;
    role: Role;
  }): Promise<MeasurementEntry> {
    if (input.status === "APPROVED") {
      assertPermission(input.role, "finance:write");
    } else {
      assertPermission(input.role, "projects:write");
    }

    return await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId },
      });
      if (!entry) throw new Error("NotFound: Measurement book entry not found");

      const oldStatus = entry.status;

      // Update entry
      const updated = await tx.measurementBookEntry.update({
        where: { id: entry.id },
        data: {
          status: input.status,
          approvedBy: input.status === "APPROVED" ? input.userId : entry.approvedBy,
          notes: input.notes
            ? `${entry.notes || ""}; ${input.notes}`.trim()
            : entry.notes,
          updatedAt: new Date(),
        },
      });

      // Create audit log
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "MB_STATUS_CHANGED",
          entityType: "MEASUREMENT_BOOK",
          entityId: entry.id,
          reason: `Status transition from ${oldStatus} to ${input.status}`,
          afterJson: JSON.stringify(updated),
        },
      });

      return this.mapToInterface(updated);
    });
  }

  /**
   * Convert APPROVED entry to Bill
   */
  static async convertToBill(input: {
    organizationId: string;
    entryId: string;
    billNumber: string;
    userId: string;
    role: Role;
  }) {
    assertPermission(input.role, "finance:write");

    return await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId },
      });
      if (!entry) throw new Error("NotFound: Measurement book entry not found");

      // Prevent duplicate billing
      if (entry.status === "BILLED" || entry.billId) {
        throw new Error(
          `Measurement book entry #${entry.id} has already been converted to Bill #${entry.billId}.`
        );
      }

      if (entry.status !== "APPROVED") {
        throw new Error(
          `Cannot bill unapproved entry. Current status: ${entry.status}.`
        );
      }

      // Create bill via FinanceService (which uses its own transaction)
      const bill = await FinanceService.createBill({
        organizationId: input.organizationId,
        partyId: entry.partyId,
        projectId: entry.projectId,
        billNumber: input.billNumber,
        billDate: new Date(),
        lines: [{
          description: `[MB] ${entry.itemDescription} (${entry.quantity} ${entry.unit})`,
          quantity: entry.quantity,
          unitRate: entry.unitRate,
          lineTotal: entry.totalAmount,
        }],
        notes: `From Measurement Book entry: ${entry.id}`,
        userId: input.userId,
        role: input.role,
      });

      // Update entry to mark as billed
      const updated = await tx.measurementBookEntry.update({
        where: { id: entry.id },
        data: {
          status: "BILLED",
          billId: bill.id,
          updatedAt: new Date(),
        },
      });

      // Audit log
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "MB_CONVERTED_TO_BILL",
          entityType: "MEASUREMENT_BOOK",
          entityId: entry.id,
          afterJson: JSON.stringify({ billId: bill.id }),
        },
      });

      return { entry: this.mapToInterface(updated), bill };
    });
  }

  /**
   * List entries scoped to organization
   */
  static async listEntries(
    organizationId: string,
    filters?: { projectId?: string; partyId?: string; status?: string }
  ): Promise<MeasurementEntry[]> {
    const entries = await prisma.measurementBookEntry.findMany({
      where: {
        organizationId,
        ...(filters?.projectId && { projectId: filters.projectId }),
        ...(filters?.partyId && { partyId: filters.partyId }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: { createdAt: "desc" },
    });

    return entries.map(e => this.mapToInterface(e));
  }

  private static mapToInterface(entry: any): MeasurementEntry {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      projectId: entry.projectId,
      partyId: entry.partyId,
      itemDescription: entry.itemDescription,
      unit: entry.unit,
      count: entry.count,
      length: entry.length,
      breadth: entry.breadth,
      depth: entry.depth,
      quantity: entry.quantity,
      unitRate: entry.unitRate,
      totalAmount: entry.totalAmount,
      status: entry.status,
      billId: entry.billId,
      notes: entry.notes,
      createdBy: entry.createdBy,
      createdByName: entry.createdByName,
      approvedBy: entry.approvedBy,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
```

### Import Script from JSON

Create `scripts/migrate-measurement-book.ts`:

```typescript
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";

const STORAGE_FILE = path.resolve(process.cwd(), "storage", "data", "measurement-book.json");

interface LegacyEntry {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  itemDescription: string;
  unit: string;
  count: number;
  length: number;
  breadth?: number;
  depth?: number;
  quantity: number;
  unitRate: number;
  totalAmount: number;
  status: string;
  billId?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

async function migrateData() {
  console.log("Starting Measurement Book migration from JSON to PostgreSQL...");

  // Load legacy data
  let legacyEntries: LegacyEntry[] = [];
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    legacyEntries = JSON.parse(raw);
    console.log(`Loaded ${legacyEntries.length} entries from JSON file`);
  }

  // Migrate to database
  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const entry of legacyEntries) {
    try {
      // Check for duplicate
      const exists = await prisma.measurementBookEntry.findUnique({
        where: { id: entry.id },
      });

      if (exists) {
        console.warn(`Skipping duplicate: ${entry.id}`);
        duplicates++;
        continue;
      }

      // Import entry
      await prisma.measurementBookEntry.create({
        data: {
          id: entry.id,
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          partyId: entry.partyId,
          itemDescription: entry.itemDescription,
          unit: entry.unit,
          count: entry.count,
          length: entry.length,
          breadth: entry.breadth,
          depth: entry.depth,
          quantity: entry.quantity,
          unitRate: entry.unitRate,
          totalAmount: entry.totalAmount,
          status: entry.status || "SUBMITTED",
          billId: entry.billId,
          notes: entry.notes,
          createdBy: entry.createdBy,
          createdByName: entry.createdByName,
          approvedBy: entry.approvedBy,
          createdAt: new Date(entry.createdAt),
          updatedAt: new Date(entry.updatedAt),
        },
      });

      imported++;
    } catch (err) {
      console.error(`Error importing entry ${entry.id}:`, err);
      errors++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Duplicates: ${duplicates}`);
  console.log(`  Errors: ${errors}`);

  // Keep JSON file as backup
  const backupPath = `${STORAGE_FILE}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(STORAGE_FILE, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  console.log("\nNext step: Delete storage/data/measurement-book.json after verifying migration");
}

migrateData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
```

---

## TASK 5: Workforce Headcount → PostgreSQL

### Current Problem
```typescript
// src/services/workforce-headcount-service.ts

// In-memory fallback (CRITICAL BUG)
const g = globalThis as any;
if (!g.__WORKFORCE_HEADCOUNT__) {
  g.__WORKFORCE_HEADCOUNT__ = [];  // Lost on pod restart!
}

// Silent fallback (CRITICAL BUG)
function saveAllRecords(records: WorkforceHeadcountRecord[]) {
  g.__WORKFORCE_HEADCOUNT__ = records;  // Always updates memory
  try {
    fs.writeFileSync(STORAGE_FILE, jsonStr, "utf-8");
  } catch (err) {
    console.warn("Notice: Saved to in-memory store...");  // Silently falls back!
  }
}

// Non-deterministic data merge (BUG)
listRecords() {
  const recordsMap = new Map();
  
  // Merge from 3 sources: IdempotencyRecord, AuditEvent, JSON file
  // No clear source of truth!
  // Can result in duplicates or inconsistent data
}
```

**Issues:**
- ❌ In-memory fallback loses all data on pod restart
- ❌ Silent fallback hides write failures  
- ❌ Non-deterministic merge from 3 sources (IdempotencyRecord, AuditEvent, file)
- ❌ No uniqueness constraint (can have duplicate records for same site/date/shift)
- ❌ No correction/history trail for changes

### Prisma Model Design

```prisma
model WorkforceHeadcount {
  id               String   @id @default(uuid())
  organizationId   String
  siteId           String
  siteName         String
  date             String   // YYYY-MM-DD
  shift            String   @default("GENERAL") // GENERAL, DAY, NIGHT
  
  // Headcount by category
  artisanCount     Int
  craftsmanCount   Int
  laborerMale      Int
  laborerFemale    Int
  laborerTotal     Int
  
  grandTotal       Int      // Sum of all categories
  
  // Metadata
  contractorName   String?
  notes            String?
  supervisorId     String
  supervisorName   String
  
  // Change tracking
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  createdById      String   // Who entered the record
  correctedById    String?  // Who corrected it
  
  // Correction reference
  correctionOf     String?  // ID of previous record if this is a correction
  isCorrected      Boolean  @default(false)  // True if another record corrected this
  
  // Relationships
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  site             Site         @relation(fields: [siteId], references: [id], onDelete: Cascade)
  corrections      WorkforceHeadcount[] @relation("CorrectionReference", fields: [correctionOf], references: [id])
  correctedBy      WorkforceHeadcount[] @relation("CorrectionReference")
  
  // CRITICAL: Uniqueness constraint prevents duplicates
  // Only one record per org/site/date/shift (unless marked as correction)
  @@unique([organizationId, siteId, date, shift], where: { isCorrected: false })
  @@index([organizationId])
  @@index([siteId])
  @@index([date])
  @@index([supervisorId])
  @@index([createdById])
}

// Update Site model
model Site {
  // ... existing fields ...
  workforceHeadcounts WorkforceHeadcount[]
}
```

### Migration File

Create `prisma/migrations/{timestamp}_add_workforce_headcount/migration.sql`:

```sql
CREATE TABLE "WorkforceHeadcount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "siteName" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "shift" TEXT NOT NULL DEFAULT 'GENERAL',
  "artisanCount" INTEGER NOT NULL,
  "craftsmanCount" INTEGER NOT NULL,
  "laborerMale" INTEGER NOT NULL,
  "laborerFemale" INTEGER NOT NULL,
  "laborerTotal" INTEGER NOT NULL,
  "grandTotal" INTEGER NOT NULL,
  "contractorName" TEXT,
  "notes" TEXT,
  "supervisorId" TEXT NOT NULL,
  "supervisorName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "createdById" TEXT NOT NULL,
  "correctedById" TEXT,
  "correctionOf" TEXT,
  "isCorrected" BOOLEAN NOT NULL DEFAULT false,
  
  CONSTRAINT "WorkforceHeadcount_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "WorkforceHeadcount_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE,
  CONSTRAINT "WorkforceHeadcount_correctionOf_fkey"
    FOREIGN KEY ("correctionOf") REFERENCES "WorkforceHeadcount" ("id")
);

-- CRITICAL: Uniqueness constraint to prevent duplicates
-- Only one "active" record (isCorrected=false) per org/site/date/shift
CREATE UNIQUE INDEX "WorkforceHeadcount_unique_active"
  ON "WorkforceHeadcount"(
    "organizationId", "siteId", "date", "shift"
  ) WHERE "isCorrected" = false;

CREATE INDEX "WorkforceHeadcount_organizationId_idx" ON "WorkforceHeadcount"("organizationId");
CREATE INDEX "WorkforceHeadcount_siteId_idx" ON "WorkforceHeadcount"("siteId");
CREATE INDEX "WorkforceHeadcount_date_idx" ON "WorkforceHeadcount"("date");
CREATE INDEX "WorkforceHeadcount_supervisorId_idx" ON "WorkforceHeadcount"("supervisorId");
CREATE INDEX "WorkforceHeadcount_createdById_idx" ON "WorkforceHeadcount"("createdById");
```

### Service Implementation

Replace `src/services/workforce-headcount-service.ts`:

```typescript
import { prisma } from "@/lib/db";
import { Role } from "@/lib/permissions";

export interface WorkforceHeadcountRecord {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  date: string;
  shift: "GENERAL" | "DAY" | "NIGHT";
  artisanCount: number;
  craftsmanCount: number;
  laborerMale: number;
  laborerFemale: number;
  laborerTotal: number;
  grandTotal: number;
  contractorName?: string;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  createdAt: string;
  updatedAt: string;
}

export class WorkforceHeadcountService {
  /**
   * List headcount records for organization
   * Source of truth: PostgreSQL only
   */
  static async listRecords(
    organizationId: string,
    filter?: { siteId?: string; date?: string; startDate?: string; endDate?: string }
  ): Promise<WorkforceHeadcountRecord[]> {
    const records = await prisma.workforceHeadcount.findMany({
      where: {
        organizationId,
        ...(filter?.siteId && { siteId: filter.siteId }),
        ...(filter?.date && { date: filter.date }),
        ...(filter?.startDate && { date: { gte: filter.startDate } }),
        ...(filter?.endDate && { date: { lte: filter.endDate } }),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    return records.map(r => this.mapToInterface(r));
  }

  /**
   * Save or update workforce headcount
   * Uses uniqueness constraint to prevent duplicates
   * Correction trail for changes
   */
  static async saveRecord(
    organizationId: string,
    input: {
      siteId: string;
      date: string;
      shift?: "GENERAL" | "DAY" | "NIGHT";
      artisanCount?: number;
      craftsmanCount?: number;
      laborerMale: number;
      laborerFemale: number;
      contractorName?: string;
      notes?: string;
    },
    user: { userId: string; name: string; role: Role }
  ): Promise<WorkforceHeadcountRecord> {
    if (!input.siteId) {
      throw new Error("Target site is required");
    }

    const shift = input.shift || "GENERAL";
    const date = input.date || new Date().toISOString().split("T")[0];

    // Resolve site name
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId },
    });
    if (!site) throw new Error("NotFound: Site not found");

    const artisanCount = Math.max(0, Math.floor(input.artisanCount || 0));
    const craftsmanCount = Math.max(0, Math.floor(input.craftsmanCount || 0));
    const laborerMale = Math.max(0, Math.floor(input.laborerMale));
    const laborerFemale = Math.max(0, Math.floor(input.laborerFemale));
    const laborerTotal = laborerMale + laborerFemale;
    const grandTotal = artisanCount + craftsmanCount + laborerTotal;

    return await prisma.$transaction(async (tx) => {
      // Check for existing record for this org/site/date/shift
      const existing = await tx.workforceHeadcount.findFirst({
        where: {
          organizationId,
          siteId: input.siteId,
          date,
          shift,
          isCorrected: false,
        },
      });

      if (existing) {
        // Mark old record as corrected
        await tx.workforceHeadcount.update({
          where: { id: existing.id },
          data: { isCorrected: true },
        });
      }

      // Create new record (or correction)
      const record = await tx.workforceHeadcount.create({
        data: {
          organizationId,
          siteId: input.siteId,
          siteName: site.name,
          date,
          shift,
          artisanCount,
          craftsmanCount,
          laborerMale,
          laborerFemale,
          laborerTotal,
          grandTotal,
          contractorName: input.contractorName,
          notes: input.notes,
          supervisorId: user.userId,
          supervisorName: user.name,
          createdById: user.userId,
          correctionOf: existing?.id,
        },
      });

      // Audit log
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.userId,
          action: "WORKFORCE_COUNT_LOGGED",
          entityType: "SITE_WORKFORCE",
          entityId: input.siteId,
          reason: `Headcount recorded for ${date} shift ${shift}`,
          afterJson: JSON.stringify(record),
        },
      });

      return this.mapToInterface(record);
    });
  }

  /**
   * Get correction history for a site/date/shift
   */
  static async getCorrectionHistory(
    organizationId: string,
    siteId: string,
    date: string,
    shift: string = "GENERAL"
  ): Promise<WorkforceHeadcountRecord[]> {
    // Get all records (including corrected ones) for this site/date/shift
    const records = await prisma.workforceHeadcount.findMany({
      where: {
        organizationId,
        siteId,
        date,
        shift,
      },
      orderBy: { createdAt: "asc" },
    });

    return records.map(r => this.mapToInterface(r));
  }

  private static mapToInterface(record: any): WorkforceHeadcountRecord {
    return {
      id: record.id,
      organizationId: record.organizationId,
      siteId: record.siteId,
      siteName: record.siteName,
      date: record.date,
      shift: record.shift as any,
      artisanCount: record.artisanCount,
      craftsmanCount: record.craftsmanCount,
      laborerMale: record.laborerMale,
      laborerFemale: record.laborerFemale,
      laborerTotal: record.laborerTotal,
      grandTotal: record.grandTotal,
      contractorName: record.contractorName,
      notes: record.notes,
      supervisorId: record.supervisorId,
      supervisorName: record.supervisorName,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
```

### Import Script

Create `scripts/migrate-workforce-headcount.ts`:

```typescript
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";

const STORAGE_FILE = path.resolve(process.cwd(), "storage", "data", "workforce-headcount.json");

interface LegacyRecord {
  id?: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  date: string;
  shift: string;
  artisanCount: number;
  craftsmanCount: number;
  laborerMale: number;
  laborerFemale: number;
  laborerTotal: number;
  grandTotal: number;
  contractorName?: string;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  createdAt: string;
  updatedAt: string;
}

async function migrateData() {
  console.log("Starting Workforce Headcount migration...");

  let legacyRecords: LegacyRecord[] = [];
  if (fs.existsSync(STORAGE_FILE)) {
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    legacyRecords = JSON.parse(raw);
    console.log(`Loaded ${legacyRecords.length} records from JSON`);
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Group by org/site/date/shift to handle duplicates
  const recordsByKey = new Map<string, LegacyRecord[]>();

  for (const record of legacyRecords) {
    const key = `${record.organizationId}#${record.siteId}#${record.date}#${record.shift}`;
    if (!recordsByKey.has(key)) {
      recordsByKey.set(key, []);
    }
    recordsByKey.get(key)!.push(record);
  }

  for (const [key, records] of recordsByKey) {
    // For each org/site/date/shift group, import all as a correction trail
    for (const record of records) {
      try {
        const [orgId, siteId, date, shift] = key.split("#");

        // Check for existing
        const existing = await prisma.workforceHeadcount.findFirst({
          where: {
            organizationId: orgId,
            siteId,
            date,
            shift,
            isCorrected: false,
          },
        });

        const id = record.id || `legacy-${Math.random().toString(36)}`;

        await prisma.workforceHeadcount.create({
          data: {
            id,
            organizationId: orgId,
            siteId,
            siteName: record.siteName,
            date,
            shift,
            artisanCount: record.artisanCount,
            craftsmanCount: record.craftsmanCount,
            laborerMale: record.laborerMale,
            laborerFemale: record.laborerFemale,
            laborerTotal: record.laborerTotal,
            grandTotal: record.grandTotal,
            contractorName: record.contractorName,
            notes: record.notes,
            supervisorId: record.supervisorId,
            supervisorName: record.supervisorName,
            createdById: record.supervisorId,
            correctionOf: existing?.id,
            isCorrected: false,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
          },
        });

        imported++;
      } catch (err) {
        console.error(`Error importing record for key ${key}:`, err);
        errors++;
      }
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  const backupPath = `${STORAGE_FILE}.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(STORAGE_FILE, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }
}

migrateData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
```

---

## EXECUTION STEPS

### 1. Update Prisma Schema
Add the models above to `prisma/schema.prisma`

### 2. Create Migrations
```bash
# Create empty migration files manually
# Or use:
npx prisma migrate dev --name "add-measurement-book-entries"
npx prisma migrate dev --name "add-workforce-headcount"
```

### 3. Apply Migrations
```bash
npx prisma db push
```

### 4. Replace Services
- Update `src/services/measurement-book-service.ts`
- Update `src/services/workforce-headcount-service.ts`

### 5. Run Import Scripts
```bash
npx tsx scripts/migrate-measurement-book.ts
npx tsx scripts/migrate-workforce-headcount.ts
```

### 6. Verify
```bash
# Check records in database
npx prisma studio

# Run tests
npm test -- --run --no-file-parallelism
```

### 7. Cleanup
- Delete `storage/data/measurement-book.json` after verification
- Delete `storage/data/workforce-headcount.json` after verification
- Keep `.bak` files for audit trail

---

## Test Coverage Required

For each service:
- ✅ Create new record
- ✅ Retrieve records
- ✅ Update/correct record
- ✅ Prevent duplicates (uniqueness constraint)
- ✅ Transaction safety (atomic)
- ✅ Permission enforcement
- ✅ Concurrent update handling
- ✅ Database failure (no fallback)
- ✅ Import from JSON (deduplication)
- ✅ Correction/history trail

---

## Deployment Checklist

- [ ] Backup production database
- [ ] Run migrations in staging
- [ ] Verify no data loss
- [ ] Run import scripts
- [ ] Verify imported data matches
- [ ] Run full test suite
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Verify health endpoint
- [ ] Keep JSON backups for audit trail
