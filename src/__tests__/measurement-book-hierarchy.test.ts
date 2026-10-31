import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { rupeesToPaise } from "@/lib/formatters";

describe("Measurement Book: Complete Hierarchical Table, Formulas, Images & Audit System", () => {
  const orgId = "org-mb-hierarchy-test";
  const adminUserId = "user-admin-mb";
  const supervisorUserId = "user-sup-mb";

  let projectId: string;
  let contractorPartyId: string;
  let vendorPartyId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.projectAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementHistory.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementChangeRequest.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementAttachment.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementBookEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementSubgroup.deleteMany({ where: { organizationId: orgId } });
    await prisma.measurementGroup.deleteMany({ where: { organizationId: orgId } });
    await prisma.billLine.deleteMany({ where: { bill: { organizationId: orgId } } });
    await prisma.bill.deleteMany({ where: { organizationId: orgId } });
    await prisma.party.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.site.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed Organization
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Bothra Construction Test Corp",
        status: "ACTIVE",
      },
    });

    // Seed Users
    await prisma.user.createMany({
      data: [
        {
          id: adminUserId,
          organizationId: orgId,
          name: "Super Admin",
          email: "admin@bothra.test",
          role: "SUPER_ADMIN",
          passwordHash: "hash-123",
        },
        {
          id: supervisorUserId,
          organizationId: orgId,
          name: "Site Supervisor",
          email: "supervisor@bothra.test",
          role: "SITE_SUPERVISOR",
          passwordHash: "hash-123",
        },
      ],
    });

    // Seed Site
    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Kohinoor Villa Site",
        code: "KVS-01",
        address: "123 Construction Road",
        status: "ACTIVE",
      },
    });

    // Seed Project
    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Kohinoor Villa",
        code: "KV-01",
        status: "ACTIVE",
      },
    });
    projectId = project.id;

    // Assign supervisor to project
    await prisma.projectAssignment.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        userId: supervisorUserId,
        role: "SUPERVISOR",
        status: "ACTIVE",
        assignedById: adminUserId,
      },
    });

    // Seed Parties: Contractor & Vendor
    const contractor = await prisma.party.create({
      data: {
        organizationId: orgId,
        name: "Ramesh RCC & Masonry Works",
        partyType: "CONTRACTOR",
        active: true,
      },
    });
    contractorPartyId = contractor.id;

    const vendor = await prisma.party.create({
      data: {
        organizationId: orgId,
        name: "Asian Paints Ltd",
        partyType: "VENDOR",
        active: true,
      },
    });
    vendorPartyId = vendor.id;
  });

  it("Phase 2 & 4: Creates 3-Level Hierarchy with multiple parties and subgroups", async () => {
    // LEVEL 1: Main Group for Kohinoor Villa + Asian Paints Ltd
    const mainGroup = await MeasurementBookService.createGroup({
      organizationId: orgId,
      projectId,
      partyId: vendorPartyId,
      name: "Kohinoor Villa - Asian Paints Painting",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(mainGroup.id).toBeDefined();
    expect(mainGroup.projectId).toBe(projectId);
    expect(mainGroup.partyId).toBe(vendorPartyId);

    // LEVEL 2: Subgroup for Drawing Room
    const drawingRoom = await MeasurementBookService.createSubgroup({
      organizationId: orgId,
      groupId: mainGroup.id,
      name: "Drawing Room",
      type: "ROOM",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(drawingRoom.id).toBeDefined();
    expect(drawingRoom.name).toBe("Drawing Room");
    expect(drawingRoom.type).toBe("ROOM");

    // LEVEL 3: Measurement Entries for Wall 1 and Wall 2
    const wall1 = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: vendorPartyId,
      groupId: mainGroup.id,
      subgroupId: drawingRoom.id,
      entryName: "Wall 1",
      itemDescription: "Premium Emulsion Paint 2 Coats",
      measurementType: "WALL",
      formula: "AREA",
      unit: "SQM",
      count: 1,
      length: 14,
      breadth: null,
      depth: 12, // Height = 12
      deduction: 0,
      agreedRate: rupeesToPaise(100),
      userId: adminUserId,
      userName: "Admin",
      role: "SUPER_ADMIN",
    });

    // 14 * 12 = 168 SQM
    expect(wall1.quantity).toBe(168);
    expect(wall1.totalAmount).toBe(168 * rupeesToPaise(100));

    const wall2 = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: vendorPartyId,
      groupId: mainGroup.id,
      subgroupId: drawingRoom.id,
      entryName: "Wall 2",
      itemDescription: "Premium Emulsion Paint 2 Coats",
      measurementType: "WALL",
      formula: "AREA",
      unit: "SQM",
      count: 1,
      length: 10,
      breadth: null,
      depth: 12,
      deduction: 0,
      agreedRate: rupeesToPaise(100),
      userId: adminUserId,
      userName: "Admin",
      role: "SUPER_ADMIN",
    });

    // 10 * 12 = 120 SQM
    expect(wall2.quantity).toBe(120);

    // Query hierarchical tree
    const hierarchy = await MeasurementBookService.listHierarchical(orgId);
    expect(hierarchy.length).toBeGreaterThanOrEqual(1);

    const foundGroup = hierarchy.find((g) => g.id === mainGroup.id);
    expect(foundGroup).toBeDefined();
    expect(foundGroup?.party?.name).toBe("Asian Paints Ltd");

    const foundSub = foundGroup?.subgroups.find((s) => s.id === drawingRoom.id);
    expect(foundSub).toBeDefined();
    expect(foundSub?.entries?.length).toBe(2);
    // Subgroup quantity: 168 + 120 = 288 SQM
    expect(foundSub?.quantitiesByUnit?.["SQM"]).toBe(288);
  });

  it("Phase 6: Automatic measurement formulas and deductions", () => {
    // 1. AREA: N * L * H = 14 * 12 = 168 m²
    const areaCalc = MeasurementBookService.calculateQuantities({
      formula: "AREA",
      count: 1,
      length: 14,
      breadth: null,
      depth: 12,
      deduction: 0,
    });
    expect(areaCalc.grossQuantity).toBe(168);
    expect(areaCalc.netQuantity).toBe(168);

    // With deduction (e.g. window opening of 8 m²)
    const areaWithDed = MeasurementBookService.calculateQuantities({
      formula: "AREA",
      count: 1,
      length: 14,
      depth: 12,
      deduction: 8,
    });
    expect(areaWithDed.grossQuantity).toBe(168);
    expect(areaWithDed.netQuantity).toBe(160);

    // 2. VOLUME: N * L * B * H
    const volCalc = MeasurementBookService.calculateQuantities({
      formula: "VOLUME",
      count: 2,
      length: 5,
      breadth: 3,
      depth: 2,
    });
    expect(volCalc.grossQuantity).toBe(60); // 2 * 5 * 3 * 2 = 60 m³
    expect(volCalc.netQuantity).toBe(60);

    // 3. LENGTH: N * L
    const lenCalc = MeasurementBookService.calculateQuantities({
      formula: "LENGTH",
      count: 4,
      length: 25.5,
    });
    expect(lenCalc.netQuantity).toBe(102);

    // 4. QUANTITY: N * Unit Qty
    const qtyCalc = MeasurementBookService.calculateQuantities({
      formula: "QUANTITY",
      count: 10,
      length: 2.5,
    });
    expect(qtyCalc.netQuantity).toBe(25);
  });

  it("Phase 7: Evidence images: upload, replace with mandatory reason, and versioning", async () => {
    const entry = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: contractorPartyId,
      itemDescription: "Brick Masonry 230mm",
      entryName: "Wall 1",
      unit: "CUM",
      count: 1,
      length: 10,
      breadth: 0.23,
      depth: 3,
      agreedRate: rupeesToPaise(500),
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    // 1. Initial upload
    const img1 = await MeasurementBookService.addAttachment({
      organizationId: orgId,
      entryId: entry.id,
      fileName: "wall1_evidence_v1.jpg",
      fileUrl: "/api/uploads/file-123.jpg",
      fileSize: 102400,
      mimeType: "image/jpeg",
      caption: "Initial wall layout",
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });
    expect(img1.version).toBe(1);
    expect(img1.isDeleted).toBe(false);

    // 2. Replace image with mandatory reason
    const replaceReason = "Previous photo was blurry and did not clearly show the wall measurement.";
    const img2 = await MeasurementBookService.replaceAttachmentWithReason({
      organizationId: orgId,
      entryId: entry.id,
      attachmentId: img1.id,
      fileName: "wall1_evidence_v2_sharp.jpg",
      fileUrl: "/api/uploads/file-456.jpg",
      fileSize: 150000,
      mimeType: "image/jpeg",
      reason: replaceReason,
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });
    expect(img2.version).toBe(2);
    expect(img2.isDeleted).toBe(false);

    // Verify old image is archived with replacement reason
    const oldImg = await prisma.measurementAttachment.findUnique({ where: { id: img1.id } });
    expect(oldImg?.isDeleted).toBe(true);
    expect(oldImg?.replacedById).toBe(img2.id);
    expect(oldImg?.replaceReason).toBe(replaceReason);

    // 3. Delete active image with reason
    await MeasurementBookService.deleteAttachmentWithReason({
      organizationId: orgId,
      entryId: entry.id,
      attachmentId: img2.id,
      reason: "Wrong room photo uploaded",
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    const deletedImg = await prisma.measurementAttachment.findUnique({ where: { id: img2.id } });
    expect(deletedImg?.isDeleted).toBe(true);
    expect(deletedImg?.deleteReason).toBe("Wrong room photo uploaded");

    // Invariant: Wall measurement entry remains fully intact!
    const intactEntry = await prisma.measurementBookEntry.findUnique({ where: { id: entry.id } });
    expect(intactEntry?.isDeleted).toBe(false);
  });

  it("Phase 8 & 9: Mandatory reason enforcement for updates & deletions with audit trail", async () => {
    const entry = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: contractorPartyId,
      itemDescription: "Plaster work",
      entryName: "Living Room North Wall",
      unit: "SQM",
      count: 1,
      length: 10,
      depth: 3,
      agreedRate: rupeesToPaise(120),
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    // 1. Attempting update without reason should fail
    await expect(
      MeasurementBookService.updateEntryWithReason({
        organizationId: orgId,
        entryId: entry.id,
        reason: "",
        updates: { length: 12 },
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/mandatory reason/i);

    // 2. Update with valid reason
    const updateResult = await MeasurementBookService.updateEntryWithReason({
      organizationId: orgId,
      entryId: entry.id,
      reason: "Original wall height was entered incorrectly after site remeasurement.",
      updates: { length: 12 },
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(updateResult.changeRequestCreated).toBe(false);
    expect(updateResult.entry?.length).toBe(12);
    expect(updateResult.entry?.version).toBe(2);

    // 3. Verify audit history logged
    const history = await MeasurementBookService.listHistory(orgId, entry.id);
    const updateHistory = history.find((h) => h.action === "UPDATED");
    expect(updateHistory).toBeDefined();
    expect(updateHistory?.reason).toBe("Original wall height was entered incorrectly after site remeasurement.");

    // 4. Attempting delete without reason should fail
    await expect(
      MeasurementBookService.deleteEntryWithReason({
        organizationId: orgId,
        entryId: entry.id,
        reason: "",
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/mandatory reason/i);

    // 5. Delete with valid reason
    const deleteResult = await MeasurementBookService.deleteEntryWithReason({
      organizationId: orgId,
      entryId: entry.id,
      reason: "Wall dismantled per architectural revision Rev-03",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(deleteResult.success).toBe(true);
    const softDeleted = await prisma.measurementBookEntry.findUnique({ where: { id: entry.id } });
    expect(softDeleted?.isDeleted).toBe(true);
    expect(softDeleted?.deletionReason).toBe("Wall dismantled per architectural revision Rev-03");
  });

  it("Phase 10: Site supervisor editing approved entry creates Change Request; Admin reviews & approves", async () => {
    // 1. Create and approve entry
    const entry = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: contractorPartyId,
      itemDescription: "Granite Flooring",
      entryName: "Master Bedroom",
      unit: "SQM",
      count: 1,
      length: 5,
      breadth: 4,
      agreedRate: rupeesToPaise(250),
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    // Mark as APPROVED by admin
    await MeasurementBookService.updateStatus({
      organizationId: orgId,
      entryId: entry.id,
      status: "APPROVED",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    // 2. Supervisor attempts to modify the approved entry -> must generate Change Request
    const editAttempt = await MeasurementBookService.updateEntryWithReason({
      organizationId: orgId,
      entryId: entry.id,
      reason: "Actual boundary measured at 5.5m instead of 5.0m",
      updates: { length: 5.5 },
      userId: supervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(editAttempt.changeRequestCreated).toBe(true);
    expect(editAttempt.changeRequest?.status).toBe("PENDING");
    expect(editAttempt.changeRequest?.requestedRole).toBe("SITE_SUPERVISOR");

    // 3. Admin reviews and approves the change request
    const reviewResult = await MeasurementBookService.reviewChangeRequest({
      organizationId: orgId,
      requestId: editAttempt.changeRequest.id,
      action: "APPROVE",
      reviewerComments: "Remeasurement confirmed on site by PM.",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(reviewResult.status).toBe("APPROVED");

    // Verify entry was updated
    const updatedEntry = await prisma.measurementBookEntry.findUnique({ where: { id: entry.id } });
    expect(updatedEntry?.length).toBe(5.5);
    expect(updatedEntry?.version).toBe(2);
  });

  it("Phase 14: Abstract summary & Bill conversion with duplicate billing protection", async () => {
    // Create entry
    const entry = await MeasurementBookService.createEntry({
      organizationId: orgId,
      projectId,
      partyId: contractorPartyId,
      itemDescription: "Concrete Foundation Footing",
      entryName: "Footing F1",
      measurementType: "FOOTING",
      formula: "VOLUME",
      unit: "CUM",
      count: 4,
      length: 2,
      breadth: 2,
      depth: 1.5, // 4 * 2 * 2 * 1.5 = 24 CUM
      agreedRate: rupeesToPaise(4500),
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    // Abstract Summary
    const abstractData = await MeasurementBookService.getAbstract(orgId, { projectId });
    expect(abstractData.unitTotals["CUM"]).toBeDefined();
    expect(abstractData.unitTotals["CUM"].quantity).toBe(24);

    // Cannot convert to Bill if not APPROVED
    await expect(
      MeasurementBookService.convertToBill({
        organizationId: orgId,
        entryId: entry.id,
        billNumber: "BILL-TEST-001",
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/Cannot bill unapproved/i);

    // Approve the entry
    await MeasurementBookService.updateStatus({
      organizationId: orgId,
      entryId: entry.id,
      status: "APPROVED",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    // Convert to Bill
    const billResult = await MeasurementBookService.convertToBill({
      organizationId: orgId,
      entryId: entry.id,
      billNumber: "BILL-TEST-001",
      userId: adminUserId,
      role: "SUPER_ADMIN",
    });

    expect(billResult.entry.status).toBe("BILLED");
    expect(billResult.bill.billNumber).toBe("BILL-TEST-001");

    // Invariant: Duplicate billing must be rejected!
    await expect(
      MeasurementBookService.convertToBill({
        organizationId: orgId,
        entryId: entry.id,
        billNumber: "BILL-TEST-002",
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/already been converted to Bill/i);

    // Invariant: Billed entry cannot be edited or deleted
    await expect(
      MeasurementBookService.updateEntryWithReason({
        organizationId: orgId,
        entryId: entry.id,
        reason: "Late adjustment",
        updates: { count: 5 },
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/Modifying billed entries is strictly prohibited/i);

    await expect(
      MeasurementBookService.deleteEntryWithReason({
        organizationId: orgId,
        entryId: entry.id,
        reason: "Remove entry",
        userId: adminUserId,
        role: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/converted to a Bill and cannot be deleted/i);
  });
});
