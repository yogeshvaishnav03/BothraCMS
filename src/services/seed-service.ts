import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export interface SeedResult {
  organizationId: string;
  organizationName: string;
  sitesCreated: number;
  storesCreated: number;
  projectsCreated: number;
  materialsCreated: number;
  partiesCreated: number;
  tasksCreated: number;
  billsCreated: number;
  paymentsCreated: number;
  workforceCreated: number;
  attendanceCreated: number;
  dailyReportsCreated: number;
}

export async function seedDemoData(
  targetOrgId?: string,
  actorUserId?: string
): Promise<SeedResult> {
  // 1. Resolve or create target organization
  let org = targetOrgId
    ? await prisma.organization.findUnique({ where: { id: targetOrgId } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });

  if (!org) {
    org = await prisma.organization.upsert({
      where: { id: targetOrgId || "demo-org-1" },
      update: {},
      create: {
        id: targetOrgId || "demo-org-1",
        name: "Bothra Infrastructure & Builders",
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });
  }

  const orgId = org.id;
  const defaultPasswordHash = await hashPassword("Password123!");

  // 2. Ensure standard role accounts exist for this organization
  const standardUsers = [
    {
      id: `usr-super-${orgId.slice(0, 4)}`,
      name: "Master Super Admin",
      email: "superadmin@buildtrack.pro",
      role: "SUPER_ADMIN",
    },
    {
      id: `usr-admin-${orgId.slice(0, 4)}`,
      name: "Vikram Malhotra",
      email: "admin@buildtrack.pro",
      role: "ORG_ADMIN",
    },
    {
      id: `usr-pm-${orgId.slice(0, 4)}`,
      name: "Arjun Verma",
      email: "pm@buildtrack.pro",
      role: "PROJECT_MANAGER",
    },
    {
      id: `usr-sup-${orgId.slice(0, 4)}`,
      name: "Rajesh Kumar",
      email: "supervisor@buildtrack.pro",
      role: "SITE_SUPERVISOR",
    },
    {
      id: `usr-store-${orgId.slice(0, 4)}`,
      name: "Mohan Lal",
      email: "store@buildtrack.pro",
      role: "STOREKEEPER",
    },
    {
      id: `usr-fin-${orgId.slice(0, 4)}`,
      name: "Pooja Sharma",
      email: "finance@buildtrack.pro",
      role: "ACCOUNTANT",
    },
  ];

  const userMap: Record<string, string> = {};
  for (const u of standardUsers) {
    const userRec = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: orgId,
          email: u.email,
        },
      },
      update: { role: u.role },
      create: {
        id: u.id,
        organizationId: orgId,
        name: u.name,
        email: u.email,
        passwordHash: defaultPasswordHash,
        role: u.role,
        status: "ACTIVE",
      },
    });
    userMap[u.role] = userRec.id;
  }

  const supervisorId = userMap["SITE_SUPERVISOR"] || userMap["ORG_ADMIN"] || actorUserId || userMap["SUPER_ADMIN"];
  const pmId = userMap["PROJECT_MANAGER"] || userMap["ORG_ADMIN"] || actorUserId || userMap["SUPER_ADMIN"];
  const storekeeperId = userMap["STOREKEEPER"] || userMap["ORG_ADMIN"] || actorUserId || userMap["SUPER_ADMIN"];
  const accountantId = userMap["ACCOUNTANT"] || userMap["ORG_ADMIN"] || actorUserId || userMap["SUPER_ADMIN"];

  // 3. Create Sites
  const site1 = await prisma.site.upsert({
    where: {
      organizationId_code: { organizationId: orgId, code: "SKY-62" },
    },
    update: { status: "ACTIVE" },
    create: {
      organizationId: orgId,
      name: "Skyline Heights Sector 62",
      code: "SKY-62",
      address: "Plot 14B, Sector 62, Noida, Uttar Pradesh 201309",
      latitude: 28.628,
      longitude: 77.3649,
      status: "ACTIVE",
    },
  });

  const site2 = await prisma.site.upsert({
    where: {
      organizationId_code: { organizationId: orgId, code: "RIV-128" },
    },
    update: { status: "ACTIVE" },
    create: {
      organizationId: orgId,
      name: "Riverside Enclave Phase 2",
      code: "RIV-128",
      address: "Expressway Boulevard, Sector 128, Noida, Uttar Pradesh 201304",
      latitude: 28.52,
      longitude: 77.38,
      status: "ACTIVE",
    },
  });

  // 4. Create Stores
  const store1 = await prisma.store.upsert({
    where: { id: `store-sky-${orgId.slice(0, 4)}` },
    update: { status: "ACTIVE" },
    create: {
      id: `store-sky-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      siteId: site1.id,
      name: "Skyline Main Yard Store",
      status: "ACTIVE",
    },
  });

  const store2 = await prisma.store.upsert({
    where: { id: `store-riv-${orgId.slice(0, 4)}` },
    update: { status: "ACTIVE" },
    create: {
      id: `store-riv-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      siteId: site2.id,
      name: "Riverside Site Store",
      status: "ACTIVE",
    },
  });

  // 5. Create Projects
  const project1 = await prisma.project.upsert({
    where: {
      organizationId_code: { organizationId: orgId, code: "PRJ-SKY-A" },
    },
    update: { status: "IN_PROGRESS" },
    create: {
      organizationId: orgId,
      siteId: site1.id,
      code: "PRJ-SKY-A",
      name: "Tower A Structural Frame",
      managerUserId: pmId,
      status: "IN_PROGRESS",
      startDate: new Date("2026-01-15T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      budgetAmount: 4500000000, // 4.5 Crores INR (in paise)
      notes: "14-story residential tower structural framing and masonry",
    },
  });

  const project2 = await prisma.project.upsert({
    where: {
      organizationId_code: { organizationId: orgId, code: "PRJ-RIV-B" },
    },
    update: { status: "IN_PROGRESS" },
    create: {
      organizationId: orgId,
      siteId: site2.id,
      code: "PRJ-RIV-B",
      name: "Riverside Commercial Plaza",
      managerUserId: pmId,
      status: "IN_PROGRESS",
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: new Date("2027-04-30T00:00:00Z"),
      budgetAmount: 6800000000, // 6.8 Crores INR (in paise)
      notes: "G+4 Commercial Complex with basement parking",
    },
  });

  // 6. Material Categories
  const catCement = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: orgId, name: "Cement & Aggregates" } },
    update: {},
    create: { organizationId: orgId, name: "Cement & Aggregates" },
  });

  const catSteel = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: orgId, name: "Structural Steel" } },
    update: {},
    create: { organizationId: orgId, name: "Structural Steel" },
  });

  const catPaints = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: orgId, name: "Paints & Chemicals" } },
    update: {},
    create: { organizationId: orgId, name: "Paints & Chemicals" },
  });

  const catElectrical = await prisma.materialCategory.upsert({
    where: { organizationId_name: { organizationId: orgId, name: "Electrical & Conduit" } },
    update: {},
    create: { organizationId: orgId, name: "Electrical & Conduit" },
  });

  // 7. Materials
  const materialsList = [
    {
      sku: "CEM-PPC-50",
      name: "UltraTech Cement PPC (50kg)",
      categoryId: catCement.id,
      unitCode: "BAG",
      minStockQty: 100,
      reorderQty: 250,
      initialQty: 350,
      unitRate: 38000, // ₹380
    },
    {
      sku: "STL-TMT-12",
      name: "Tata Tiscon Fe550D TMT Rebar 12mm",
      categoryId: catSteel.id,
      unitCode: "TONNE",
      minStockQty: 15,
      reorderQty: 30,
      initialQty: 40,
      unitRate: 6200000, // ₹62,000
    },
    {
      sku: "AGG-SND-CRS",
      name: "Coarse Washed River Sand",
      categoryId: catCement.id,
      unitCode: "TONNE",
      minStockQty: 40,
      reorderQty: 80,
      initialQty: 120,
      unitRate: 140000, // ₹1,400
    },
    {
      sku: "PNT-APX-WHT",
      name: "Asian Paints Apex Ultima White (20L)",
      categoryId: catPaints.id,
      unitCode: "LITRE",
      minStockQty: 30,
      reorderQty: 60,
      initialQty: 80,
      unitRate: 24000, // ₹240
    },
    {
      sku: "ELC-FNP-25",
      name: "Finolex 2.5 sq mm FR Wire (90m)",
      categoryId: catElectrical.id,
      unitCode: "COIL",
      minStockQty: 20,
      reorderQty: 50,
      initialQty: 65,
      unitRate: 185000, // ₹1,850
    },
  ];

  const materialMap: Record<string, string> = {};
  for (const m of materialsList) {
    const mat = await prisma.material.upsert({
      where: { organizationId_sku: { organizationId: orgId, sku: m.sku } },
      update: {
        categoryId: m.categoryId,
        name: m.name,
        minStockQty: m.minStockQty,
        reorderQty: m.reorderQty,
      },
      create: {
        organizationId: orgId,
        categoryId: m.categoryId,
        sku: m.sku,
        name: m.name,
        unitCode: m.unitCode,
        minStockQty: m.minStockQty,
        reorderQty: m.reorderQty,
      },
    });
    materialMap[m.sku] = mat.id;
  }

  // 8. Parties
  const partyAsianPaints = await prisma.party.upsert({
    where: { id: `party-ap-${orgId.slice(0, 4)}` },
    update: {},
    create: {
      id: `party-ap-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyType: "VENDOR",
      name: "Asian Paints Ltd",
      phone: "+91 98110 22334",
      email: "supplies@asianpaints.com",
      address: "Plot 8, Okhla Industrial Area Phase 3, New Delhi",
      taxIdentifier: "07AAACA1234D1Z2",
    },
  });

  const partyJindalSteel = await prisma.party.upsert({
    where: { id: `party-js-${orgId.slice(0, 4)}` },
    update: {},
    create: {
      id: `party-js-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyType: "VENDOR",
      name: "Jindal Steel & Power Distributors",
      phone: "+91 98220 55443",
      email: "orders@jindalsteel.com",
      address: "Steel Yard Complex, Ghaziabad",
      taxIdentifier: "09AAACJ5678K1Z5",
    },
  });

  const partyRameshContractor = await prisma.party.upsert({
    where: { id: `party-ramesh-${orgId.slice(0, 4)}` },
    update: {},
    create: {
      id: `party-ramesh-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyType: "CONTRACTOR",
      name: "Ramesh RCC & Masonry Works",
      phone: "+91 98990 11223",
      email: "ramesh.contractor@gmail.com",
      address: "Sector 18, Noida",
    },
  });

  const partySharmaElec = await prisma.party.upsert({
    where: { id: `party-sharma-${orgId.slice(0, 4)}` },
    update: {},
    create: {
      id: `party-sharma-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyType: "CONTRACTOR",
      name: "Sharma Electricals & Contractors",
      phone: "+91 98101 99887",
      email: "sharma.electricals@gmail.com",
      address: "Sector 63, Noida",
    },
  });

  // 9. Initial Material Receipts & Stock Balances
  for (const m of materialsList) {
    const matId = materialMap[m.sku];
    if (!matId) continue;

    const existingMov = await prisma.stockMovement.findFirst({
      where: {
        organizationId: orgId,
        materialId: matId,
        storeId: store1.id,
        referenceDoc: `INIT-${m.sku}`,
      },
    });

    if (!existingMov) {
      await prisma.stockMovement.create({
        data: {
          organizationId: orgId,
          materialId: matId,
          storeId: store1.id,
          movementType: "RECEIPT",
          quantityDelta: m.initialQty,
          unitCode: m.unitCode,
          unitRate: m.unitRate,
          referenceDoc: `INIT-${m.sku}`,
          vendorPartyId: m.sku.startsWith("PNT") ? partyAsianPaints.id : partyJindalSteel.id,
          notes: "Initial inventory setup challan",
          createdBy: storekeeperId,
        },
      });
    }

    await prisma.stockBalance.upsert({
      where: {
        materialId_storeId: {
          materialId: matId,
          storeId: store1.id,
        },
      },
      update: { quantityOnHand: m.initialQty },
      create: {
        materialId: matId,
        storeId: store1.id,
        quantityOnHand: m.initialQty,
      },
    });
  }

  // 10. Tasks
  const demoTasks = [
    {
      id: `task-pour-${orgId.slice(0, 4)}`,
      title: "Pour Concrete on 5th Floor Slab",
      description: "Cast M25 grade concrete on floor slab including shuttering and bar placement verification.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      projectId: project1.id,
      assigneeUserId: supervisorId,
      dueDays: 2,
    },
    {
      id: `task-rebar-${orgId.slice(0, 4)}`,
      title: "Column Rebar Tying & Shuttering",
      description: "Tie 12mm and 16mm rebar rings for grid C1 to C8 columns.",
      priority: "CRITICAL",
      status: "TODO",
      projectId: project1.id,
      assigneeUserId: supervisorId,
      dueDays: 1,
    },
    {
      id: `task-conduit-${orgId.slice(0, 4)}`,
      title: "Conduit Pipe Laying in Ceiling Slab",
      description: "Lay 25mm PVC heavy duty electrical conduits before concrete pour.",
      priority: "MEDIUM",
      status: "IN_PROGRESS",
      projectId: project1.id,
      assigneeUserId: supervisorId,
      dueDays: 3,
    },
    {
      id: `task-plaster-${orgId.slice(0, 4)}`,
      title: "External Plaster Quality Inspection",
      description: "Check vertical plumb and line of external 1:4 cement mortar plaster.",
      priority: "LOW",
      status: "DONE",
      projectId: project2.id,
      assigneeUserId: pmId,
      dueDays: -1,
    },
  ];

  for (const t of demoTasks) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: { status: t.status },
      create: {
        id: t.id,
        organizationId: orgId,
        projectId: t.projectId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assigneeUserId: t.assigneeUserId,
        dueAt: new Date(Date.now() + 86400000 * t.dueDays),
        createdBy: pmId,
      },
    });
  }

  // 11. Bills & Payments
  const bill1 = await prisma.bill.upsert({
    where: {
      organizationId_partyId_billNumber: {
        organizationId: orgId,
        partyId: partyAsianPaints.id,
        billNumber: `INV-AP-8801`,
      },
    },
    update: {},
    create: {
      id: `bill-ap-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyId: partyAsianPaints.id,
      projectId: project1.id,
      billNumber: `INV-AP-8801`,
      billDate: new Date("2026-10-01T00:00:00Z"),
      dueDate: new Date("2026-10-31T00:00:00Z"),
      totalAmount: 1920000, // ₹19,200
      status: "POSTED",
      createdBy: accountantId,
      lines: {
        create: [
          {
            description: "Asian Paints Apex Ultima White 20L (4 drums)",
            materialId: materialMap["PNT-APX-WHT"],
            quantity: 80,
            unitRate: 24000,
            lineTotal: 1920000,
          },
        ],
      },
    },
  });

  const bill2 = await prisma.bill.upsert({
    where: {
      organizationId_partyId_billNumber: {
        organizationId: orgId,
        partyId: partyJindalSteel.id,
        billNumber: `INV-JS-4420`,
      },
    },
    update: {},
    create: {
      id: `bill-js-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyId: partyJindalSteel.id,
      projectId: project1.id,
      billNumber: `INV-JS-4420`,
      billDate: new Date("2026-10-05T00:00:00Z"),
      dueDate: new Date("2026-11-05T00:00:00Z"),
      totalAmount: 124000000, // ₹12,40,000 (20 Tonnes @ ₹62k)
      status: "POSTED",
      createdBy: accountantId,
      lines: {
        create: [
          {
            description: "Tata Tiscon Fe550D TMT Rebar 12mm (20 tonnes)",
            materialId: materialMap["STL-TMT-12"],
            quantity: 20,
            unitRate: 6200000,
            lineTotal: 124000000,
          },
        ],
      },
    },
  });

  // Payments against bills
  await prisma.payment.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: orgId,
        idempotencyKey: `pay-ap-${orgId.slice(0, 4)}`,
      },
    },
    update: {},
    create: {
      id: `pay-ap-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyId: partyAsianPaints.id,
      projectId: project1.id,
      paymentDate: new Date("2026-10-10T00:00:00Z"),
      amount: 1000000, // ₹10,000 part-payment
      currency: "INR",
      method: "BANK_TRANSFER",
      referenceNumber: "NEFT-HDFC-889102",
      status: "POSTED",
      idempotencyKey: `pay-ap-${orgId.slice(0, 4)}`,
      notes: "Part payment against invoice INV-AP-8801",
      createdBy: accountantId,
      allocations: {
        create: [
          {
            billId: bill1.id,
            amount: 1000000,
          },
        ],
      },
    },
  });

  await prisma.payment.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: orgId,
        idempotencyKey: `pay-js-${orgId.slice(0, 4)}`,
      },
    },
    update: {},
    create: {
      id: `pay-js-${orgId.slice(0, 4)}`,
      organizationId: orgId,
      partyId: partyJindalSteel.id,
      projectId: project1.id,
      paymentDate: new Date("2026-10-12T00:00:00Z"),
      amount: 50000000, // ₹5,00,000 part-payment
      currency: "INR",
      method: "BANK_TRANSFER",
      referenceNumber: "RTGS-ICICI-49102",
      status: "POSTED",
      idempotencyKey: `pay-js-${orgId.slice(0, 4)}`,
      notes: "Advance/part settlement against invoice INV-JS-4420",
      createdBy: accountantId,
      allocations: {
        create: [
          {
            billId: bill2.id,
            amount: 50000000,
          },
        ],
      },
    },
  });

  // 12. Workforce Members & Today's Attendance
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
          organizationId: orgId,
          employeeCode: w.code,
        },
      },
      update: { active: true },
      create: {
        organizationId: orgId,
        employeeCode: w.code,
        name: w.name,
        workerType: w.type,
        defaultSiteId: site1.id,
        dailyWageRate: w.wage,
        active: true,
      },
    });

    // Check in workers for today (first 4 present, 5th absent)
    if (w.code !== "EMP-005") {
      await prisma.attendanceSession.upsert({
        where: {
          organizationId_workforceMemberId_siteId_workDate: {
            organizationId: orgId,
            workforceMemberId: wm.id,
            siteId: site1.id,
            workDate: todayStr,
          },
        },
        update: { status: "PRESENT" },
        create: {
          organizationId: orgId,
          workforceMemberId: wm.id,
          siteId: site1.id,
          projectId: project1.id,
          workDate: todayStr,
          checkInAt: new Date(),
          checkInLat: 28.6281,
          checkInLng: 77.365,
          checkInAccuracyM: 10.0,
          status: "PRESENT",
          createdBy: supervisorId,
        },
      });
    }
  }

  // 13. Daily Site Report
  const existingReport = await prisma.dailySiteReport.findFirst({
    where: {
      organizationId: orgId,
      projectId: project1.id,
      reportDate: todayStr,
    },
  });

  if (!existingReport) {
    await prisma.dailySiteReport.create({
      data: {
        organizationId: orgId,
        projectId: project1.id,
        reportDate: todayStr,
        progress: "Completed shuttering for 5th floor slab. Rebar tying in progress by team of 4 carpenters and helpers.",
        blockers: "Heavy midday downpour caused 1 hour delay; resumed work after water extraction.",
        safetyNotes: "Safety helmets and harnesses checked before workers ascended external scaffolding.",
        createdBy: supervisorId,
      },
    });
  }

  // 14. Audit Log
  if (actorUserId) {
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId,
          action: "ADMIN_SEED_DEMO_DATA",
          entityType: "ORGANIZATION",
          entityId: orgId,
          reason: "Super Admin executed one-click comprehensive demo data generation",
        },
      });
    } catch (auditErr) {
      console.warn("Could not write audit log for seed:", auditErr);
    }
  }

  return {
    organizationId: orgId,
    organizationName: org.name,
    sitesCreated: 2,
    storesCreated: 2,
    projectsCreated: 2,
    materialsCreated: materialsList.length,
    partiesCreated: 4,
    tasksCreated: demoTasks.length,
    billsCreated: 2,
    paymentsCreated: 2,
    workforceCreated: workers.length,
    attendanceCreated: 4,
    dailyReportsCreated: 1,
  };
}
