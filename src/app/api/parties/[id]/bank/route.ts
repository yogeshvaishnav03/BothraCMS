import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * Full bank details for paying a vendor or contractor. Only roles that can
 * record payments (finance:write) may see the full account number, and every
 * view is written to the audit log.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "finance:write");

    const party = await prisma.party.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankIfsc: true,
        bankName: true,
        bankBranch: true,
        upiId: true,
        panNumber: true,
      },
    });
    if (!party) return jsonError("Party not found", "NOT_FOUND", 404);

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "BANK_DETAILS_VIEWED",
        entityType: "PARTY",
        entityId: party.id,
        reason: `Viewed full bank details of ${party.name}`,
      },
    });

    return jsonSuccess(party, 200, undefined, { allowSensitive: true });
  } catch (error) {
    return handleApiError(error);
  }
}
