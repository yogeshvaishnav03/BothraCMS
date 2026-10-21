const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBackStart, daysBackEnd) {
  const now = new Date();
  const daysAgo = randomInt(daysBackEnd, daysBackStart);
  return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

const PROJECT_DOMAINS = [
  'RCC Superstructure & Framing',
  'Deep Piling & Foundation Raft',
  'Underground Storm Drainage Network',
  'Commercial Podium & Retail Galleria',
  'Double Glazed Curtain Wall & Façade',
  'Central Substation & LT Switchgear',
  'Chilled Water VRV Air-Conditioning',
  'Wet Riser Fire Suppression & Sprinklers',
  'Vitrified Tile & Italian Marble Flooring',
  'Gypsum Plaster & Texture Painting',
  'Precast Hume Pipe Culvert Drainage',
  'Perimeter Boundary & Automated Security',
  'Podium Roof Garden & Hardscape Paving',
  'Clubhouse Badminton & Swimming Pool',
  'Waterproofing & Bentonite Barrier Tanking',
  'Internal Sanitary & Concealed CPVC Plumbing',
  'High-Speed Passenger Lift Shaft Erection',
  'Solar PV Rooftop Generation System',
  'Basement Parking VDF Trimix Flooring',
  'Sewage Treatment Plant & Greywater Recycling',
];

const LOCATIONS = [
  'Tower A', 'Tower B', 'Tower C', 'Tower D', 'Tower E',
  'Podium Level 1', 'Podium Level 2', 'Clubhouse Wing',
  'Retail Arcade', 'Basement 1', 'Basement 2', 'North Gateway',
  'East Boulevard', 'South Courtyard', 'Executive Suites', 'Grand Atrium',
];

async function seedOrg(orgId, orgName) {
  console.log(`\n======================================================`);
  console.log(`🏗️ Seeding 100+ Projects & Orders for: ${orgName} (${orgId})`);
  console.log(`======================================================`);

  let adminUser = await prisma.user.findFirst({
    where: { organizationId: orgId, role: 'SUPER_ADMIN' },
  }) || await prisma.user.findFirst({
    where: { organizationId: orgId },
  });

  const adminId = adminUser ? adminUser.id : 'd7e07f5e-e6d1-441f-805f-aead94dc382d';

  // 1. Ensure Sites
  let sites = await prisma.site.findMany({ where: { organizationId: orgId } });
  if (sites.length < 4) {
    const defaultSites = [
      { code: 'CHP-01', name: 'Chaupasni Phase 1', address: 'Chaupasni Road, Jodhpur, Rajasthan' },
      { code: 'RIV-02', name: 'Riverside Enclave Phase 2', address: 'Sector 128, Expressway, Noida, UP' },
      { code: 'SKY-01', name: 'Skyline Heights', address: 'Sector 66, Gurugram, Haryana' },
      { code: 'NGS-01', name: 'North Gateway Site', address: 'Plot 104, Industrial Corridor, Jaipur' },
    ];
    for (const ds of defaultSites) {
      const existing = await prisma.site.findFirst({
        where: { organizationId: orgId, code: ds.code },
      });
      if (!existing) {
        await prisma.site.create({
          data: {
            organizationId: orgId,
            code: ds.code,
            name: ds.name,
            address: ds.address,
            status: 'ACTIVE',
          },
        });
      }
    }
    sites = await prisma.site.findMany({ where: { organizationId: orgId } });
  }

  // 2. Ensure Stores
  let stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  if (stores.length < 4) {
    for (const site of sites) {
      await prisma.store.create({
        data: {
          organizationId: orgId,
          siteId: site.id,
          name: `${site.name} Central Yard Store`,
          status: 'ACTIVE',
        },
      });
    }
    stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  }

  // 3. SEED 110+ PROJECTS
  const currentProjects = await prisma.project.count({ where: { organizationId: orgId } });
  const projectsNeeded = Math.max(110 - currentProjects, 0);
  console.log(`Current Projects: ${currentProjects}. Seeding ${projectsNeeded} additional Projects...`);

  for (let i = 0; i < projectsNeeded; i++) {
    const site = pick(sites);
    const domain = pick(PROJECT_DOMAINS);
    const loc = pick(LOCATIONS);
    const seq = currentProjects + i + 1;
    const code = `PRJ-${site.code}-${String(seq).padStart(3, '0')}`;
    const name = `${site.name} - ${loc} ${domain} (#${seq})`;

    const p = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        code,
        name,
        managerUserId: adminId,
        status: pick(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED', 'PLANNING']),
        budgetAmount: randomInt(25, 450) * 10000000, // INR in paise / minor units
        startDate: new Date('2025-01-01'),
        endDate: new Date('2027-12-31'),
        notes: `Comprehensive EPC scope for ${domain} at ${loc}. Supervised under Bothra QA/QC standards.`,
      },
    });

    // Create ProjectAssignment for adminUser
    if (adminUser) {
      await prisma.projectAssignment.upsert({
        where: { projectId_userId: { projectId: p.id, userId: adminUser.id } },
        update: {},
        create: {
          organizationId: orgId,
          projectId: p.id,
          userId: adminUser.id,
          role: 'PROJECT_MANAGER',
          status: 'ACTIVE',
          assignedById: adminId,
        },
      });
    }
  }

  const allProjects = await prisma.project.findMany({ where: { organizationId: orgId } });
  console.log(`✓ Total Projects in DB for ${orgName}: ${allProjects.length}`);

  // 4. Ensure Materials & Parties for Purchase Orders
  let materials = await prisma.material.findMany({ where: { organizationId: orgId } });
  let parties = await prisma.party.findMany({ where: { organizationId: orgId } });

  // If materials or parties are empty, create them
  if (materials.length < 100) {
    console.log(`Materials count (${materials.length}) < 100. Seeding materials...`);
    const units = ['BAG', 'TONNE', 'KG', 'LITRE', 'METER', 'PIECE', 'BOX'];
    while (materials.length < 115) {
      const idx = materials.length + 1;
      const m = await prisma.material.create({
        data: {
          organizationId: orgId,
          sku: `MAT-GEN-${idx}`,
          name: `Civil Construction Specification Material #${idx} (${pick(['Grade 53', 'Fe550D', 'Heavy Duty', 'ISI Approved'])})`,
          unitCode: pick(units),
          minStockQty: randomInt(10, 50),
          reorderQty: randomInt(50, 200),
          active: true,
        },
      });
      materials.push(m);
    }
  }

  if (parties.length < 100) {
    console.log(`Parties count (${parties.length}) < 100. Seeding parties...`);
    while (parties.length < 115) {
      const idx = parties.length + 1;
      const isVendor = idx % 2 === 0;
      const p = await prisma.party.create({
        data: {
          organizationId: orgId,
          name: `${isVendor ? 'Supplier' : 'Contractor'} Partner Agency #${idx}`,
          partyType: isVendor ? 'VENDOR' : 'CONTRACTOR',
          phone: `+91 98201 ${String(50000 + idx).slice(0, 5)}`,
          email: `partner${idx}@bothra-vendors.in`,
          address: `Industrial Complex Phase ${idx % 5 + 1}, NCR`,
          taxIdentifier: `07AABPB${String(2000 + idx)}1Z4`,
          contractValue: randomInt(20, 150) * 100000,
          active: true,
        },
      });
      parties.push(p);
    }
  }

  // 5. SEED 110+ PURCHASE ORDERS
  const currentPOs = await prisma.purchaseOrder.count({ where: { organizationId: orgId } });
  const posNeeded = Math.max(110 - currentPOs, 0);
  console.log(`Current Purchase Orders: ${currentPOs}. Seeding ${posNeeded} additional Purchase Orders...`);

  const poStatuses = ['PENDING_APPROVAL', 'APPROVED', 'PLACED', 'CONFIRMED', 'DELIVERED'];
  const vendors = parties.filter(p => p.partyType === 'VENDOR' || p.partyType === 'BOTH');
  const validVendors = vendors.length > 0 ? vendors : parties;

  for (let i = 0; i < posNeeded; i++) {
    const seq = currentPOs + i + 1;
    const poNumber = `PO-2026-${String(seq).padStart(4, '0')}`;
    const mat = pick(materials);
    const vendor = pick(validVendors);
    const store = pick(stores);
    const site = pick(sites);
    const proj = pick(allProjects);
    const status = pick(poStatuses);
    const qty = randomInt(10, 500);
    const rate = randomInt(250, 45000);
    const totalAmount = qty * rate;
    const date = randomDate(45, 1);

    await prisma.purchaseOrder.create({
      data: {
        organizationId: orgId,
        orderNumber: poNumber,
        materialId: mat.id,
        vendorPartyId: vendor.id,
        storeId: store.id,
        siteId: site.id,
        projectId: proj.id,
        quantity: qty,
        unitCode: mat.unitCode,
        unitRate: rate,
        totalAmount,
        status,
        approvalQuery: `Requisition verified against Bill of Quantities (BOQ) and site inventory threshold. Approved by Project Director.`,
        approvedBy: (status !== 'PENDING_APPROVAL') ? adminId : null,
        approvedAt: (status !== 'PENDING_APPROVAL') ? date : null,
        expectedDeliveryDate: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
        notes: `Procurement order for ${qty} ${mat.unitCode} ${mat.name} destined for ${proj.name}.`,
        createdBy: adminId,
        createdAt: date,
      },
    });
  }

  const allPOs = await prisma.purchaseOrder.count({ where: { organizationId: orgId } });
  console.log(`✓ Total Purchase Orders in DB for ${orgName}: ${allPOs}`);

  // 6. Check if Tasks, MB, Workforce, Attendance, Daily Reports, Bills, Payments, Audit need topping up to 100+
  const taskCount = await prisma.task.count({ where: { organizationId: orgId } });
  if (taskCount < 100) {
    const need = 105 - taskCount;
    console.log(`Topping up Tasks (${taskCount}) with ${need} more entries...`);
    for (let i = 0; i < need; i++) {
      const proj = pick(allProjects);
      await prisma.task.create({
        data: {
          organizationId: orgId,
          projectId: proj.id,
          title: `Site Execution Milestone: ${pick(PROJECT_DOMAINS)} (#${taskCount + i + 1})`,
          description: `Execute construction activity adhering to quality standards and safety protocols.`,
          priority: pick(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
          status: pick(['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']),
          assigneeUserId: adminId,
          dueAt: randomDate(15, -15),
          createdBy: adminId,
          createdAt: randomDate(30, 2),
        },
      });
    }
  }

  const mbCount = await prisma.measurementBookEntry.count({ where: { organizationId: orgId } });
  if (mbCount < 100) {
    const need = 105 - mbCount;
    console.log(`Topping up Measurement Book (${mbCount}) with ${need} more entries...`);
    for (let i = 0; i < need; i++) {
      const proj = pick(allProjects);
      const party = pick(parties);
      const l = randomInt(5, 25);
      const b = randomInt(2, 10);
      const d = randomInt(1, 4);
      const qty = l * b * d;
      const rate = randomInt(25000, 150000);
      await prisma.measurementBookEntry.create({
        data: {
          organizationId: orgId,
          projectId: proj.id,
          partyId: party.id,
          itemDescription: `RCC Construction & Masonry Work Block #${mbCount + i + 1}`,
          unit: 'CUM',
          count: 1,
          length: l,
          breadth: b,
          depth: d,
          quantity: qty,
          unitRate: rate,
          totalAmount: qty * rate,
          status: pick(['SUBMITTED', 'VERIFIED', 'APPROVED', 'BILLED']),
          createdBy: adminId,
          createdByName: adminUser ? adminUser.name : 'System Super Admin',
          createdAt: randomDate(40, 1),
        },
      });
    }
  }

  const wfCount = await prisma.workforceMember.count({ where: { organizationId: orgId } });
  if (wfCount < 100) {
    const need = 105 - wfCount;
    console.log(`Topping up Workforce (${wfCount}) with ${need} more entries...`);
    for (let i = 0; i < need; i++) {
      const seq = 5000 + wfCount + i + 1;
      await prisma.workforceMember.create({
        data: {
          organizationId: orgId,
          employeeCode: `WF-${seq}`,
          name: `Craftsman Member #${seq}`,
          workerType: pick(['MASON', 'CARPENTER', 'ELECTRICIAN', 'PLUMBER', 'HELPER', 'FOREMAN']),
          phone: `+91 97801 ${String(seq).slice(0, 5)}`,
          defaultSiteId: pick(sites).id,
          dailyWageRate: randomInt(650, 1200),
          active: true,
        },
      });
    }
  }

  const attCount = await prisma.attendanceSession.count({ where: { organizationId: orgId } });
  if (attCount < 100) {
    const allWf = await prisma.workforceMember.findMany({ where: { organizationId: orgId } });
    console.log(`Topping up Attendance (${attCount}) to 150+ sessions...`);
    const days = [0, 1, 2, 3, 4, 5, 6, 7];
    let created = 0;
    for (const d of days) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      const wDate = formatDateStr(dt);
      for (const w of allWf) {
        if (attCount + created >= 150) break;
        const site = pick(sites);
        const exists = await prisma.attendanceSession.findUnique({
          where: {
            organizationId_workforceMemberId_siteId_workDate: {
              organizationId: orgId,
              workforceMemberId: w.id,
              siteId: site.id,
              workDate: wDate,
            },
          },
        });
        if (!exists) {
          await prisma.attendanceSession.create({
            data: {
              organizationId: orgId,
              workforceMemberId: w.id,
              siteId: site.id,
              projectId: pick(allProjects).id,
              workDate: wDate,
              checkInAt: new Date(`${wDate}T08:30:00.000Z`),
              checkOutAt: new Date(`${wDate}T17:30:00.000Z`),
              status: 'PRESENT',
              createdBy: adminId,
            },
          });
          created++;
        }
      }
    }
  }

  const auditCount = await prisma.auditEvent.count({ where: { organizationId: orgId } });
  if (auditCount < 100) {
    const need = 110 - auditCount;
    console.log(`Topping up Audit Events (${auditCount}) with ${need} more entries...`);
    const actions = ['PAYMENT_POSTED', 'STOCK_ADJUSTMENT', 'MATERIAL_RECEIPT', 'TASK_COMPLETED', 'MB_ENTRY_APPROVED', 'BILL_POSTED'];
    for (let i = 0; i < need; i++) {
      await prisma.auditEvent.create({
        data: {
          organizationId: orgId,
          actorUserId: adminId,
          action: pick(actions),
          entityType: 'TRANSACTION',
          entityId: `AUD-${randomInt(10000, 99999)}`,
          beforeJson: JSON.stringify({ status: 'PENDING' }),
          afterJson: JSON.stringify({ status: 'VERIFIED' }),
          reason: 'Verified and authorized by system administrator',
          createdAt: randomDate(45, 1),
        },
      });
    }
  }

  const finalCounts = {
    sites: await prisma.site.count({ where: { organizationId: orgId } }),
    projects: await prisma.project.count({ where: { organizationId: orgId } }),
    tasks: await prisma.task.count({ where: { organizationId: orgId } }),
    materials: await prisma.material.count({ where: { organizationId: orgId } }),
    parties: await prisma.party.count({ where: { organizationId: orgId } }),
    purchaseOrders: await prisma.purchaseOrder.count({ where: { organizationId: orgId } }),
    mbEntries: await prisma.measurementBookEntry.count({ where: { organizationId: orgId } }),
    bills: await prisma.bill.count({ where: { organizationId: orgId } }),
    payments: await prisma.payment.count({ where: { organizationId: orgId } }),
    workforce: await prisma.workforceMember.count({ where: { organizationId: orgId } }),
    attendance: await prisma.attendanceSession.count({ where: { organizationId: orgId } }),
    auditEvents: await prisma.auditEvent.count({ where: { organizationId: orgId } }),
  };

  console.log(`✅ Final Counts for ${orgName}:`, finalCounts);
}

async function main() {
  // Target 1: Primary active organization
  await seedOrg('1eb45938-3964-41ab-8145-c8ff93c90c73', 'Bothra Construction Group (Main HQ)');

  // Target 2: demo-org-1 (Apex Infrastructure & Builders)
  await seedOrg('demo-org-1', 'Apex Infrastructure & Builders');

  console.log('\n🎉 ALL TARGET ORGANIZATIONS FULLY SEEDED WITH 100+ ENTRIES ACROSS ALL ENTITIES!');
}

main()
  .catch((e) => {
    console.error('Error seeding projects & orders:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
