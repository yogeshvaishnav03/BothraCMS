import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { FinanceService } from "./finance-service";
import { roundQuantity, roundPaise } from "@/lib/financial-math";

function syncLegacyJson(entry: any) {
  try {
    const dir = path.resolve(process.cwd(), "storage", "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const storageFile = path.resolve(dir, "measurement-book.json");
    const backupFile = path.resolve(dir, "measurement-book.json.bak");
    let current: any[] = [];
    if (fs.existsSync(storageFile)) {
      try {
        current = JSON.parse(fs.readFileSync(storageFile, "utf-8"));
        if (!Array.isArray(current)) current = [];
      } catch {}
    }
    current.push(entry);
    const content = JSON.stringify(current, null, 2);
    fs.writeFileSync(storageFile, content, "utf-8");
    fs.writeFileSync(backupFile, content, "utf-8");
  } catch {}
}

function checkAndHealLegacyJsonBackup() {
  try {
    const storageFile = path.resolve(process.cwd(), "storage", "data", "measurement-book.json");
    const backupFile = path.resolve(process.cwd(), "storage", "data", "measurement-book.json.bak");
    if (fs.existsSync(storageFile)) {
      try {
        const raw = fs.readFileSync(storageFile, "utf-8");
        JSON.parse(raw);
      } catch (err) {
        if (fs.existsSync(backupFile)) {
          const bakRaw = fs.readFileSync(backupFile, "utf-8");
          try {
            JSON.parse(bakRaw);
            fs.writeFileSync(storageFile, bakRaw, "utf-8");
          } catch {}
        }
      }
    }
  } catch {}
}

function assertCanRecordMeasurements(role: Role) {
  if (
    role === "SUPER_ADMIN" ||
    role === "ORG_ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "SITE_SUPERVISOR"
  ) {
    return;
  }
  throw new Error(`Forbidden: Role ${role} is not authorized to create or edit measurement book entries.`);
}

export interface MeasurementAttachmentItem {
  id: string;
  entryId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  caption?: string | null;
  version: number;
  isDeleted: boolean;
  deleteReason?: string | null;
  replacedById?: string | null;
  replaceReason?: string | null;
  uploadedBy: string;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface MeasurementEntry {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string; // Subcontractor or Vendor
  groupId?: string | null;
  subgroupId?: string | null;
  referenceNumber?: string | null;
  entryName?: string | null; // e.g. "Wall 1", "North Wall"
  itemDescription: string;
  measurementType: string; // WALL, FLOOR, CEILING, etc.
  formula: string; // AREA, VOLUME, LENGTH, QUANTITY
  unit: string; // SQM, CUM, RMT, NOS, TONNE
  count: number;
  length: number;
  breadth?: number | null;
  depth?: number | null;
  grossQuantity: number;
  deduction: number;
  quantity: number; // Net quantity
  unitRate: number; // paise
  totalAmount: number; // paise
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "REJECTED" | "BILLED";
  billId?: string | null;
  notes?: string | null;
  remarks?: string | null;
  measurementDate: string;
  version: number;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletedByName?: string | null;
  deletionReason?: string | null;
  createdBy: string;
  createdByName?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string; siteId?: string | null; site?: { id: string; name: string } | null };
  party?: { id: string; name: string; partyType?: string | null };
  group?: { id: string; name?: string | null };
  subgroup?: { id: string; name: string; type: string };
  attachments?: MeasurementAttachmentItem[];
}

export interface MeasurementSubgroupItem {
  id: string;
  organizationId: string;
  groupId: string;
  name: string;
  type: string;
  description?: string | null;
  remarks?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  entries?: MeasurementEntry[];
  entriesCount?: number;
  quantitiesByUnit?: Record<string, number>;
  totalAmount?: number;
}

export interface MeasurementGroupItem {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  siteId?: string | null;
  name?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string; siteId?: string | null; site?: { id: string; name: string } | null };
  party?: { id: string; name: string; partyType?: string | null };
  subgroups: MeasurementSubgroupItem[];
  subgroupsCount?: number;
  entriesCount?: number;
  quantitiesByUnit?: Record<string, number>;
  totalAmount?: number;
}

function mapEntryToInterface(r: any): MeasurementEntry {
  return {
    id: r.id,
    organizationId: r.organizationId,
    projectId: r.projectId,
    partyId: r.partyId,
    groupId: r.groupId ?? null,
    subgroupId: r.subgroupId ?? null,
    referenceNumber: r.referenceNumber ?? null,
    entryName: r.entryName ?? null,
    itemDescription: r.itemDescription,
    measurementType: r.measurementType || "WALL",
    formula: r.formula || "AREA",
    unit: r.unit,
    count: r.count,
    length: r.length,
    breadth: r.breadth ?? null,
    depth: r.depth ?? null,
    grossQuantity: r.grossQuantity ?? r.quantity,
    deduction: r.deduction ?? 0,
    quantity: r.quantity,
    unitRate: r.unitRate,
    totalAmount: r.totalAmount,
    status: r.status as any,
    billId: r.billId ?? null,
    notes: r.notes ?? null,
    remarks: r.remarks ?? null,
    measurementDate: r.measurementDate instanceof Date ? r.measurementDate.toISOString() : (r.measurementDate ? String(r.measurementDate) : (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt))),
    version: r.version ?? 1,
    isDeleted: Boolean(r.isDeleted),
    deletedAt: r.deletedAt instanceof Date ? r.deletedAt.toISOString() : (r.deletedAt ? String(r.deletedAt) : null),
    deletedBy: r.deletedBy ?? null,
    deletedByName: r.deletedByName ?? null,
    deletionReason: r.deletionReason ?? null,
    createdBy: r.createdBy,
    createdByName: r.createdByName ?? null,
    approvedBy: r.approvedBy ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    project: r.project ? {
      id: r.project.id,
      name: r.project.name,
      code: r.project.code,
      siteId: r.project.siteId,
      site: r.project.site ? { id: r.project.site.id, name: r.project.site.name } : null
    } : undefined,
    party: r.party ? { id: r.party.id, name: r.party.name, partyType: r.party.partyType } : undefined,
    group: r.group ? { id: r.group.id, name: r.group.name } : undefined,
    subgroup: r.subgroup ? { id: r.subgroup.id, name: r.subgroup.name, type: r.subgroup.type } : undefined,
    attachments: Array.isArray(r.attachments)
      ? r.attachments.map((att: any) => ({
          id: att.id,
          entryId: att.entryId,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          caption: att.caption,
          version: att.version,
          isDeleted: Boolean(att.isDeleted),
          deleteReason: att.deleteReason,
          replacedById: att.replacedById,
          replaceReason: att.replaceReason,
          uploadedBy: att.uploadedBy,
          uploadedByName: att.uploadedByName,
          createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : String(att.createdAt),
        }))
      : undefined,
  };
}

