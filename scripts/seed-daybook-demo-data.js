/**
 * Seed Comprehensive Realistic Demo Data for Day Book
 * 
 * Populates:
 * 1. Vendor Bills (Cement, Steel, RMC, Scaffolding)
 * 2. Cash & Bank Payments (Supplier settlements, contractor advances, diesel, petty cash)
 * 3. Material Goods Receipts (Challan receipts with supplier and rates)
 * 4. Material Goods Issues (Issued to site projects with timestamps)
 * 5. Workforce Headcount (Masons, Carpenters, Barbenders, Helpers by Shift)
 * 6. Daily Attendance Sessions (Named workers with GPS coordinates & check-in times)
 * 7. Daily Site Progress Reports (DSR with work progress, weather, safety records)
 * 
 * Specifically targets:
 * - The primary active user organization (1eb45938-3964-41ab-8145-c8ff93c90c73) where admin@buildtrack.pro & superadmin@buildtrack.pro belong
 * - demo-org-1 (Apex Infrastructure & Builders)
 * - All other Bothra CMS organizations with users
 * 
 * Targeted Dates:
 * - Today (2026-10-20)
 * - Yesterday (2026-10-19)
 * - Day Before (2026-10-18)
 */
const fs = require("fs");
const path = require("path");

// Load .env
const envFile = path.resolve(__dirname, "../.env");
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function seedDayBookDemoData() {
  console.log("============================================================");
  console.log("🌱 SEEDING COMPREHENSIVE DAY BOOK DEMO DATA");
  console.log("============================================================\n");

  // 1. Rename primary user organization to Bothra Construction Group if needed
  const primaryOrgId = "1eb45938-3964-41ab-8145-c8ff93c90c73";
  let primaryOrg = await prisma.organization.findUnique({
    where: { id: primaryOrgId },
    include: {
      users: true,
      sites: true,
      projects: true,
      stores: true,
      materials: true,
      parties: true,
    },
  });

  if (primaryOrg) {
    if (primaryOrg.name.startsWith("Stock Audit Org")) {
      primaryOrg = await prisma.organization.update({
        where: { id: primaryOrgId },
        data: { name: "Bothra Construction Group (Main HQ)" },
        include: {
          users: true,
          sites: true,
          projects: true,
          stores: true,
          materials: true,
          parties: true,
        },
      });
      console.log(`Updated primary organization name to: "${primaryOrg.name}"`);
    }
  }

  // 2. Ensure demo-org-1 exists
  let demoOrg = await prisma.organization.upsert({
    where: { id: "demo-org-1" },
    update: {},
    create: {
      id: "demo-org-1",
      name: "Apex Infrastructure & Builders",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    },
    include: {
      users: true,
      sites: true,
      projects: true,
      stores: true,
      materials: true,
      parties: true,
    },
  });

  // Collect target organizations
  const targetOrgs = [];
  if (primaryOrg) targetOrgs.push(primaryOrg);
  if (demoOrg && !targetOrgs.some((o) => o.id === demoOrg.id)) targetOrgs.push(demoOrg);

  // Add other organizations that have users and 'Bothra' in their name
  const otherBothraOrgs = await prisma.organization.findMany({
    where: {
      id: { notIn: targetOrgs.map((o) => o.id) },
      name: { contains: "Bothra" },
      users: { some: {} },
    },
    include: {
      users: true,
      sites: true,
      projects: true,
      stores: true,
      materials: true,
      parties: true,
    },
    take: 5,
  });

  for (const o of otherBothraOrgs) {
    targetOrgs.push(o);
  }

  console.log(`Found ${targetOrgs.length} target organizations to seed:\n` +
    targetOrgs.map((o) => ` - [${o.id}] ${o.name} (${o.users.length} users)`).join("\n") + "\n"
  );

  for (const org of targetOrgs) {
    console.log(`\n============================================================`);
    console.log(`📦 Processing Organization: "${org.name}" (${org.id})`);
    console.log(`============================================================`);

    // Ensure essential Admin User exists
    let adminUser = org.users.find((u) => u.role === "ORG_ADMIN" || u.role === "SUPER_ADMIN") || org.users[0];
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          organizationId: org.id,
          name: "Vikram Malhotra",
          email: `admin-${org.id.slice(0, 6)}@buildtrack.pro`,
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
          role: "ORG_ADMIN",
          status: "ACTIVE",
        },
      });
      console.log(`  Created default admin user: ${adminUser.email}`);
    }

    // 1. Ensure Sites exist
    let site1 = org.sites[0];
    if (!site1) {
      site1 = await prisma.site.create({
        data: {
          organizationId: org.id,
          name: "Skyline Heights Sector 62",
          code: `SKY-${org.id.slice(0, 4).toUpperCase()}`,
          address: "Plot 14B, Sector 62, Noida, Uttar Pradesh 201309",
          status: "ACTIVE",
        },
      });
    }

    let site2 = org.sites[1];
    if (!site2) {
      site2 = await prisma.site.create({
        data: {
          organizationId: org.id,
          name: "Riverside Enclave Phase 2",
          code: `RIV-${org.id.slice(0, 4).toUpperCase()}`,
          address: "Sector 128, Expressway, Noida, Uttar Pradesh",
          status: "ACTIVE",
        },
      });
    }

    // 2. Ensure Projects exist
    let project1 = org.projects[0];
    if (!project1) {
      project1 = await prisma.project.create({
        data: {
          organizationId: org.id,
          siteId: site1.id,
          name: "Tower A Structural Frame",
          code: `PRJ-SKY-A`,
          budgetAmount: 4500000000, // paise
          managerUserId: adminUser.id,
          status: "IN_PROGRESS",
        },
      });
    }

    let project2 = org.projects[1];
    if (!project2) {
      project2 = await prisma.project.create({
        data: {
          organizationId: org.id,
          siteId: site2.id,
          name: "Riverside Commercial Plaza",
          code: `PRJ-RIV-B`,
          budgetAmount: 6800000000, // paise
          managerUserId: adminUser.id,
          status: "IN_PROGRESS",
        },
      });
    }

    // 3. Ensure Stores exist
    let store1 = org.stores[0];
    if (!store1) {
      store1 = await prisma.store.create({
        data: {
          organizationId: org.id,
          siteId: site1.id,
          name: "Skyline Main Yard Store",
          status: "ACTIVE",
        },
      });
    }

    // 4. Ensure Materials exist
    const materialDefs = [
      { name: "UltraTech Cement PPC (50kg)", sku: `CEM-PPC-${org.id.slice(0, 4)}`, unitCode: "BAG", minStock: 200 },
      { name: "Tata Tiscon Fe550D TMT Rebar 12mm", sku: `STL-12M-${org.id.slice(0, 4)}`, unitCode: "TONNE", minStock: 10 },
      { name: "Coarse Washed River Sand", sku: `AGG-SND-${org.id.slice(0, 4)}`, unitCode: "TONNE", minStock: 50 },
      { name: "Ready Mix Concrete M25 Grade", sku: `RMC-M25-${org.id.slice(0, 4)}`, unitCode: "CUM", minStock: 20 },
      { name: "Asian Paints Apex Ultima White (20L)", sku: `PNT-WHT-${org.id.slice(0, 4)}`, unitCode: "LITRE", minStock: 15 },
    ];

    const materials = [];
    for (const m of materialDefs) {
      let mat = await prisma.material.findFirst({
        where: { organizationId: org.id, name: m.name },
      });
      if (!mat) {
        mat = await prisma.material.create({
          data: {
            organizationId: org.id,
            name: m.name,
            sku: m.sku,
            unitCode: m.unitCode,
            minStockQty: m.minStock,
          },
        });
      }
      materials.push(mat);
    }

    // 5. Ensure Parties (Vendors & Subcontractors) exist
    const partyDefs = [
      { name: "Ramesh RCC & Masonry Works", type: "CONTRACTOR" },
      { name: "Apex Cement & Building Supplies", type: "VENDOR" },
      { name: "Jindal Steel & Power Distributors", type: "VENDOR" },
      { name: "ACC Ready Mix Concrete Pvt Ltd", type: "VENDOR" },
      { name: "Krishna Shuttering & Scaffolding Services", type: "CONTRACTOR" },
      { name: "Site Petty Cash & Local Hardware", type: "VENDOR" },
    ];

    const parties = [];
    for (const p of partyDefs) {
      let party = await prisma.party.findFirst({
        where: { organizationId: org.id, name: p.name },
      });
      if (!party) {
        party = await prisma.party.create({
          data: {
            organizationId: org.id,
            name: p.name,
            partyType: p.type,
            taxIdentifier: "07AAAAA0000A1Z5",
          },
        });
      }
      parties.push(party);
    }

    // 6. Ensure Workforce Members exist
    const workerDefs = [
      { name: "Sunil Paswan", code: `EMP-001-${org.id.slice(0, 3)}`, type: "MASON", wage: 85000 },
      { name: "Dinesh Yadav", code: `EMP-002-${org.id.slice(0, 3)}`, type: "CARPENTER", wage: 80000 },
      { name: "Raju Barman", code: `EMP-003-${org.id.slice(0, 3)}`, type: "HELPER", wage: 55000 },
      { name: "Anand Shukla", code: `EMP-004-${org.id.slice(0, 3)}`, type: "ELECTRICIAN", wage: 90000 },
      { name: "Mahesh Thakur", code: `EMP-005-${org.id.slice(0, 3)}`, type: "FOREMAN", wage: 110000 },
      { name: "Kallu Ram", code: `EMP-006-${org.id.slice(0, 3)}`, type: "MASON", wage: 85000 },
      { name: "Santosh Kumar", code: `EMP-007-${org.id.slice(0, 3)}`, type: "HELPER", wage: 55000 },
      { name: "Vijay Shuttering", code: `EMP-008-${org.id.slice(0, 3)}`, type: "CARPENTER", wage: 80000 },
    ];

    const workers = [];
    for (const w of workerDefs) {
      let worker = await prisma.workforceMember.findFirst({
        where: { organizationId: org.id, employeeCode: w.code },
      });
      if (!worker) {
        worker = await prisma.workforceMember.create({
          data: {
            organizationId: org.id,
            name: w.name,
            employeeCode: w.code,
            workerType: w.type,
            dailyWageRate: w.wage,
            defaultSiteId: site1.id,
          },
        });
      }
      workers.push(worker);
    }

    // 7. Seed Day Book data for Today (2026-10-20), Yesterday (2026-10-19), Day Before (2026-10-18)
    const dates = ["2026-10-20", "2026-10-19", "2026-10-18"];

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const noonUtc = `${dateStr}T12:00:00.000Z`;
      const morningUtc = `${dateStr}T09:30:00.000Z`;
      const afternoonUtc = `${dateStr}T14:15:00.000Z`;
      const eveningUtc = `${dateStr}T17:45:00.000Z`;

      console.log(`  -> Seeding day entries for: ${dateStr}`);

      // A. BILLS (Invoiced Inflow / Subcontractor RA Bills - Amounts in Paise)
      const billData = [
        {
          party: parties[1], // Apex Cement
          project: project1,
          num: `INV-CEM-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`,
          amount: 15200000, // ₹1,52,000 (paise)
          notes: "Supply of 400 Bags UltraTech PPC 53 Grade Cement - Delivery Batch A",
          lines: [{ desc: "UltraTech PPC Cement (50kg)", qty: 400, rate: 38000, amt: 15200000 }],
        },
        {
          party: parties[2], // Jindal Steel
          project: project1,
          num: `INV-STL-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-02`,
          amount: 32000000, // ₹3,20,000 (paise)
          notes: "Supply of 5.0 MT Tata Tiscon 12mm TMT Rebar for 4th Floor Slab",
          lines: [{ desc: "Tata Tiscon Fe550D TMT Rebar 12mm", qty: 5, rate: 6400000, amt: 32000000 }],
        },
        {
          party: parties[0], // Ramesh RCC Contractor
          project: project1,
          num: `RA-BILL-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-03`,
          amount: 8500000, // ₹85,000 (paise)
          notes: "Running Account Bill #4 - 3rd Floor Brickwork & Internal Plastering",
          lines: [{ desc: "Brickwork 9-inch wall (sqm)", qty: 150, rate: 56667, amt: 8500000 }],
        },
      ];

      for (const b of billData) {
        const existing = await prisma.bill.findFirst({
          where: { organizationId: org.id, billNumber: b.num },
        });
        if (!existing) {
          await prisma.bill.create({
            data: {
              organizationId: org.id,
              partyId: b.party.id,
              projectId: b.project.id,
              billNumber: b.num,
              billDate: new Date(noonUtc),
              dueDate: new Date(new Date(noonUtc).getTime() + 15 * 86400000),
              totalAmount: b.amount,
              status: "POSTED",
              notes: b.notes,
              createdBy: adminUser.id,
              createdAt: new Date(morningUtc),
              lines: {
                create: b.lines.map((l) => ({
                  description: l.desc,
                  quantity: l.qty,
                  unitRate: l.rate,
                  lineTotal: l.amt,
                })),
              },
            },
          });
        }
      }

      // B. PAYMENTS (Cash & Bank Outflow - Amounts in Paise)
      const paymentData = [
        {
          party: parties[1], // Apex Cement
          project: project1,
          amount: 7500000, // ₹75,000 (paise)
          method: "BANK_TRANSFER",
          account: "HDFC Operating Bank A/C",
          ref: `NEFT-HDFC-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-101`,
          notes: "Part payment against cement supply challan #400",
        },
        {
          party: parties[0], // Contractor Ramesh
          project: project1,
          amount: 4000000, // ₹40,000 (paise)
          method: "UPI",
          account: "ICICI Primary A/C",
          ref: `UPI-YESB-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-882`,
          notes: "Weekly labor advance payment to contractor Ramesh",
        },
        {
          party: parties[4], // Scaffolding
          project: project1,
          amount: 1850000, // ₹18,500 (paise)
          method: "CHEQUE",
          account: "HDFC Operating Bank A/C",
          ref: `CHQ-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "").slice(-4)}19`,
          notes: "Monthly scaffolding & shuttering rental charges",
        },
        {
          party: parties[5], // Petty Cash / Hardware
          project: project1,
          amount: 1150000, // ₹11,500 (paise)
          method: "CASH",
          account: "Site Petty Cash Box",
          ref: `PETTY-CASH-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-04`,
          notes: "Site diesel purchase (100L) for DG Set and minor hardware tools",
        },
      ];

      for (const p of paymentData) {
        const existing = await prisma.payment.findFirst({
          where: { organizationId: org.id, referenceNumber: p.ref },
        });
        if (!existing) {
          await prisma.payment.create({
            data: {
              organizationId: org.id,
              partyId: p.party ? p.party.id : null,
              projectId: p.project.id,
              paymentDate: new Date(noonUtc),
              amount: p.amount,
              currency: "INR",
              method: p.method,
              payingAccount: p.account,
              referenceNumber: p.ref,
              idempotencyKey: `IDEMP-${p.ref}`,
              status: "POSTED",
              notes: p.notes,
              createdBy: adminUser.id,
              createdAt: new Date(afternoonUtc),
            },
          });
        }
      }

      // C. INVENTORY GOODS RECEIPTS & ISSUES
      // 1. Goods Receipt: 400 bags cement
      const receiptRef = `GRN-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`;
      const existingReceipt = await prisma.stockMovement.findFirst({
        where: { organizationId: org.id, referenceDoc: receiptRef },
      });
      if (!existingReceipt) {
        await prisma.stockMovement.create({
          data: {
            organizationId: org.id,
            materialId: materials[0].id,
            storeId: store1.id,
            movementType: "RECEIPT",
            quantityDelta: 400,
            unitCode: "BAG",
            unitRate: 38000,
            vendorPartyId: parties[1].id,
            projectId: project1.id,
            referenceDoc: receiptRef,
            notes: "Received 400 bags PPC Cement from Apex Cement. Quality verified.",
            movementAt: new Date(morningUtc),
            createdAt: new Date(morningUtc),
            createdBy: adminUser.id,
          },
        });

        await prisma.stockBalance.upsert({
          where: { materialId_storeId: { materialId: materials[0].id, storeId: store1.id } },
          create: { materialId: materials[0].id, storeId: store1.id, quantityOnHand: 400 },
          update: { quantityOnHand: { increment: 400 } },
        });
      }

      // 2. Goods Issue: 120 bags cement issued to Tower A
      const issueRef = `GIN-${org.id.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`;
      const existingIssue = await prisma.stockMovement.findFirst({
        where: { organizationId: org.id, referenceDoc: issueRef },
      });
      if (!existingIssue) {
        await prisma.stockMovement.create({
          data: {
            organizationId: org.id,
            materialId: materials[0].id,
            storeId: store1.id,
            movementType: "ISSUE",
            quantityDelta: -120,
            unitCode: "BAG",
            unitRate: 38000,
            projectId: project1.id,
            referenceDoc: issueRef,
            notes: "Issued 120 bags cement for 4th-floor column casting work",
            movementAt: new Date(afternoonUtc),
            createdAt: new Date(afternoonUtc),
            createdBy: adminUser.id,
          },
        });

        await prisma.stockBalance.updateMany({
          where: { materialId: materials[0].id, storeId: store1.id },
          data: { quantityOnHand: { decrement: 120 } },
        });
      }

      // D. WORKFORCE HEADCOUNT (Headcount Aggregation)
      const existingHeadcount = await prisma.workforceHeadcount.findFirst({
        where: { organizationId: org.id, siteId: site1.id, date: dateStr, shift: "DAY" },
      });
      if (!existingHeadcount) {
        await prisma.workforceHeadcount.create({
          data: {
            organizationId: org.id,
            siteId: site1.id,
            siteName: site1.name,
            date: dateStr,
            shift: "DAY",
            contractorName: "Ramesh RCC & Masonry Works",
            artisanCount: 14, // 14 Artisans / Masons
            craftsmanCount: 8, // 8 Craftsmen / Carpenters
            laborerMale: 22,
            laborerFemale: 10,
            laborerTotal: 32,
            grandTotal: 54,
            notes: "General morning shift deployment: 4th-floor casting, brickwork grid 4-8",
            supervisorId: adminUser.id,
            supervisorName: adminUser.name,
            createdAt: new Date(morningUtc),
          },
        });
      }

      // E. DAILY ATTENDANCE SESSIONS (Individual Named Workers)
      for (const w of workers) {
        const existingAtt = await prisma.attendanceSession.findFirst({
          where: { organizationId: org.id, workforceMemberId: w.id, workDate: dateStr },
        });
        if (!existingAtt) {
          await prisma.attendanceSession.create({
            data: {
              organizationId: org.id,
              workforceMemberId: w.id,
              siteId: site1.id,
              projectId: project1.id,
              workDate: dateStr,
              checkInAt: new Date(morningUtc),
              checkInLat: 28.6281,
              checkInLng: 77.3650,
              checkInAccuracyM: 4.5,
              status: "PRESENT",
              notes: `Checked in on site - assigned to ${project1.name}`,
              createdBy: adminUser.id,
            },
          });
        }
      }

      // F. DAILY SITE REPORT (DSR)
      const existingDsr = await prisma.dailySiteReport.findFirst({
        where: { organizationId: org.id, projectId: project1.id, reportDate: dateStr },
      });
      if (!existingDsr) {
        await prisma.dailySiteReport.create({
          data: {
            organizationId: org.id,
            projectId: project1.id,
            reportDate: dateStr,
            progress: "Completed shuttering and rebar binding for 4th-floor columns (Columns C1 to C12). Concreting of 6 columns completed with 120 bags cement. Brickwork ongoing on 3rd floor west wing.",
            blockers: "Tower crane cable inspected and lubricated. Ready Mix Concrete truck delayed by 30 mins due to ring-road traffic.",
            safetyNotes: "Morning tool-box talk conducted at 08:30 AM covering fall protection and safety harness compliance. Zero accidents or injuries recorded.",
            createdBy: adminUser.id,
            createdAt: new Date(eveningUtc),
          },
        });
      }
    }

    console.log(`✅ Demo data seeded successfully for organization "${org.name}".`);
  }

  // 8. Synchronize active database (prisma/dev.db) to prisma/prisma/dev.db
  const mainDb = path.resolve(__dirname, "..", "prisma", "dev.db");
  const mirrorDb = path.resolve(__dirname, "..", "prisma", "prisma", "dev.db");
  try {
    if (fs.existsSync(mainDb)) {
      fs.copyFileSync(mainDb, mirrorDb);
      console.log(`\n🔄 Synchronized ${mainDb} -> ${mirrorDb}`);
    }
  } catch (syncErr) {
    console.warn("Notice: Database sync copy warning:", syncErr.message);
  }

  console.log("\n============================================================");
  console.log("ALL DAY BOOK DEMO DATA SUCCESSFULLY SEEDED!");
  console.log("============================================================\n");
}

seedDayBookDemoData()
  .catch((err) => {
    console.error("Error seeding Day Book demo data:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
