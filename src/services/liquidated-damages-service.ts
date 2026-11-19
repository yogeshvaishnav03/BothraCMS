import { prisma } from "@/lib/db";
import { roundPaise } from "@/lib/financial-math";
import { UserContext } from "@/lib/server-auth";

export interface RecordDamageInput {
  organizationId: string;
  partyId: string;
  projectId?: string | null;
  amount: number; // in paise
  damageType?: string; // DELAY, DEFECT, BREAKAGE, SAFETY, BREACH, OTHER
  reason: string;
  referenceNumber?: string | null;
  deductionDate: Date | string;
  notes?: string | null;
  userId: string;
  role?: string;
}

export interface WaiveDamageInput {
  organizationId: string;
  id: string;
  waiveReason: string;
  userId: string;
  role?: string;
}

export class LiquidatedDamagesService {
  /**
   * Helper to ensure table exists in SQLite local environment
   */
  private static async ensureTable() {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "LiquidatedDamage" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "organizationId" TEXT NOT NULL,
          "partyId" TEXT NOT NULL,
          "projectId" TEXT,
          "amount" REAL NOT NULL,
          "damageType" TEXT DEFAULT 'DELAY',
          "reason" TEXT NOT NULL,
          "referenceNumber" TEXT,
          "deductionDate" DATETIME NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'APPLIED',
          "waiveReason" TEXT,
          "waivedAt" DATETIME,
          "waivedById" TEXT,
          "notes" TEXT,
          "createdById" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(() => {});
    } catch {}
  }

  /**
   * Record a Liquidated Damages deduction against a Vendor or Contractor
   */
  static async recordDamage(input: RecordDamageInput) {
    await this.ensureTable();

    const party = await prisma.party.findFirst({
      where: { id: input.partyId, organizationId: input.organizationId },
    });
    if (!party) {
      throw new Error("NotFound: Vendor or Contractor not found");
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) {
        throw new Error("NotFound: Project not found");
      }
    }

    if (!input.amount || input.amount <= 0) {
      throw new Error("InvalidAmount: Deduction amount must be greater than zero");
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error("InvalidReason: Reason / damage assessment is required");
    }

    const deductionDate = input.deductionDate instanceof Date ? input.deductionDate : new Date(input.deductionDate);
    const year = deductionDate.getFullYear();
    const referenceNumber = input.referenceNumber?.trim() || `LD-${year}-${Math.floor(1000 + Math.random() * 9000)}`;

    const damageData = {
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
      partyId: input.partyId,
      projectId: input.projectId || null,
      amount: roundPaise(input.amount),
      damageType: input.damageType || "DELAY",
      reason: input.reason.trim(),
      referenceNumber,
      deductionDate,
      status: "APPLIED",
      notes: input.notes?.trim() || null,
      createdById: input.userId,
    };

    let record: any;
    if ((prisma as any).liquidatedDamage?.create) {
      record = await (prisma as any).liquidatedDamage.create({
        data: damageData,
        include: {
          project: { select: { id: true, name: true, code: true } },
          party: { select: { id: true, name: true, partyType: true } },
          creator: { select: { id: true, name: true, role: true } },
        },
      });
    } else {
      // Direct SQL fallback if Prisma model is not dynamically injected
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LiquidatedDamage" ("id", "organizationId", "partyId", "projectId", "amount", "damageType", "reason", "referenceNumber", "deductionDate", "status", "notes", "createdById", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        damageData.id,
        damageData.organizationId,
        damageData.partyId,
        damageData.projectId,
        damageData.amount,
        damageData.damageType,
        damageData.reason,
        damageData.referenceNumber,
        damageData.deductionDate.toISOString(),
        damageData.notes,
        damageData.createdById
      );
      record = damageData;
    }

    // Audit Event
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "LIQUIDATED_DAMAGES_DEDUCTED",
          entityType: "PARTY",
          entityId: input.partyId,
          reason: `Liquidated Damages of ₹${(damageData.amount / 100).toLocaleString("en-IN")} deducted: ${damageData.reason}`,
          afterJson: JSON.stringify({
            amount: damageData.amount,
            damageType: damageData.damageType,
            referenceNumber: damageData.referenceNumber,
            projectId: damageData.projectId,
            deductionDate: damageData.deductionDate,
          }),
        },
      });
    } catch {}

    return record;
  }

  /**
   * Waive or reverse an applied Liquidated Damages deduction
   */
  static async waiveDamage(input: WaiveDamageInput) {
    await this.ensureTable();

    let existing: any;
    if ((prisma as any).liquidatedDamage?.findFirst) {
      existing = await (prisma as any).liquidatedDamage.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      });
    } else {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM "LiquidatedDamage" WHERE "id" = ? AND "organizationId" = ? LIMIT 1`,
        input.id,
        input.organizationId
      );
      existing = rows?.[0];
    }

    if (!existing) {
      throw new Error("NotFound: Liquidated damage record not found");
    }

    if (existing.status === "WAIVED") {
      throw new Error("AlreadyWaived: This liquidated damage has already been waived");
    }

    if (!input.waiveReason || input.waiveReason.trim().length === 0) {
      throw new Error("InvalidReason: Reason for waiving this deduction is required");
    }

    const waivedAt = new Date();
    let updated: any;
    if ((prisma as any).liquidatedDamage?.update) {
      updated = await (prisma as any).liquidatedDamage.update({
        where: { id: input.id },
        data: {
          status: "WAIVED",
          waiveReason: input.waiveReason.trim(),
          waivedAt,
          waivedById: input.userId,
        },
      });
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "LiquidatedDamage" SET "status" = 'WAIVED', "waiveReason" = ?, "waivedAt" = ?, "waivedById" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        input.waiveReason.trim(),
        waivedAt.toISOString(),
        input.userId,
        input.id
      );
      updated = { ...existing, status: "WAIVED", waiveReason: input.waiveReason.trim(), waivedAt, waivedById: input.userId };
    }

    // Audit Event
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.userId,
          action: "LIQUIDATED_DAMAGES_WAIVED",
          entityType: "PARTY",
          entityId: existing.partyId,
          reason: `Waived Liquidated Damages deduction #${existing.referenceNumber || existing.id}: ${input.waiveReason}`,
          afterJson: JSON.stringify({
            waivedAt,
            waiveReason: input.waiveReason,
          }),
        },
      });
    } catch {}

    return updated;
  }

  /**
   * List Liquidated Damages for a party with project details
   */
  static async getPartyDamages(organizationId: string, partyId: string) {
    await this.ensureTable();

    let damages: any[] = [];
    try {
      if ((prisma as any).liquidatedDamage?.findMany) {
        damages = await (prisma as any).liquidatedDamage.findMany({
          where: { organizationId, partyId },
          include: {
            project: { select: { id: true, name: true, code: true } },
            creator: { select: { id: true, name: true, role: true } },
          },
          orderBy: [{ deductionDate: "desc" }, { createdAt: "desc" }],
        });
      } else {
        damages = await prisma.$queryRawUnsafe(
          `SELECT ld.*, p.name as "projectName", p.code as "projectCode", u.name as "creatorName"
           FROM "LiquidatedDamage" ld
           LEFT JOIN "Project" p ON ld."projectId" = p."id"
           LEFT JOIN "User" u ON ld."createdById" = u."id"
           WHERE ld."organizationId" = ? AND ld."partyId" = ?
           ORDER BY ld."deductionDate" DESC, ld."createdAt" DESC`,
          organizationId,
          partyId
        );
        damages = (damages || []).map((d: any) => ({
          ...d,
          project: d.projectName ? { id: d.projectId, name: d.projectName, code: d.projectCode } : null,
          creator: d.creatorName ? { id: d.createdById, name: d.creatorName } : null,
        }));
      }
    } catch (err) {
      console.warn("Could not query LiquidatedDamage:", err);
      damages = [];
    }

    const appliedDamages = damages.filter((d) => d.status === "APPLIED");
    const totalDamagesDeducted = roundPaise(appliedDamages.reduce((sum, d) => sum + (Number(d.amount) || 0), 0));

    return {
      damages,
      totalDamagesDeducted,
      appliedCount: appliedDamages.length,
      totalCount: damages.length,
    };
  }
}