export class MeasurementBookService {
  /**
   * Configurable formula calculation
   * AREA: N * L * (H || B || 1)
   * VOLUME: N * L * B * H
   * LENGTH: N * L
   * QUANTITY: N * (L || 1)
   */
  static calculateQuantities(params: {
    formula: string;
    count?: number;
    length?: number;
    breadth?: number | null;
    depth?: number | null;
    deduction?: number;
  }): { grossQuantity: number; netQuantity: number } {
    const n = params.count && params.count > 0 ? params.count : 1;
    const l = typeof params.length === "number" && params.length >= 0 ? params.length : 1;
    const b = typeof params.breadth === "number" && params.breadth >= 0 ? params.breadth : 1;
    const h = typeof params.depth === "number" && params.depth >= 0 ? params.depth : 1;
    const deduction = typeof params.deduction === "number" && params.deduction >= 0 ? params.deduction : 0;

    let gross = 0;
    const f = (params.formula || "AREA").toUpperCase();

    if (f === "AREA") {
      // Area = N * L * H (or B if H not given)
      const heightOrBreadth = params.depth !== null && params.depth !== undefined ? h : b;
      gross = n * l * heightOrBreadth;
    } else if (f === "VOLUME") {
      // Volume = N * L * B * H
      gross = n * l * b * h;
    } else if (f === "LENGTH") {
      // Length = N * L
      gross = n * l;
    } else if (f === "QUANTITY") {
      // Quantity = N * unit quantity
      gross = n * l;
    } else {
      // Default to Area or Count*Length
      gross = n * l * b;
    }

    const grossQuantity = roundQuantity(gross, 4);
    const netQuantity = roundQuantity(Math.max(0, grossQuantity - deduction), 4);

    return { grossQuantity, netQuantity };
  }

