import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET as listParties, POST as createParty } from "@/app/api/parties/route";
import { GET as getParty, PATCH as patchParty } from "@/app/api/parties/[id]/route";
import { GET as getBank } from "@/app/api/parties/[id]/bank/route";
import { GET as listPayments } from "@/app/api/finance/payments/route";
import { normalizePhone, whatsappLink, telLink } from "@/lib/contact-links";

const ACCOUNT = "50100234567891";
let orgId = "";
let userId = "";
let partyId = "";

function as(role: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: orgId,
    email: "bank@test.local",
    name: "Bank Tester",
    role: role as any,
    organizationName: "Bank Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const url = (path: string) => `http://localhost:3000${path}`;

describe("Vendor and contractor bank details", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Bank Org ${Date.now()}` } });
    orgId = org.id;
    const user = await prisma.user.create({
      data: { organizationId: orgId, name: "Bank Tester", email: `bank-${Date.now()}@test.local`, passwordHash: "x", role: "ACCOUNTANT" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("an empty organisation's party list stays empty (no sample vendors are created)", async () => {
    as("ACCOUNTANT");
    const res = await listParties(new NextRequest(url("/api/parties")));
    const json = await res.json();
    expect(json.data).toEqual([]);
    expect(await prisma.party.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it("saves bank and KYC fields, normalising IFSC and PAN to upper case", async () => {
    as("ACCOUNTANT");
    const res = await createParty(
      new NextRequest(url("/api/parties"), {
        method: "POST",
        body: JSON.stringify({
          name: "Shree Balaji Steel",
          partyType: "VENDOR",
          phone: "98110 22334",
          city: "Jaipur",
          category: "Steel",
          rating: 4,
          panNumber: "abcde1234f",
          bankAccountName: "Shree Balaji Steel Pvt Ltd",
          bankAccountNumber: "5010 0234 5678 91",
          bankIfsc: "hdfc0001234",
          bankName: "HDFC Bank",
          upiId: "balajisteel@hdfcbank",
        }),
      })
    );
    const json = await res.json();
    expect(res.status).toBe(201);
    partyId = json.data.id;

    const row = await prisma.party.findUnique({ where: { id: partyId } });
    expect(row?.bankAccountNumber).toBe(ACCOUNT);
    expect(row?.bankIfsc).toBe("HDFC0001234");
    expect(row?.panNumber).toBe("ABCDE1234F");

    // The create response itself never carries the full number.
    expect(JSON.stringify(json)).not.toContain(ACCOUNT);
    expect(json.data.bankAccountMasked).toBe("•••• 7891");
  });

  it("rejects a malformed IFSC", async () => {
    as("ACCOUNTANT");
    const res = await patchParty(
      new NextRequest(url(`/api/parties/${partyId}`), { method: "PATCH", body: JSON.stringify({ bankIfsc: "HDFC123" }) }),
      { params: { id: partyId } }
    );
    expect(res.status).toBe(422);
  });

  it("lists, detail and nested payment responses show only the masked number", async () => {
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        partyId,
        paymentDate: new Date(),
        amount: 100_000,
        method: "NEFT_RTGS",
        referenceNumber: "NEFT-BANK-1",
        status: "POSTED",
        idempotencyKey: `bank-${Date.now()}`,
        createdBy: userId,
      },
    });

    as("PROJECT_MANAGER");
    for (const res of [
      await listParties(new NextRequest(url("/api/parties"))),
      await getParty(new NextRequest(url(`/api/parties/${partyId}`)), { params: { id: partyId } }),
      await listPayments(new NextRequest(url("/api/finance/payments"))),
    ]) {
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(text).not.toContain(ACCOUNT);
    }

    const list = await (await listParties(new NextRequest(url("/api/parties")))).json();
    expect(list.data[0]).toMatchObject({ bankAccountMasked: "•••• 7891", bankIfsc: "HDFC0001234", hasBankDetails: true });
  });

  it("full details need finance:write and every view is audited", async () => {
    as("PROJECT_MANAGER");
    const denied = await getBank(new NextRequest(url(`/api/parties/${partyId}/bank`)), { params: { id: partyId } });
    expect(denied.status).toBe(403);

    as("ACCOUNTANT");
    const res = await getBank(new NextRequest(url(`/api/parties/${partyId}/bank`)), { params: { id: partyId } });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.bankAccountNumber).toBe(ACCOUNT);

    const audits = await prisma.auditEvent.count({
      where: { organizationId: orgId, entityId: partyId, action: "BANK_DETAILS_VIEWED" },
    });
    expect(audits).toBe(1);
  });
});

describe("contact links", () => {
  it("normalises Indian numbers and builds WhatsApp / call links", () => {
    expect(normalizePhone("+91 98110 22334")).toBe("919811022334");
    expect(normalizePhone("098110 22334")).toBe("919811022334");
    expect(normalizePhone("9811022334")).toBe("919811022334");
    expect(normalizePhone("12345")).toBeNull();
    expect(whatsappLink("9811022334", "Namaste")).toBe("https://wa.me/919811022334?text=Namaste");
    expect(whatsappLink(null)).toBeNull();
    expect(telLink("9811022334")).toBe("tel:+919811022334");
  });
});
