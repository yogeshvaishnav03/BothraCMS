/**
 * Vendor ↔ material rate comparison helpers.
 *
 * One vendor can quote many materials and one material can be quoted by many
 * vendors; each MaterialQuotation row is one (material, vendor, unit) rate at a
 * point in time. When a vendor re-quotes, a new row is added so history is kept,
 * and only the newest row per (material, vendor, unit) is "current".
 *
 * Ranks (L1, L2, ...) are worked out among current, unexpired quotes of the same
 * material in the same unit, by landing rate (base + GST + freight). Rates in
 * different units (e.g. TON vs KG) are never ranked against each other.
 */

export interface RankableQuote {
  id: string;
  materialId: string;
  vendorPartyId: string;
  unitCode: string;
  totalRatePaise: number;
  quotationDate: string; // YYYY-MM-DD
  validUntil?: string | null; // YYYY-MM-DD
  createdAt?: Date | string | null;
}

export interface QuoteRanking {
  /** Newest quote from this vendor for this material + unit. */
  isCurrent: boolean;
  /** validUntil is set and is before today. */
  isExpired: boolean;
  /** 1 = lowest (L1). Null when superseded or expired. */
  rank: number | null;
  /** Number of vendors ranked for this material + unit. */
  rankedVendorCount: number;
  /** Landing rate gap to L1 in paise (0 for L1). Null when not ranked. */
  diffFromL1Paise: number | null;
  /** Gap to L1 as a percentage of L1. Null when not ranked. */
  diffFromL1Percent: number | null;
}

const normUnit = (u: string) => (u || "").trim().toUpperCase();

export function comparisonKey(materialId: string, unitCode: string): string {
  return `${materialId}::${normUnit(unitCode)}`;
}

function createdMs(v: RankableQuote["createdAt"]): number {
  if (!v) return 0;
  const t = typeof v === "string" ? Date.parse(v) : v.getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Newer first: later quotation date, then later createdAt. */
function isNewer(a: RankableQuote, b: RankableQuote): boolean {
  if (a.quotationDate !== b.quotationDate) return a.quotationDate > b.quotationDate;
  return createdMs(a.createdAt) > createdMs(b.createdAt);
}

export function rankQuotations<T extends RankableQuote>(
  quotes: T[],
  todayStr: string = new Date().toISOString().slice(0, 10)
): Map<string, QuoteRanking> {
  // 1. Newest quote per (material, vendor, unit)
  const latestByVendor = new Map<string, T>();
  for (const q of quotes) {
    const key = `${comparisonKey(q.materialId, q.unitCode)}::${q.vendorPartyId}`;
    const prev = latestByVendor.get(key);
    if (!prev || isNewer(q, prev)) latestByVendor.set(key, q);
  }
  const currentIds = new Set(Array.from(latestByVendor.values(), (q) => q.id));

  // 2. Group current, unexpired quotes by (material, unit) and sort by landing rate
  const groups = new Map<string, T[]>();
  for (const q of latestByVendor.values()) {
    if (q.validUntil && q.validUntil < todayStr) continue;
    const key = comparisonKey(q.materialId, q.unitCode);
    const arr = groups.get(key) || [];
    arr.push(q);
    groups.set(key, arr);
  }

  const rankById = new Map<string, { rank: number; l1: number; count: number }>();
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.totalRatePaise - b.totalRatePaise);
    const l1 = arr[0].totalRatePaise;
    // Dense competition ranking: equal rates share a rank
    let rank = 0;
    let prevRate: number | null = null;
    arr.forEach((q, i) => {
      if (q.totalRatePaise !== prevRate) {
        rank = i + 1;
        prevRate = q.totalRatePaise;
      }
      rankById.set(q.id, { rank, l1, count: arr.length });
    });
  }

  const out = new Map<string, QuoteRanking>();
  for (const q of quotes) {
    const isCurrent = currentIds.has(q.id);
    const isExpired = !!q.validUntil && q.validUntil < todayStr;
    const r = rankById.get(q.id);
    out.set(q.id, {
      isCurrent,
      isExpired,
      rank: r ? r.rank : null,
      rankedVendorCount: r ? r.count : groups.get(comparisonKey(q.materialId, q.unitCode))?.length || 0,
      diffFromL1Paise: r ? q.totalRatePaise - r.l1 : null,
      diffFromL1Percent:
        r && r.l1 > 0 ? Math.round(((q.totalRatePaise - r.l1) / r.l1) * 10000) / 100 : r ? 0 : null,
    });
  }
  return out;
}

/** Landing-rate maths, in paise, shared by the API and the form preview. */
export function computeLandingPaise(baseRate: number, taxRatePercent: number, additionalCharges: number) {
  const ratePaise = Math.round(baseRate * 100);
  const taxAmountPaise = Math.round((ratePaise * taxRatePercent) / 100);
  const additionalPaise = Math.round(additionalCharges * 100);
  return { ratePaise, taxAmountPaise, additionalPaise, totalRatePaise: ratePaise + taxAmountPaise + additionalPaise };
}
