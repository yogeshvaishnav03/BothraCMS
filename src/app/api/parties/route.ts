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

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "finance:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Party ID is required", "BAD_REQUEST", 400);

    const party = await prisma.party.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!party) {
      return jsonError("Party not found", "NOT_FOUND", 404);
    }

    await prisma.party.delete({
      where: { id: party.id },
    });

    return jsonSuccess({ deleted: true, id: party.id });
  } catch (error) {
    return handleApiError(error);
  }
}
