import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const canReject = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
    if (!canReject) {
      return jsonError(
        "Super Admin or Organization Admin credentials required to reject purchase orders",
        "FORBIDDEN",
        403
      );
    }

    const where: any = { id: params.id };
    if (user.role !== "SUPER_ADMIN") {
      where.organizationId = user.organizationId;
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where,
    });

    if (!existing) {
      return jsonError("Purchase order not found", "NOT_FOUND", 404);
    }

    let reason = "Order query rejected by Super Admin";
    try {
      const body = await req.json();
      if (body && typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }

    const now = new Date();
    const updated = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
        approvedBy: `${user.name} (${user.role})`,
        approvedAt: now,
      },
      include: {
        organization: true,
        material: true,
        vendor: true,
        store: true,
        site: true,
        creator: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: existing.organizationId,
        actorUserId: user.userId,
        action: "PURCHASE_ORDER_REJECTED",
        entityType: "PURCHASE_ORDER",
        entityId: updated.id,
        beforeJson: JSON.stringify({ status: existing.status }),
        afterJson: JSON.stringify({
          status: updated.status,
          rejectionReason: reason,
          approvedBy: updated.approvedBy,
        }),
        reason: `Purchase order ${updated.orderNumber} rejected by ${user.name}: ${reason}`,
      },
    });

    return jsonSuccess({
      order: updated,
      message: `Purchase order ${updated.orderNumber} has been rejected.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
