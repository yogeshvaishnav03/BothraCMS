import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { parsePartyGst, parsePartyTax } from "@/app/parties/page";

describe("Party Tax: Contractor TDS vs Vendor GST", () => {
  const testOrgId = `test-org-tax-${Date.now()}`;
  let contractorPartyId: string;
  let vendorPartyId: string;

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Tax Test Org",
      },
    });

    const contractor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Shree Ram Construction Work",
        partyType: "CONTRACTOR",
        panNumber: "ABCDE1234P",
        tdsSection: "194C",
        notes: JSON.stringify({ tdsRate: 1, tdsSection: "194C" }),
      },
    });
    contractorPartyId = contractor.id;

    const vendor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "UltraTech Cement Depot",
        partyType: "VENDOR",
        taxIdentifier: "27AAAAA0000A1Z5",
        tdsSection: "NONE",
        notes: JSON.stringify({ gstRate: 18, cgstRate: 9, sgstRate: 9 }),
      },
    });
    vendorPartyId = vendor.id;
  });

  afterAll(async () => {
    try {
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } catch {}
  });

  it("parsePartyTax resolves correct TDS configuration for contractor", () => {
    const parsed = parsePartyTax(
      JSON.stringify({ tdsRate: 1, tdsSection: "194C" }),
      "CONTRACTOR",
      "194C"
    );

    expect(parsed.tdsSection).toBe("194C");
    expect(parsed.tdsRate).toBe("1");
  });

  it("parsePartyTax resolves correct GST configuration for vendor", () => {
    const parsed = parsePartyTax(
      JSON.stringify({ gstRate: 18, cgstRate: 9, sgstRate: 9 }),
      "VENDOR",
      "NONE"
    );

    expect(parsed.gstRate).toBe("18");
    expect(parsed.cgstRate).toBe("9");
    expect(parsed.sgstRate).toBe("9");
  });

  it("parsePartyTax defaults contractor to 194C / 1% even without notes", () => {
    const parsed = parsePartyTax(null, "CONTRACTOR", null);
    expect(parsed.tdsSection).toBe("194C");
    expect(parsed.tdsRate).toBe("1");
  });

  it("correctly stores and fetches contractor and vendor from database", async () => {
    const contractor = await prisma.party.findUnique({ where: { id: contractorPartyId } });
    expect(contractor?.partyType).toBe("CONTRACTOR");
    expect(contractor?.tdsSection).toBe("194C");

    const taxContractor = parsePartyTax(contractor?.notes, contractor?.partyType, contractor?.tdsSection);
    expect(taxContractor.tdsSection).toBe("194C");
    expect(taxContractor.tdsRate).toBe("1");

    const vendor = await prisma.party.findUnique({ where: { id: vendorPartyId } });
    expect(vendor?.partyType).toBe("VENDOR");
    expect(vendor?.tdsSection).toBe("NONE");

    const taxVendor = parsePartyTax(vendor?.notes, vendor?.partyType, vendor?.tdsSection);
    expect(taxVendor.gstRate).toBe("18");
  });
});
