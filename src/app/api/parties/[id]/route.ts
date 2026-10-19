import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, canReadFinance } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const editPartySchema = z.object({
  name: z.string().min(2).optional(),
  partyType: z.enum(["VENDOR", "CONTRACTOR", "BOTH"]).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxIdentifier: z.string().nullable().optional(),
  contractValue: z.number().min(0).optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
  reason: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    const hasFinanceAccess = canReadFinance(user);

    const party = await prisma.party.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
      include: {
        bills: hasFinanceAccess
          ? {
              where: { isArchived: false },
              orderBy: { billDate: "desc" },
              take: 20,
            }
          : false,
        payments: hasFinanceAccess
          ? {
              where: { isArchived: false },
              orderBy: { paymentDate: "desc" },
              take: 20,
            }
          : false,
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!party) return jsonError("Party not found", "NOT_FOUND", 404);

    if (!hasFinanceAccess) {
      const sanitized: any = { ...party };
      delete sanitized.contractValue;
      delete sanitized.bills;
      delete sanitized.payments;
      return jsonSuccess(sanitized);
    }

    const totalBilled = (party.bills || []).reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
    const totalPaid = (party.payments || [])
      .filter((p: any) => p.status === "POSTED")
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return jsonSuccess({
      ...party,
      totalBilled,
      totalPaid,
      outstandingBalance: totalBilled - totalPaid,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const party = await prisma.party.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!party) return jsonError("Party not found", "NOT_FOUND", 404);

    const body = await req.json();
    const data = editPartySchema.parse(body);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.partyType !== undefined) updateData.partyType = data.partyType;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.taxIdentifier !== undefined) updateData.taxIdentifier = data.taxIdentifier;
    if (data.contractValue !== undefined) updateData.contractValue = data.contractValue;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.active !== undefined) updateData.active = data.active;

    const updated = await prisma.party.update({
      where: { id: party.id },
      data: updateData,
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "UPDATE",
        entityType: "PARTY",
        entityId: party.id,
        beforeJson: JSON.stringify({
          name: party.name,
          partyType: party.partyType,
          contractValue: party.contractValue,
          phone: party.phone,
          email: party.email,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          partyType: updated.partyType,
          contractValue: updated.contractValue,
          phone: updated.phone,
          email: updated.email,
        }),
        reason: data.reason || "Updated party profile and contract configuration",
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
