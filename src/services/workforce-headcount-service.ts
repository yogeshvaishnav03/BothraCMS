import fs from "fs";
import path from "path";
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

const STORAGE_FILE = path.resolve(process.cwd(), "storage", "data", "workforce-headcount.json");
const BACKUP_FILE = path.resolve(process.cwd(), "storage", "data", "workforce-headcount.json.bak");

// In-memory fallback on serverless platforms if filesystem is ephemeral
const g = globalThis as any;
if (!g.__WORKFORCE_HEADCOUNT__) {
  g.__WORKFORCE_HEADCOUNT__ = [];
}

function ensureStorageDir() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  } catch {
    // Ignore on read-only environments
  }
}

function normalizeRecord(r: any): WorkforceHeadcountRecord {
  const artisanCount = Number(
    r.artisanCount ?? r.artisanTotal ?? ((Number(r.artisanMale) || 0) + (Number(r.artisanFemale) || 0))
  ) || 0;
  const craftsmanCount = Number(
    r.craftsmanCount ?? r.craftsmanTotal ?? ((Number(r.craftsmanMale) || 0) + (Number(r.craftsmanFemale) || 0))
  ) || 0;
  const laborerMale = Number(r.laborerMale) || 0;
  const laborerFemale = Number(r.laborerFemale) || 0;
  const laborerTotal = Number(r.laborerTotal ?? (laborerMale + laborerFemale)) || 0;
  const grandTotal = Number(r.grandTotal ?? (artisanCount + craftsmanCount + laborerTotal)) || 0;

  return {
    ...r,
    artisanCount,
    artisanTotal: artisanCount,
    craftsmanCount,
    craftsmanTotal: craftsmanCount,
    laborerMale,
    laborerFemale,
    laborerTotal,
    grandTotal,
  };
}

function loadAllRecords(): WorkforceHeadcountRecord[] {
  ensureStorageDir();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        const normalized = data.map(normalizeRecord);
        g.__WORKFORCE_HEADCOUNT__ = normalized;
        return normalized;
      }
    }
  } catch (err) {
    console.error("Warning: Failed to read workforce-headcount.json. Using backup or memory:", err);
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const bakRaw = fs.readFileSync(BACKUP_FILE, "utf-8");
        const bakData = JSON.parse(bakRaw);
        if (Array.isArray(bakData)) {
          const normalized = bakData.map(normalizeRecord);
          g.__WORKFORCE_HEADCOUNT__ = normalized;
          return normalized;
        }
      }
    } catch {}
  }
  return (g.__WORKFORCE_HEADCOUNT__ || []).map(normalizeRecord);
}

function saveAllRecords(records: WorkforceHeadcountRecord[]) {
  g.__WORKFORCE_HEADCOUNT__ = records;
  ensureStorageDir();
  try {
    const jsonStr = JSON.stringify(records, null, 2);
    fs.writeFileSync(STORAGE_FILE, jsonStr, "utf-8");
  } catch (err) {
    console.warn("Notice: Saved to in-memory store; persistent disk write skipped:", err);
  }
}

export class WorkforceHeadcountService {
  /**
   * List headcount records for an organization with optional site/date filtering
   */
  static async listRecords(
    organizationId: string,
    filter?: { siteId?: string; date?: string; startDate?: string; endDate?: string }
  ): Promise<WorkforceHeadcountRecord[]> {
    const records = loadAllRecords();
    return records
      .filter((r) => {
        if (r.organizationId !== organizationId) return false;
        if (filter?.siteId && r.siteId !== filter.siteId) return false;
        if (filter?.date && r.date !== filter.date) return false;
        if (filter?.startDate && r.date < filter.startDate) return false;
        if (filter?.endDate && r.date > filter.endDate) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Save or update daily headcount for a site
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

    const now = new Date().toISOString();
    const records = loadAllRecords();

    // Find existing entry for the same site, date, and shift
    const existingIndex = records.findIndex(
      (r) =>
        r.organizationId === organizationId &&
        r.siteId === input.siteId &&
        r.date === date &&
        r.shift === shift
    );

    let savedRecord: WorkforceHeadcountRecord;

    if (existingIndex >= 0) {
      // Update existing record
      savedRecord = {
        ...records[existingIndex],
        siteName,
        artisanCount,
        craftsmanCount,
        artisanTotal: artisanCount,
        craftsmanTotal: craftsmanCount,
        laborerMale,
        laborerFemale,
        laborerTotal,
        totalMale: laborerMale,
        totalFemale: laborerFemale,
        grandTotal,
        contractorName: input.contractorName?.trim() || records[existingIndex].contractorName,
        notes: input.notes?.trim() ?? records[existingIndex].notes,
        supervisorId: user.userId,
        supervisorName: user.name || "Supervisor",
        updatedAt: now,
      };
      records[existingIndex] = savedRecord;
    } else {
      // Create new record
      savedRecord = {
        id: `hc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        organizationId,
        siteId: input.siteId,
        siteName,
        date,
        shift,
        artisanCount,
        craftsmanCount,
        artisanTotal: artisanCount,
        craftsmanTotal: craftsmanCount,
        laborerMale,
        laborerFemale,
        laborerTotal,
        totalMale: laborerMale,
        totalFemale: laborerFemale,
        grandTotal,
        contractorName: input.contractorName?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        supervisorId: user.userId,
        supervisorName: user.name || "Supervisor",
        createdAt: now,
        updatedAt: now,
      };
      records.unshift(savedRecord);
    }

    saveAllRecords(records);

    // Record audit event
    try {
      await prisma.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.userId,
          action: "WORKFORCE_COUNT_LOGGED",
          entityType: "SITE_WORKFORCE",
          entityId: savedRecord.id,
          reason:
            craftsmanCount > 0
              ? `Logged workforce count for ${siteName} on ${date}: ${grandTotal} workers (Artisans: ${artisanCount}, Craftsmen: ${craftsmanCount}, Laborers: ${laborerTotal} [${laborerMale} Male, ${laborerFemale} Female])`
              : `Logged workforce count for ${siteName} on ${date}: ${grandTotal} workers (Artisans: ${artisanCount}, Laborers: ${laborerTotal} [${laborerMale} Male, ${laborerFemale} Female])`,
          afterJson: JSON.stringify(savedRecord),
        },
      });
    } catch {}

    return savedRecord;
  }

  /**
   * Delete a headcount record
   */
  static async deleteRecord(organizationId: string, id: string): Promise<boolean> {
    const records = loadAllRecords();
    const filtered = records.filter((r) => !(r.id === id && r.organizationId === organizationId));
    if (filtered.length !== records.length) {
      saveAllRecords(filtered);
      return true;
    }
    return false;
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
