import { prisma } from "@/lib/db";

/**
 * Service to seed rich, realistic demo data for Day Book
 * Ensures that any organization (development, staging, or production sandbox)
 * has full Day Book records (Payments, Bills, Stock Receipts/Issues,
 * Workforce Headcounts, Attendance Sessions, Daily Site Reports).
 */
export class DayBookSeedService {
  static async seedDemoDataForOrg(organizationId: string, targetDateStr?: string) {
    const todayStr = new Date().toISOString().split("T")[0];
    const baseDate = targetDateStr || todayStr;

    // Calculate dates: target date, yesterday, and day before
    const d1 = new Date(baseDate);
    const d2 = new Date(d1.getTime() - 86400000);
    const d3 = new Date(d1.getTime() - 2 * 86400000);

    const dates = [
      baseDate,
      d2.toISOString().split("T")[0],
      d3.toISOString().split("T")[0],
    ];

    // 1. Get or create admin user
    let user = await prisma.user.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          organizationId,
          name: "Vikram Malhotra",
          email: `admin-${organizationId.slice(0, 6)}@buildtrack.pro`,
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr",
          role: "ORG_ADMIN",
          status: "ACTIVE",
        },
      });
    }

    // 2. Ensure Sites exist
    let site1 = await prisma.site.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    if (!site1) {
      site1 = await prisma.site.create({
        data: {
          organizationId,
          name: "Skyline Heights Sector 62",
          code: `SKY-${organizationId.slice(0, 4).toUpperCase()}`,
          address: "Plot 14B, Sector 62, Noida, Uttar Pradesh 201309",
          status: "ACTIVE",
        },
      });
    }

    let site2 = await prisma.site.findFirst({
      where: { organizationId, id: { not: site1.id } },
    });

    if (!site2) {
      site2 = await prisma.site.create({
        data: {
          organizationId,
          name: "Riverside Enclave Phase 2",
          code: `RIV-${organizationId.slice(0, 4).toUpperCase()}`,
          address: "Sector 128, Expressway, Noida, Uttar Pradesh",
          status: "ACTIVE",
        },
      });
    }

    // 3. Ensure Projects exist
    let project1 = await prisma.project.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    if (!project1) {
      project1 = await prisma.project.create({
        data: {
          organizationId,
          siteId: site1.id,
          name: "Tower A Structural Frame",
          code: `PRJ-SKY-A`,
          budgetAmount: 4500000000,
          managerUserId: user.id,
          status: "IN_PROGRESS",
        },
      });
    }

    // 4. Ensure Store exists
    let store1 = await prisma.store.findFirst({
      where: { organizationId },
    });

    if (!store1) {
      store1 = await prisma.store.create({
        data: {
          organizationId,
          siteId: site1.id,
          name: "Skyline Main Yard Store",
          status: "ACTIVE",
        },
      });
    }

    // 5. Ensure Materials exist
    const materialDefs = [
      { name: "UltraTech Cement PPC (50kg)", sku: `CEM-PPC-${organizationId.slice(0, 4)}`, unitCode: "BAG", minStock: 200 },
      { name: "Tata Tiscon Fe550D TMT Rebar 12mm", sku: `STL-12M-${organizationId.slice(0, 4)}`, unitCode: "TONNE", minStock: 10 },
      { name: "Coarse Washed River Sand", sku: `AGG-SND-${organizationId.slice(0, 4)}`, unitCode: "TONNE", minStock: 50 },
    ];

    const materials = [];
    for (const m of materialDefs) {
      let mat = await prisma.material.findFirst({
        where: { organizationId, name: m.name },
      });
      if (!mat) {
        mat = await prisma.material.create({
          data: {
            organizationId,
            name: m.name,
            sku: m.sku,
            unitCode: m.unitCode,
            minStockQty: m.minStock,
          },
        });
      }
      materials.push(mat);
    }

    // 6. Ensure Parties exist
    const partyDefs = [
      { name: "Ramesh RCC & Masonry Works", type: "CONTRACTOR" },
      { name: "Apex Cement & Building Supplies", type: "VENDOR" },
      { name: "Jindal Steel & Power Distributors", type: "VENDOR" },
      { name: "Krishna Shuttering & Scaffolding Services", type: "CONTRACTOR" },
      { name: "Site Petty Cash & Local Hardware", type: "VENDOR" },
    ];

    const parties = [];
    for (const p of partyDefs) {
      let party = await prisma.party.findFirst({
        where: { organizationId, name: p.name },
      });
      if (!party) {
        party = await prisma.party.create({
          data: {
            organizationId,
            name: p.name,
            partyType: p.type,
            taxIdentifier: "07AAAAA0000A1Z5",
          },
        });
      }
      parties.push(party);
    }

    // 7. Ensure Workforce Members exist
    const workerDefs = [
      { name: "Sunil Paswan", code: `EMP-001-${organizationId.slice(0, 3)}`, type: "MASON", wage: 85000 },
      { name: "Dinesh Yadav", code: `EMP-002-${organizationId.slice(0, 3)}`, type: "CARPENTER", wage: 80000 },
      { name: "Raju Barman", code: `EMP-003-${organizationId.slice(0, 3)}`, type: "HELPER", wage: 55000 },
      { name: "Anand Shukla", code: `EMP-004-${organizationId.slice(0, 3)}`, type: "ELECTRICIAN", wage: 90000 },
      { name: "Mahesh Thakur", code: `EMP-005-${organizationId.slice(0, 3)}`, type: "FOREMAN", wage: 110000 },
      { name: "Kallu Ram", code: `EMP-006-${organizationId.slice(0, 3)}`, type: "MASON", wage: 85000 },
      { name: "Santosh Kumar", code: `EMP-007-${organizationId.slice(0, 3)}`, type: "HELPER", wage: 55000 },
      { name: "Vijay Shuttering", code: `EMP-008-${organizationId.slice(0, 3)}`, type: "CARPENTER", wage: 80000 },
    ];

    const workers = [];
    for (const w of workerDefs) {
      let worker = await prisma.workforceMember.findFirst({
        where: { organizationId, employeeCode: w.code },
      });
      if (!worker) {
        worker = await prisma.workforceMember.create({
          data: {
            organizationId,
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

    // 8. Seed transactions for dates
    for (const dateStr of dates) {
      const noonUtc = `${dateStr}T12:00:00.000Z`;
      const morningUtc = `${dateStr}T09:30:00.000Z`;
      const afternoonUtc = `${dateStr}T14:15:00.000Z`;
      const eveningUtc = `${dateStr}T17:45:00.000Z`;

      // A. BILLS
      const bills = [
        {
          party: parties[1],
          num: `INV-CEM-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`,
          amount: 15200000,
          notes: "Supply of 400 Bags UltraTech PPC 53 Grade Cement",
          desc: "UltraTech PPC Cement (50kg)",
          qty: 400,
          rate: 38000,
        },
        {
          party: parties[2],
          num: `INV-STL-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-02`,
          amount: 32000000,
          notes: "Supply of 5.0 MT Tata Tiscon 12mm TMT Rebar for 4th Floor Slab",
          desc: "Tata Tiscon Fe550D TMT Rebar 12mm",
          qty: 5,
          rate: 6400000,
        },
        {
          party: parties[0],
          num: `RA-BILL-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-03`,
          amount: 8500000,
          notes: "Running Account Bill #4 - 3rd Floor Brickwork & Internal Plastering",
          desc: "Brickwork 9-inch wall (sqm)",
          qty: 150,
          rate: 56667,
        },
      ];

      for (const b of bills) {
        const existing = await prisma.bill.findFirst({
          where: { organizationId, billNumber: b.num },
        });
        if (!existing) {
          await prisma.bill.create({
            data: {
              organizationId,
              partyId: b.party.id,
              projectId: project1.id,
              billNumber: b.num,
              billDate: new Date(noonUtc),
              dueDate: new Date(new Date(noonUtc).getTime() + 15 * 86400000),
              totalAmount: b.amount,
              status: "POSTED",
              notes: b.notes,
              createdBy: user.id,
              createdAt: new Date(morningUtc),
              lines: {
                create: [
                  {
                    description: b.desc,
                    quantity: b.qty,
                    unitRate: b.rate,
                    lineTotal: b.amount,
                  },
                ],
              },
            },
          });
        }
      }

      // B. PAYMENTS
      const payments = [
        {
          party: parties[1],
          amount: 7500000,
          method: "BANK_TRANSFER",
          account: "HDFC Operating Bank A/C",
          ref: `NEFT-HDFC-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-101`,
          notes: "Part payment against cement supply challan #400",
        },
        {
          party: parties[0],
          amount: 4000000,
          method: "UPI",
          account: "ICICI Primary A/C",
          ref: `UPI-YESB-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-882`,
          notes: "Weekly labor advance payment to contractor Ramesh",
        },
        {
          party: parties[3],
          amount: 1850000,
          method: "CHEQUE",
          account: "HDFC Operating Bank A/C",
          ref: `CHQ-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "").slice(-4)}19`,
          notes: "Monthly scaffolding & shuttering rental charges",
        },
        {
          party: parties[4],
          amount: 1150000,
          method: "CASH",
          account: "Site Petty Cash Box",
          ref: `PETTY-CASH-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-04`,
          notes: "Site diesel purchase (100L) for DG Set and minor hardware tools",
        },
      ];

      for (const p of payments) {
        const existing = await prisma.payment.findFirst({
          where: { organizationId, referenceNumber: p.ref },
        });
        if (!existing) {
          await prisma.payment.create({
            data: {
              organizationId,
              partyId: p.party.id,
              projectId: project1.id,
              paymentDate: new Date(noonUtc),
              amount: p.amount,
              currency: "INR",
              method: p.method,
              payingAccount: p.account,
              referenceNumber: p.ref,
              idempotencyKey: `IDEMP-${p.ref}`,
              status: "POSTED",
              notes: p.notes,
              createdBy: user.id,
              createdAt: new Date(afternoonUtc),
            },
          });
        }
      }

      // C. STOCK MOVEMENTS
      const grnRef = `GRN-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`;
      const existingGrn = await prisma.stockMovement.findFirst({
        where: { organizationId, referenceDoc: grnRef },
      });
      if (!existingGrn && materials[0]) {
        await prisma.stockMovement.create({
          data: {
            organizationId,
            materialId: materials[0].id,
            storeId: store1.id,
            movementType: "RECEIPT",
            quantityDelta: 400,
            unitCode: "BAG",
            unitRate: 38000,
            vendorPartyId: parties[1].id,
            projectId: project1.id,
            referenceDoc: grnRef,
            notes: "Received 400 bags PPC Cement from Apex Cement. Quality verified.",
            movementAt: new Date(morningUtc),
            createdAt: new Date(morningUtc),
            createdBy: user.id,
          },
        });
      }

      const ginRef = `GIN-${organizationId.slice(0, 3)}-${dateStr.replace(/-/g, "")}-01`;
      const existingGin = await prisma.stockMovement.findFirst({
        where: { organizationId, referenceDoc: ginRef },
      });
      if (!existingGin && materials[0]) {
        await prisma.stockMovement.create({
          data: {
            organizationId,
            materialId: materials[0].id,
            storeId: store1.id,
            movementType: "ISSUE",
            quantityDelta: -120,
            unitCode: "BAG",
            unitRate: 38000,
            projectId: project1.id,
            referenceDoc: ginRef,
            notes: "Issued 120 bags cement for 4th-floor column casting work",
            movementAt: new Date(afternoonUtc),
            createdAt: new Date(afternoonUtc),
            createdBy: user.id,
          },
        });
      }

      // D. WORKFORCE HEADCOUNT
      const existingHeadcount = await prisma.workforceHeadcount.findFirst({
        where: { organizationId, siteId: site1.id, date: dateStr, shift: "DAY" },
      });
      if (!existingHeadcount) {
        await prisma.workforceHeadcount.create({
          data: {
            organizationId,
            siteId: site1.id,
            siteName: site1.name,
            date: dateStr,
            shift: "DAY",
            contractorName: "Ramesh RCC & Masonry Works",
            artisanCount: 14,
            craftsmanCount: 8,
            laborerMale: 22,
            laborerFemale: 10,
            laborerTotal: 32,
            grandTotal: 54,
            notes: "General morning shift deployment: 4th-floor casting, brickwork grid 4-8",
            supervisorId: user.id,
            supervisorName: user.name,
            createdAt: new Date(morningUtc),
          },
        });
      }

      // E. ATTENDANCE SESSIONS
      for (const w of workers) {
        const existingAtt = await prisma.attendanceSession.findFirst({
          where: { organizationId, workforceMemberId: w.id, workDate: dateStr },
        });
        if (!existingAtt) {
          await prisma.attendanceSession.create({
            data: {
              organizationId,
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
              createdBy: user.id,
            },
          });
        }
      }

      // F. DAILY SITE REPORT (DSR)
      const existingDsr = await prisma.dailySiteReport.findFirst({
        where: { organizationId, projectId: project1.id, reportDate: dateStr },
      });
      if (!existingDsr) {
        await prisma.dailySiteReport.create({
          data: {
            organizationId,
            projectId: project1.id,
            reportDate: dateStr,
            progress: "Completed shuttering and rebar binding for 4th-floor columns (Columns C1 to C12). Concreting of 6 columns completed with 120 bags cement. Brickwork ongoing on 3rd floor west wing.",
            blockers: "Tower crane cable inspected and lubricated. Ready Mix Concrete truck delayed by 30 mins due to ring-road traffic.",
            safetyNotes: "Morning tool-box talk conducted at 08:30 AM covering fall protection and safety harness compliance. Zero accidents or injuries recorded.",
            createdBy: user.id,
            createdAt: new Date(eveningUtc),
          },
        });
      }
    }

    return { success: true, organizationId, baseDate };
  }
}
