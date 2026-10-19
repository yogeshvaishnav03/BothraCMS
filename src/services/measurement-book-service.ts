import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";
import { FinanceService } from "./finance-service";
import { roundQuantity, roundPaise } from "@/lib/financial-math";

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
}

const STORAGE_FILE = path.resolve(process.cwd(), "storage", "data", "measurement-book.json");
const BACKUP_FILE = path.resolve(process.cwd(), "storage", "data", "measurement-book.json.bak");

function ensureStorageDir() {
  const dir = path.dirname(STORAGE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function loadAllEntries(): MeasurementEntry[] {
  ensureStorageDir();
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.error("Warning: Failed to parse primary measurement-book.json. Attempting recovery from backup...", err);
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const bakRaw = fs.readFileSync(BACKUP_FILE, "utf-8");
        const bakData = JSON.parse(bakRaw);
        if (Array.isArray(bakData)) {
          fs.writeFileSync(STORAGE_FILE, bakRaw, "utf-8");
          return bakData;
        }
      }
    } catch (bakErr) {
      console.error("CRITICAL: Failed to load measurement-book backup file:", bakErr);
    }
  }
  return [];
}

function writeAtomic(entries: MeasurementEntry[]) {
  ensureStorageDir();
  const serialized = JSON.stringify(entries, null, 2);
  const tempFile = `${STORAGE_FILE}.tmp.${crypto.randomUUID()}`;

  fs.writeFileSync(tempFile, serialized, "utf-8");

  // Perform atomic replacement without leaving stray backup files
  try {
    fs.renameSync(tempFile, STORAGE_FILE);
  } catch {
    fs.copyFileSync(tempFile, STORAGE_FILE);
    try {
      fs.unlinkSync(tempFile);
    } catch {}
  }
}

function saveEntry(entry: MeasurementEntry) {
  const all = loadAllEntries();
  const idx = all.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  writeAtomic(all);
}

function saveAllEntries(entries: MeasurementEntry[]) {
  writeAtomic(entries);
}

export class MeasurementBookService {
  /**
   * Create a new Measurement Book record
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

    const now = new Date().toISOString();
    const entry: MeasurementEntry = {
      id: crypto.randomUUID(),
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
      createdAt: now,
      updatedAt: now,
    };

    saveEntry(entry);

    // Audit log
    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "MB_ENTRY_CREATED",
        entityType: "MEASUREMENT_BOOK",
        entityId: entry.id,
        afterJson: JSON.stringify(entry),
      },
    });

    return entry;
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

    const all = loadAllEntries();
    const index = all.findIndex(
      (e) => e.id === input.entryId && e.organizationId === input.organizationId
    );
    if (index === -1) {
      throw new Error("NotFound: Measurement book entry not found");
    }

    const entry = all[index];
    const oldStatus = entry.status;
    entry.status = input.status;
    entry.updatedAt = new Date().toISOString();
    if (input.status === "APPROVED") {
      entry.approvedBy = input.userId;
    }
    if (input.notes) {
      entry.notes = `${entry.notes || ""}; ${input.notes}`.trim();
    }

    saveEntry(entry);

    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "MB_STATUS_CHANGED",
        entityType: "MEASUREMENT_BOOK",
        entityId: entry.id,
        reason: `Status transition from ${oldStatus} to ${input.status}`,
        afterJson: JSON.stringify(entry),
      },
    });

    return entry;
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

    const all = loadAllEntries();
    const index = all.findIndex(
      (e) => e.id === input.entryId && e.organizationId === input.organizationId
    );
    if (index === -1) {
      throw new Error("NotFound: Measurement book entry not found");
    }

    const entry = all[index];

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
    entry.status = "BILLED";
    entry.billId = bill.id;
    entry.updatedAt = new Date().toISOString();
    saveEntry(entry);

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

    return { entry, bill };
  }

  /**
   * List Measurement Book entries scoped to organization
   */
  static async listEntries(
    organizationId: string,
    filters?: { projectId?: string; partyId?: string; status?: string }
  ): Promise<MeasurementEntry[]> {
    const all = loadAllEntries();
    return all.filter((e) => {
      if (e.organizationId !== organizationId) return false;
      if (filters?.projectId && e.projectId !== filters.projectId) return false;
      if (filters?.partyId && e.partyId !== filters.partyId) return false;
      if (filters?.status && e.status !== filters.status) return false;
      return true;
    });
  }
}
