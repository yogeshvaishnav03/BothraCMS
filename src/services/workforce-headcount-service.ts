import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/permissions";

export interface WorkforceHeadcountRecord {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  date: string; // YYYY-MM-DD
  shift: "GENERAL" | "DAY" | "NIGHT";
  artisanCount: number; // Direct headcount
  craftsmanCount: number; // Direct headcount
  laborerMale: number;
  laborerFemale: number;
  laborerTotal: number;
  // Backward compatibility fields
  artisanMale?: number;
  artisanFemale?: number;
  artisanTotal?: number;
  craftsmanMale?: number;
  craftsmanFemale?: number;
  craftsmanTotal?: number;
  totalMale?: number;
  totalFemale?: number;
  grandTotal: number;
  contractorName?: string;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveHeadcountInput {
  siteId: string;
  date: string; // YYYY-MM-DD
  shift?: "GENERAL" | "DAY" | "NIGHT";
  artisanCount?: number;
  craftsmanCount?: number;
  laborerMale: number;
  laborerFemale: number;
  artisanMale?: number;
  artisanFemale?: number;
  craftsmanMale?: number;
  craftsmanFemale?: number;
  contractorName?: string;
  notes?: string;
}

function normalizeDbRecord(r: any): WorkforceHeadcountRecord {
  const artisanCount = Number(r.artisanCount) || 0;
  const craftsmanCount = Number(r.craftsmanCount) || 0;
  const laborerMale = Number(r.laborerMale) || 0;
  const laborerFemale = Number(r.laborerFemale) || 0;
  const laborerTotal = Number(r.laborerTotal ?? (laborerMale + laborerFemale)) || 0;
  const grandTotal = Number(r.grandTotal ?? (artisanCount + craftsmanCount + laborerTotal)) || 0;

  return {
    id: r.id,
    organizationId: r.organizationId,
    siteId: r.siteId,
    siteName: r.siteName || (r.site ? r.site.name : "Operational Site"),
    date: r.date,
    shift: r.shift as any,
    artisanCount,
    artisanTotal: artisanCount,
    craftsmanCount,
    craftsmanTotal: craftsmanCount,
    laborerMale,
    laborerFemale,
    laborerTotal,
    totalMale: laborerMale,
    totalFemale: laborerFemale,
    grandTotal,
    contractorName: r.contractorName ?? undefined,
    notes: r.notes ?? undefined,
    supervisorId: r.supervisorId,
    supervisorName: r.supervisorName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

export class WorkforceHeadcountService {
  /**
   * List headcount records for an organization with optional site/date filtering
   * Backed by authoritative Prisma WorkforceHeadcount database table
   */
  static async listRecords(
    organizationId: string,
    filter?: { siteId?: string; date?: string; startDate?: string; endDate?: string }
  ): Promise<WorkforceHeadcountRecord[]> {
    const where: any = { organizationId };
    if (filter?.siteId) where.siteId = filter.siteId;
    if (filter?.date) where.date = filter.date;
    if (filter?.startDate || filter?.endDate) {
      where.date = {};
      if (filter.startDate) where.date.gte = filter.startDate;
      if (filter.endDate) where.date.lte = filter.endDate;
    }

    try {
      const dbRecords = await prisma.workforceHeadcount.findMany({
        where,
        include: { site: { select: { id: true, name: true, code: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });

      if (dbRecords.length > 0) {
        return dbRecords.map(normalizeDbRecord);
      }
    } catch (err) {
      console.warn("Notice: WorkforceHeadcount table query fallback:", err);
    }

    // Fallback: Query legacy IdempotencyRecords if table has not yet been populated
    const recordsMap = new Map<string, WorkforceHeadcountRecord>();
    try {
      const idempRecords = await prisma.idempotencyRecord.findMany({
        where: {
          organizationId,
          operation: "WORKFORCE_HEADCOUNT",
        },
        orderBy: { createdAt: "desc" },
      });

      for (const rec of idempRecords) {
        try {
          if (rec.responseBodyJson) {
            const parsed = JSON.parse(rec.responseBodyJson);
            const normalized = normalizeDbRecord(parsed);
            const key = `${normalized.siteId}#${normalized.date}#${normalized.shift}`;
            if (!recordsMap.has(key)) {
              recordsMap.set(key, normalized);
            }
          }
        } catch {}
      }
    } catch {}

    const legacy = Array.from(recordsMap.values());
    return legacy
      .filter((r) => {
        if (r.organizationId !== organizationId) return false;
        if (filter?.siteId && r.siteId !== filter.siteId) return false;
        if (filter?.date && r.date !== filter.date) return false;
        if (filter?.startDate && r.date < filter.startDate) return false;
        if (filter?.endDate && r.date > filter.endDate) return false;
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  /**
   * Save or update daily headcount for a site using Prisma ACID transactions
   */
  static async saveRecord(
    organizationId: string,
    input: SaveHeadcountInput,
    user: { userId: string; name: string; role: Role }
  ): Promise<WorkforceHeadcountRecord> {
    if (!input.siteId) {
      throw new Error("Target site is required to upload workforce count");
    }

    // Resolve site name
    let siteName = "Site";
    try {
      const site = await prisma.site.findFirst({
        where: { id: input.siteId, organizationId },
      });
      if (site) {
        siteName = site.name;
      }
    } catch {}

    const shift = input.shift || "GENERAL";
    const date = input.date || new Date().toISOString().split("T")[0];

    const artisanCount = Math.max(
      0,
      Math.floor(
        Number(
          input.artisanCount !== undefined
            ? input.artisanCount
            : (Number(input.artisanMale) || 0) + (Number(input.artisanFemale) || 0)
        ) || 0
      )
    );

    const craftsmanCount = Math.max(
      0,
      Math.floor(
        Number(
          input.craftsmanCount !== undefined
            ? input.craftsmanCount
            : (Number(input.craftsmanMale) || 0) + (Number(input.craftsmanFemale) || 0)
        ) || 0
      )
    );

    const laborerMale = Math.max(0, Math.floor(Number(input.laborerMale) || 0));
    const laborerFemale = Math.max(0, Math.floor(Number(input.laborerFemale) || 0));
    const laborerTotal = laborerMale + laborerFemale;
    const grandTotal = artisanCount + craftsmanCount + laborerTotal;

    return await prisma.$transaction(async (tx) => {
      // Find existing record for same site, date, shift
      const existing = await tx.workforceHeadcount.findFirst({
        where: {
          organizationId,
          siteId: input.siteId,
          date,
          shift,
        },
      });

      let saved: any;
      if (existing) {
        saved = await tx.workforceHeadcount.update({
          where: { id: existing.id },
          data: {
            siteName,
            artisanCount,
            craftsmanCount,
            laborerMale,
            laborerFemale,
            laborerTotal,
            grandTotal,
            contractorName: input.contractorName?.trim() || existing.contractorName,
            notes: input.notes?.trim() ?? existing.notes,
            supervisorId: user.userId,
            supervisorName: user.name || "Supervisor",
          },
        });
      } else {
        saved = await tx.workforceHeadcount.create({
          data: {
            id: `hc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            organizationId,
            siteId: input.siteId,
            siteName,
            date,
            shift,
            artisanCount,
            craftsmanCount,
            laborerMale,
            laborerFemale,
            laborerTotal,
            grandTotal,
            contractorName: input.contractorName?.trim() || null,
            notes: input.notes?.trim() || null,
            supervisorId: user.userId,
            supervisorName: user.name || "Supervisor",
            createdById: user.userId,
          },
        });
      }

      const normalized = normalizeDbRecord(saved);

      // Audit log inside transaction
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.userId,
          action: "WORKFORCE_COUNT_LOGGED",
          entityType: "SITE_WORKFORCE",
          entityId: saved.id,
          reason:
            craftsmanCount > 0
              ? `Logged workforce count for ${siteName} on ${date}: ${grandTotal} workers (Artisans: ${artisanCount}, Craftsmen: ${craftsmanCount}, Laborers: ${laborerTotal} [${laborerMale} Male, ${laborerFemale} Female])`
              : `Logged workforce count for ${siteName} on ${date}: ${grandTotal} workers (Artisans: ${artisanCount}, Laborers: ${laborerTotal} [${laborerMale} Male, ${laborerFemale} Female])`,
          afterJson: JSON.stringify(normalized),
        },
      });

      // Maintain IdempotencyRecord for backward compatibility
      const storageKey = `HEADCOUNT#${saved.siteId}#${saved.date}#${saved.shift}`;
      await tx.idempotencyRecord.upsert({
        where: {
          organizationId_key: {
            organizationId,
            key: storageKey,
          },
        },
        create: {
          organizationId,
          key: storageKey,
          operation: "WORKFORCE_HEADCOUNT",
          responseCode: 200,
          responseBodyJson: JSON.stringify(normalized),
        },
        update: {
          responseBodyJson: JSON.stringify(normalized),
        },
      });

      return normalized;
    });
  }

  /**
   * Delete a headcount record
   */
  static async deleteRecord(organizationId: string, id: string): Promise<boolean> {
    try {
      const del = await prisma.workforceHeadcount.deleteMany({
        where: { id, organizationId },
      });

      await prisma.idempotencyRecord.deleteMany({
        where: {
          organizationId,
          operation: "WORKFORCE_HEADCOUNT",
          responseBodyJson: { contains: id },
        },
      }).catch(() => {});

      return del.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Aggregate workforce stats for a site or overall
   */
  static async getSummary(organizationId: string, siteId?: string, date?: string) {
    const today = date || new Date().toISOString().split("T")[0];
    const records = await this.listRecords(organizationId, { siteId, date: today });

    const totalArtisan = records.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
    const totalCraftsman = records.reduce((s, r) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
    const totalLaborer = records.reduce((s, r) => s + r.laborerTotal, 0);
    const totalLaborerMale = records.reduce((s, r) => s + r.laborerMale, 0);
    const totalLaborerFemale = records.reduce((s, r) => s + r.laborerFemale, 0);
    const grandTotal = totalArtisan + totalCraftsman + totalLaborer;

    return {
      date: today,
      recordsCount: records.length,
      totalArtisan,
      totalCraftsman,
      totalLaborer,
      totalLaborerMale,
      totalLaborerFemale,
      grandTotal,
      laborerMaleRatio: totalLaborer > 0 ? Math.round((totalLaborerMale / totalLaborer) * 100) : 0,
      laborerFemaleRatio: totalLaborer > 0 ? Math.round((totalLaborerFemale / totalLaborer) * 100) : 0,
    };
  }
}
