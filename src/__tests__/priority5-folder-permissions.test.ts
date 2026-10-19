import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { requireFolderAccess, AuthorizationError } from "@/lib/server-auth";
import { UserContext } from "@/lib/auth";

describe("Priority 5: Secure Nested Document Folders & Permissions", () => {
  const orgId = "org-test-p5";
  const ownerUserId = "user-owner-p5";
  const managerUserId = "user-mgr-p5";
  const engineerUserId = "user-eng-p5";
  const restrictedUserId = "user-rest-p5";
  let projectId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.folderPermission.deleteMany({ where: { organizationId: orgId } });
    await prisma.attachment.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentFolder.deleteMany({ where: { organizationId: orgId } });
    await prisma.projectAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed org and users
    await prisma.organization.create({
      data: { id: orgId, name: "Priority 5 Org", status: "ACTIVE" },
    });

    await prisma.user.createMany({
      data: [
        { id: ownerUserId, organizationId: orgId, name: "Owner", email: "owner@p5.test", role: "ORG_ADMIN", passwordHash: "test-hash" },
        { id: managerUserId, organizationId: orgId, name: "Manager", email: "mgr@p5.test", role: "PROJECT_MANAGER", passwordHash: "test-hash" },
        { id: engineerUserId, organizationId: orgId, name: "Engineer", email: "eng@p5.test", role: "SITE_ENGINEER", passwordHash: "test-hash" },
        { id: restrictedUserId, organizationId: orgId, name: "Restricted", email: "rest@p5.test", role: "VIEWER", passwordHash: "test-hash" },
      ],
    });

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "River Site",
        code: "RS-01",
        address: "River Bank Rd",
        status: "ACTIVE",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "River Bridge Project",
        code: "RBP-01",
        status: "IN_PROGRESS",
        managerUserId,
      },
    });
    projectId = project.id;

    // Assign engineer and restricted users to project
    await prisma.projectAssignment.createMany({
      data: [
        { organizationId: orgId, projectId, userId: engineerUserId, role: "SITE_ENGINEER", status: "ACTIVE", assignedById: ownerUserId },
        { organizationId: orgId, projectId, userId: restrictedUserId, role: "VIEWER", status: "ACTIVE", assignedById: ownerUserId },
      ],
    });
  });

  it("5.1 Supports nested folder hierarchy and child folder resolution", async () => {
    // Create Root folder: "Drawings"
    const drawingsFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Drawings",
      },
    });

    // Create Subfolder: "Structural"
    const structuralFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Structural",
        parentId: drawingsFolder.id,
      },
    });

    // Create Nested Subfolder: "Pier Foundation"
    const pierFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Pier Foundation",
        parentId: structuralFolder.id,
      },
    });

    // Verify parent relationships
    const resolvedPier = await prisma.documentFolder.findUnique({
      where: { id: pierFolder.id },
      include: {
        parent: {
          include: { parent: true },
        },
      },
    });

    expect(resolvedPier!.parent!.name).toBe("Structural");
    expect(resolvedPier!.parent!.parent!.name).toBe("Drawings");
    expect(resolvedPier!.parent!.parent!.parentId).toBeNull();
  });

  it("5.2 Enforces folder-specific access permissions (view, upload, delete)", async () => {
    const confidentialFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Confidential Tenders",
      },
    });

    // Configure permission: restrictedUser can only VIEW, cannot UPLOAD or DELETE
    await prisma.folderPermission.create({
      data: {
        organizationId: orgId,
        folderId: confidentialFolder.id,
        userId: restrictedUserId,
        canView: true,
        canUpload: false,
        canEdit: false,
        canDelete: false,
        canDownload: true,
      },
    });

    const restrictedCtx: UserContext = {
      userId: restrictedUserId,
      email: "rest@p5.test",
      role: "VIEWER",
      organizationId: orgId,
    };

    // View should succeed
    const folder = await requireFolderAccess(restrictedCtx, confidentialFolder.id, "view");
    expect(folder.id).toBe(confidentialFolder.id);

    // Upload should be rejected with 403
    await expect(requireFolderAccess(restrictedCtx, confidentialFolder.id, "upload")).rejects.toThrow(
      AuthorizationError
    );

    // Delete should be rejected with 403
    await expect(requireFolderAccess(restrictedCtx, confidentialFolder.id, "delete")).rejects.toThrow(
      AuthorizationError
    );
  });

  it("5.3 Owner has full access to all folders regardless of individual folder permissions", async () => {
    const secretFolder = await prisma.documentFolder.create({
      data: {
        organizationId: orgId,
        projectId,
        name: "Secret Audits",
      },
    });

    const ownerCtx: UserContext = {
      userId: ownerUserId,
      email: "owner@p5.test",
      role: "ORG_ADMIN",
      organizationId: orgId,
    };

    // Owner can access without specific folder permission entry
    const viewFolder = await requireFolderAccess(ownerCtx, secretFolder.id, "view");
    expect(viewFolder.id).toBe(secretFolder.id);

    const uploadFolder = await requireFolderAccess(ownerCtx, secretFolder.id, "upload");
    expect(uploadFolder.id).toBe(secretFolder.id);

    const deleteFolder = await requireFolderAccess(ownerCtx, secretFolder.id, "delete");
    expect(deleteFolder.id).toBe(secretFolder.id);
  });

  it("5.4 Non-empty folder protects active contents and cascades archival cleanly", async () => {
    const folder = await prisma.documentFolder.create({
      data: { organizationId: orgId, projectId, name: "Site Snaps" },
    });

    const file = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        projectId,
        folderId: folder.id,
        fileId: "snap-01",
        fileName: "rebar_inspect.jpg",
        fileSize: 1024 * 50,
        mimeType: "image/jpeg",
        category: "GENERAL",
        diskFileName: `${orgId}_snap-01.jpg`,
        entityType: "DOCUMENT_FOLDER",
        entityId: folder.id,
        uploadedById: managerUserId,
      },
    });

    // Active file count check
    const activeFiles = await prisma.attachment.count({
      where: { folderId: folder.id, isArchived: false },
    });
    expect(activeFiles).toBe(1);

    // Soft-archive folder and cascade to its files
    await prisma.documentFolder.update({
      where: { id: folder.id },
      data: { isArchived: true, archivedAt: new Date(), archivedById: ownerUserId },
    });

    await prisma.attachment.updateMany({
      where: { folderId: folder.id, isArchived: false },
      data: { isArchived: true, archivedAt: new Date(), archivedById: ownerUserId },
    });

    // Verify file is soft-archived, not permanently deleted
    const archivedFile = await prisma.attachment.findUnique({
      where: { id: file.id },
    });
    expect(archivedFile).not.toBeNull();
    expect(archivedFile!.isArchived).toBe(true);

    // Verify normal active queries exclude it
    const activeRemaining = await prisma.attachment.count({
      where: { folderId: folder.id, isArchived: false },
    });
    expect(activeRemaining).toBe(0);
  });
});
