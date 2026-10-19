import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";

describe("Priority 3 & 7: Attachments, Photographs, Missing Bills & Project Document Folders", () => {
  let orgId: string;
  let otherOrgId: string;
  let adminId: string;
  let supervisorId: string;
  let projectId: string;
  let taskId: string;
  let paymentId: string;
  let rootFolderId: string;
  let subFolderId: string;

  beforeAll(async () => {
    // 1. Setup primary organization
    const org = await prisma.organization.create({
      data: { name: `Bothra Attachments Org ${Date.now()}` },
    });
    orgId = org.id;

    // 2. Setup separate organization for isolation tests
    const otherOrg = await prisma.organization.create({
      data: { name: `Unrelated Rival Org ${Date.now()}` },
    });
    otherOrgId = otherOrg.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Chief Architect Mehta",
        email: `arch-${Date.now()}@bothracms.com`,
        passwordHash: "hash-arch",
        role: "ORG_ADMIN",
      },
    });
    adminId = admin.id;

    const supervisor = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Field Supervisor Khan",
        email: `khan-${Date.now()}@bothracms.com`,
        passwordHash: "hash-khan",
        role: "SITE_SUPERVISOR",
      },
    });
    supervisorId = supervisor.id;

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Emerald Bay Site",
        code: `EBS-${Date.now().toString().slice(-4)}`,
        address: "Marine Drive Phase 2",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Emerald Bay Luxury Residences",
        code: `EBR-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
      },
    });
    projectId = project.id;

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: projectId,
        title: "Rebar inspection for 3rd floor slab",
        assigneeUserId: supervisorId,
        createdBy: adminId,
        dueAt: new Date(Date.now() + 86400000),
        status: "TODO",
      },
    });
    taskId = task.id;

    const payment = await prisma.payment.create({
      data: {
        organizationId: orgId,
        recipientType: "VENDOR",
        recipientName: "UltraTech Concrete Batching Plant",
        payingAccount: "SBI Current A/c 3012984712",
        amount: 15000000, // ₹1.5 Lakhs
        method: "BANK_TRANSFER",
        referenceNumber: `REF-${Date.now()}`,
        idempotencyKey: `IDEM-PAY-${Date.now()}`,
        status: "POSTED",
        createdBy: adminId,
        paymentDate: new Date(),
      },
    });
    paymentId = payment.id;
  });

  it("should create hierarchical document folders within a project", async () => {
    // 1. Root folder: Architectural & Structural Drawings
    const rootFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Architectural & Structural Drawings",
        description: "Official stamped blueprints and engineering drawings",
      },
    });
    rootFolderId = rootFolder.id;
    expect(rootFolder.parentId).toBeNull();

    // 2. Subfolder: 3rd Floor Slab Layouts
    const subFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "3rd Floor Slab Rebar Plans",
        description: "Bar bending schedules and beam sections",
        parentId: rootFolderId,
      },
    });
    subFolderId = subFolder.id;
    expect(subFolder.parentId).toBe(rootFolderId);

    // Verify folder hierarchy retrieval
    const fetchedRoot = await prisma.documentFolder.findUnique({
      where: { id: rootFolderId },
      include: { subfolders: true },
    });
    expect(fetchedRoot?.subfolders.length).toBe(1);
    expect(fetchedRoot?.subfolders[0].name).toBe("3rd Floor Slab Rebar Plans");
  });

  it("should upload drawing attachment linked to project subfolder and enforce metadata", async () => {
    const drawingAttachment = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        projectId,
        folderId: subFolderId,
        entityType: "PROJECT",
        entityId: projectId,
        fileId: `file-dwg-${Date.now()}`,
        fileName: "EBR-3FL-BEAM-SCHEDULE-REV2.pdf",
        diskFileName: "disk_ebr_3fl_beam.pdf",
        fileSize: 4528100, // ~4.3 MB
        mimeType: "application/pdf",
        category: "DRAWING",
        notes: "Revision 2 approved by Lead Structural Consultant",
        uploadedById: adminId,
      },
    });

    expect(drawingAttachment.id).toBeDefined();
    expect(drawingAttachment.category).toBe("DRAWING");
    expect(drawingAttachment.folderId).toBe(subFolderId);
    expect(drawingAttachment.projectId).toBe(projectId);

    // Verify folder attachments count
    const folderAttachments = await prisma.attachment.findMany({
      where: { folderId: subFolderId },
    });
    expect(folderAttachments.length).toBe(1);
    expect(folderAttachments[0].fileName).toBe("EBR-3FL-BEAM-SCHEDULE-REV2.pdf");
  });

  it("should support multiple task progress photographs and associate with task record", async () => {
    // Photo 1: Pre-pour shuttering inspection
    const photo1 = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        projectId,
        taskId,
        entityType: "TASK",
        entityId: taskId,
        fileId: `file-photo-1-${Date.now()}`,
        fileName: "shuttering-inspection-grid-B4.jpg",
        diskFileName: "disk_shut_b4.jpg",
        fileSize: 2048500,
        mimeType: "image/jpeg",
        category: "PHOTO",
        notes: "Shuttering level verified with optical dumpy level",
        uploadedById: supervisorId,
      },
    });

    // Photo 2: Cover blocks and rebar spacers
    const photo2 = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        projectId,
        taskId,
        entityType: "TASK",
        entityId: taskId,
        fileId: `file-photo-2-${Date.now()}`,
        fileName: "cover-blocks-spacing-check.jpg",
        diskFileName: "disk_cover_check.jpg",
        fileSize: 1856200,
        mimeType: "image/jpeg",
        category: "PHOTO",
        notes: "40mm concrete cover blocks placed at 1m intervals",
        uploadedById: supervisorId,
      },
    });

    const taskAttachments = await prisma.attachment.findMany({
      where: { taskId, entityType: "TASK" },
      orderBy: { createdAt: "asc" },
    });

    expect(taskAttachments.length).toBe(2);
    expect(taskAttachments[0].fileName).toBe("shuttering-inspection-grid-B4.jpg");
    expect(taskAttachments[1].fileName).toBe("cover-blocks-spacing-check.jpg");
    expect(taskAttachments.every((a) => a.category === "PHOTO")).toBe(true);
  });

  it("should highlight missing bills for unallocated payments and resolve once challan/bill is attached", async () => {
    // 1. Payment has NO allocations and NO bill attachments
    const paymentBefore = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: true,
      },
    });

    const attachmentsBefore = await prisma.attachment.findMany({
      where: { entityType: "PAYMENT", entityId: paymentId },
    });

    const isMissingBillBefore =
      paymentBefore!.allocations.length === 0 &&
      attachmentsBefore.filter(
        (a) => a.category === "INVOICE" || a.category === "BILL" || a.category === "CHALLAN"
      ).length === 0;

    expect(isMissingBillBefore).toBe(true); // Flagged as missing bill / receipt

    // 2. Attach delivery challan / GST invoice to the payment
    const challanDoc = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        entityType: "PAYMENT",
        entityId: paymentId,
        fileId: `file-challan-${Date.now()}`,
        fileName: "ULTRATECH-CHALLAN-9021.pdf",
        diskFileName: "disk_ut_challan_9021.pdf",
        fileSize: 845200,
        mimeType: "application/pdf",
        category: "INVOICE",
        notes: "Scanned delivery challan and batch certificate signed by driver",
        uploadedById: adminId,
      },
    });

    const attachmentsAfter = await prisma.attachment.findMany({
      where: { entityType: "PAYMENT", entityId: paymentId },
    });

    const isMissingBillAfter =
      paymentBefore!.allocations.length === 0 &&
      attachmentsAfter.filter(
        (a) => a.category === "INVOICE" || a.category === "BILL" || a.category === "CHALLAN"
      ).length === 0;

    expect(isMissingBillAfter).toBe(false); // Resolved: Challan/Invoice is now attached
    expect(attachmentsAfter.length).toBe(1);
    expect(attachmentsAfter[0].id).toBe(challanDoc.id);
  });

  it("should enforce isolation so another organization cannot access project documents or folders", async () => {
    // Attempt to query folders of primary org's project from other organization context
    const unauthorizedProjectFolders = await prisma.documentFolder.findMany({
      where: {
        id: rootFolderId,
        organizationId: otherOrgId, // Cross-tenant barrier
      },
    });

    expect(unauthorizedProjectFolders.length).toBe(0);

    const unauthorizedAttachments = await prisma.attachment.findMany({
      where: {
        folderId: subFolderId,
        organizationId: otherOrgId, // Cross-tenant barrier
      },
    });

    expect(unauthorizedAttachments.length).toBe(0);
  });

  it("should cleanly delete an attachment and update database references", async () => {
    // Create temporary task photo
    const tempPhoto = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        taskId,
        entityType: "TASK",
        entityId: taskId,
        fileId: `file-temp-${Date.now()}`,
        fileName: "temp-draft-photo.jpg",
        diskFileName: "temp_draft.jpg",
        fileSize: 102400,
        mimeType: "image/jpeg",
        category: "PHOTO",
        uploadedById: supervisorId,
      },
    });

    expect(tempPhoto.id).toBeDefined();

    // Delete attachment
    await prisma.attachment.delete({
      where: { id: tempPhoto.id },
    });

    const check = await prisma.attachment.findUnique({
      where: { id: tempPhoto.id },
    });
    expect(check).toBeNull();
  });
});
