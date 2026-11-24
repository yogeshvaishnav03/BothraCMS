import { describe, it, expect } from "vitest";
import { rankQuotations, computeLandingPaise } from "../lib/material-pricing";

const q = (id: string, materialId: string, vendorPartyId: string, totalRatePaise: number, extra: any = {}) => ({
  id,
  materialId,
  vendorPartyId,
  unitCode: "TON",
  totalRatePaise,
  quotationDate: "2026-11-01",
  validUntil: null,
  createdAt: "2026-11-01T10:00:00Z",
  ...extra,
});

describe("vendor/material rate ranking", () => {
  it("ranks vendors for one material by landing rate (L1, L2, L3)", () => {
    const r = rankQuotations([q("a", "steel", "v1", 6000000), q("b", "steel", "v2", 5800000), q("c", "steel", "v3", 6100000)], "2026-11-24");
    expect(r.get("b")!.rank).toBe(1);
    expect(r.get("a")!.rank).toBe(2);
    expect(r.get("c")!.rank).toBe(3);
    expect(r.get("a")!.diffFromL1Paise).toBe(200000);
    expect(r.get("a")!.diffFromL1Percent).toBeCloseTo(3.45, 2);
    expect(r.get("a")!.rankedVendorCount).toBe(3);
  });

  it("lets one vendor sell many materials, ranked separately per material", () => {
    const r = rankQuotations([q("a", "steel", "v1", 100), q("b", "steel", "v2", 90), q("c", "cement", "v1", 50), q("d", "cement", "v2", 60)], "2026-11-24");
    expect(r.get("b")!.rank).toBe(1);
    expect(r.get("c")!.rank).toBe(1);
    expect(r.get("a")!.rank).toBe(2);
    expect(r.get("d")!.rank).toBe(2);
  });

  it("uses only a vendor's newest rate; older ones are history", () => {
    const r = rankQuotations(
      [q("old", "steel", "v1", 50, { quotationDate: "2026-10-01" }), q("new", "steel", "v1", 120, { quotationDate: "2026-11-10" }), q("other", "steel", "v2", 100)],
      "2026-11-24"
    );
    expect(r.get("old")!.isCurrent).toBe(false);
    expect(r.get("old")!.rank).toBeNull();
    expect(r.get("other")!.rank).toBe(1);
    expect(r.get("new")!.rank).toBe(2);
  });

  it("breaks same-day ties by createdAt", () => {
    const r = rankQuotations(
      [q("first", "steel", "v1", 50, { createdAt: "2026-11-01T09:00:00Z" }), q("second", "steel", "v1", 70, { createdAt: "2026-11-01T11:00:00Z" })],
      "2026-11-24"
    );
    expect(r.get("second")!.isCurrent).toBe(true);
    expect(r.get("first")!.isCurrent).toBe(false);
  });

  it("does not compare different units and skips expired quotes", () => {
    const r = rankQuotations(
      [q("ton", "steel", "v1", 6000000), q("kg", "steel", "v2", 6000, { unitCode: "kg" }), q("exp", "steel", "v3", 10, { validUntil: "2026-11-01" })],
      "2026-11-24"
    );
    expect(r.get("ton")!.rank).toBe(1);
    expect(r.get("kg")!.rank).toBe(1);
    expect(r.get("exp")!.isExpired).toBe(true);
    expect(r.get("exp")!.rank).toBeNull();
  });

  it("gives equal rates the same rank", () => {
    const r = rankQuotations([q("a", "m", "v1", 100), q("b", "m", "v2", 100), q("c", "m", "v3", 120)], "2026-11-24");
    expect(r.get("a")!.rank).toBe(1);
    expect(r.get("b")!.rank).toBe(1);
    expect(r.get("c")!.rank).toBe(3);
  });

  it("computes landing rate in paise", () => {
    expect(computeLandingPaise(350, 18, 10)).toEqual({ ratePaise: 35000, taxAmountPaise: 6300, additionalPaise: 1000, totalRatePaise: 42300 });
  });
});
