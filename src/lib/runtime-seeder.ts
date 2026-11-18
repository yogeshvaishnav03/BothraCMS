import { prisma, getDirectPrisma, ensurePostgresColumns } from "./db";
import fs from "fs";
import path from "path";

let isSeeding = false;

export async function bootstrapWebsiteDataRuntime(targetOrgId?: string): Promise<boolean> {
  if (isSeeding) return false;
  isSeeding = true;

  try {
    const client = getDirectPrisma() || prisma;
    await ensurePostgresColumns();

    const dataFilePath = path.resolve(process.cwd(), "data", "website-data.json");
    if (!fs.existsSync(dataFilePath)) {
      console.warn("[RUNTIME_SEEDER] website-data.json not found at:", dataFilePath);
      return false;
    }

    const raw = fs.readFileSync(dataFilePath, "utf8");
    const dataset = JSON.parse(raw);
    const orgData = dataset.organization;
    if (!orgData) return false;

    const effectiveOrgId = targetOrgId || orgData.id;

    // 1. Organization
    await client.organization.upsert({
      where: { id: effectiveOrgId },
      update: {
        name: orgData.name,
        currency: orgData.currency || "INR",
        timezone: orgData.timezone || "Asia/Kolkata",
        status: "ACTIVE",
      },
      create: {
        id: effectiveOrgId,
        name: orgData.name,
        currency: orgData.currency || "INR",
        timezone: orgData.timezone || "Asia/Kolkata",
        status: "ACTIVE",
        settingsJson: orgData.settingsJson || null,
      },
    });

    // 2. Core Users
    const fallbackHash = "$2a$10$wT0/NspT5aLzC8q43j.aZOCnC2R471P6oM9wT8oM.Qx5Cg9nO8g9e"; // Password123!
    for (const u of dataset.users || []) {
      const email = u.email.toLowerCase().trim();
      const existing = await client.user.findFirst({
        where: { email },
        select: { id: true },
      });

      if (!existing) {
        await client.user.create({
          data: {
            id: u.id,
            organizationId: effectiveOrgId,
            name: u.name,
            email,
            passwordHash: u.passwordHash || fallbackHash,
            role: u.role,
            jobTitle: u.jobTitle || null,
            phone: u.phone || null,
            status: "ACTIVE",
          },
        });
      }
    }

    // Purge removed users (Lakashy Bothra and Mohan Lal)
    const purgeEmails = ["lakashy@buildtrack.pro", "store@buildtrack.pro"];
    const fallbackMaster = (await client.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } }))?.id || "usr-super-1";
    for (const remEmail of purgeEmails) {
      const u = await client.user.findFirst({ where: { email: remEmail }, select: { id: true, name: true } });
      if (u) {
        await client.stockMovement.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.bill.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.payment.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.project.updateMany({ where: { managerUserId: u.id }, data: { managerUserId: null } }).catch(() => {});
        await client.task.updateMany({ where: { assigneeUserId: u.id }, data: { assigneeUserId: null } }).catch(() => {});
        await client.task.updateMany({ where: { completedById: u.id }, data: { completedById: null } }).catch(() => {});
        await client.task.updateMany({ where: { verifiedById: u.id }, data: { verifiedById: null } }).catch(() => {});
        await client.task.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.dailySiteReport.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.auditEvent.updateMany({ where: { actorUserId: u.id }, data: { actorUserId: fallbackMaster } }).catch(() => {});
        await client.purchaseOrder.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.conversation.updateMany({ where: { createdById: u.id }, data: { createdById: fallbackMaster } }).catch(() => {});
        await client.siteDiaryEntry.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.materialQuotation.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.materialRequest.updateMany({ where: { requestedById: u.id }, data: { requestedById: fallbackMaster } }).catch(() => {});
        await client.materialRequest.updateMany({ where: { reviewedById: u.id }, data: { reviewedById: null } }).catch(() => {});
        await client.attendanceSession.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.attendanceSession.updateMany({ where: { correctedBy: u.id }, data: { correctedBy: null } }).catch(() => {});
        await client.attachment.updateMany({ where: { uploadedById: u.id }, data: { uploadedById: fallbackMaster } }).catch(() => {});
        await client.salesReceipt.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await client.projectAssignment.updateMany({ where: { assignedById: u.id }, data: { assignedById: fallbackMaster } }).catch(() => {});
        await client.conversationParticipant.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await client.projectAssignment.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await client.folderPermission.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await client.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await client.user.delete({ where: { id: u.id } }).catch(() => {});
        console.log(`[RUNTIME_SEEDER] Purged removed user: ${remEmail}`);
      }
    }

    // 3. Sites
    for (const s of dataset.sites || []) {
      const siteId = effectiveOrgId === orgData.id ? s.id : `${s.id}-${effectiveOrgId.slice(0, 6)}`;
      await client.site.upsert({
        where: {
          organizationId_code: {
            organizationId: effectiveOrgId,
            code: s.code,
          },
        },
        update: {
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceM: s.geofenceM || 300,
        },
        create: {
          id: siteId,
          organizationId: effectiveOrgId,
          code: s.code,
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          geofenceM: s.geofenceM || 300,
          status: "ACTIVE",
        },
      });
    }

    // 4. Projects
    for (const p of dataset.projects || []) {
      const projId = effectiveOrgId === orgData.id ? p.id : `${p.id}-${effectiveOrgId.slice(0, 6)}`;
      const projSiteId = effectiveOrgId === orgData.id ? p.siteId : `${p.siteId}-${effectiveOrgId.slice(0, 6)}`;
      await client.project.upsert({
        where: {
          organizationId_code: {
            organizationId: effectiveOrgId,
            code: p.code,
          },
        },
        update: {
          name: p.name,
        },
        create: {
          id: projId,
          organizationId: effectiveOrgId,
          siteId: projSiteId,
          code: p.code,
          name: p.name,
          managerUserId: p.managerUserId || null,
          status: p.status || "IN_PROGRESS",
          budgetAmount: p.budgetAmount || 0,
          notes: p.notes || null,
        },
      });
    }

    // 5. Material Categories
    for (const cat of dataset.materialCategories || []) {
      const catId = effectiveOrgId === orgData.id ? cat.id : `${cat.id}-${effectiveOrgId.slice(0, 6)}`;
      await client.materialCategory.upsert({
        where: {
          organizationId_name: {
            organizationId: effectiveOrgId,
            name: cat.name,
          },
        },
        update: {},
        create: {
          id: catId,
          organizationId: effectiveOrgId,
          name: cat.name,
        },
      });
    }

    // 6. Materials
    for (const m of dataset.materials || []) {
      const matId = effectiveOrgId === orgData.id ? m.id : `${m.id}-${effectiveOrgId.slice(0, 6)}`;
      const catId = m.categoryId ? (effectiveOrgId === orgData.id ? m.categoryId : `${m.categoryId}-${effectiveOrgId.slice(0, 6)}`) : null;
      await client.material.upsert({
        where: {
          organizationId_sku: {
            organizationId: effectiveOrgId,
            sku: m.sku,
          },
        },
        update: {
          name: m.name,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          unitPrice: m.unitPrice || 0,
        },
        create: {
          id: matId,
          organizationId: effectiveOrgId,
          categoryId: catId,
          sku: m.sku,
          name: m.name,
          unitCode: m.unitCode,
          minStockQty: m.minStockQty || 0,
          reorderQty: m.reorderQty || 0,
          unitPrice: m.unitPrice || 0,
          active: true,
        },
      });
    }

    // 7. Parties
    for (const party of dataset.parties || []) {
      const partyId = effectiveOrgId === orgData.id ? party.id : `${party.id}-${effectiveOrgId.slice(0, 6)}`;
      await client.party.upsert({
        where: { id: partyId },
        update: {
          name: party.name,
          partyType: party.partyType,
          category: party.category || null,
          phone: party.phone || null,
        },
        create: {
          id: partyId,
          organizationId: effectiveOrgId,
          name: party.name,
          partyType: party.partyType,
          category: party.category || null,
          contactPerson: party.contactPerson || null,
          phone: party.phone || null,
          email: party.email || null,
          address: party.address || null,
          taxIdentifier: party.taxIdentifier || null,
          panNumber: party.panNumber || null,
          tdsSection: party.tdsSection || null,
          dailyWageRate: party.dailyWageRate || null,
          maleHelperWageRate: party.maleHelperWageRate || null,
          femaleHelperWageRate: party.femaleHelperWageRate || null,
          active: true,
        },
      });
    }

    // 8. Workforce Members
    for (const wf of dataset.workforceMembers || []) {
      const wfId = effectiveOrgId === orgData.id ? wf.id : `${wf.id}-${effectiveOrgId.slice(0, 6)}`;
      const wfSiteId = wf.defaultSiteId ? (effectiveOrgId === orgData.id ? wf.defaultSiteId : `${wf.defaultSiteId}-${effectiveOrgId.slice(0, 6)}`) : null;
      await client.workforceMember.upsert({
        where: {
          organizationId_employeeCode: {
            organizationId: effectiveOrgId,
            employeeCode: wf.employeeCode,
          },
        },
        update: {
          name: wf.name,
          workerType: wf.workerType,
          phone: wf.phone || null,
          defaultSiteId: wfSiteId,
        },
        create: {
          id: wfId,
          organizationId: effectiveOrgId,
          employeeCode: wf.employeeCode,
          name: wf.name,
          workerType: wf.workerType,
          phone: wf.phone || null,
          defaultSiteId: wfSiteId,
          dailyWageRate: wf.dailyWageRate || 650,
          active: true,
        },
      }).catch(() => {});
    }

    // 9. Initial Tasks Seed
    const taskCount = await client.task.count({ where: { organizationId: effectiveOrgId } }).catch(() => 0);
    if (taskCount === 0) {
      const allProjects = await client.project.findMany({ where: { organizationId: effectiveOrgId } }).catch(() => []);
      const masterUser = (await client.user.findFirst({ where: { organizationId: effectiveOrgId, role: "SUPER_ADMIN" } })) ||
                         (await client.user.findFirst({ where: { organizationId: effectiveOrgId } }));
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
          await client.task.create({
            data: {
              organizationId: effectiveOrgId,
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
        }
      }
    }

    // 10. Initial Attendance Session
    const attCount = await client.attendanceSession.count({ where: { organizationId: effectiveOrgId } }).catch(() => 0);
    if (attCount === 0) {
      const firstSite = await client.site.findFirst({ where: { organizationId: effectiveOrgId } }).catch(() => null);
      const firstWorker = await client.workforceMember.findFirst({ where: { organizationId: effectiveOrgId } }).catch(() => null);
      const masterUser = await client.user.findFirst({ where: { organizationId: effectiveOrgId } }).catch(() => null);
      if (firstSite && firstWorker && masterUser) {
        const todayStr = new Date().toISOString().split("T")[0];
        await client.attendanceSession.create({
          data: {
            organizationId: effectiveOrgId,
            siteId: firstSite.id,
            workforceMemberId: firstWorker.id,
            workDate: todayStr,
            checkInAt: new Date(),
            status: "PRESENT",
            notes: "Initial on-site shift attendance record",
            createdBy: masterUser.id,
          },
        }).catch(() => {});
      }
    }

    console.log("✅ [RUNTIME_SEEDER] Runtime website data self-healing completed successfully.");
    return true;
  } catch (err) {
    console.warn("⚠️ [RUNTIME_SEEDER] Runtime bootstrap warning:", err);
    return false;
  } finally {
    isSeeding = false;
  }
}
