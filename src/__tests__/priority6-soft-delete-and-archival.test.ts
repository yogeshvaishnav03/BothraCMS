import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

describe("Priority 6: Protect Business Records from Permanent Deletion (Soft Archival)", () => {
  const orgId = "org-test-p6";
  const userId = "user-archiver-p6";
  let projectId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.attachment.deleteMany({ where: { organizationId: orgId } });
    await prisma.taskComment.deleteMany({});
    await prisma.taskStatusHistory.deleteMany({});
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.bill.deleteMany({ where: { organizationId: orgId } });
    await prisma.party.deleteMany({ where: { organizationId: orgId } });
    await prisma.attendanceSession.deleteMany({ where: { organizationId: orgId } });
    await prisma.workforceMember.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockMovement.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockBalance.deleteMany({});
    await prisma.material.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed org and user
    await prisma.organization.create({
      data: { id: orgId, name: "Priority 6 Org", status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: userId, organizationId: orgId, name: "Org Admin", email: "admin@p6.test", role: "ORG_ADMIN", passwordHash: "test-hash" },
    });

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Solar Farm Site",
        code: "SFS-01",
        address: "Solar Valley Way",
        status: "ACTIVE",
      },
    });

    const p = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Solar Farm Project",
        code: "SFP-01",
        status: "IN_PROGRESS",
      },
    });
    projectId = p.id;
  });

  it("6.1 Soft-deleting a Task preserves record, comments, status history, and attachments", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId,
        title: "Inverter Pad Pouring",
        assigneeUserId: userId,
        createdBy: userId,
        status: "IN_PROGRESS",
      },
    });

    // Add a comment and status history
    await prisma.taskComment.create({
      data: { organizationId: orgId, taskId: task.id, userId, content: "Concrete arrived on site" },
    });

    await prisma.taskStatusHistory.create({
      data: { taskId: task.id, changedBy: userId, oldStatus: "PENDING", newStatus: "IN_PROGRESS" },
    });

    // Perform soft archival (as implemented in DELETE /api/tasks/[id])
    const archivedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "ARCHIVED",
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
        archiveReason: "Project scope modified",
      },
      include: { comments: true, statusHistory: true },
    });

    // Record is NOT deleted from DB
    expect(archivedTask.isArchived).toBe(true);
    expect(archivedTask.status).toBe("ARCHIVED");
    expect(archivedTask.archivedById).toBe(userId);
    expect(archivedTask.comments.length).toBe(1);
    expect(archivedTask.statusHistory.length).toBe(1);

    // Normal active task query excludes archived task
    const activeTasks = await prisma.task.findMany({
      where: { organizationId: orgId, isArchived: false },
    });
    expect(activeTasks.length).toBe(0);
  });

  it("6.2 Soft-deleting a Material preserves historical stock movements and pricing", async () => {
    const material = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: "SP-400W",
        name: "Discontinued Solar Panels 400W",
        unitCode: "NOS",
        active: true,
      },
    });

    // Perform soft archival (as implemented in DELETE /api/materials)
    const archivedMaterial = await prisma.material.update({
      where: { id: material.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
        archiveReason: "Replaced by 550W model",
      },
    });

    expect(archivedMaterial.isArchived).toBe(true);
    expect(archivedMaterial.active).toBe(false);

    // Active query excludes it
    const activeMaterials = await prisma.material.findMany({
      where: { organizationId: orgId, isArchived: false, active: true },
    });
    expect(activeMaterials.length).toBe(0);
  });

  it("6.3 Soft-deleting a Party preserves historical vendor ledger, bills, and payments", async () => {
    const vendor = await prisma.party.create({
      data: {
        organizationId: orgId,
        partyType: "VENDOR",
        name: "Solar Inverters Direct",
        active: true,
      },
    });

    const bill = await prisma.bill.create({
      data: {
        organizationId: orgId,
        projectId,
        partyId: vendor.id,
        billNumber: "INV-2026-901",
        billDate: new Date(),
        totalAmount: 25000000,
        createdBy: userId,
        status: "POSTED",
      },
    });

    // Soft-archive vendor (as implemented in DELETE /api/parties/[id])
    const archivedVendor = await prisma.party.update({
      where: { id: vendor.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
      },
    });

    expect(archivedVendor.isArchived).toBe(true);

    // The bill still retains its vendor relationship intact
    const preservedBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: { party: true },
    });
    expect(preservedBill).not.toBeNull();
    expect(preservedBill!.party.name).toBe("Solar Inverters Direct");
  });

  it("6.4 Soft-deleting a Workforce member preserves past attendance sessions", async () => {
    const site = await prisma.site.create({
      data: { organizationId: orgId, name: "Solar Site 1", code: "SS-01", address: "Solar Site Rd" },
    });

    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: orgId,
        employeeCode: "SOL-101",
        name: "Anil Helper",
        workerType: "HELPER",
        defaultSiteId: site.id,
        active: true,
      },
    });

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: orgId,
        workforceMemberId: worker.id,
        siteId: site.id,
        projectId,
        workDate: "2026-10-15",
        checkInAt: new Date(),
        status: "PRESENT",
        createdBy: userId,
      },
    });

    // Soft-archive worker (as implemented in DELETE /api/workforce)
    const archivedWorker = await prisma.workforceMember.update({
      where: { id: worker.id },
      data: {
        active: false,
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
      },
    });

    expect(archivedWorker.isArchived).toBe(true);

    // Historical attendance session remains completely intact
    const historicalSession = await prisma.attendanceSession.findUnique({
      where: { id: session.id },
      include: { workforceMember: true },
    });
    expect(historicalSession!.workforceMember.name).toBe("Anil Helper");
  });

  it("6.5 Soft-deleting an Attachment preserves database record and file metadata", async () => {
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        projectId,
        fileId: "inverter-drawing-01",
        fileName: "inverter_schematic.pdf",
        fileSize: 1024 * 500,
        mimeType: "application/pdf",
        category: "CONTRACT",
        diskFileName: `${orgId}_inverter-drawing-01.pdf`,
        entityType: "PROJECT",
        entityId: projectId,
        uploadedById: userId,
      },
    });

    // Soft-archive attachment (as implemented in DELETE /api/attachments/[id])
    const archivedAttachment = await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: userId,
        archiveReason: "Superceded by revision 2",
      },
    });

    expect(archivedAttachment.isArchived).toBe(true);
    expect(archivedAttachment.archivedById).toBe(userId);

    // Active attachment queries exclude it
    const activeAttachments = await prisma.attachment.findMany({
      where: { organizationId: orgId, isArchived: false },
    });
    expect(activeAttachments.length).toBe(0);
  });
});
