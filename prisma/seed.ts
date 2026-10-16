import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PROD_SEED) {
    throw new Error(
      "SECURITY ENFORCEMENT: Seeding development accounts with default passwords is strictly prohibited in production environments! Set ALLOW_PROD_SEED=true only for explicit sandbox staging."
    );
  }
  console.log("🌱 Seeding Build Track Pro database...");

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { id: "demo-org-1" },
    update: {},
    create: {
      id: "demo-org-1",
      name: "Apex Infrastructure & Builders",
      currency: "INR",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    },
  });

  const passwordHash = await bcrypt.hash("Password123!", 10);

  // 2. Create Users
  const users = [
    {
      id: "usr-super-1",
      name: "Master Super Admin",
      email: "superadmin@buildtrack.pro",
      role: "SUPER_ADMIN",
    },
    {
      id: "usr-admin-1",
      name: "Vikram Malhotra",
      email: "admin@buildtrack.pro",
      role: "ORG_ADMIN",
    },
    {
      id: "usr-pm-1",
      name: "Arjun Verma",
      email: "pm@buildtrack.pro",
      role: "PROJECT_MANAGER",
    },
    {
      id: "usr-sup-1",
      name: "Rajesh Kumar",
      email: "supervisor@buildtrack.pro",
      role: "SITE_SUPERVISOR",
    },
    {
      id: "usr-store-1",
      name: "Mohan Lal",
      email: "store@buildtrack.pro",
      role: "STOREKEEPER",
    },
    {
      id: "usr-fin-1",
      name: "Pooja Sharma",
      email: "finance@buildtrack.pro",
      role: "ACCOUNTANT",
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: u.email,
        },
      },
      update: { role: u.role, passwordHash },
      create: {
        id: u.id,
        organizationId: org.id,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        status: "ACTIVE",
      },
    });
  }

  // 3. Create Sites
  const site1 = await prisma.site.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: "SKY-62" },
    },
    update: {},
    create: {
      id: "site-skyline-1",
      organizationId: org.id,
      name: "Skyline Heights Sector 62",
      code: "SKY-62",
      address: "Plot 14B, Sector 62, Noida, Uttar Pradesh 201309",
      latitude: 28.6280,
      longitude: 77.3649,
      status: "ACTIVE",
    },
  });

  const site2 = await prisma.site.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: "RIV-128" },
    },
    update: {},
    create: {
      id: "site-riverside-2",
      organizationId: org.id,
      name: "Riverside Enclave Phase 2",
      code: "RIV-128",
      address: "Expressway Boulevard, Sector 128, Noida, Uttar Pradesh 201304",
      latitude: 28.5200,
      longitude: 77.3800,
      status: "ACTIVE",
    },
  });

  // 4. Create Stores
  const store1 = await prisma.store.upsert({
    where: { id: "store-skyline-main" },
    update: {},
    create: {
      id: "store-skyline-main",
      organizationId: org.id,
      siteId: site1.id,
      name: "Skyline Main Yard Store",
      status: "ACTIVE",
    },
  });

  const store2 = await prisma.store.upsert({
    where: { id: "store-riverside-main" },
    update: {},
    create: {
      id: "store-riverside-main",
      organizationId: org.id,
      siteId: site2.id,
      name: "Riverside Site Store",
      status: "ACTIVE",
    },
  });

  // 5. Create Projects
  const project1 = await prisma.project.upsert({
    where: {
      organizationId_code: { organizationId: org.id, code: "PRJ-SKY-A" },
    },
    update: {},
    create: {
      id: "prj-skyline-a",
      organizationId: org.id,
      siteId: site1.id,
      code: "PRJ-SKY-A",
      name: "Tower A Structural Frame",
      managerUserId: "usr-pm-1",
      status: "IN_PROGRESS",
      startDate: new Date("2026-01-15T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      budgetAmount: 4500000000, // 4.5 Crores INR (in paise)
      notes: "14-story residential tower structural framing and masonry",
    },
  });

  // 6. Create Material Categories & Materials
  const catCement = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Cement & Aggregates" } },
    update: {},
    create: { organizationId: org.id, name: "Cement & Aggregates" },
  });

  const catSteel = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Structural Steel" } },
    update: {},
    create: { organizationId: org.id, name: "Structural Steel" },
  });

  const catPaints = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Paints & Chemicals" } },
    update: {},
    create: { organizationId: org.id, name: "Paints & Chemicals" },
  });

  const materialsData = [
    {
      id: "mat-cem-50",
      sku: "CEM-PPC-50",
      name: "UltraTech Cement PPC (50kg)",
      categoryId: catCement.id,
      unitCode: "BAG",
      minStockQty: 100,
      reorderQty: 250,
    },
    {
      id: "mat-steel-12",
      sku: "STL-TMT-12",
      name: "Tata Tiscon Fe550D TMT Rebar 12mm",
      categoryId: catSteel.id,
      unitCode: "TONNE",
      minStockQty: 15,
      reorderQty: 30,
    },
    {
      id: "mat-sand-crs",
      sku: "AGG-SND-CRS",
      name: "Coarse Washed River Sand",
      categoryId: catCement.id,
      unitCode: "TONNE",
      minStockQty: 40,
      reorderQty: 80,
    },
    {
      id: "mat-paint-white",
      sku: "PNT-APX-WHT",
      name: "Asian Paints Apex Ultima White (20L)",
      categoryId: catPaints.id,
      unitCode: "LITRE",
      minStockQty: 30,
      reorderQty: 60,
    },
  ];

  for (const m of materialsData) {
    await prisma.material.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: m.sku } },
      update: {},
      create: {
        id: m.id,
        organizationId: org.id,
        categoryId: m.categoryId,
        sku: m.sku,
        name: m.name,
        unitCode: m.unitCode,
        minStockQty: m.minStockQty,
        reorderQty: m.reorderQty,
      },
    });
  }

  // 7. Create Parties (Vendors & Contractors)
  const partyAsianPaints = await prisma.party.upsert({
    where: { id: "party-asian-paints" },
    update: {},
    create: {
      id: "party-asian-paints",
      organizationId: org.id,
      partyType: "VENDOR",
      name: "Asian Paints Ltd",
      phone: "+91 98110 22334",
      email: "supplies@asianpaints.com",
      address: "Plot 8, Okhla Industrial Area Phase 3, New Delhi",
      taxIdentifier: "07AAACA1234D1Z2",
    },
  });

  const partyJindalSteel = await prisma.party.upsert({
    where: { id: "party-jindal-steel" },
    update: {},
    create: {
      id: "party-jindal-steel",
      organizationId: org.id,
      partyType: "VENDOR",
      name: "Jindal Steel & Power Distributors",
      phone: "+91 98220 55443",
      email: "orders@jindalsteel.com",
      address: "Steel Yard Complex, Ghaziabad",
      taxIdentifier: "09AAACJ5678K1Z5",
    },
  });

  const partyRameshContractor = await prisma.party.upsert({
    where: { id: "party-ramesh-contractor" },
    update: {},
    create: {
      id: "party-ramesh-contractor",
      organizationId: org.id,
      partyType: "CONTRACTOR",
      name: "Ramesh RCC & Masonry Works",
      phone: "+91 98990 11223",
      email: "ramesh.contractor@gmail.com",
      address: "Sector 18, Noida",
    },
  });

  // 8. Create Tasks
  const task1 = await prisma.task.upsert({
    where: { id: "task-pour-slab-5" },
    update: {},
    create: {
      id: "task-pour-slab-5",
      organizationId: org.id,
      projectId: project1.id,
      title: "Pour Concrete on 5th Floor Slab",
      description: "Cast M25 grade concrete on floor slab including shuttering and bar placement verification.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      assigneeUserId: "usr-sup-1",
      dueAt: new Date(Date.now() + 86400000 * 2),
      createdBy: "usr-pm-1",
    },
  });

  await prisma.task.upsert({
    where: { id: "task-column-reinforce" },
    update: {},
    create: {
      id: "task-column-reinforce",
      organizationId: org.id,
      projectId: project1.id,
      title: "Column Rebar Tying & Shuttering",
      description: "Tie 12mm and 16mm rebar rings for grid C1 to C8 columns.",
      priority: "CRITICAL",
      status: "TODO",
      assigneeUserId: "usr-sup-1",
      dueAt: new Date(Date.now() + 86400000),
      createdBy: "usr-pm-1",
    },
  });

  // 9. Initial Material Goods Receipts (Authoritative Stock Movements)
  const initialReceipts = [
    {
      materialId: "mat-cem-50",
      storeId: store1.id,
      quantityDelta: 200,
      unitCode: "BAG",
      unitRate: 38000, // ₹380 / bag
      referenceDoc: "DC-9081",
      vendorPartyId: partyAsianPaints.id,
      notes: "Delivery Challan DC-9081",
    },
    {
      materialId: "mat-steel-12",
      storeId: store1.id,
      quantityDelta: 25,
      unitCode: "TONNE",
      unitRate: 6200000, // ₹62,000 / tonne
      referenceDoc: "DC-JS-441",
      vendorPartyId: partyJindalSteel.id,
      notes: "Delivery Challan DC-JS-441",
    },
    {
      materialId: "mat-paint-white",
      storeId: store1.id,
      quantityDelta: 50,
      unitCode: "LITRE",
      unitRate: 24000, // ₹240 / litre
      referenceDoc: "DC-AP-102",
      vendorPartyId: partyAsianPaints.id,
      notes: "Delivery Challan DC-AP-102",
    },
  ];

  for (const r of initialReceipts) {
    const existingMov = await prisma.stockMovement.findFirst({
      where: {
        organizationId: org.id,
        materialId: r.materialId,
        storeId: r.storeId,
        referenceDoc: r.referenceDoc,
      },
    });

    if (!existingMov) {
      await prisma.stockMovement.create({
        data: {
          organizationId: org.id,
          materialId: r.materialId,
          storeId: r.storeId,
          movementType: "RECEIPT",
          quantityDelta: r.quantityDelta,
          unitCode: r.unitCode,
          unitRate: r.unitRate,
          referenceDoc: r.referenceDoc,
          vendorPartyId: r.vendorPartyId,
          notes: r.notes,
          createdBy: "usr-store-1",
        },
      });

      await prisma.stockBalance.upsert({
        where: {
          materialId_storeId: {
            materialId: r.materialId,
            storeId: r.storeId,
          },
        },
        update: { quantityOnHand: r.quantityDelta },
        create: {
          materialId: r.materialId,
          storeId: r.storeId,
          quantityOnHand: r.quantityDelta,
        },
      });
    }
  }

  // 10. Create Bills & Payments for Asian Paints & Jindal Steel
  const bill1 = await prisma.bill.upsert({
    where: {
      organizationId_partyId_billNumber: {
        organizationId: org.id,
        partyId: partyAsianPaints.id,
        billNumber: "INV-AP-8801",
      },
    },
    update: {},
    create: {
      id: "bill-ap-8801",
      organizationId: org.id,
      partyId: partyAsianPaints.id,
      projectId: project1.id,
      billNumber: "INV-AP-8801",
      billDate: new Date("2026-10-01T00:00:00Z"),
      dueDate: new Date("2026-10-31T00:00:00Z"),
      totalAmount: 1000000, // ₹10,000 (1,000,000 paise)
      status: "POSTED",
      createdBy: "usr-fin-1",
      lines: {
        create: [
          {
            description: "Asian Paints Apex Ultima White 20L (2 drums)",
            materialId: "mat-paint-white",
            quantity: 40,
            unitRate: 25000,
            lineTotal: 1000000,
          },
        ],
      },
    },
  });

  // Create payment of ₹4,000 allocated to bill1 (leaving ₹6,000 outstanding)
  await prisma.payment.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: org.id,
        idempotencyKey: "seed-payment-ap-1",
      },
    },
    update: {},
    create: {
      id: "pay-ap-4000",
      organizationId: org.id,
      partyId: partyAsianPaints.id,
      projectId: project1.id,
      paymentDate: new Date("2026-10-10T00:00:00Z"),
      amount: 400000, // ₹4,000 (400,000 paise)
      currency: "INR",
      method: "BANK_TRANSFER",
      referenceNumber: "NEFT-HDFC-889102",
      status: "POSTED",
      idempotencyKey: "seed-payment-ap-1",
      notes: "Part payment against invoice INV-AP-8801",
      createdBy: "usr-fin-1",
      allocations: {
        create: [
          {
            billId: bill1.id,
            amount: 400000,
          },
        ],
      },
    },
  });

  // 11. Create Workforce Members & Today's Attendance
  const workers = [
    { code: "EMP-001", name: "Sunil Paswan", type: "MASON", wage: 95000 },
    { code: "EMP-002", name: "Dinesh Yadav", type: "CARPENTER", wage: 90000 },
    { code: "EMP-003", name: "Raju Barman", type: "HELPER", wage: 65000 },
    { code: "EMP-004", name: "Anand Shukla", type: "ELECTRICIAN", wage: 100000 },
    { code: "EMP-005", name: "Mahesh Thakur", type: "FOREMAN", wage: 120000 },
  ];

  const todayStr = new Date().toISOString().split("T")[0];

  for (const w of workers) {
    const wm = await prisma.workforceMember.upsert({
      where: {
        organizationId_employeeCode: {
          organizationId: org.id,
          employeeCode: w.code,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        employeeCode: w.code,
        name: w.name,
        workerType: w.type,
        defaultSiteId: site1.id,
        dailyWageRate: w.wage,
        active: true,
      },
    });

    // Check in the first 4 workers for today
    if (w.code !== "EMP-005") {
      await prisma.attendanceSession.upsert({
        where: {
          organizationId_workforceMemberId_siteId_workDate: {
            organizationId: org.id,
            workforceMemberId: wm.id,
            siteId: site1.id,
            workDate: todayStr,
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          workforceMemberId: wm.id,
          siteId: site1.id,
          projectId: project1.id,
          workDate: todayStr,
          checkInAt: new Date(),
          checkInLat: 28.6281,
          checkInLng: 77.3650,
          checkInAccuracyM: 10.0,
          status: "PRESENT",
          createdBy: "usr-sup-1",
        },
      });
    }
  }

  // 12. Create Daily Site Report
  await prisma.dailySiteReport.create({
    data: {
      organizationId: org.id,
      projectId: project1.id,
      reportDate: todayStr,
      progress: "Completed shuttering for 5th floor slab. Rebar tying in progress by team of 4 carpenters and helpers.",
      blockers: "Heavy midday downpour caused 1 hour delay; resumed work after water extraction.",
      safetyNotes: "Safety helmets and harnesses checked before workers ascended external scaffolding.",
      createdBy: "usr-sup-1",
    },
  });

  console.log("✅ Build Track Pro seeded successfully!");
  console.log("-----------------------------------------");
  console.log("Credentials:");
  console.log("  Admin:       admin@buildtrack.pro       / Password123!");
  console.log("  Supervisor:  supervisor@buildtrack.pro  / Password123!");
  console.log("  Finance:     finance@buildtrack.pro     / Password123!");
  console.log("  Storekeeper: store@buildtrack.pro       / Password123!");
  console.log("-----------------------------------------");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
