/**
 * BothraCMS / BuildTrack Pro - Authoritative Website Data Loader
 *
 * Reads authoritative website records from `data/website-data.json`
 * and cleanly loads / upserts them into the active database (SQLite or PostgreSQL).
 *
 * Can be run directly via:
 *   node scripts/load-website-data.js
 * Or via npm:
 *   npm run db:load-data
 */

const fs = require("fs");
const path = require("path");

// 1. Load environment variables from .env if present
const envFile = path.resolve(__dirname, "..", ".env");
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

function getOptimalDbUrl() {
  const directCandidate =
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    "file:./dev.db";

  if (!directCandidate || directCandidate.startsWith("file:")) {
    return directCandidate;
  }

  try {
    const u = new URL(directCandidate);
    u.searchParams.delete("channel_binding");
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
      u.searchParams.delete("pgbouncer");
    }
    if (!u.searchParams.has("connect_timeout")) {
      u.searchParams.set("connect_timeout", "60");
    }
    if (!u.searchParams.has("sslmode") && !u.hostname.includes("localhost")) {
      u.searchParams.set("sslmode", "require");
    }
    return u.toString();
  } catch {
    let cleaned = directCandidate.replace(/[?&]channel_binding=[^&]+/g, "");
    if (cleaned.includes("-pooler.")) {
      cleaned = cleaned.replace("-pooler.", ".").replace(/[?&]pgbouncer=true/g, "");
    }
    if (!cleaned.includes("connect_timeout=")) {
      cleaned += (cleaned.includes("?") ? "&" : "?") + "connect_timeout=60";
    }
    return cleaned;
  }
}

let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch {
  // Optional if bcryptjs is not yet installed in local dev
}

// Fallback known valid bcrypt hash for "Password123!" with 10 salt rounds
const FALLBACK_BCRYPT_HASH = "$2a$10$wT0/NspT5aLzC8q43j.aZOCnC2R471P6oM9wT8oM.Qx5Cg9nO8g9e";

async function hashPassword(plainPassword) {
  if (!plainPassword) return FALLBACK_BCRYPT_HASH;
  if (bcrypt && typeof bcrypt.hash === "function") {
    try {
      return await bcrypt.hash(plainPassword, 10);
    } catch {
      return FALLBACK_BCRYPT_HASH;
    }
  }
  return FALLBACK_BCRYPT_HASH;
}

