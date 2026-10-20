const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
    },
  },
});

async function migrateData() {
  console.log('--- Starting Data Migration to Relational Database ---');

  // 1. Migrate Measurement Book
  const mbFile = path.resolve('storage', 'data', 'measurement-book.json');
  if (fs.existsSync(mbFile)) {
    try {
      const raw = fs.readFileSync(mbFile, 'utf8');
      const entries = JSON.parse(raw);
      console.log(`Found ${entries.length} measurement book entries in JSON.`);

      let imported = 0;
      let skipped = 0;
      let errors = 0;

      for (const entry of entries) {
        try {
          const existing = await prisma.measurementBookEntry.findUnique({
            where: { id: entry.id },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Ensure Organization exists
          let orgId = entry.organizationId;
          let org = await prisma.organization.findUnique({ where: { id: orgId } });
          if (!org) {
            org = await prisma.organization.create({
              data: {
                id: orgId,
                name: 'Bothra Construction Org',
                currency: 'INR',
                timezone: 'Asia/Kolkata',
              },
            });
          }

          // Ensure Site & Project exist
          let projId = entry.projectId;
          let proj = projId ? await prisma.project.findUnique({ where: { id: projId } }) : null;
          if (!proj) {
            let site = await prisma.site.findFirst({ where: { organizationId: orgId } });
            if (!site) {
              site = await prisma.site.create({
                data: {
                  organizationId: orgId,
                  name: 'Operational Site',
                  code: 'SITE-' + Math.floor(Math.random() * 90000 + 10000),
                  address: 'Site Location',
                },
              });
            }
            proj = await prisma.project.create({
              data: {
                id: projId || undefined,
                organizationId: orgId,
                siteId: site.id,
                name: 'Main Project ' + (projId ? projId.slice(-6) : 'Default'),
                code: 'PRJ-' + Math.floor(Math.random() * 90000 + 10000),
                status: 'IN_PROGRESS',
              },
            });
          }

          // Ensure Subcontractor Party exists
          let partyId = entry.partyId;
          let party = await prisma.party.findUnique({ where: { id: partyId } });
          if (!party) {
            party = await prisma.party.create({
              data: {
                id: partyId,
                organizationId: orgId,
                name: 'Subcontractor ' + partyId.slice(-6),
                partyType: 'CONTRACTOR',
                active: true,
              },
            });
          }

          // Verify bill if specified
          let billId = entry.billId || null;
          if (billId) {
            const bill = await prisma.bill.findUnique({ where: { id: billId } });
            if (!bill) billId = null;
          }

          await prisma.measurementBookEntry.create({
            data: {
              id: entry.id,
              organizationId: orgId,
              projectId: proj.id,
              partyId: party.id,
              itemDescription: entry.itemDescription || 'Measurement item',
              unit: (entry.unit || 'SQM').toUpperCase(),
              count: entry.count || 1,
              length: entry.length || 1,
              breadth: entry.breadth || null,
              depth: entry.depth || null,
              quantity: entry.quantity || 1,
              unitRate: entry.unitRate || 0,
              totalAmount: entry.totalAmount || 0,
              status: entry.status || 'SUBMITTED',
              billId: billId,
              notes: entry.notes || null,
              createdBy: entry.createdBy || 'system',
              createdByName: entry.createdByName || null,
              approvedBy: entry.approvedBy || null,
              createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
              updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : new Date(),
            },
          });
          imported++;
        } catch (e) {
          console.error('Failed on entry:', entry.id, e.message);
          errors++;
        }
      }

      console.log(`Measurement Book Migration: ${imported} imported, ${skipped} skipped, ${errors} errors.`);
    } catch (err) {
      console.error('Error during Measurement Book migration:', err);
    }
  }

  // 2. Migrate Workforce Headcount from IdempotencyRecords / JSON
  const wfFile = path.resolve('storage', 'data', 'workforce-headcount.json');
  let wfRecords = [];
  if (fs.existsSync(wfFile)) {
    try {
      const raw = fs.readFileSync(wfFile, 'utf8');
      wfRecords = JSON.parse(raw);
    } catch {}
  }

  const idempotencyWf = await prisma.idempotencyRecord.findMany({
    where: { key: { startsWith: 'WF_HEADCOUNT_' } },
  });

  for (const item of idempotencyWf) {
    try {
      const parsed = JSON.parse(item.responseJson);
      if (parsed && parsed.siteId && !wfRecords.some((r) => r.id === parsed.id)) {
        wfRecords.push(parsed);
      }
    } catch {}
  }

  console.log(`Found ${wfRecords.length} workforce headcount records to migrate.`);
  let wfImported = 0;
  let wfSkipped = 0;

  for (const rec of wfRecords) {
    const existing = await prisma.workforceHeadcount.findUnique({
      where: { id: rec.id },
    }).catch(() => null);

    if (existing) {
      wfSkipped++;
      continue;
    }

    let orgId = rec.organizationId;
    let org = await prisma.organization.findUnique({ where: { id: orgId } }).catch(() => null);
    if (!org) {
      org = await prisma.organization.findFirst();
      if (org) orgId = org.id;
    }

    let siteId = rec.siteId;
    let site = await prisma.site.findUnique({ where: { id: siteId } }).catch(() => null);
    if (!site && orgId) {
      site = await prisma.site.findFirst({ where: { organizationId: orgId } });
      if (site) siteId = site.id;
    }

    if (!orgId || !siteId) continue;

    await prisma.workforceHeadcount.create({
      data: {
        id: rec.id,
        organizationId: orgId,
        siteId: siteId,
        siteName: rec.siteName || site?.name || 'Operational Site',
        date: rec.date || new Date().toISOString().split('T')[0],
        shift: rec.shift || 'GENERAL',
        artisanCount: rec.artisanCount || rec.artisanTotal || 0,
        craftsmanCount: rec.craftsmanCount || rec.craftsmanTotal || 0,
        laborerMale: rec.laborerMale || 0,
        laborerFemale: rec.laborerFemale || 0,
        laborerTotal: rec.laborerTotal || ((rec.laborerMale || 0) + (rec.laborerFemale || 0)),
        grandTotal: rec.grandTotal || 0,
        contractorName: rec.contractorName || null,
        notes: rec.notes || null,
        supervisorId: rec.supervisorId || 'system',
        supervisorName: rec.supervisorName || 'Site Supervisor',
        createdById: rec.supervisorId || null,
        createdAt: rec.createdAt ? new Date(rec.createdAt) : new Date(),
        updatedAt: rec.updatedAt ? new Date(rec.updatedAt) : new Date(),
      },
    }).catch((e) => console.error('Failed to insert HC record:', e.message));

    wfImported++;
  }

  console.log(`Workforce Headcount Migration: ${wfImported} imported, ${wfSkipped} skipped.`);
  console.log('--- Migration Finished Successfully ---');
}

migrateData()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
