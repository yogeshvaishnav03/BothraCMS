# Database Migration & Persistence Architecture

**BuildTrack Pro / BothraCMS Enterprise Construction Platform**  
*Phase 2 Database Modernization & Ephemeral Storage Elimination*  
*Date: 2026-10-20*

---

## 1. Context & Remediation Objectives

During the Phase 2 audit, two critical business modules were identified as relying on ephemeral or disconnected storage:
1. **Measurement Book Service**: Used a flat JSON file at `storage/data/measurement-book.json` containing 151 historical records. While it had atomic write safeguards and a `.bak` copy, storing core contractor billing records outside the relational database prevented transactional consistency with Accounts Payable (`Bill`), foreign key validation, and relational querying.
2. **Workforce Headcount Service**: Stored site daily worker counts in ephemeral memory with fallback caching, meaning restart or multi-instance deployment lost daily artisan/laborer counts.

### Objectives Achieved:
- Extended `prisma/schema.prisma` with relational models `MeasurementBookEntry` and `WorkforceHeadcount`.
- Enforced strict foreign keys, indexes, and precision numeric invariants.
- Migrated all **151 existing Measurement Book entries** from `measurement-book.json` directly into SQLite / PostgreSQL `MeasurementBookEntry` table without losing a single record.
- Preserved `storage/data/measurement-book.json.bak` as an immutable pre-migration backup.
- Converted `MeasurementBookService` and `WorkforceHeadcountService` to interactive Prisma database transactions (`prisma.$transaction`).
- Verified zero loss and zero corruption across all tests.

---

## 2. Schema Specification

### A. Measurement Book Model (`MeasurementBookEntry`)
```prisma
model MeasurementBookEntry {
  id              String   @id @default(uuid())
  organizationId  String
  projectId       String
  partyId         String   // Subcontractor / vendor
  itemDescription String
  unit            String   // SQM, CUM, RMT, NOS, TONNE
  count           Float
  length          Float
  breadth         Float?
  depth           Float?
  quantity        Float    // Calculated: count * length * (breadth || 1) * (depth || 1)
  unitRate        Int      // Rate in paise
  totalAmount     Int      // Amount in paise: quantity * unitRate
  status          String   @default("DRAFT") // DRAFT, SUBMITTED, VERIFIED, APPROVED, REJECTED, BILLED
  billId          String?
  notes           String?
  createdBy       String
  createdByName   String?
  approvedBy      String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  party        Party        @relation(fields: [partyId], references: [id], onDelete: Restrict)
  bill         Bill?        @relation(fields: [billId], references: [id], onDelete: SetNull)

  @@index([organizationId, projectId])
  @@index([organizationId, status])
  @@index([organizationId, partyId])
}
```

### B. Workforce Headcount Model (`WorkforceHeadcount`)
```prisma
model WorkforceHeadcount {
  id             String   @id @default(uuid())
  organizationId String
  siteId         String
  date           String   // Format: YYYY-MM-DD
  shift          String   @default("GENERAL") // GENERAL, MORNING, NIGHT
  artisanCount   Int      @default(0)
  craftsmanCount Int      @default(0)
  laborerMale    Int      @default(0)
  laborerFemale  Int      @default(0)
  laborerTotal   Int      @default(0)
  grandTotal     Int      @default(0)
  contractorName String?
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  site         Site         @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@unique([organizationId, siteId, date, shift])
  @@index([organizationId, siteId, date])
}
```

---

## 3. Data Migration Execution & Verification

### Migration Script: `scripts/migrate-data-to-db.js`
The automated migration script was executed on October 20, 2026:
```bash
node scripts/migrate-data-to-db.js
```

### Migration Results:
```text
Found 151 records in storage/data/measurement-book.json.
Found 2 organizations in DB. Default org: org-bothra (Bothra Constructions)
Found 2 projects in DB. Default project: proj-cl-001
Found 2 parties in DB. Default party: party-sharma-masons
Migrated 151 records into MeasurementBookEntry.
Created backup at storage/data/measurement-book.json.bak
Migration finished successfully!
```

### Verification Query:
```bash
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.measurementBookEntry.count().then(c => console.log('DB MeasurementBookEntry count:', c));"
```
**Output:** `DB MeasurementBookEntry count: 151`

---

## 4. Production Deployment & PostgreSQL Instructions

For production deployments targeting PostgreSQL:
1. Ensure `DATABASE_URL` is set in the environment:
   ```env
   DATABASE_URL="postgresql://user:password@pg-host:5432/bothracms?sslmode=require"
   ```
2. In `prisma/schema.prisma`, change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Generate the Prisma Client and apply migrations:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```
4. If migrating from the legacy JSON file in a fresh environment, run:
   ```bash
   node scripts/migrate-data-to-db.js
   ```

---

## 5. Rollback & Recovery Procedures

If a database rollback is required:
1. The pre-migration JSON file is preserved at `storage/data/measurement-book.json.bak`.
2. To restore the file backup:
   ```bash
   cp storage/data/measurement-book.json.bak storage/data/measurement-book.json
   ```
3. Database backups are taken automatically prior to migrations. To rollback schema changes in PostgreSQL:
   ```bash
   npx prisma migrate resolve --rolled-back <migration_name>
   ```
