import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Role } from "@/lib/permissions";

export interface WorkforceHeadcountRecord {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  projectId?: string;
  projectName?: string;
  date: string; // YYYY-MM-DD
  shift: "GENERAL" | "DAY" | "NIGHT";
  source: "CONTRACTOR" | "DIRECT";
  contractorId?: string;
  contractorName?: string;
  artisanCount: number; // Direct headcount (Skilled Workers)
  skilledCount?: number;
  craftsmanCount: number; // Direct headcount
  laborerMale: number;
  maleCount?: number;
  laborerFemale: number;
  femaleCount?: number;
  laborerTotal: number;
  grandTotal: number;

  // Rate snapshot & Cost details (in paise)
  skilledRate: number; // paise per day/unit
  skilledAmount: number; // paise
  maleRate: number; // paise per day/unit
  maleAmount: number; // paise
  femaleRate: number; // paise per day/unit
  femaleAmount: number; // paise
  totalExpense: number; // paise (total cost for this entry)

  rateUnit: string; // DAY, SHIFT
  isOverridden: boolean;
  overrideReason?: string;

  // Backward compatibility fields
  artisanMale?: number;
  artisanFemale?: number;
  artisanTotal?: number;
  craftsmanMale?: number;
  craftsmanFemale?: number;
  craftsmanTotal?: number;
  totalMale?: number;
  totalFemale?: number;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveHeadcountInput {
  id?: string;
  siteId: string;
  projectId?: string;
  date: string; // YYYY-MM-DD
  shift?: "GENERAL" | "DAY" | "NIGHT";
  source?: "CONTRACTOR" | "DIRECT";
  contractorId?: string;
  contractorName?: string;
  artisanCount?: number;
  skilledCount?: number;
  craftsmanCount?: number;
  laborerMale?: number;
  maleCount?: number;
  laborerFemale?: number;
  femaleCount?: number;
  skilledRate?: number; // paise per day/unit
  skilledAmount?: number; // paise
  maleRate?: number; // paise per day/unit
  maleAmount?: number; // paise
  femaleRate?: number; // paise per day/unit
  femaleAmount?: number; // paise
  totalExpense?: number; // paise
  rateUnit?: string;
  isOverridden?: boolean;
  overrideReason?: string;
  notes?: string;
  // Backward compatibility input fields
  artisanMale?: number;
  artisanFemale?: number;
  craftsmanMale?: number;
  craftsmanFemale?: number;
}

export interface ContractorRateCardResult {
  hasRates: boolean;
  contractorId?: string;
  contractorName: string;
  skilledRate: number; // paise
  maleRate: number; // paise
  femaleRate: number; // paise
  rateUnit: string;
  source: "PARTY" | "WORKER" | "HISTORICAL" | "NONE";
  warning?: string;
}

const EMPTY_LEGACY_TTL_MS = 60_000;
const emptyLegacyOrgCache = new Map<string, number>();

function normalizeDbRecord(r: any): WorkforceHeadcountRecord {
  const artisanCount = Number(r.artisanCount) || 0;
  const craftsmanCount = Number(r.craftsmanCount) || 0;
  const laborerMale = Number(r.laborerMale) || 0;
  const laborerFemale = Number(r.laborerFemale) || 0;
  const laborerTotal = Number(r.laborerTotal ?? (laborerMale + laborerFemale)) || 0;
  const grandTotal = Number(r.grandTotal ?? (artisanCount + craftsmanCount + laborerTotal)) || 0;

  const skilledRate = Number(r.skilledRate) || 0;
  const maleRate = Number(r.maleRate) || 0;
  const femaleRate = Number(r.femaleRate) || 0;

  const skilledAmount = Number(r.skilledAmount !== undefined && r.skilledAmount !== null ? r.skilledAmount : artisanCount * skilledRate) || 0;
  const maleAmount = Number(r.maleAmount !== undefined && r.maleAmount !== null ? r.maleAmount : laborerMale * maleRate) || 0;
  const femaleAmount = Number(r.femaleAmount !== undefined && r.femaleAmount !== null ? r.femaleAmount : laborerFemale * femaleRate) || 0;
  const totalExpense = Number(r.totalExpense !== undefined && r.totalExpense !== null ? r.totalExpense : skilledAmount + maleAmount + femaleAmount) || 0;

  const source = (r.source === "DIRECT" ? "DIRECT" : "CONTRACTOR") as "CONTRACTOR" | "DIRECT";

  return {
    id: r.id,
    organizationId: r.organizationId,
    siteId: r.siteId,
    siteName: r.siteName || (r.site ? r.site.name : "Operational Site"),
    projectId: r.projectId ?? undefined,
    projectName: r.projectName ?? undefined,
    date: r.date,
    shift: r.shift as any,
    source,
    contractorId: r.contractorId ?? undefined,
    contractorName: r.contractorName ?? undefined,
    artisanCount,
    artisanTotal: artisanCount,
    skilledCount: artisanCount,
    craftsmanCount,
    craftsmanTotal: craftsmanCount,
    laborerMale,
    maleCount: laborerMale,
    laborerFemale,
    femaleCount: laborerFemale,
    laborerTotal,
    totalMale: laborerMale,
    totalFemale: laborerFemale,
    grandTotal,
    skilledRate,
    skilledAmount,
    maleRate,
    maleAmount,
    femaleRate,
    femaleAmount,
    totalExpense,
    rateUnit: r.rateUnit || "DAY",
    isOverridden: Boolean(r.isOverridden),
    overrideReason: r.overrideReason ?? undefined,
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
    filter?: { siteId?: string; projectId?: string; date?: string; startDate?: string; endDate?: string }
  ): Promise<WorkforceHeadcountRecord[]> {
    const where: any = { organizationId };
    if (filter?.siteId) where.siteId = filter.siteId;
    if (filter?.projectId) where.projectId = filter.projectId;
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

    // Avoid repeated IdempotencyRecord scans when this org has recently been confirmed to have 0 legacy records
    const cachedEmptyAt = emptyLegacyOrgCache.get(organizationId);
    if (cachedEmptyAt && Date.now() - cachedEmptyAt < EMPTY_LEGACY_TTL_MS) {
      return [];
    }

    // Fallback: Query legacy IdempotencyRecords if table has not yet been populated
    const recordsMap = new Map<string, WorkforceHeadcountRecord>();
    try {
      const idempRecords = await prisma.idempotencyRecord.findMany({
        where: {
          organizationId,
          operation: "WORKFORCE_HEADCOUNT",
        },
        select: { responseBodyJson: true },
        orderBy: { createdAt: "desc" },
      });

      if (idempRecords.length === 0) {
        emptyLegacyOrgCache.set(organizationId, Date.now());
        return [];
      }

      for (const rec of idempRecords) {
        try {
          if (rec.responseBodyJson) {
            const parsed = JSON.parse(rec.responseBodyJson);
            const normalized = normalizeDbRecord(parsed);
            const key = `${normalized.siteId}#${normalized.date}#${normalized.shift}#${normalized.id || ""}`;
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
        if (filter?.projectId && r.projectId !== filter.projectId) return false;
        if (filter?.date && r.date !== filter.date) return false;
        if (filter?.startDate && r.date < filter.startDate) return false;
        if (filter?.endDate && r.date > filter.endDate) return false;
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  /**
   * Save or update a single daily headcount record for a site
   */
  static async saveRecord(
    organizationId: string,
    input: SaveHeadcountInput,
    user: { userId: string; name: string; role: Role }
  ): Promise<WorkforceHeadcountRecord> {
    const results = await this.saveBulkRecords(organizationId, [input], user);
    return results[0];
  }

  /**
   * Save multiple headcount entries atomically in a single ACID database transaction.
   * If any record fails validation or persistence, the entire transaction rolls back.
   */
  static async saveBulkRecords(
    organizationId: string,
    entries: SaveHeadcountInput[],
    user: { userId: string; name: string; role: Role }
  ): Promise<WorkforceHeadcountRecord[]> {
    if (!entries || entries.length === 0) {
      throw new Error("At least one headcount entry is required to save");
    }

    emptyLegacyOrgCache.delete(organizationId);

    // Validate all entries prior to transaction
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.siteId) {
        throw new Error(`Entry #${i + 1}: Target site is required`);
      }
      if (!e.date) {
        throw new Error(`Entry #${i + 1}: Date is required`);
      }
    }

    return await prisma.$transaction(async (tx) => {
      const savedRecords: WorkforceHeadcountRecord[] = [];
      let totalAllWorkers = 0;
      let totalAllExpensePaise = 0;
      let mainSiteName = "Site";

      // Cache site names & project names to minimize queries
      const siteNameMap = new Map<string, string>();
      const projectNameMap = new Map<string, string>();

      for (const input of entries) {
        // Resolve Site Name
        let siteName = siteNameMap.get(input.siteId);
        if (!siteName) {
          const site = await tx.site.findFirst({
            where: { id: input.siteId, organizationId },
            select: { name: true },
          });
          siteName = site?.name || "Operational Site";
          siteNameMap.set(input.siteId, siteName);
        }
        mainSiteName = siteName;

        // Resolve Project Name if provided
        let projectName: string | undefined;
        if (input.projectId) {
          projectName = projectNameMap.get(input.projectId);
          if (!projectName) {
            const project = await tx.project.findFirst({
              where: { id: input.projectId, organizationId },
              select: { name: true },
            });
            projectName = project?.name || undefined;
            if (projectName) projectNameMap.set(input.projectId, projectName);
          }
        }

        const shift = input.shift || "GENERAL";
        const date = input.date || new Date().toISOString().split("T")[0];
        const source = (input.source === "DIRECT" ? "DIRECT" : "CONTRACTOR") as "CONTRACTOR" | "DIRECT";

        const artisanCount = Math.max(
          0,
          Math.floor(
            Number(
              input.artisanCount !== undefined
                ? input.artisanCount
                : input.skilledCount !== undefined
                ? input.skilledCount
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

        const laborerMale = Math.max(0, Math.floor(Number(input.laborerMale !== undefined ? input.laborerMale : input.maleCount) || 0));
        const laborerFemale = Math.max(0, Math.floor(Number(input.laborerFemale !== undefined ? input.laborerFemale : input.femaleCount) || 0));
        const laborerTotal = laborerMale + laborerFemale;
        const grandTotal = artisanCount + craftsmanCount + laborerTotal;

        // Rates & Financial Calculations (in paise)
        const skilledRate = Math.max(0, Math.round(Number(input.skilledRate) || 0));
        const maleRate = Math.max(0, Math.round(Number(input.maleRate) || 0));
        const femaleRate = Math.max(0, Math.round(Number(input.femaleRate) || 0));

        const skilledAmount = input.skilledAmount !== undefined
          ? Math.max(0, Math.round(Number(input.skilledAmount)))
          : Math.round(artisanCount * skilledRate);

        const maleAmount = input.maleAmount !== undefined
          ? Math.max(0, Math.round(Number(input.maleAmount)))
          : Math.round(laborerMale * maleRate);

        const femaleAmount = input.femaleAmount !== undefined
          ? Math.max(0, Math.round(Number(input.femaleAmount)))
          : Math.round(laborerFemale * femaleRate);

        const totalExpense = input.totalExpense !== undefined
          ? Math.max(0, Math.round(Number(input.totalExpense)))
          : skilledAmount + maleAmount + femaleAmount;

        const rateUnit = input.rateUnit || "DAY";
        const isOverridden = Boolean(input.isOverridden);
        const overrideReason = input.overrideReason?.trim() || null;
        const contractorName = input.contractorName?.trim() || (source === "DIRECT" ? null : null);
        const contractorId = input.contractorId?.trim() || null;

        // Find existing record:
        // If an explicit ID is passed, match by ID;
        // Otherwise, match by organizationId, siteId, date, shift, source, and contractorName
        let existing: any = null;
        if (input.id) {
          existing = await tx.workforceHeadcount.findFirst({
            where: { id: input.id, organizationId },
          });
        }

        if (!existing) {
          existing = await tx.workforceHeadcount.findFirst({
            where: {
              organizationId,
              siteId: input.siteId,
              date,
              shift,
              source,
              contractorName: contractorName || null,
            },
          });
        }

        // If still not found and this is a single legacy submission (e.g. tests), find by site/date/shift
        if (!existing && entries.length === 1 && !contractorName && source === "CONTRACTOR") {
          existing = await tx.workforceHeadcount.findFirst({
            where: {
              organizationId,
              siteId: input.siteId,
              date,
              shift,
            },
          });
        }

        let saved: any;
        if (existing) {
          saved = await tx.workforceHeadcount.update({
            where: { id: existing.id },
            data: {
              siteName,
              projectId: input.projectId || existing.projectId,
              projectName: projectName || existing.projectName,
              source,
              contractorId: contractorId || existing.contractorId,
              contractorName: contractorName || existing.contractorName,
              artisanCount,
              craftsmanCount,
              laborerMale,
              laborerFemale,
              laborerTotal,
              grandTotal,
              skilledRate,
              skilledAmount,
              maleRate,
              maleAmount,
              femaleRate,
              femaleAmount,
              totalExpense,
              rateUnit,
              isOverridden,
              overrideReason,
              notes: input.notes?.trim() ?? existing.notes,
              supervisorId: user.userId,
              supervisorName: user.name || "Supervisor",
            },
          });
        } else {
          saved = await tx.workforceHeadcount.create({
            data: {
              id: input.id || `hc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
              organizationId,
              siteId: input.siteId,
              siteName,
              projectId: input.projectId || null,
              projectName: projectName || null,
              date,
              shift,
              source,
              contractorId,
              contractorName,
              artisanCount,
              craftsmanCount,
              laborerMale,
              laborerFemale,
              laborerTotal,
              grandTotal,
              skilledRate,
              skilledAmount,
              maleRate,
              maleAmount,
              femaleRate,
              femaleAmount,
              totalExpense,
              rateUnit,
              isOverridden,
              overrideReason,
              notes: input.notes?.trim() || null,
              supervisorId: user.userId,
              supervisorName: user.name || "Supervisor",
              createdById: user.userId,
            },
          });
        }

        const normalized = normalizeDbRecord(saved);
        savedRecords.push(normalized);
        totalAllWorkers += grandTotal;
        totalAllExpensePaise += totalExpense;

        // Legacy idempotency record mirror
        const storageKey = `HEADCOUNT#${saved.siteId}#${saved.date}#${saved.shift}#${saved.id}`;
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
        }).catch(() => {});
      }

      // Single transactional audit event for this bulk save
      const firstEntry = entries[0];
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.userId,
          action: "WORKFORCE_COUNT_LOGGED",
          entityType: "SITE_WORKFORCE",
          entityId: savedRecords[0]?.id || `bulk-${Date.now()}`,
          reason:
            savedRecords.length === 1
              ? `Logged workforce count for ${mainSiteName} on ${firstEntry.date}: ${totalAllWorkers} workers, ₹${Math.round(totalAllExpensePaise / 100).toLocaleString("en-IN")} total expense`
              : `Logged bulk workforce count (${savedRecords.length} entries) for ${mainSiteName} on ${firstEntry.date}: ${totalAllWorkers} workers, ₹${Math.round(totalAllExpensePaise / 100).toLocaleString("en-IN")} total expense`,
          afterJson: JSON.stringify(savedRecords),
        },
      });

      return savedRecords;
    });
  }

  /**
   * Delete a headcount record
   */
  static async deleteRecord(organizationId: string, id: string): Promise<boolean> {
    emptyLegacyOrgCache.delete(organizationId);
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
   * Automatically fetch saved rate card for a selected contractor or agency
   * Sources: Party master, WorkforceMember trade wage, or latest historical headcount record.
   */
  static async getContractorRates(
    organizationId: string,
    contractorQuery: string
  ): Promise<ContractorRateCardResult> {
    const query = contractorQuery.trim();
    if (!query) {
      return {
        hasRates: false,
        contractorName: "",
        skilledRate: 0,
        maleRate: 0,
        femaleRate: 0,
        rateUnit: "DAY",
        source: "NONE",
        warning: "No contractor specified",
      };
    }

    try {
      // 1. Check Party database records (where partyType is CONTRACTOR or BOTH)
      const parties = await prisma.party.findMany({
        where: {
          organizationId,
          active: true,
          isArchived: false,
        },
        select: {
          id: true,
          name: true,
          partyType: true,
          dailyWageRate: true,
          maleHelperWageRate: true,
          femaleHelperWageRate: true,
        },
      });

      const matchedParty = parties.find((p) => {
        if (p.id === query) return true;
        const pName = p.name.trim().toLowerCase();
        const qName = query.toLowerCase();
        return pName === qName || qName.includes(pName) || pName.includes(qName);
      });

      if (matchedParty && (matchedParty.dailyWageRate || matchedParty.maleHelperWageRate || matchedParty.femaleHelperWageRate)) {
        return {
          hasRates: true,
          contractorId: matchedParty.id,
          contractorName: matchedParty.name,
          skilledRate: matchedParty.dailyWageRate || 0,
          maleRate: matchedParty.maleHelperWageRate || 0,
          femaleRate: matchedParty.femaleHelperWageRate || 0,
          rateUnit: "DAY",
          source: "PARTY",
        };
      }

      // 2. Check WorkforceMember registered workers
      const workers = await prisma.workforceMember.findMany({
        where: {
          organizationId,
          active: true,
          isArchived: false,
        },
        select: {
          id: true,
          name: true,
          employeeCode: true,
          workerType: true,
          dailyWageRate: true,
          maleHelperWageRate: true,
          femaleHelperWageRate: true,
        },
      });

      const matchedWorker = workers.find((w) => {
        const qLower = query.toLowerCase();
        return (
          w.name.toLowerCase() === qLower ||
          w.employeeCode.toLowerCase() === qLower ||
          qLower.includes(w.employeeCode.toLowerCase()) ||
          qLower.includes(w.name.toLowerCase())
        );
      });

      if (matchedWorker && (matchedWorker.dailyWageRate || matchedWorker.maleHelperWageRate || matchedWorker.femaleHelperWageRate)) {
        return {
          hasRates: true,
          contractorId: matchedWorker.id,
          contractorName: `${matchedWorker.name} (${matchedWorker.employeeCode} - ${matchedWorker.workerType})`,
          skilledRate: matchedWorker.dailyWageRate || 0,
          maleRate: matchedWorker.maleHelperWageRate || 0,
          femaleRate: matchedWorker.femaleHelperWageRate || 0,
          rateUnit: "DAY",
          source: "WORKER",
        };
      }

      // 3. Fallback to latest historical WorkforceHeadcount snapshot for this contractor
      const latestHeadcount = await prisma.workforceHeadcount.findFirst({
        where: {
          organizationId,
          contractorName: {
            contains: query,
            mode: "insensitive",
          },
          OR: [
            { skilledRate: { gt: 0 } },
            { maleRate: { gt: 0 } },
            { femaleRate: { gt: 0 } },
          ],
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });

      if (latestHeadcount && (latestHeadcount.skilledRate > 0 || latestHeadcount.maleRate > 0 || latestHeadcount.femaleRate > 0)) {
        return {
          hasRates: true,
          contractorId: latestHeadcount.contractorId || undefined,
          contractorName: latestHeadcount.contractorName || query,
          skilledRate: latestHeadcount.skilledRate || 0,
          maleRate: latestHeadcount.maleRate || 0,
          femaleRate: latestHeadcount.femaleRate || 0,
          rateUnit: latestHeadcount.rateUnit || "DAY",
          source: "HISTORICAL",
        };
      }
    } catch (err) {
      console.warn("Could not fetch contractor rates:", err);
    }

    return {
      hasRates: false,
      contractorName: query,
      skilledRate: 0,
      maleRate: 0,
      femaleRate: 0,
      rateUnit: "DAY",
      source: "NONE",
      warning: `No saved rate card found for "${query}". Please enter category rates or configure in Contractor Master.`,
    };
  }

  /**
   * Aggregate workforce stats and financial totals for a site or overall
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

    // Financial calculations
    const contractorRecords = records.filter((r) => r.source === "CONTRACTOR");
    const directRecords = records.filter((r) => r.source === "DIRECT");

    const contractorExpense = contractorRecords.reduce((s, r) => s + (r.totalExpense || 0), 0);
    const directExpense = directRecords.reduce((s, r) => s + (r.totalExpense || 0), 0);
    const totalExpense = contractorExpense + directExpense;

    const skilledExpense = records.reduce((s, r) => s + (r.skilledAmount || 0), 0);
    const maleExpense = records.reduce((s, r) => s + (r.maleAmount || 0), 0);
    const femaleExpense = records.reduce((s, r) => s + (r.femaleAmount || 0), 0);
    const unskilledExpense = maleExpense + femaleExpense;

    return {
      date: today,
      recordsCount: records.length,
      totalArtisan,
      totalCraftsman,
      totalLaborer,
      totalLaborerMale,
      totalLaborerFemale,
      grandTotal,
      contractorWorkers: contractorRecords.reduce((s, r) => s + r.grandTotal, 0),
      directWorkers: directRecords.reduce((s, r) => s + r.grandTotal, 0),
      contractorExpense,
      directExpense,
      totalExpense,
      skilledExpense,
      unskilledExpense,
      maleExpense,
      femaleExpense,
      laborerMaleRatio: totalLaborer > 0 ? Math.round((totalLaborerMale / totalLaborer) * 100) : 0,
      laborerFemaleRatio: totalLaborer > 0 ? Math.round((totalLaborerFemale / totalLaborer) * 100) : 0,
    };
  }

  /**
   * Comprehensive Labour Expense Reporting:
   * 1. Daily Site Labour Expense Report
   * 2. Contractor-wise Expense Report
   * 3. Direct Labour Expense Report
   * 4. Project-wise Labour Cost Report
   * 5. Skilled vs Unskilled Labour Cost
   * 6. Monthly Labour Expense Summary
   * 7. Total Worker Count vs Total Expense
   * Always calculated using saved historical rate snapshots.
   */
  static async getLabourExpenseReports(
    organizationId: string,
    filter?: { siteId?: string; projectId?: string; startDate?: string; endDate?: string }
  ) {
    const records = await this.listRecords(organizationId, filter);

    // 1. Daily Site Labour Expense Report
    const dailyMap = new Map<string, {
      date: string;
      siteId: string;
      siteName: string;
      contractorWorkers: number;
      directWorkers: number;
      totalWorkers: number;
      contractorExpense: number;
      directExpense: number;
      totalExpense: number;
      entriesCount: number;
    }>();

    // 2. Contractor-wise Expense Report
    const contractorMap = new Map<string, {
      contractorName: string;
      entriesCount: number;
      skilledCount: number;
      maleCount: number;
      femaleCount: number;
      totalWorkers: number;
      skilledExpense: number;
      maleExpense: number;
      femaleExpense: number;
      totalExpense: number;
    }>();

    // 3. Direct Labour Expense Report
    const directReport = {
      entriesCount: 0,
      skilledCount: 0,
      maleCount: 0,
      femaleCount: 0,
      totalWorkers: 0,
      skilledExpense: 0,
      maleExpense: 0,
      femaleExpense: 0,
      totalExpense: 0,
    };

    // 4. Project-wise Labour Cost Report
    const projectMap = new Map<string, {
      projectId: string;
      projectName: string;
      entriesCount: number;
      totalWorkers: number;
      contractorExpense: number;
      directExpense: number;
      totalExpense: number;
    }>();

    // 6. Monthly Labour Expense Summary
    const monthlyMap = new Map<string, {
      month: string; // YYYY-MM
      entriesCount: number;
      totalWorkers: number;
      contractorExpense: number;
      directExpense: number;
      totalExpense: number;
    }>();

    let totalSkilledWorkers = 0;
    let totalUnskilledWorkers = 0;
    let totalSkilledCost = 0;
    let totalUnskilledCost = 0;
    let grandWorkers = 0;
    let grandExpense = 0;

    for (const r of records) {
      const skilled = r.artisanCount ?? r.skilledCount ?? 0;
      const male = r.laborerMale ?? r.maleCount ?? 0;
      const female = r.laborerFemale ?? r.femaleCount ?? 0;
      const workers = r.grandTotal;
      const skilledCost = r.skilledAmount || 0;
      const maleCost = r.maleAmount || 0;
      const femaleCost = r.femaleAmount || 0;
      const unskilledCost = maleCost + femaleCost;
      const expense = r.totalExpense || (skilledCost + unskilledCost);

      totalSkilledWorkers += skilled;
      totalUnskilledWorkers += (male + female);
      totalSkilledCost += skilledCost;
      totalUnskilledCost += unskilledCost;
      grandWorkers += workers;
      grandExpense += expense;

      // Daily Grouping
      const dayKey = `${r.date}#${r.siteId}`;
      const dayExisting = dailyMap.get(dayKey) || {
        date: r.date,
        siteId: r.siteId,
        siteName: r.siteName,
        contractorWorkers: 0,
        directWorkers: 0,
        totalWorkers: 0,
        contractorExpense: 0,
        directExpense: 0,
        totalExpense: 0,
        entriesCount: 0,
      };
      dayExisting.entriesCount += 1;
      dayExisting.totalWorkers += workers;
      dayExisting.totalExpense += expense;
      if (r.source === "CONTRACTOR") {
        dayExisting.contractorWorkers += workers;
        dayExisting.contractorExpense += expense;
      } else {
        dayExisting.directWorkers += workers;
        dayExisting.directExpense += expense;
      }
      dailyMap.set(dayKey, dayExisting);

      // Contractor Grouping
      if (r.source === "CONTRACTOR" && r.contractorName) {
        const cKey = r.contractorName.trim();
        const cExisting = contractorMap.get(cKey) || {
          contractorName: cKey,
          entriesCount: 0,
          skilledCount: 0,
          maleCount: 0,
          femaleCount: 0,
          totalWorkers: 0,
          skilledExpense: 0,
          maleExpense: 0,
          femaleExpense: 0,
          totalExpense: 0,
        };
        cExisting.entriesCount += 1;
        cExisting.skilledCount += skilled;
        cExisting.maleCount += male;
        cExisting.femaleCount += female;
        cExisting.totalWorkers += workers;
        cExisting.skilledExpense += skilledCost;
        cExisting.maleExpense += maleCost;
        cExisting.femaleExpense += femaleCost;
        cExisting.totalExpense += expense;
        contractorMap.set(cKey, cExisting);
      } else if (r.source === "DIRECT") {
        directReport.entriesCount += 1;
        directReport.skilledCount += skilled;
        directReport.maleCount += male;
        directReport.femaleCount += female;
        directReport.totalWorkers += workers;
        directReport.skilledExpense += skilledCost;
        directReport.maleExpense += maleCost;
        directReport.femaleExpense += femaleCost;
        directReport.totalExpense += expense;
      }

      // Project Grouping
      const pKey = r.projectId || "general";
      const pName = r.projectName || (r.projectId ? "Project Assigned" : "General Site Deployment");
      const pExisting = projectMap.get(pKey) || {
        projectId: pKey,
        projectName: pName,
        entriesCount: 0,
        totalWorkers: 0,
        contractorExpense: 0,
        directExpense: 0,
        totalExpense: 0,
      };
      pExisting.entriesCount += 1;
      pExisting.totalWorkers += workers;
      pExisting.totalExpense += expense;
      if (r.source === "CONTRACTOR") {
        pExisting.contractorExpense += expense;
      } else {
        pExisting.directExpense += expense;
      }
      projectMap.set(pKey, pExisting);

      // Monthly Grouping
      const monthKey = r.date.slice(0, 7); // YYYY-MM
      const mExisting = monthlyMap.get(monthKey) || {
        month: monthKey,
        entriesCount: 0,
        totalWorkers: 0,
        contractorExpense: 0,
        directExpense: 0,
        totalExpense: 0,
      };
      mExisting.entriesCount += 1;
      mExisting.totalWorkers += workers;
      mExisting.totalExpense += expense;
      if (r.source === "CONTRACTOR") {
        mExisting.contractorExpense += expense;
      } else {
        mExisting.directExpense += expense;
      }
      monthlyMap.set(monthKey, mExisting);
    }

    return {
      totalRecords: records.length,
      totalWorkers: grandWorkers,
      grandTotalExpense: grandExpense,
      dailyReports: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
      contractorReports: Array.from(contractorMap.values()).sort((a, b) => b.totalExpense - a.totalExpense),
      directReport,
      projectReports: Array.from(projectMap.values()).sort((a, b) => b.totalExpense - a.totalExpense),
      skilledVsUnskilled: {
        skilledWorkers: totalSkilledWorkers,
        unskilledWorkers: totalUnskilledWorkers,
        skilledCost: totalSkilledCost,
        unskilledCost: totalUnskilledCost,
        skilledCostRatio: grandExpense > 0 ? Math.round((totalSkilledCost / grandExpense) * 100) : 0,
        unskilledCostRatio: grandExpense > 0 ? Math.round((totalUnskilledCost / grandExpense) * 100) : 0,
      },
      monthlySummary: Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month)),
    };
  }
}
