import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  formatNotificationMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
  resolveDeliveryLocation,
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
    if (!hasPermission(user, "inventory:read") && !hasPermission(user, "finance:read")) {
      return jsonError("Forbidden: Role cannot view purchase orders", "FORBIDDEN", 403);
    }

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
        store: { include: { site: true } },
        site: true,
        creator: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!order) return jsonError("Order not found", "NOT_FOUND", 404);

    const orgName = order.organization?.name || user.organizationName || "Bothra Infrastructure";
    const deliveryLocation = resolveDeliveryLocation({
      store: order.store,
      site: order.site,
    });

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
    if (!hasPermission(user, "inventory:receipt") && !hasPermission(user, "projects:write")) {
      return jsonError("Forbidden: Role cannot update purchase orders", "FORBIDDEN", 403);
    }

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
    } else if (
      requestedStatus &&
      ["PLACED", "CONFIRMED", "DELIVERED"].includes(requestedStatus) &&
      ["PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(existing.status)
    ) {
      return jsonError("Purchase order must be approved before marking as placed, confirmed, or delivered", "FORBIDDEN", 403);
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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
        material: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });

    if (!order) return jsonError("Purchase order not found", "NOT_FOUND", 404);

    const isOwner = order.createdBy === user.userId;
    const isPrivileged =
      ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"].includes(user.role) ||
      hasPermission(user, "inventory:write") ||
      hasPermission(user, "projects:write");

    if (!isOwner && !isPrivileged) {
      return jsonError("Forbidden: You do not have permission to delete this purchase order", "FORBIDDEN", 403);
    }

    if (order.status === "DELIVERED" && user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") {
      return jsonError("Cannot delete an order that has already been delivered and billed.", "INVALID_STATE", 400);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Find all request items referencing this purchase order
      const linkedItems = await tx.materialRequestItem.findMany({
        where: { purchaseOrderId: order.id },
        select: { id: true, requestId: true },
      });

      // 2. Disconnect request items
      if (linkedItems.length > 0) {
        await tx.materialRequestItem.updateMany({
          where: { purchaseOrderId: order.id },
          data: { purchaseOrderId: null },
        });

        // 3. Recalculate status for each affected material request
        const affectedRequestIds = Array.from(new Set(linkedItems.map((item) => item.requestId)));
        for (const reqId of affectedRequestIds) {
          const allItems = await tx.materialRequestItem.findMany({
            where: { requestId: reqId },
            select: { approvedQty: true, purchaseOrderId: true },
          });
          const live = allItems.filter((i) => (i.approvedQty ?? 0) > 0);
          const ordered = live.filter((i) => i.purchaseOrderId).length;
          let newStatus = "APPROVED";
          if (live.length > 0 && ordered === live.length) {
            newStatus = "ORDERED";
          } else if (ordered > 0) {
            newStatus = "PARTLY_ORDERED";
          }
          await tx.materialRequest.update({
            where: { id: reqId },
            data: { status: newStatus },
          });
        }
      }

      // 4. Delete the purchase order
      await tx.purchaseOrder.delete({
        where: { id: order.id },
      });

      // 5. Create audit event
      await tx.auditEvent.create({
        data: {
          organizationId: order.organizationId,
          actorUserId: user.userId,
          action: "PURCHASE_ORDER_DELETED",
          entityType: "PURCHASE_ORDER",
          entityId: order.id,
          beforeJson: JSON.stringify({
            orderNumber: order.orderNumber,
            status: order.status,
            material: order.material?.name,
            quantity: order.quantity,
            totalAmount: order.totalAmount,
          }),
          reason: `Deleted purchase order ${order.orderNumber}`,
        },
      });
    });

    return jsonSuccess({
      id: order.id,
      orderNumber: order.orderNumber,
      deleted: true,
      message: `Purchase order ${order.orderNumber} deleted successfully`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
