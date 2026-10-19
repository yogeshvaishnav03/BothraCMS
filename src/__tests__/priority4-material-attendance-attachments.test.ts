import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { InventoryService } from "@/services/inventory-service";
import { AttendanceService } from "@/services/attendance-service";

describe("Priority 4: Photo & Document Attachments for Materials and Attendance", () => {
  const orgId = "org-test-p4";
  const userId = "user-p4";
  let siteId: string;
  let storeId: string;
  let materialId: string;
  let workerId: string;
  let projectId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.idempotencyRecord.deleteMany({ where: { organizationId: orgId } });
    await prisma.attachment.deleteMany({ where: { organizationId: orgId } });
    await prisma.attendanceSession.deleteMany({ where: { organizationId: orgId } });
    await prisma.workforceMember.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockMovement.deleteMany({ where: { organizationId: orgId } });
    await prisma.stockBalance.deleteMany({});
    await prisma.material.deleteMany({ where: { organizationId: orgId } });
    await prisma.store.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.site.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed org and user
    await prisma.organization.create({
      data: { id: orgId, name: "Priority 4 Org", status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: userId, organizationId: orgId, name: "Site Supervisor", email: "ss@p4.test", role: "SITE_SUPERVISOR", passwordHash: "test-hash" },
    });

    const site = await prisma.site.create({
      data: { organizationId: orgId, name: "Metro Site", code: "MS-01", address: "Metro Rail Yard", status: "ACTIVE" },
    });
    siteId = site.id;

    const project = await prisma.project.create({
      data: { organizationId: orgId, siteId: site.id, name: "Metro Station Box", code: "MSB-01", status: "IN_PROGRESS" },
    });
    projectId = project.id;

    const store = await prisma.store.create({
      data: { organizationId: orgId, siteId: site.id, name: "Site Warehouse" },
    });
    storeId = store.id;

    const mat = await prisma.material.create({
      data: {
        organizationId: orgId,
        sku: "STL-20",
        name: "Reinforcement Steel",
        unitCode: "MT",
        minStockQty: 10,
        active: true,
      },
    });
    materialId = mat.id;

    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: orgId,
        employeeCode: "WRK-401",
        name: "Ramesh Mason",
        workerType: "MASON",
        defaultSiteId: site.id,
        dailyWageRate: 80000,
        active: true,
      },
    });
    workerId = worker.id;
  });

  it("4.1 Links photo attachments during goods receipt (e.g. delivery challan / physical inspection)", async () => {
    // Create an uploaded attachment record for the delivery receipt photo
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        fileId: "challan-photo-01",
        fileName: "challan_scan.jpg",
        fileSize: 1024 * 200,
        mimeType: "image/jpeg",
        category: "RECEIPT",
        diskFileName: `${orgId}_challan-photo-01.jpg`,
        entityType: "STOCK_RECEIPT",
        entityId: "temp-receipt-id",
        uploadedById: userId,
      },
    });

    // Receive goods and pass attachmentIds
    const result = await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      projectId,
      items: [{ materialId, quantity: 25 }],
      attachmentIds: [attachment.id],
      userId,
      role: "SITE_SUPERVISOR",
    });

    expect(result.success).toBe(true);
    expect(result.movements.length).toBe(1);
    const movementId = result.movements[0].id;

    // Verify attachment record was linked with stockMovementId
    const linkedAttachment = await prisma.attachment.findUnique({
      where: { id: attachment.id },
    });

    expect(linkedAttachment!.stockMovementId).toBe(movementId);
    expect(linkedAttachment!.projectId).toBe(projectId);
  });

  it("4.2 Links photo attachments during goods issue (e.g. site consumption proof / gate pass)", async () => {
    // First receive stock so we have balance to issue
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      projectId,
      items: [{ materialId, quantity: 50 }],
      userId,
      role: "SITE_SUPERVISOR",
    });

    // Create an issue photo attachment
    const attachment = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        fileId: "issue-photo-01",
        fileName: "rebars_on_truck.jpg",
        fileSize: 1024 * 350,
        mimeType: "image/jpeg",
        category: "GENERAL",
        diskFileName: `${orgId}_issue-photo-01.jpg`,
        entityType: "STOCK_ISSUE",
        entityId: "temp-issue-id",
        uploadedById: userId,
      },
    });

    // Issue goods with attachmentIds
    const result = await InventoryService.issueGoods({
      organizationId: orgId,
      storeId,
      projectId,
      materialId,
      quantity: 15,
      attachmentIds: [attachment.id],
      userId,
      role: "SITE_SUPERVISOR",
    });

    expect(result.success).toBe(true);
    const movementId = result.movement.id;

    const linkedAttachment = await prisma.attachment.findUnique({
      where: { id: attachment.id },
    });

    expect(linkedAttachment!.stockMovementId).toBe(movementId);
    expect(linkedAttachment!.projectId).toBe(projectId);
  });

  it("4.3 Links attendance check-in photo and returns it with daily attendance queries", async () => {
    // Create attendance selfie attachment
    const selfie = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        fileId: "worker-selfie-01",
        fileName: "worker_checkin_ramesh.jpg",
        fileSize: 1024 * 180,
        mimeType: "image/jpeg",
        category: "GENERAL",
        diskFileName: `${orgId}_worker-selfie-01.jpg`,
        entityType: "ATTENDANCE",
        entityId: "temp-attendance-id",
        uploadedById: userId,
      },
    });

    // Check in worker with selfie attachment
    const session = await AttendanceService.checkIn({
      organizationId: orgId,
      workforceMemberId: workerId,
      siteId,
      projectId,
      workDate: "2026-10-18",
      attachmentIds: [selfie.id],
      userId,
      role: "SITE_SUPERVISOR",
    });

    expect(session).toBeDefined();

    // Verify attachment is linked
    const linkedSelfie = await prisma.attachment.findUnique({
      where: { id: selfie.id },
    });
    expect(linkedSelfie!.attendanceSessionId).toBe(session.id);

    // Retrieve daily attendance and verify attachments array contains the photo
    const attendanceRecords = await AttendanceService.getDailyAttendance(orgId, siteId, "2026-10-18");
    expect(attendanceRecords.length).toBe(1);
    expect(attendanceRecords[0].attachments).toBeDefined();
    expect(attendanceRecords[0].attachments.length).toBe(1);
    expect(attendanceRecords[0].attachments[0].fileName).toBe("worker_checkin_ramesh.jpg");
  });
});
