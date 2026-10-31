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

export interface MeasurementEntry {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string; // Subcontractor
  itemDescription: string;
  unit: string; // SQM, CUM, RMT, NOS, TONNE
  count: number;
  length: number;
  breadth?: number;
  depth?: number;
  quantity: number;
  unitRate: number; // paise
  totalAmount: number; // paise
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "REJECTED" | "BILLED";
  billId?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string };
  party?: { id: string; name: string };
}

function mapToInterface(r: any): MeasurementEntry {
  return {
    id: r.id,
    organizationId: r.organizationId,
    projectId: r.projectId,
    partyId: r.partyId,
    itemDescription: r.itemDescription,
    unit: r.unit,
    count: r.count,
    length: r.length,
    breadth: r.breadth ?? undefined,
    depth: r.depth ?? undefined,
    quantity: r.quantity,
    unitRate: r.unitRate,
    totalAmount: r.totalAmount,
    status: r.status as any,
    billId: r.billId ?? undefined,
    notes: r.notes ?? undefined,
    createdBy: r.createdBy,
    createdByName: r.createdByName ?? undefined,
    approvedBy: r.approvedBy ?? undefined,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    project: r.project ? { id: r.project.id, name: r.project.name, code: r.project.code } : undefined,
    party: r.party ? { id: r.party.id, name: r.party.name } : undefined,
  };
}

export class MeasurementBookService {
  /**
   * Create a new Measurement Book record backed by database transaction
   */
  static async createEntry(input: {
    organizationId: string;
    projectId: string;
    partyId: string;
    itemDescription: string;
    unit: string;
    count?: number;
    length?: number;
    breadth?: number;
    depth?: number;
    agreedRate: number; // paise
    notes?: string;
    userId: string;
    role: Role;
  }): Promise<MeasurementEntry> {
    assertPermission(input.role, "projects:write");

    // Verify project belongs to organization
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
    });
    if (!project) throw new Error("NotFound: Project not found or outside organization scope");

    // Verify subcontractor party belongs to organization
    const party = await prisma.party.findFirst({
      where: { id: input.partyId, organizationId: input.organizationId },
    });
    if (!party) throw new Error("NotFound: Subcontractor party not found or outside organization scope");

    const count = input.count && input.count > 0 ? input.count : 1;
    const length = input.length && input.length > 0 ? input.length : 1;
    const breadth = input.breadth && input.breadth > 0 ? input.breadth : 1;
    const depth = input.depth && input.depth > 0 ? input.depth : 1;

    // Calculate quantity and total amount with precision
    const quantity = roundQuantity(count * length * breadth * depth, 4);
    const totalAmount = roundPaise(quantity * input.agreedRate);

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          partyId: input.partyId,
          itemDescription: input.itemDescription,
          unit: input.unit.toUpperCase(),
          count,
          length,
          breadth: input.breadth,
          depth: input.depth,
          quantity,
          unitRate: input.agreedRate,
          totalAmount,
          status: "SUBMITTED",
          notes: input.notes,
          createdBy: input.userId,
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          party: { select: { id: true, name: true } },
        },
      });

      // Audit log in same transaction
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

      return mapToInterface(entry);
    });

    syncLegacyJson(result);
    return result;
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
    role: Role;
  }): Promise<MeasurementEntry> {
    if (input.status === "APPROVED") {
      assertPermission(input.role, "finance:write");
    } else {
      assertPermission(input.role, "projects:write");
    }

    return await prisma.$transaction(async (tx) => {
      const entry = await tx.measurementBookEntry.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId },
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
          project: { select: { id: true, name: true, code: true } },
          party: { select: { id: true, name: true } },
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "MB_STATUS_CHANGED",
          entityType: "MEASUREMENT_BOOK",
          entityId: entry.id,
          reason: `Status transition from ${oldStatus} to ${input.status}`,
          afterJson: JSON.stringify(updated),
        },
      });

      return mapToInterface(updated);
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
    role: Role;
  }) {
    assertPermission(input.role, "finance:write");

    const entry = await prisma.measurementBookEntry.findFirst({
      where: { id: input.entryId, organizationId: input.organizationId },
    });
    if (!entry) {
      throw new Error("NotFound: Measurement book entry not found");
    }

    // INVARIANT ENFORCEMENT: Prevent duplicate billing
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
          description: `[MB Work Order] ${entry.itemDescription} (${entry.quantity} ${entry.unit})`,
          quantity: entry.quantity,
          unitRate: entry.unitRate,
          lineTotal: entry.totalAmount,
        },
      ],
      notes: `Converted from approved Measurement Book entry ID: ${entry.id}`,
      userId: input.userId,
      role: input.role,
    });

    // Mark as BILLED
    const billedEntry = await prisma.measurementBookEntry.update({
      where: { id: entry.id },
      data: {
        status: "BILLED",
        billId: bill.id,
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        party: { select: { id: true, name: true } },
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "MB_CONVERTED_TO_BILL",
        entityType: "MEASUREMENT_BOOK",
        entityId: entry.id,
        afterJson: JSON.stringify({ billId: bill.id, billNumber: bill.billNumber }),
      },
    });

    return { entry: mapToInterface(billedEntry), bill };
  }

  /**
   * List Measurement Book entries scoped to organization
   */
  static async listEntries(
    organizationId: string,
    filters?: { projectId?: string; partyId?: string; status?: string }
  ): Promise<MeasurementEntry[]> {
    checkAndHealLegacyJsonBackup();

    const where: any = { organizationId };
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.partyId) where.partyId = filters.partyId;
    if (filters?.status) where.status = filters.status;

    const entries = await prisma.measurementBookEntry.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        party: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return entries.map(mapToInterface);
  }
}
