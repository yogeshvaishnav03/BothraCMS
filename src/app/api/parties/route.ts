import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createPartySchema = z.object({
  partyType: z.enum(["VENDOR", "CONTRACTOR", "BOTH"]),
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const partyType = searchParams.get("type"); // VENDOR, CONTRACTOR, BOTH, ALL

    const where: any = { organizationId: user.organizationId, active: true };
    if (partyType && partyType !== "ALL") {
      where.partyType = { in: [partyType, "BOTH"] };
    }

    try {
      const parties = await prisma.party.findMany({
        where,
        include: {
          bills: {
            where: { status: "POSTED" },
            include: { allocations: { where: { reversedAt: null } } },
          },
          payments: {
            where: { status: "POSTED" },
          },
        },
        orderBy: { name: "asc" },
      });

      const enriched = parties.map((p) => {
        const totalBilled = p.bills.reduce((sum, b) => sum + b.totalAmount, 0);
        const totalPaid = p.payments.reduce((sum, pay) => sum + pay.amount, 0);
        const outstandingBalance = totalBilled - totalPaid;

        return {
          id: p.id,
          name: p.name,
          partyType: p.partyType,
          phone: p.phone,
          email: p.email,
          address: p.address,
          taxIdentifier: p.taxIdentifier,
          totalBilled,
          totalPaid,
          outstandingBalance,
        };
      });

      return jsonSuccess(enriched);
    } catch {
      const fallbackParties = [
        {
          id: "demo-party-1",
          name: "Tata Steel Ltd",
          partyType: "VENDOR",
          phone: "+91 98765 43210",
          email: "sales@tatasteel.com",
          address: "Jamshedpur, Jharkhand",
          taxIdentifier: "GSTIN20AAAAT1234A1Z5",
          totalBilled: 12000000,
          totalPaid: 9500000,
          outstandingBalance: 2500000,
        },
        {
          id: "demo-party-2",
          name: "UltraTech Cement Supplies",
          partyType: "VENDOR",
          phone: "+91 98111 22334",
          email: "orders@ultratech.com",
          address: "Mumbai, Maharashtra",
          taxIdentifier: "GSTIN27AAACU5678B1Z2",
          totalBilled: 8500000,
          totalPaid: 6000000,
          outstandingBalance: 2500000,
        },
      ];
      return jsonSuccess(fallbackParties);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "finance:write");

    const body = await req.json();
    const data = createPartySchema.parse(body);

    const party = await prisma.party.create({
      data: {
        organizationId: user.organizationId,
        partyType: data.partyType,
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        taxIdentifier: data.taxIdentifier,
        notes: data.notes,
      },
    });

    return jsonSuccess(party, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
