import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

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

    try {
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
    } catch {
      return jsonSuccess(dynamicStore.getParties(partyType));
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

    try {
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
    } catch (dbErr) {
      console.warn("[PARTIES] Database write failed, saving to dynamicStore:", dbErr);
      const newParty = dynamicStore.addParty(data);
      return jsonSuccess(newParty, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Party ID is required", "BAD_REQUEST", 400);

    try {
      await prisma.party.delete({ where: { id } });
    } catch {
      dynamicStore.deleteParty(id);
    }
    return jsonSuccess({ deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
