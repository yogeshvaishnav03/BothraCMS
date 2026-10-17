import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  formatNotificationMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from "@/lib/order-notifications";

export const dynamic = "force-dynamic";

const updateOrderSchema = z.object({
  status: z
    .enum(["PENDING_APPROVAL", "APPROVED", "REJECTED", "PLACED", "CONFIRMED", "DELIVERED", "CANCELLED"])
    .optional(),
  notes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const where: any = { id: params.id };
    if (user.role !== "SUPER_ADMIN") {
      where.organizationId = user.organizationId;
    }

    const order = await prisma.purchaseOrder.findFirst({
      where,
      include: {
        organization: true,
        material: true,
        vendor: true,
        store: true,
        site: true,
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!order) return jsonError("Order not found", "NOT_FOUND", 404);

    const orgName = order.organization?.name || user.organizationName || "Bothra Infrastructure";
    const deliveryLocation = order.store
      ? `${order.site?.name || "Site"} — ${order.store.name}`
      : order.site?.name || "Main Site Yard";

    const expDateStr = order.expectedDeliveryDate
      ? new Date(order.expectedDeliveryDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

    const message = formatNotificationMessage({
      orderNumber: order.orderNumber,
      organizationName: orgName,
      vendorName: order.vendor.name,
      materialName: order.material.name,
      materialSku: order.material.sku,
      quantity: order.quantity,
      unitCode: order.unitCode,
      unitRate: order.unitRate,
      totalAmount: order.totalAmount,
      deliveryLocation,
      expectedDeliveryDate: expDateStr,
      notes: order.notes,
      approvalQuery: order.approvalQuery,
      orderedByName: order.creator?.name || "Site Supervisor",
      approvedByName: order.approvedBy,
    });

    return jsonSuccess({
      ...order,
      notificationMessage: message,
      whatsappUrl: buildWhatsAppUrl(order.vendor.phone, message),
      mailtoUrl: buildMailtoUrl(
        order.vendor.email,
        `Purchase Order: ${order.orderNumber} - ${order.material.name}`,
        message
      ),
    });
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

    const where: any = { id: params.id };
    if (user.role !== "SUPER_ADMIN") {
      where.organizationId = user.organizationId;
    }

    const existing = await prisma.purchaseOrder.findFirst({
      where,
    });
    if (!existing) return jsonError("Order not found", "NOT_FOUND", 404);

    // If changing to APPROVED or REJECTED, enforce Super Admin / Org Admin role
    const requestedStatus = parsed.data.status;
    if (requestedStatus === "APPROVED" || requestedStatus === "REJECTED") {
      const canApprove = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";
      if (!canApprove) {
        return jsonError("Only Super Admin or Org Admin can approve or reject orders", "FORBIDDEN", 403);
      }
    }

    const updateData: any = {};
    if (requestedStatus) {
      updateData.status = requestedStatus;
      if (requestedStatus === "APPROVED") {
        updateData.approvedBy = `${user.name} (${user.role})`;
        updateData.approvedAt = new Date();
        updateData.notificationSent = true;
        updateData.notificationSentAt = new Date();
      } else if (requestedStatus === "REJECTED") {
        updateData.approvedBy = `${user.name} (${user.role})`;
        updateData.approvedAt = new Date();
        if (parsed.data.rejectionReason) {
          updateData.rejectionReason = parsed.data.rejectionReason;
        }
      }
    }
    if (parsed.data.notes) updateData.notes = parsed.data.notes;

    const updated = await prisma.purchaseOrder.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        organization: true,
        material: true,
        vendor: true,
        store: true,
        site: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: existing.organizationId,
        actorUserId: user.userId,
        action: requestedStatus ? `PURCHASE_ORDER_${requestedStatus}` : "PURCHASE_ORDER_UPDATED",
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
