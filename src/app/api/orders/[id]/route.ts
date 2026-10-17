import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const updateOrderSchema = z.object({
  status: z.enum(["PLACED", "CONFIRMED", "DELIVERED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const order = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      include: {
        material: true,
        vendor: true,
        store: true,
        site: true,
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) return jsonError("Order not found", "NOT_FOUND", 404);
    return jsonSuccess(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid update payload", "BAD_REQUEST", 400);
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });
    if (!existing) return jsonError("Order not found", "NOT_FOUND", 404);

    const updated = await prisma.purchaseOrder.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      },
      include: {
        material: true,
        vendor: true,
        store: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "PURCHASE_ORDER_UPDATED",
        entityType: "PURCHASE_ORDER",
        entityId: updated.id,
        beforeJson: JSON.stringify({ status: existing.status }),
        afterJson: JSON.stringify({ status: updated.status }),
        reason: `Updated purchase order ${updated.orderNumber} status to ${updated.status}`,
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