  /**
   * Helper to ensure a default Main Group and Subgroup exist for a Project + Party combination
   */
  static async getOrCreateDefaultGroupAndSubgroup(
    organizationId: string,
    projectId: string,
    partyId: string,
    siteId?: string | null
  ): Promise<{ groupId: string; subgroupId: string }> {
    let group = await prisma.measurementGroup.findUnique({
      where: {
        organizationId_projectId_partyId: {
          organizationId,
          projectId,
          partyId,
        },
      },
    });

    if (!group) {
      group = await prisma.measurementGroup.create({
        data: {
          organizationId,
          projectId,
          partyId,
          siteId: siteId || null,
        },
      });
    }

    let subgroup = await prisma.measurementSubgroup.findFirst({
      where: {
        organizationId,
        groupId: group.id,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!subgroup) {
      subgroup = await prisma.measurementSubgroup.create({
        data: {
          organizationId,
          groupId: group.id,
          name: "General / Main Work Section",
          type: "WORK_SECTION",
          description: "Default measurement section for general works",
        },
      });
    }

    return { groupId: group.id, subgroupId: subgroup.id };
  }

  /**
   * Create a new Main Group (Level 1: Project + Contractor/Vendor)
   */
  static async createGroup(input: {
    organizationId: string;
    projectId: string;
    partyId: string;
    siteId?: string;
    name?: string;
    description?: string;
    userId: string;
    role: Role;
  }): Promise<MeasurementGroupItem> {
    assertPermission(input.role, "projects:write");

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
    });
    if (!project) throw new Error("NotFound: Project not found or outside organization scope");

    const party = await prisma.party.findFirst({
      where: { id: input.partyId, organizationId: input.organizationId },
    });
    if (!party) throw new Error("NotFound: Contractor or Vendor party not found");

    // Check if group already exists
    let group = await prisma.measurementGroup.findUnique({
      where: {
        organizationId_projectId_partyId: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          partyId: input.partyId,
        },
      },
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        subgroups: true,
      },
    });

    if (!group) {
      group = await prisma.measurementGroup.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          partyId: input.partyId,
          siteId: input.siteId || project.siteId || null,
          name: input.name?.trim() || `${project.name} - ${party.name}`,
          description: input.description?.trim() || null,
        },
        include: {
          project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
          party: { select: { id: true, name: true, partyType: true } },
          subgroups: true,
        },
      });

      // Automatically create a default subgroup under newly created group
      await prisma.measurementSubgroup.create({
        data: {
          organizationId: input.organizationId,
          groupId: group.id,
          name: "General / Work Section 1",
          type: "WORK_SECTION",
        },
      });
    }

    return {
      id: group.id,
      organizationId: group.organizationId,
      projectId: group.projectId,
      partyId: group.partyId,
      siteId: group.siteId,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      project: group.project as any,
      party: group.party as any,
      subgroups: group.subgroups.map((sg) => ({
        id: sg.id,
        organizationId: sg.organizationId,
        groupId: sg.groupId,
        name: sg.name,
        type: sg.type,
        description: sg.description,
        remarks: sg.remarks,
        sortOrder: sg.sortOrder,
        createdAt: sg.createdAt.toISOString(),
        updatedAt: sg.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * Create a Subgroup (Level 2: Room / Floor / Area / Location / Work Section)
   */
  static async createSubgroup(input: {
    organizationId: string;
    groupId: string;
    name: string;
    type?: string;
    description?: string;
    remarks?: string;
    userId: string;
    role: Role;
  }): Promise<MeasurementSubgroupItem> {
    assertPermission(input.role, "projects:write");

    if (!input.name || !input.name.trim()) {
      throw new Error("InvalidInput: Subgroup name is required (e.g., Drawing Room, Ground Floor)");
    }

    const group = await prisma.measurementGroup.findFirst({
      where: { id: input.groupId, organizationId: input.organizationId },
    });
    if (!group) {
      throw new Error("NotFound: Measurement Main Group not found");
    }

    const validTypes = ["ROOM", "FLOOR", "AREA", "LOCATION", "WORK_SECTION", "CUSTOM"];
    const typeUpper = (input.type || "ROOM").toUpperCase();
    const finalType = validTypes.includes(typeUpper) ? typeUpper : "ROOM";

    const subgroup = await prisma.measurementSubgroup.create({
      data: {
        organizationId: input.organizationId,
        groupId: group.id,
        name: input.name.trim(),
        type: finalType,
        description: input.description?.trim() || null,
        remarks: input.remarks?.trim() || null,
      },
    });

    return {
      id: subgroup.id,
      organizationId: subgroup.organizationId,
      groupId: subgroup.groupId,
      name: subgroup.name,
      type: subgroup.type,
      description: subgroup.description,
      remarks: subgroup.remarks,
      sortOrder: subgroup.sortOrder,
      createdAt: subgroup.createdAt.toISOString(),
      updatedAt: subgroup.updatedAt.toISOString(),
    };
  }

  /**
   * Create a new Measurement Entry (Level 3)
   */
  static async createEntry(input: {
    organizationId: string;
    projectId: string;
    partyId: string;
    groupId?: string;
    subgroupId?: string;
    referenceNumber?: string;
    entryName?: string;
    itemDescription: string;
    measurementType?: string;
    formula?: string;
    unit: string;
    count?: number;
    length?: number;
    breadth?: number;
    depth?: number;
    deduction?: number;
    agreedRate: number; // paise
    notes?: string;
    remarks?: string;
    measurementDate?: string | Date;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<MeasurementEntry> {
    if (input.role === "SITE_SUPERVISOR") {
      const assignment = await prisma.projectAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          userId: input.userId,
          status: "ACTIVE",
        },
      });
      if (!assignment) {
        throw new Error("Forbidden: Role SITE_SUPERVISOR lacks required permission 'projects:write' or assignment to this project.");
      }
    } else {
      assertPermission(input.role, "projects:write");
    }

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
    });
    if (!project) throw new Error("NotFound: Project not found or outside organization scope");

    const party = await prisma.party.findFirst({
      where: { id: input.partyId, organizationId: input.organizationId },
    });
    if (!party) throw new Error("NotFound: Contractor or Vendor party not found");

    // Ensure group and subgroup exist
    let targetGroupId = input.groupId;
    let targetSubgroupId = input.subgroupId;

    if (!targetGroupId || !targetSubgroupId) {
      const defaults = await this.getOrCreateDefaultGroupAndSubgroup(
        input.organizationId,
        input.projectId,
        input.partyId,
        project.siteId
      );
      targetGroupId = targetGroupId || defaults.groupId;
      targetSubgroupId = targetSubgroupId || defaults.subgroupId;
    }

    const count = input.count && input.count > 0 ? input.count : 1;
    const length = typeof input.length === "number" && input.length >= 0 ? input.length : 1;
    let formula = input.formula ? input.formula.toUpperCase() : undefined;
    if (!formula) {
      const u = input.unit.toUpperCase();
      if (u === "CUM" || (input.breadth !== undefined && input.breadth !== null && input.depth !== undefined && input.depth !== null)) {
        formula = "VOLUME";
      } else if (u === "RMT") {
        formula = "LENGTH";
      } else if (u === "NOS") {
        formula = "QUANTITY";
      } else {
        formula = "AREA";
      }
    }

    const { grossQuantity, netQuantity } = this.calculateQuantities({
      formula,
      count,
      length,
      breadth: input.breadth,
      depth: input.depth,
      deduction: input.deduction,
    });

    const totalAmount = roundPaise(netQuantity * input.agreedRate);

    const mDate = input.measurementDate ? new Date(input.measurementDate) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          partyId: input.partyId,
          groupId: targetGroupId,
          subgroupId: targetSubgroupId,
          referenceNumber: input.referenceNumber?.trim() || null,
          entryName: input.entryName?.trim() || "Wall 1",
          itemDescription: input.itemDescription.trim(),
          measurementType: (input.measurementType || "WALL").toUpperCase(),
          formula,
          unit: input.unit.toUpperCase(),
          count,
          length,
          breadth: input.breadth !== undefined ? input.breadth : null,
          depth: input.depth !== undefined ? input.depth : null,
          grossQuantity,
          deduction: input.deduction || 0,
          quantity: netQuantity,
          unitRate: input.agreedRate,
          totalAmount,
          status: "SUBMITTED",
          notes: input.notes?.trim() || null,
          remarks: input.remarks?.trim() || null,
          measurementDate: mDate,
          createdBy: input.userId,
          createdByName: input.userName || null,
        },
        include: {
          project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
          party: { select: { id: true, name: true, partyType: true } },
          group: { select: { id: true, name: true } },
          subgroup: { select: { id: true, name: true, type: true } },
          attachments: { where: { isDeleted: false } },
        },
      });

      // Record in append-only MeasurementHistory
      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: entry.id,
          action: "CREATED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: "Initial measurement entry created",
          diff: JSON.stringify({
            entryName: entry.entryName,
            formula: entry.formula,
            grossQuantity,
            deduction: entry.deduction,
            netQuantity,
            unit: entry.unit,
            totalAmount,
          }),
        },
      });

      // Organization audit log
      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "MB_ENTRY_CREATED",
          entityType: "MEASUREMENT_BOOK",
          entityId: entry.id,
          afterJson: JSON.stringify(entry),
        },
      });

      return mapEntryToInterface(entry);
    });

    syncLegacyJson(result);
    return result;
  }

  /**
   * Update a Measurement Entry with MANDATORY REASON.
   * If non-admin (e.g. SITE_SUPERVISOR) tries to edit an APPROVED/VERIFIED entry,
   * it creates a MeasurementChangeRequest instead of silently overwriting.
   */
  static async updateEntryWithReason(input: {
    organizationId: string;
    entryId: string;
    reason: string;
    updates: {
      entryName?: string;
      itemDescription?: string;
      measurementType?: string;
      formula?: string;
      unit?: string;
      count?: number;
      length?: number;
      breadth?: number | null;
      depth?: number | null;
      deduction?: number;
      agreedRate?: number;
      notes?: string;
      remarks?: string;
      subgroupId?: string;
      measurementDate?: string | Date;
    };
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<{ changeRequestCreated: boolean; entry?: MeasurementEntry; changeRequest?: any }> {
    assertCanRecordMeasurements(input.role);

    if (!input.reason || !input.reason.trim()) {
      throw new Error("InvalidInput: A mandatory reason is strictly required to update a measurement entry.");
    }

    const existing = await prisma.measurementBookEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, isDeleted: false },
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        group: { select: { id: true, name: true } },
        subgroup: { select: { id: true, name: true, type: true } },
      },
    });

    if (!existing) {
      throw new Error("NotFound: Measurement entry not found or has been deleted.");
    }

    if (existing.status === "BILLED" || existing.billId) {
      throw new Error("Forbidden: This measurement entry has already been billed. Modifying billed entries is strictly prohibited.");
    }

    const isSupervisor = input.role === "SITE_SUPERVISOR";
    const isLockedState = existing.status === "APPROVED" || existing.status === "VERIFIED";

    // If supervisor is modifying an approved/verified measurement, route to Change Request
    if (isSupervisor && isLockedState) {
      const changeRequest = await prisma.measurementChangeRequest.create({
        data: {
          organizationId: input.organizationId,
          entryId: existing.id,
          requestType: "UPDATE",
          reason: input.reason.trim(),
          previousData: JSON.stringify(existing),
          proposedData: JSON.stringify(input.updates),
          status: "PENDING",
          requestedBy: input.userId,
          requestedByName: input.userName || "Site Supervisor",
          requestedRole: input.role,
        },
      });

      return { changeRequestCreated: true, changeRequest };
    }

    // Direct update authorized (Super Admin, Org Admin, or Draft/Submitted state)
    const formula = (input.updates.formula || existing.formula || "AREA").toUpperCase();
    const count = input.updates.count !== undefined ? input.updates.count : existing.count;
    const length = input.updates.length !== undefined ? input.updates.length : existing.length;
    const breadth = input.updates.breadth !== undefined ? input.updates.breadth : existing.breadth;
    const depth = input.updates.depth !== undefined ? input.updates.depth : existing.depth;
    const deduction = input.updates.deduction !== undefined ? input.updates.deduction : existing.deduction;
    const unitRate = input.updates.agreedRate !== undefined ? input.updates.agreedRate : existing.unitRate;

    const { grossQuantity, netQuantity } = this.calculateQuantities({
      formula,
      count,
      length,
      breadth,
      depth,
      deduction,
    });

    const totalAmount = roundPaise(netQuantity * unitRate);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.measurementBookEntry.update({
        where: { id: existing.id },
        data: {
          entryName: input.updates.entryName !== undefined ? input.updates.entryName : existing.entryName,
          itemDescription: input.updates.itemDescription !== undefined ? input.updates.itemDescription : existing.itemDescription,
          measurementType: input.updates.measurementType ? input.updates.measurementType.toUpperCase() : existing.measurementType,
          formula,
          unit: input.updates.unit ? input.updates.unit.toUpperCase() : existing.unit,
          count,
          length,
          breadth,
          depth,
          grossQuantity,
          deduction,
          quantity: netQuantity,
          unitRate,
          totalAmount,
          notes: input.updates.notes !== undefined ? input.updates.notes : existing.notes,
          remarks: input.updates.remarks !== undefined ? input.updates.remarks : existing.remarks,
          subgroupId: input.updates.subgroupId !== undefined ? input.updates.subgroupId : existing.subgroupId,
          measurementDate: input.updates.measurementDate ? new Date(input.updates.measurementDate) : existing.measurementDate,
          version: existing.version + 1,
        },
        include: {
          project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
          party: { select: { id: true, name: true, partyType: true } },
          group: { select: { id: true, name: true } },
          subgroup: { select: { id: true, name: true, type: true } },
          attachments: { where: { isDeleted: false } },
        },
      });

      // Append-only history record
      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: existing.id,
          action: "UPDATED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: input.reason.trim(),
          diff: JSON.stringify({
            previous: {
              entryName: existing.entryName,
              formula: existing.formula,
              count: existing.count,
              length: existing.length,
              breadth: existing.breadth,
              depth: existing.depth,
              grossQuantity: existing.grossQuantity,
              deduction: existing.deduction,
              netQuantity: existing.quantity,
              unitRate: existing.unitRate,
              totalAmount: existing.totalAmount,
            },
            current: {
              entryName: updatedRecord.entryName,
              formula: updatedRecord.formula,
              count: updatedRecord.count,
              length: updatedRecord.length,
              breadth: updatedRecord.breadth,
              depth: updatedRecord.depth,
              grossQuantity: updatedRecord.grossQuantity,
              deduction: updatedRecord.deduction,
              netQuantity: updatedRecord.quantity,
              unitRate: updatedRecord.unitRate,
              totalAmount: updatedRecord.totalAmount,
            },
            version: updatedRecord.version,
          }),
        },
      });

      return mapEntryToInterface(updatedRecord);
    });

    return { changeRequestCreated: false, entry: updated };
  }

  /**
   * Delete a Measurement Entry with MANDATORY REASON.
   * Prohibits deletion of billed entries.
   * Supervisors deleting approved items create a change request.
   */
  static async deleteEntryWithReason(input: {
    organizationId: string;
    entryId: string;
    reason: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<{ changeRequestCreated: boolean; success: boolean; changeRequest?: any }> {
    assertCanRecordMeasurements(input.role);

    if (!input.reason || !input.reason.trim()) {
      throw new Error("InvalidInput: A mandatory reason is strictly required to delete a measurement entry.");
    }

    const existing = await prisma.measurementBookEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, isDeleted: false },
    });

    if (!existing) {
      throw new Error("NotFound: Measurement entry not found or already deleted.");
    }

    if (existing.status === "BILLED" || existing.billId) {
      throw new Error("Forbidden: This measurement entry has been converted to a Bill and cannot be deleted.");
    }

    const isSupervisor = input.role === "SITE_SUPERVISOR";
    const isApproved = existing.status === "APPROVED" || existing.status === "VERIFIED";

    if (isSupervisor && isApproved) {
      const changeRequest = await prisma.measurementChangeRequest.create({
        data: {
          organizationId: input.organizationId,
          entryId: existing.id,
          requestType: "DELETE",
          reason: input.reason.trim(),
          previousData: JSON.stringify(existing),
          proposedData: JSON.stringify({ isDeleted: true }),
          status: "PENDING",
          requestedBy: input.userId,
          requestedByName: input.userName || "Site Supervisor",
          requestedRole: input.role,
        },
      });

      return { changeRequestCreated: true, success: true, changeRequest };
    }

    // Soft-delete with reason
    await prisma.$transaction(async (tx) => {
      await tx.measurementBookEntry.update({
        where: { id: existing.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: input.userId,
          deletedByName: input.userName || null,
          deletionReason: input.reason.trim(),
        },
      });

      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: existing.id,
          action: "DELETED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: input.reason.trim(),
          diff: JSON.stringify({
            deletedEntry: existing.entryName || existing.itemDescription,
            deletionReason: input.reason.trim(),
          }),
        },
      });
    });

    return { changeRequestCreated: false, success: true };
  }

  /**
   * Evidence Image: Upload new image
   */
  static async addAttachment(input: {
    organizationId: string;
    entryId: string;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
    caption?: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<MeasurementAttachmentItem> {
    assertCanRecordMeasurements(input.role);

    const entry = await prisma.measurementBookEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, isDeleted: false },
    });
    if (!entry) throw new Error("NotFound: Measurement entry not found");

    const attachment = await prisma.$transaction(async (tx) => {
      const att = await tx.measurementAttachment.create({
        data: {
          organizationId: input.organizationId,
          entryId: entry.id,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileSize: input.fileSize || null,
          mimeType: input.mimeType || null,
          caption: input.caption?.trim() || null,
          version: 1,
          uploadedBy: input.userId,
          uploadedByName: input.userName || null,
        },
      });

      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: entry.id,
          action: "IMAGE_UPLOADED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: `Uploaded evidence photo: ${input.fileName}`,
          diff: JSON.stringify({ attachmentId: att.id, fileName: att.fileName, fileUrl: att.fileUrl }),
        },
      });

      return att;
    });

    return {
      id: attachment.id,
      entryId: attachment.entryId,
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      caption: attachment.caption,
      version: attachment.version,
      isDeleted: false,
      uploadedBy: attachment.uploadedBy,
      uploadedByName: attachment.uploadedByName,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  /**
   * Evidence Image: Replace existing image with MANDATORY REASON.
   * Retains old image as previous version and saves replacement history.
   */
  static async replaceAttachmentWithReason(input: {
    organizationId: string;
    entryId: string;
    attachmentId: string;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
    caption?: string;
    reason: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<MeasurementAttachmentItem> {
    assertCanRecordMeasurements(input.role);

    if (!input.reason || !input.reason.trim()) {
      throw new Error("InvalidInput: A mandatory reason is strictly required to replace evidence image.");
    }

    const existingAtt = await prisma.measurementAttachment.findFirst({
      where: { id: input.attachmentId, entryId: input.entryId, organizationId: input.organizationId },
    });
    if (!existingAtt) throw new Error("NotFound: Evidence image to replace not found");

    const newAttachment = await prisma.$transaction(async (tx) => {
      const nextVersion = existingAtt.version + 1;

      const created = await tx.measurementAttachment.create({
        data: {
          organizationId: input.organizationId,
          entryId: input.entryId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          fileSize: input.fileSize || null,
          mimeType: input.mimeType || null,
          caption: input.caption?.trim() || existingAtt.caption,
          version: nextVersion,
          uploadedBy: input.userId,
          uploadedByName: input.userName || null,
        },
      });

      // Soft archive old image with replacement reference
      await tx.measurementAttachment.update({
        where: { id: existingAtt.id },
        data: {
          isDeleted: true,
          replacedById: created.id,
          replaceReason: input.reason.trim(),
        },
      });

      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: input.entryId,
          action: "IMAGE_REPLACED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: input.reason.trim(),
          diff: JSON.stringify({
            previousImage: { id: existingAtt.id, fileName: existingAtt.fileName, version: existingAtt.version },
            newImage: { id: created.id, fileName: created.fileName, version: created.version },
            replaceReason: input.reason.trim(),
          }),
        },
      });

      return created;
    });

    return {
      id: newAttachment.id,
      entryId: newAttachment.entryId,
      fileName: newAttachment.fileName,
      fileUrl: newAttachment.fileUrl,
      fileSize: newAttachment.fileSize,
      mimeType: newAttachment.mimeType,
      caption: newAttachment.caption,
      version: newAttachment.version,
      isDeleted: false,
      uploadedBy: newAttachment.uploadedBy,
      uploadedByName: newAttachment.uploadedByName,
      createdAt: newAttachment.createdAt.toISOString(),
    };
  }

  /**
   * Evidence Image: Delete image with MANDATORY REASON.
   * Soft-deletes image metadata; NEVER deletes wall measurement!
   */
  static async deleteAttachmentWithReason(input: {
    organizationId: string;
    entryId: string;
    attachmentId: string;
    reason: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<{ success: boolean }> {
    assertCanRecordMeasurements(input.role);

    if (!input.reason || !input.reason.trim()) {
      throw new Error("InvalidInput: A mandatory reason is strictly required to remove an evidence photo.");
    }

    const existingAtt = await prisma.measurementAttachment.findFirst({
      where: { id: input.attachmentId, entryId: input.entryId, organizationId: input.organizationId },
    });
    if (!existingAtt) throw new Error("NotFound: Evidence image not found");

    await prisma.$transaction(async (tx) => {
      await tx.measurementAttachment.update({
        where: { id: existingAtt.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: input.userId,
          deleteReason: input.reason.trim(),
        },
      });

      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: input.entryId,
          action: "IMAGE_DELETED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: input.reason.trim(),
          diff: JSON.stringify({
            attachmentId: existingAtt.id,
            fileName: existingAtt.fileName,
            deleteReason: input.reason.trim(),
          }),
        },
      });
    });

    return { success: true };
  }

  /**
   * Review a Change Request (Approve or Reject)
   */
  static async reviewChangeRequest(input: {
    organizationId: string;
    requestId: string;
    action: "APPROVE" | "REJECT";
    reviewerComments?: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<any> {
    // Only Admin / Super Admin or authorized manager can approve changes
    if (input.role !== "SUPER_ADMIN" && input.role !== "ORG_ADMIN" && input.role !== "PROJECT_MANAGER") {
      throw new Error("Forbidden: Only project managers or administrators can approve change requests.");
    }

    const request = await prisma.measurementChangeRequest.findFirst({
      where: { id: input.requestId, organizationId: input.organizationId, status: "PENDING" },
      include: { entry: true },
    });
    if (!request) throw new Error("NotFound: Pending change request not found");

    return await prisma.$transaction(async (tx) => {
      if (input.action === "REJECT") {
        const rejected = await tx.measurementChangeRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            reviewedBy: input.userId,
            reviewedByName: input.userName || null,
            reviewerComments: input.reviewerComments?.trim() || null,
            reviewedAt: new Date(),
          },
        });

        await tx.measurementHistory.create({
          data: {
            organizationId: input.organizationId,
            entryId: request.entryId,
            action: "STATUS_CHANGED",
            actorUserId: input.userId,
            actorName: input.userName || null,
            actorRole: input.role,
            reason: `Change request #${request.id} REJECTED: ${input.reviewerComments || "No comment"}`,
          },
        });

        return rejected;
      }

      // APPROVE
      if (request.requestType === "DELETE") {
        await tx.measurementBookEntry.update({
          where: { id: request.entryId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: request.requestedBy,
            deletedByName: request.requestedByName,
            deletionReason: `Approved Change Request #${request.id}: ${request.reason}`,
          },
        });

        await tx.measurementHistory.create({
          data: {
            organizationId: input.organizationId,
            entryId: request.entryId,
            action: "DELETED",
            actorUserId: input.userId,
            actorName: input.userName || null,
            actorRole: input.role,
            reason: `Change request #${request.id} APPROVED (Deletion)`,
          },
        });
      } else if (request.requestType === "UPDATE") {
        const proposed = JSON.parse(request.proposedData || "{}");
        const existing = request.entry;

        const formula = (proposed.formula || existing.formula || "AREA").toUpperCase();
        const count = proposed.count !== undefined ? proposed.count : existing.count;
        const length = proposed.length !== undefined ? proposed.length : existing.length;
        const breadth = proposed.breadth !== undefined ? proposed.breadth : existing.breadth;
        const depth = proposed.depth !== undefined ? proposed.depth : existing.depth;
        const deduction = proposed.deduction !== undefined ? proposed.deduction : existing.deduction;
        const unitRate = proposed.agreedRate !== undefined ? proposed.agreedRate : existing.unitRate;

        const { grossQuantity, netQuantity } = this.calculateQuantities({
          formula,
          count,
          length,
          breadth,
          depth,
          deduction,
        });

        const totalAmount = roundPaise(netQuantity * unitRate);

        await tx.measurementBookEntry.update({
          where: { id: existing.id },
          data: {
            entryName: proposed.entryName !== undefined ? proposed.entryName : existing.entryName,
            itemDescription: proposed.itemDescription !== undefined ? proposed.itemDescription : existing.itemDescription,
            measurementType: proposed.measurementType ? proposed.measurementType.toUpperCase() : existing.measurementType,
            formula,
            unit: proposed.unit ? proposed.unit.toUpperCase() : existing.unit,
            count,
            length,
            breadth,
            depth,
            grossQuantity,
            deduction,
            quantity: netQuantity,
            unitRate,
            totalAmount,
            notes: proposed.notes !== undefined ? proposed.notes : existing.notes,
            remarks: proposed.remarks !== undefined ? proposed.remarks : existing.remarks,
            subgroupId: proposed.subgroupId !== undefined ? proposed.subgroupId : existing.subgroupId,
            version: existing.version + 1,
          },
        });

        await tx.measurementHistory.create({
          data: {
            organizationId: input.organizationId,
            entryId: existing.id,
            action: "UPDATED",
            actorUserId: input.userId,
            actorName: input.userName || null,
            actorRole: input.role,
            reason: `Change request #${request.id} APPROVED: ${request.reason}`,
            diff: JSON.stringify({ proposed, version: existing.version + 1 }),
          },
        });
      }

      const approved = await tx.measurementChangeRequest.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          reviewedBy: input.userId,
          reviewedByName: input.userName || null,
          reviewerComments: input.reviewerComments?.trim() || null,
          reviewedAt: new Date(),
        },
      });

      return approved;
    });
  }

  /**
   * List Change Requests
   */
  static async listChangeRequests(organizationId: string, filters?: { status?: string; entryId?: string }) {
    const where: any = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.entryId) where.entryId = filters.entryId;

    return await prisma.measurementChangeRequest.findMany({
      where,
      include: {
        entry: {
          select: {
            id: true,
            entryName: true,
            itemDescription: true,
            unit: true,
            quantity: true,
            totalAmount: true,
            project: { select: { id: true, name: true, code: true } },
            party: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * List Audit History for an entry or the organization
   */
  static async listHistory(organizationId: string, entryId?: string) {
    const where: any = { organizationId };
    if (entryId) where.entryId = entryId;

    return await prisma.measurementHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Update status (e.g. SUBMITTED -> VERIFIED -> APPROVED)
   */
  static async updateStatus(input: {
    organizationId: string;
    entryId: string;
    status: "VERIFIED" | "APPROVED" | "REJECTED";
    notes?: string;
    userId: string;
    userName?: string;
    role: Role;
  }): Promise<MeasurementEntry> {
    if (input.status === "APPROVED") {
      assertPermission(input.role, "finance:write");
    } else {
      assertPermission(input.role, "projects:write");
    }

    return await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId, isDeleted: false },
      });
      if (!entry) {
        throw new Error("NotFound: Measurement book entry not found");
      }

      const oldStatus = entry.status;
      const updatedNotes = input.notes
        ? `${entry.notes || ""}; ${input.notes}`.trim()
        : entry.notes;

      const updated = await tx.measurementBookEntry.update({
        where: { id: entry.id },
        data: {
          status: input.status,
          approvedBy: input.status === "APPROVED" ? input.userId : entry.approvedBy,
          notes: updatedNotes,
        },
        include: {
          project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
          party: { select: { id: true, name: true, partyType: true } },
          group: { select: { id: true, name: true } },
          subgroup: { select: { id: true, name: true, type: true } },
          attachments: { where: { isDeleted: false } },
        },
      });

      await tx.measurementHistory.create({
        data: {
          organizationId: input.organizationId,
          entryId: entry.id,
          action: "STATUS_CHANGED",
          actorUserId: input.userId,
          actorName: input.userName || null,
          actorRole: input.role,
          reason: `Status transition from ${oldStatus} to ${input.status}`,
          diff: JSON.stringify({ oldStatus, newStatus: input.status, notes: input.notes }),
        },
      });

      return mapEntryToInterface(updated);
    });
  }

  /**
   * Convert an APPROVED Measurement Book entry into a posted Bill.
   * INVARIANT: Rejects if status is not APPROVED!
   */
  static async convertToBill(input: {
    organizationId: string;
    entryId: string;
    billNumber: string;
    userId: string;
    userName?: string;
    role: Role;
  }) {
    assertPermission(input.role, "finance:write");

    const entry = await prisma.measurementBookEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId, isDeleted: false },
    });
    if (!entry) {
      throw new Error("NotFound: Measurement book entry not found");
    }

    if (entry.status === "BILLED" || entry.billId) {
      throw new Error(
        `Measurement book entry #${entry.id} has already been converted to Bill #${entry.billId}. Duplicate billing is strictly prohibited.`
      );
    }

    if (entry.status !== "APPROVED") {
      throw new Error(
        `Cannot bill unapproved measurement book entry. Current status: ${entry.status}. Verification and managerial approval are strictly required.`
      );
    }

    // Create the Bill via authoritative FinanceService
    const bill = await FinanceService.createBill({
      organizationId: input.organizationId,
      partyId: entry.partyId,
      projectId: entry.projectId,
      billNumber: input.billNumber,
      billDate: new Date(),
      lines: [
        {
          description: `[MB Work Order] ${entry.entryName ? entry.entryName + " - " : ""}${entry.itemDescription} (${entry.quantity} ${entry.unit})`,
          quantity: entry.quantity,
          unitRate: entry.unitRate,
          lineTotal: entry.totalAmount,
        },
      ],
      notes: `Converted from approved Measurement Book entry ID: ${entry.id}`,
      userId: input.userId,
      role: input.role,
    });

    const billedEntry = await prisma.measurementBookEntry.update({
      where: { id: entry.id },
      data: {
        status: "BILLED",
        billId: bill.id,
      },
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        group: { select: { id: true, name: true } },
        subgroup: { select: { id: true, name: true, type: true } },
        attachments: { where: { isDeleted: false } },
      },
    });

    await prisma.measurementHistory.create({
      data: {
        organizationId: input.organizationId,
        entryId: entry.id,
        action: "CONVERTED_TO_BILL",
        actorUserId: input.userId,
        actorName: input.userName || null,
        actorRole: input.role,
        reason: `Generated Bill #${bill.billNumber} from approved measurement`,
        diff: JSON.stringify({ billId: bill.id, billNumber: bill.billNumber, totalAmount: entry.totalAmount }),
      },
    });

    return { entry: mapEntryToInterface(billedEntry), bill };
  }

  /**
   * List Measurement Book entries scoped to organization
   */
  static async listEntries(
    organizationId: string,
    filters?: { projectId?: string; partyId?: string; status?: string; includeDeleted?: boolean }
  ): Promise<MeasurementEntry[]> {
    checkAndHealLegacyJsonBackup();

    const where: any = { organizationId };
    if (!filters?.includeDeleted) where.isDeleted = false;
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.partyId) where.partyId = filters.partyId;
    if (filters?.status) where.status = filters.status;

    const entries = await prisma.measurementBookEntry.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        group: { select: { id: true, name: true } },
        subgroup: { select: { id: true, name: true, type: true } },
        attachments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return entries.map(mapEntryToInterface);
  }

  /**
   * List hierarchical 3-level tree:
   * Level 1: Main Group (Project + Contractor/Vendor)
   * Level 2: Subgroup (Room / Floor / Area)
   * Level 3: Measurement Entries (Wall 1, Wall 2...)
   */
  static async listHierarchical(
    organizationId: string,
    filters?: {
      projectId?: string;
      partyId?: string;
      partyType?: string;
      siteId?: string;
      status?: string;
      search?: string;
    }
  ): Promise<MeasurementGroupItem[]> {
    checkAndHealLegacyJsonBackup();

    // Fetch all active entries matching base filters
    const entryWhere: any = { organizationId, isDeleted: false };
    if (filters?.projectId) entryWhere.projectId = filters.projectId;
    if (filters?.partyId) entryWhere.partyId = filters.partyId;
    if (filters?.status) entryWhere.status = filters.status;

    const allEntries = await prisma.measurementBookEntry.findMany({
      where: entryWhere,
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        group: { select: { id: true, name: true } },
        subgroup: { select: { id: true, name: true, type: true } },
        attachments: { where: { isDeleted: false }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Also fetch all groups in this organization
    const groupWhere: any = { organizationId };
    if (filters?.projectId) groupWhere.projectId = filters.projectId;
    if (filters?.partyId) groupWhere.partyId = filters.partyId;

    const existingGroups = await prisma.measurementGroup.findMany({
      where: groupWhere,
      include: {
        project: { select: { id: true, name: true, code: true, siteId: true, site: { select: { id: true, name: true } } } },
        party: { select: { id: true, name: true, partyType: true } },
        subgroups: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    // Build map of groups
    const groupMap = new Map<string, MeasurementGroupItem>();

    for (const g of existingGroups) {
      // Party type filter
      if (filters?.partyType && g.party?.partyType !== filters.partyType) continue;
      // Site filter
      if (filters?.siteId && g.project?.siteId !== filters.siteId) continue;

      groupMap.set(g.id, {
        id: g.id,
        organizationId: g.organizationId,
        projectId: g.projectId,
        partyId: g.partyId,
        siteId: g.siteId || g.project?.siteId || null,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        project: g.project as any,
        party: g.party as any,
        subgroups: g.subgroups.map((sg) => ({
          id: sg.id,
          organizationId: sg.organizationId,
          groupId: sg.groupId,
          name: sg.name,
          type: sg.type,
          description: sg.description,
          remarks: sg.remarks,
          sortOrder: sg.sortOrder,
          createdAt: sg.createdAt.toISOString(),
          updatedAt: sg.updatedAt.toISOString(),
          entries: [],
          entriesCount: 0,
          quantitiesByUnit: {},
          totalAmount: 0,
        })),
        subgroupsCount: g.subgroups.length,
        entriesCount: 0,
        quantitiesByUnit: {},
        totalAmount: 0,
      });
    }

    // Now organize all entries into their respective Groups and Subgroups
    for (const rawEntry of allEntries) {
      const entry = mapEntryToInterface(rawEntry);

      // Search filter matching: project, party, room (subgroup), wall (entryName), referenceNumber, description
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.toLowerCase().trim();
        const match =
          (entry.entryName && entry.entryName.toLowerCase().includes(q)) ||
          (entry.itemDescription && entry.itemDescription.toLowerCase().includes(q)) ||
          (entry.referenceNumber && entry.referenceNumber.toLowerCase().includes(q)) ||
          (entry.subgroup?.name && entry.subgroup.name.toLowerCase().includes(q)) ||
          (entry.project?.name && entry.project.name.toLowerCase().includes(q)) ||
          (entry.party?.name && entry.party.name.toLowerCase().includes(q));
        if (!match) continue;
      }

      // Check party type and site filter
      if (filters?.partyType && entry.party?.partyType !== filters.partyType) continue;
      if (filters?.siteId && entry.project?.siteId !== filters.siteId) continue;

      // Locate or create virtual group
      let groupKey = entry.groupId;
      if (!groupKey) {
        // Fallback compound key
        groupKey = `V_${entry.projectId}_${entry.partyId}`;
      }

      let group = groupMap.get(groupKey);
      if (!group) {
        // Create virtual or lookup group
        group = {
          id: groupKey,
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          partyId: entry.partyId,
          siteId: entry.project?.siteId || null,
          name: `${entry.project?.name || "Project"} - ${entry.party?.name || "Contractor"}`,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          project: entry.project as any,
          party: entry.party as any,
          subgroups: [],
          subgroupsCount: 0,
          entriesCount: 0,
          quantitiesByUnit: {},
          totalAmount: 0,
        };
        groupMap.set(groupKey, group);
      }

      // Locate or create subgroup
      let subgroup = group.subgroups.find((s) => s.id === entry.subgroupId);
      if (!subgroup) {
        // Create a default subgroup if missing
        subgroup = {
          id: entry.subgroupId || `SG_DEFAULT_${group.id}`,
          organizationId: entry.organizationId,
          groupId: group.id,
          name: entry.subgroup?.name || "General / Unassigned Area",
          type: entry.subgroup?.type || "AREA",
          sortOrder: 0,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          entries: [],
          entriesCount: 0,
          quantitiesByUnit: {},
          totalAmount: 0,
        };
        group.subgroups.push(subgroup);
      }

      if (!subgroup.entries) subgroup.entries = [];
      subgroup.entries.push(entry);

      // Update Subgroup aggregates
      subgroup.entriesCount = (subgroup.entriesCount || 0) + 1;
      const unit = entry.unit.toUpperCase();
      if (!subgroup.quantitiesByUnit) subgroup.quantitiesByUnit = {};
      subgroup.quantitiesByUnit[unit] = roundQuantity((subgroup.quantitiesByUnit[unit] || 0) + entry.quantity, 4);
      subgroup.totalAmount = (subgroup.totalAmount || 0) + entry.totalAmount;

      // Update Group aggregates
      group.entriesCount = (group.entriesCount || 0) + 1;
      if (!group.quantitiesByUnit) group.quantitiesByUnit = {};
      group.quantitiesByUnit[unit] = roundQuantity((group.quantitiesByUnit[unit] || 0) + entry.quantity, 4);
      group.totalAmount = (group.totalAmount || 0) + entry.totalAmount;
    }

    // Update group subgroupsCount
    for (const g of groupMap.values()) {
      g.subgroupsCount = g.subgroups.length;
    }

    return Array.from(groupMap.values());
  }

  /**
   * Measurement Abstract Summary (Phase 14)
   * Grouped and summarized by Project, Party, Subgroup, and Unit
   */
  static async getAbstract(
    organizationId: string,
    filters?: { projectId?: string; partyId?: string; siteId?: string }
  ) {
    const groups = await this.listHierarchical(organizationId, filters);

    const unitTotals: Record<string, { quantity: number; amount: number; count: number }> = {};

    const projectsSummary: Record<string, { name: string; code: string; unitTotals: Record<string, number>; totalAmount: number }> = {};
    const partiesSummary: Record<string, { name: string; partyType: string; unitTotals: Record<string, number>; totalAmount: number }> = {};

    for (const g of groups) {
      const projId = g.projectId;
      const partyId = g.partyId;

      if (!projectsSummary[projId]) {
        projectsSummary[projId] = {
          name: g.project?.name || "Unknown",
          code: g.project?.code || "",
          unitTotals: {},
          totalAmount: 0,
        };
      }
      if (!partiesSummary[partyId]) {
        partiesSummary[partyId] = {
          name: g.party?.name || "Unknown",
          partyType: g.party?.partyType || "CONTRACTOR",
          unitTotals: {},
          totalAmount: 0,
        };
      }

      projectsSummary[projId].totalAmount += g.totalAmount || 0;
      partiesSummary[partyId].totalAmount += g.totalAmount || 0;

      for (const [unit, qty] of Object.entries(g.quantitiesByUnit || {})) {
        if (!unitTotals[unit]) unitTotals[unit] = { quantity: 0, amount: 0, count: 0 };
        unitTotals[unit].quantity = roundQuantity(unitTotals[unit].quantity + qty, 4);

        projectsSummary[projId].unitTotals[unit] = roundQuantity(
          (projectsSummary[projId].unitTotals[unit] || 0) + qty,
          4
        );
        partiesSummary[partyId].unitTotals[unit] = roundQuantity(
          (partiesSummary[partyId].unitTotals[unit] || 0) + qty,
          4
        );
      }

      // Add to unitTotals amount and count
      for (const sg of g.subgroups) {
        for (const e of sg.entries || []) {
          const u = e.unit.toUpperCase();
          if (unitTotals[u]) {
            unitTotals[u].amount += e.totalAmount;
            unitTotals[u].count += 1;
          }
        }
      }
    }

    return {
      unitTotals,
      projectsSummary,
      partiesSummary,
      groupsCount: groups.length,
      totalEntries: Object.values(unitTotals).reduce((acc, u) => acc + u.count, 0),
      totalOverallAmount: Object.values(unitTotals).reduce((acc, u) => acc + u.amount, 0),
    };
  }
}
