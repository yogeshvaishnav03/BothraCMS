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
  artisanMale: number;
  artisanFemale: number;
  artisanTotal: number;
  craftsmanMale: number;
  craftsmanFemale: number;
  craftsmanTotal: number;
  laborerMale: number;
  laborerFemale: number;
  laborerTotal: number;
  totalMale: number;
  totalFemale: number;
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
  artisanMale: number;
  artisanFemale: number;
  craftsmanMale: number;
  craftsmanFemale: number;
  laborerMale: number;
  laborerFemale: number;
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

function loadAllRecords(): WorkforceHeadcountRecord[] {
  ensureStorageDir();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        g.__WORKFORCE_HEADCOUNT__ = data;
        return data;
      }
    }
  } catch (err) {
    console.error("Warning: Failed to read workforce-headcount.json. Using backup or memory:", err);
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const bakRaw = fs.readFileSync(BACKUP_FILE, "utf-8");
        const bakData = JSON.parse(bakRaw);
        if (Array.isArray(bakData)) {
          g.__WORKFORCE_HEADCOUNT__ = bakData;
          return bakData;
        }
      }
    } catch {}
  }
  return g.__WORKFORCE_HEADCOUNT__ || [];
}

function saveAllRecords(records: WorkforceHeadcountRecord[]) {
  g.__WORKFORCE_HEADCOUNT__ = records;
  ensureStorageDir();
  try {
    const jsonStr = JSON.stringify(records, null, 2);
    fs.writeFileSync(STORAGE_FILE, jsonStr, "utf-8");
    fs.writeFileSync(BACKUP_FILE, jsonStr, "utf-8");
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

    const artisanMale = Math.max(0, Math.floor(Number(input.artisanMale) || 0));
    const artisanFemale = Math.max(0, Math.floor(Number(input.artisanFemale) || 0));
    const artisanTotal = artisanMale + artisanFemale;

    const craftsmanMale = Math.max(0, Math.floor(Number(input.craftsmanMale) || 0));
    const craftsmanFemale = Math.max(0, Math.floor(Number(input.craftsmanFemale) || 0));
    const craftsmanTotal = craftsmanMale + craftsmanFemale;

    const laborerMale = Math.max(0, Math.floor(Number(input.laborerMale) || 0));
    const laborerFemale = Math.max(0, Math.floor(Number(input.laborerFemale) || 0));
    const laborerTotal = laborerMale + laborerFemale;

    const totalMale = artisanMale + craftsmanMale + laborerMale;
    const totalFemale = artisanFemale + craftsmanFemale + laborerFemale;
    const grandTotal = totalMale + totalFemale;

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
        artisanMale,
        artisanFemale,
        artisanTotal,
        craftsmanMale,
        craftsmanFemale,
        craftsmanTotal,
        laborerMale,
        laborerFemale,
        laborerTotal,
        totalMale,
        totalFemale,
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
        artisanMale,
        artisanFemale,
        artisanTotal,
        craftsmanMale,
        craftsmanFemale,
        craftsmanTotal,
        laborerMale,
        laborerFemale,
        laborerTotal,
        totalMale,
        totalFemale,
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
          reason: `Logged workforce count for ${siteName} on ${date}: ${grandTotal} workers (Artisans: ${artisanTotal}, Craftsmen: ${craftsmanTotal}, Laborers: ${laborerTotal})`,
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

    const totalArtisan = records.reduce((s, r) => s + r.artisanTotal, 0);
    const totalCraftsman = records.reduce((s, r) => s + r.craftsmanTotal, 0);
    const totalLaborer = records.reduce((s, r) => s + r.laborerTotal, 0);
    const totalMale = records.reduce((s, r) => s + r.totalMale, 0);
    const totalFemale = records.reduce((s, r) => s + r.totalFemale, 0);
    const grandTotal = totalMale + totalFemale;

    return {
      date: today,
      recordsCount: records.length,
      totalArtisan,
      totalCraftsman,
      totalLaborer,
      totalMale,
      totalFemale,
      grandTotal,
      maleRatio: grandTotal > 0 ? Math.round((totalMale / grandTotal) * 100) : 0,
      femaleRatio: grandTotal > 0 ? Math.round((totalFemale / grandTotal) * 100) : 0,
    };
  }
}