async function loadWebsiteData(options = {}) {
  const dataFilePath = options.dataFile || path.resolve(__dirname, "..", "data", "website-data.json");
  if (!fs.existsSync(dataFilePath)) {
    throw new Error(`Website data file not found at: ${dataFilePath}`);
  }

  const raw = fs.readFileSync(dataFilePath, "utf8");
  const dataset = JSON.parse(raw);

  let PrismaClient;
  try {
    PrismaClient = require("@prisma/client").PrismaClient;
  } catch (err) {
    console.warn("⚠️ @prisma/client is not yet generated or installed. Run 'npx prisma generate' first.");
    return { success: false, error: err.message };
  }

  const targetUrl = options.dbUrl || getOptimalDbUrl();
  const isPostgres = targetUrl.startsWith("postgres://") || targetUrl.startsWith("postgresql://");

  const prisma = new PrismaClient({
    datasources: isPostgres ? { db: { url: targetUrl } } : undefined,
  });

  const startTime = Date.now();
  console.log("============================================================");
  console.log("🚀 BOTHRA CMS - LOADING AUTHORITATIVE WEBSITE DATA");
  console.log(`📁 Source: ${dataFilePath}`);
  console.log(`🌐 Target: ${isPostgres ? "Remote PostgreSQL" : "Local SQLite"}`);
  console.log("============================================================\n");

  const counts = {
    organization: 0,
    users: 0,
    sites: 0,
    stores: 0,
    projects: 0,
    materialCategories: 0,
    materials: 0,
    stockBalances: 0,
    parties: 0,
    workforceMembers: 0,
    bills: 0,
    payments: 0,
    stockMovements: 0,
    dailySiteReports: 0,
    measurementBookEntries: 0,
  };

  try {
    // 1. Organization
    const orgData = dataset.organization;
    if (orgData) {
      console.log(`🏢 Upserting Organization: "${orgData.name}" (${orgData.id})...`);
      await prisma.organization.upsert({
        where: { id: orgData.id },
        update: {
          name: orgData.name,
          currency: orgData.currency || "INR",
          timezone: orgData.timezone || "Asia/Kolkata",
          status: orgData.status || "ACTIVE",
          settingsJson: orgData.settingsJson || null,
        },
        create: {
          id: orgData.id,
          name: orgData.name,
          currency: orgData.currency || "INR",
          timezone: orgData.timezone || "Asia/Kolkata",
          status: orgData.status || "ACTIVE",
          settingsJson: orgData.settingsJson || null,
        },
      });
      counts.organization++;
    }

    // 2. Users
    const orgId = orgData.id;
    console.log(`👥 Upserting ${dataset.users?.length || 0} Default Core Users...`);
    for (const u of dataset.users || []) {
      const passwordHash = u.passwordHash || (await hashPassword(u.password || "Password123!"));
      await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: orgId,
            email: u.email.toLowerCase().trim(),
          },
        },
        update: {
          name: u.name,
          role: u.role,
          jobTitle: u.jobTitle || null,
          phone: u.phone || null,
          status: u.status || "ACTIVE",
          // Do not overwrite existing password hash on update to protect existing admin accounts
        },
        create: {
          id: u.id,
          organizationId: orgId,
          name: u.name,
          email: u.email.toLowerCase().trim(),
          passwordHash,
          role: u.role,
          jobTitle: u.jobTitle || null,
          phone: u.phone || null,
          status: u.status || "ACTIVE",
        },
      });
      counts.users++;
    }

    // Purge removed users (Lakashy Bothra and Mohan Lal)
    const purgeEmails = ["lakashy@buildtrack.pro", "store@buildtrack.pro"];
    const fallbackMasterUser = (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } }))?.id || "usr-super-1";
    for (const remEmail of purgeEmails) {
      const u = await prisma.user.findFirst({ where: { email: remEmail } });
      if (u) {
        console.log(`🗑️ Removing user: ${u.name} (${remEmail})...`);
        await prisma.stockMovement.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.bill.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.payment.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.project.updateMany({ where: { managerUserId: u.id }, data: { managerUserId: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { assigneeUserId: u.id }, data: { assigneeUserId: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { completedById: u.id }, data: { completedById: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { verifiedById: u.id }, data: { verifiedById: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.dailySiteReport.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.auditEvent.updateMany({ where: { actorUserId: u.id }, data: { actorUserId: fallbackMasterUser } }).catch(() => {});
        await prisma.purchaseOrder.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.conversation.updateMany({ where: { createdById: u.id }, data: { createdById: fallbackMasterUser } }).catch(() => {});
        await prisma.siteDiaryEntry.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.materialQuotation.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.materialRequest.updateMany({ where: { requestedById: u.id }, data: { requestedById: fallbackMasterUser } }).catch(() => {});
        await prisma.materialRequest.updateMany({ where: { reviewedById: u.id }, data: { reviewedById: null } }).catch(() => {});
        await prisma.attendanceSession.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.attendanceSession.updateMany({ where: { correctedBy: u.id }, data: { correctedBy: null } }).catch(() => {});
        await prisma.attachment.updateMany({ where: { uploadedById: u.id }, data: { uploadedById: fallbackMasterUser } }).catch(() => {});
        await prisma.salesReceipt.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMasterUser } }).catch(() => {});
        await prisma.projectAssignment.updateMany({ where: { assignedById: u.id }, data: { assignedById: fallbackMasterUser } }).catch(() => {});
        await prisma.conversationParticipant.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.projectAssignment.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.folderPermission.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: u.id } }).catch((err) => {
          console.warn(`Could not delete user ${remEmail}:`, err?.message);
        });
        console.log(`✅ Removed ${remEmail}`);
      }
    }

    // 3. Sites
    console.log(`📍 Upserting ${dataset.sites?.length || 0} Operational Sites...`);
    for (const s of dataset.sites || []) {
      await prisma.site.upsert({
        where: {
          organizationId_code: {
            organizationId: orgId,
            code: s.code,
          },
        },
        update: {
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceM: s.geofenceM || 300,
          status: s.status || "ACTIVE",
        },
        create: {
          id: s.id,
          organizationId: orgId,
          code: s.code,
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceM: s.geofenceM || 300,
          status: s.status || "ACTIVE",
        },
      });
      counts.sites++;
    }

    // 4. Stores
    console.log(`🏪 Upserting ${dataset.stores?.length || 0} Site Stores & Depots...`);
    for (const st of dataset.stores || []) {
      const existing = await prisma.store.findFirst({
        where: { organizationId: orgId, siteId: st.siteId, name: st.name },
      });
      if (existing) {
        await prisma.store.update({
          where: { id: existing.id },
          data: { status: st.status || "ACTIVE" },
        });
      } else {
        await prisma.store.create({
          data: {
            id: st.id,
            organizationId: orgId,
            siteId: st.siteId,
            name: st.name,
            status: st.status || "ACTIVE",
          },
        });
      }
      counts.stores++;
    }

    // 5. Projects
    console.log(`🏗️ Upserting ${dataset.projects?.length || 0} Landmark Construction Projects...`);
    for (const p of dataset.projects || []) {
      await prisma.project.upsert({
        where: {
          organizationId_code: {
            organizationId: orgId,
            code: p.code,
          },
        },
        update: {
          name: p.name,
          siteId: p.siteId,
          managerUserId: p.managerUserId || null,
          status: p.status || "IN_PROGRESS",
          budgetAmount: p.budgetAmount || 0,
          notes: p.notes || null,
        },
        create: {
          id: p.id,
          organizationId: orgId,
          siteId: p.siteId,
          code: p.code,
          name: p.name,
          managerUserId: p.managerUserId || null,
          status: p.status || "IN_PROGRESS",
          budgetAmount: p.budgetAmount || 0,
          startDate: p.startDate ? new Date(p.startDate) : null,
          endDate: p.endDate ? new Date(p.endDate) : null,
          notes: p.notes || null,
        },
      });
      counts.projects++;
    }

    // 6. Material Categories
    console.log(`📦 Upserting ${dataset.materialCategories?.length || 0} Material Categories...`);
    for (const cat of dataset.materialCategories || []) {
      await prisma.materialCategory.upsert({
        where: {
          organizationId_name: {
            organizationId: orgId,
            name: cat.name,
          },
        },
        update: {},
        create: {
          id: cat.id,
          organizationId: orgId,
          name: cat.name,
        },
      });
      counts.materialCategories++;
    }

    // 7. Materials
    console.log(`🧱 Upserting ${dataset.materials?.length || 0} Inventory Materials...`);
    for (const m of dataset.materials || []) {
      await prisma.material.upsert({
        where: {
          organizationId_sku: {
            organizationId: orgId,
            sku: m.sku,
          },
        },
        update: {
          name: m.name,
          categoryId: m.categoryId || null,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          reorderQty: m.reorderQty || 0,
          unitPrice: m.unitPrice || 0,
          active: m.active !== false,
        },
        create: {
          id: m.id,
          organizationId: orgId,
          categoryId: m.categoryId || null,
          sku: m.sku,
          name: m.name,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          reorderQty: m.reorderQty || 0,
          unitPrice: m.unitPrice || 0,
          active: m.active !== false,
        },
      });
      counts.materials++;
    }

    // 8. Parties (Vendors & Subcontractors)
    console.log(`🤝 Upserting ${dataset.parties?.length || 0} Vendors & Subcontractors...`);
    for (const p of dataset.parties || []) {
      await prisma.party.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          partyType: p.partyType,
          category: p.category || null,
          contactPerson: p.contactPerson || null,
          phone: p.phone || null,
          email: p.email || null,
          address: p.address || null,
          taxIdentifier: p.taxIdentifier || null,
          panNumber: p.panNumber || null,
          tdsSection: p.tdsSection || null,
          dailyWageRate: p.dailyWageRate || null,
          maleHelperWageRate: p.maleHelperWageRate || null,
          femaleHelperWageRate: p.femaleHelperWageRate || null,
          contractValue: p.contractValue || null,
          bankName: p.bankName || null,
          bankAccountNumber: p.bankAccountNumber || null,
          bankIfsc: p.bankIfsc || null,
          bankBranch: p.bankBranch || null,
          active: p.active !== false,
        },
        create: {
          id: p.id,
          organizationId: orgId,
          name: p.name,
          partyType: p.partyType,
          category: p.category || null,
          contactPerson: p.contactPerson || null,
          phone: p.phone || null,
          email: p.email || null,
          address: p.address || null,
          taxIdentifier: p.taxIdentifier || null,
          panNumber: p.panNumber || null,
          tdsSection: p.tdsSection || null,
          dailyWageRate: p.dailyWageRate || null,
          maleHelperWageRate: p.maleHelperWageRate || null,
          femaleHelperWageRate: p.femaleHelperWageRate || null,
          contractValue: p.contractValue || null,
          bankName: p.bankName || null,
          bankAccountNumber: p.bankAccountNumber || null,
          bankIfsc: p.bankIfsc || null,
          bankBranch: p.bankBranch || null,
          active: p.active !== false,
        },
      });
      counts.parties++;
    }

    // 9. Workforce Members
    console.log(`👷 Upserting ${dataset.workforceMembers?.length || 0} Workforce Members...`);
    for (const wf of dataset.workforceMembers || []) {
      await prisma.workforceMember.upsert({
        where: {
          organizationId_employeeCode: {
            organizationId: orgId,
            employeeCode: wf.employeeCode,
          },
        },
        update: {
          name: wf.name,
          workerType: wf.workerType,
          phone: wf.phone || null,
          defaultSiteId: wf.defaultSiteId || null,
          contractorId: wf.contractorId || null,
          dailyWageRate: wf.dailyWageRate || null,
          maleHelperWageRate: wf.maleHelperWageRate || null,
          femaleHelperWageRate: wf.femaleHelperWageRate || null,
          active: wf.active !== false,
        },
        create: {
          id: wf.id,
          organizationId: orgId,
          employeeCode: wf.employeeCode,
          name: wf.name,
          workerType: wf.workerType,
          phone: wf.phone || null,
          defaultSiteId: wf.defaultSiteId || null,
          contractorId: wf.contractorId || null,
          dailyWageRate: wf.dailyWageRate || null,
          maleHelperWageRate: wf.maleHelperWageRate || null,
          femaleHelperWageRate: wf.femaleHelperWageRate || null,
          active: wf.active !== false,
        },
      });
      counts.workforceMembers++;
    }

    // 10. Bills & Bill Lines
    console.log(`📄 Upserting ${dataset.bills?.length || 0} Vendor & Contractor Bills...`);
    for (const b of dataset.bills || []) {
      const billRecord = await prisma.bill.upsert({
        where: {
          organizationId_partyId_billNumber: {
            organizationId: orgId,
            partyId: b.partyId,
            billNumber: b.billNumber,
          },
        },
        update: {
          projectId: b.projectId || null,
          billDate: new Date(b.billDate),
          dueDate: b.dueDate ? new Date(b.dueDate) : null,
          totalAmount: b.totalAmount,
          taxableAmount: b.taxableAmount || null,
          cgst: b.cgst || 0,
          sgst: b.sgst || 0,
          gstRate: b.gstRate || null,
          costHead: b.costHead || null,
          status: b.status || "POSTED",
          notes: b.notes || null,
        },
        create: {
          id: b.id,
          organizationId: orgId,
          partyId: b.partyId,
          projectId: b.projectId || null,
          billNumber: b.billNumber,
          billDate: new Date(b.billDate),
          dueDate: b.dueDate ? new Date(b.dueDate) : null,
          totalAmount: b.totalAmount,
          taxableAmount: b.taxableAmount || null,
          cgst: b.cgst || 0,
          sgst: b.sgst || 0,
          gstRate: b.gstRate || null,
          costHead: b.costHead || null,
          status: b.status || "POSTED",
          notes: b.notes || null,
          createdBy: b.createdBy,
        },
      });
      counts.bills++;

      // Upsert lines
      for (const line of b.lines || []) {
        await prisma.billLine.upsert({
          where: { id: line.id },
          update: {
            description: line.description,
            materialId: line.materialId || null,
            quantity: line.quantity || null,
            unitRate: line.unitRate || null,
            lineTotal: line.lineTotal,
            gstRate: line.gstRate || null,
            taxAmount: line.taxAmount || 0,
          },
          create: {
            id: line.id,
            billId: billRecord.id,
            description: line.description,
            materialId: line.materialId || null,
            quantity: line.quantity || null,
            unitRate: line.unitRate || null,
            lineTotal: line.lineTotal,
            gstRate: line.gstRate || null,
            taxAmount: line.taxAmount || 0,
          },
        });
      }
    }

    // 11. Payments & Allocations
    console.log(`💳 Upserting ${dataset.payments?.length || 0} Financial Payments...`);
    for (const pay of dataset.payments || []) {
      const paymentRecord = await prisma.payment.upsert({
        where: {
          organizationId_idempotencyKey: {
            organizationId: orgId,
            idempotencyKey: pay.idempotencyKey,
          },
        },
        update: {
          partyId: pay.partyId || null,
          projectId: pay.projectId || null,
          paymentDate: new Date(pay.paymentDate),
          amount: pay.amount,
          currency: pay.currency || "INR",
          method: pay.method,
          costHead: pay.costHead || null,
          payingAccount: pay.payingAccount || null,
          referenceNumber: pay.referenceNumber,
          status: pay.status || "POSTED",
          notes: pay.notes || null,
        },
        create: {
          id: pay.id,
          organizationId: orgId,
          partyId: pay.partyId || null,
          projectId: pay.projectId || null,
          paymentDate: new Date(pay.paymentDate),
          amount: pay.amount,
          currency: pay.currency || "INR",
          method: pay.method,
          costHead: pay.costHead || null,
          payingAccount: pay.payingAccount || null,
          referenceNumber: pay.referenceNumber,
          status: pay.status || "POSTED",
          idempotencyKey: pay.idempotencyKey,
          notes: pay.notes || null,
          createdBy: pay.createdBy,
        },
      });
      counts.payments++;

      for (const alloc of pay.allocations || []) {
        await prisma.paymentAllocation.upsert({
          where: { id: alloc.id },
          update: {
            amount: alloc.amount,
          },
          create: {
            id: alloc.id,
            paymentId: paymentRecord.id,
            billId: alloc.billId,
            amount: alloc.amount,
          },
        });
      }
    }

    // 12. Stock Movements
    console.log(`🚚 Upserting ${dataset.stockMovements?.length || 0} Stock Movements & Gate Passes...`);
    for (const sm of dataset.stockMovements || []) {
      await prisma.stockMovement.upsert({
        where: { id: sm.id },
        update: {
          quantityDelta: sm.quantityDelta,
          unitCode: sm.unitCode,
          unitRate: sm.unitRate || null,
          movementAt: new Date(sm.movementAt),
          vendorPartyId: sm.vendorPartyId || null,
          projectId: sm.projectId || null,
          referenceDoc: sm.referenceDoc || null,
          notes: sm.notes || null,
        },
        create: {
          id: sm.id,
          organizationId: orgId,
          materialId: sm.materialId,
          storeId: sm.storeId,
          movementType: sm.movementType,
          quantityDelta: sm.quantityDelta,
          unitCode: sm.unitCode,
          unitRate: sm.unitRate || null,
          movementAt: new Date(sm.movementAt),
          vendorPartyId: sm.vendorPartyId || null,
          projectId: sm.projectId || null,
          referenceDoc: sm.referenceDoc || null,
          notes: sm.notes || null,
          createdBy: sm.createdBy,
        },
      });
      counts.stockMovements++;
    }

    // 13. Daily Site Reports
    console.log(`📋 Upserting ${dataset.dailySiteReports?.length || 0} Daily Site Progress Reports...`);
    for (const dsr of dataset.dailySiteReports || []) {
      await prisma.dailySiteReport.upsert({
        where: { id: dsr.id },
        update: {
          progress: dsr.progress,
          blockers: dsr.blockers || null,
          safetyNotes: dsr.safetyNotes || null,
        },
        create: {
          id: dsr.id,
          organizationId: orgId,
          projectId: dsr.projectId,
          reportDate: dsr.reportDate,
          progress: dsr.progress,
          blockers: dsr.blockers || null,
          safetyNotes: dsr.safetyNotes || null,
          createdBy: dsr.createdBy,
        },
      });
      counts.dailySiteReports++;
    }

    // 14. Measurement Book Entries
    console.log(`📐 Upserting ${dataset.measurementBookEntries?.length || 0} Measurement Book Records...`);
    for (const mb of dataset.measurementBookEntries || []) {
      await prisma.measurementBookEntry.upsert({
        where: { id: mb.id },
        update: {
          itemDescription: mb.itemDescription,
          unit: mb.unit,
          count: mb.count,
          length: mb.length,
          breadth: mb.breadth,
          depth: mb.depth,
          quantity: mb.quantity,
          unitRate: mb.unitRate,
          totalAmount: mb.totalAmount,
          status: mb.status,
          notes: mb.notes || null,
          approvedBy: mb.approvedBy || null,
          billId: mb.billId || null,
        },
        create: {
          id: mb.id,
          organizationId: orgId,
          projectId: mb.projectId,
          partyId: mb.partyId,
          itemDescription: mb.itemDescription,
          unit: mb.unit,
          count: mb.count,
          length: mb.length,
          breadth: mb.breadth,
          depth: mb.depth,
          quantity: mb.quantity,
          unitRate: mb.unitRate,
          totalAmount: mb.totalAmount,
          status: mb.status,
          notes: mb.notes || null,
          createdBy: mb.createdBy,
          approvedBy: mb.approvedBy || null,
          billId: mb.billId || null,
        },
      });
      counts.measurementBookEntries++;
    }

    // 13. Initial Tasks & Attendance Sessions if empty
    const currentTasks = await prisma.task.count({ where: { organizationId: orgId } }).catch(() => 0);
    if (currentTasks === 0) {
      console.log("📋 Seeding initial operational tasks for projects...");
      const allProjects = await prisma.project.findMany({ where: { organizationId: orgId } }).catch(() => []);
      const masterUser = (await prisma.user.findFirst({ where: { organizationId: orgId, role: "SUPER_ADMIN" } })) ||
                         (await prisma.user.findFirst({ where: { organizationId: orgId } }));
      if (allProjects.length > 0 && masterUser) {
        const taskDefs = [
          {
            proj: allProjects[0],
            title: "Foundation raft reinforcement and concrete pour inspection",
            desc: "Verify rebar lap lengths, chair spacing, and clear covers before concrete batching begins.",
            priority: "HIGH",
            status: "IN_PROGRESS",
            daysDue: 2,
          },
          {
            proj: allProjects[1] || allProjects[0],
            title: "Column shuttering line and plumb verification",
            desc: "Inspect line, level, and plumb of 4th floor structural columns.",
            priority: "MEDIUM",
            status: "TODO",
            daysDue: 4,
          },
          {
            proj: allProjects[2] || allProjects[0],
            title: "Basement retaining wall waterproofing test",
            desc: "48-hour ponding test for waterproofing membrane integrity.",
            priority: "CRITICAL",
            status: "TODO",
            daysDue: 1,
          },
          {
            proj: allProjects[3] || allProjects[0],
            title: "Aggregate base compaction density report check",
            desc: "Examine lab test report for subgrade compaction degree >= 98%.",
            priority: "MEDIUM",
            status: "COMPLETED",
            daysDue: -1,
            completed: true,
          },
        ];

        for (const t of taskDefs) {
          await prisma.task.create({
            data: {
              organizationId: orgId,
              projectId: t.proj.id,
              title: t.title,
              description: t.desc,
              priority: t.priority,
              status: t.status,
              dueAt: new Date(Date.now() + t.daysDue * 86400000),
              completedAt: t.completed ? new Date() : null,
              completedById: t.completed ? masterUser.id : null,
              createdBy: masterUser.id,
              assigneeUserId: masterUser.id,
            },
          }).catch(() => {});
          counts.tasks = (counts.tasks || 0) + 1;
        }
      }
    }

    const currentAtt = await prisma.attendanceSession.count({ where: { organizationId: orgId } }).catch(() => 0);
    if (currentAtt === 0) {
      console.log("⏱️ Seeding initial attendance check-in session...");
      const firstSite = await prisma.site.findFirst({ where: { organizationId: orgId } }).catch(() => null);
      const firstWorker = await prisma.workforceMember.findFirst({ where: { organizationId: orgId } }).catch(() => null);
      const masterUser = await prisma.user.findFirst({ where: { organizationId: orgId } }).catch(() => null);
      if (firstSite && firstWorker && masterUser) {
        const todayStr = new Date().toISOString().split("T")[0];
        await prisma.attendanceSession.create({
          data: {
            organizationId: orgId,
            siteId: firstSite.id,
            workforceMemberId: firstWorker.id,
            workDate: todayStr,
            checkInAt: new Date(),
            status: "PRESENT",
            notes: "Initial on-site shift attendance record",
            createdBy: masterUser.id,
          },
        }).catch(() => {});
        counts.attendanceSessions = (counts.attendanceSessions || 0) + 1;
      }
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n============================================================");
    console.log(`✅ WEBSITE DATA LOAD COMPLETED IN ${durationSec}s!`);
    console.log("============================================================");
    console.table(counts);
    console.log("\n🔑 DEFAULT SYSTEM LOGIN CREDENTIALS:");
    console.log("  • Master Super Admin : superadmin@buildtrack.pro  /  Password123!");
    console.log("  • Org Administrator  : admin@buildtrack.pro       /  Password123!");
    console.log("  • Project Manager    : pm@buildtrack.pro          /  Password123!");
    console.log("  • Site Supervisor    : supervisor@buildtrack.pro  /  Password123!");
    console.log("  • Accountant         : finance@buildtrack.pro     /  Password123!");
    console.log("============================================================\n");

    return { success: true, counts, durationSec };
  } catch (error) {
    console.error("❌ Error loading website data:", error);
    throw error;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  loadWebsiteData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { loadWebsiteData };
